from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.request import Request, urlopen

from app.adapters.base import RawOptionRecord, SiteAdapter, register_adapter
from app.models import SourceTarget


DAY_OPTIONS_RE = re.compile(r'\\"dayOptions\\":(\{.*?\}),\\"recommendDay\\":', re.DOTALL)
NETWORK_TYPE_RE = re.compile(r'\\"networkType\\":\\"([^\\"]+)\\"')
TITLE_RE = re.compile(r'data-testid="product-title">([^<]+)<')


def _unescape_json_fragment(fragment: str) -> str:
    return fragment.replace('\\"', '"').replace("\\\\", "\\")


def extract_day_options(html: str) -> tuple[str | None, dict[str, list[dict[str, object]]]]:
    network_match = NETWORK_TYPE_RE.search(html)
    day_options_match = DAY_OPTIONS_RE.search(html)
    if day_options_match is None:
        raise ValueError("Could not locate usimsa dayOptions payload")

    day_options = json.loads(_unescape_json_fragment(day_options_match.group(1)))
    network_type = network_match.group(1) if network_match else None
    return network_type, day_options


def detect_country_name(html: str, fallback: str) -> str:
    match = TITLE_RE.search(html)
    if match:
        return match.group(1).strip()
    return fallback


def quota_label_from_option(option_name: str, quota: int | None) -> str | None:
    if "완전 무제한" in option_name:
        return "unlimited"
    if quota is None:
        return None
    if quota >= 1000 and quota % 1000 == 0:
        return f"{quota // 1000}GB"
    return f"{quota}MB"


def parse_usimsa_html(html: str, target: SourceTarget) -> list[RawOptionRecord]:
    network_type, day_options = extract_day_options(html)
    country_name = detect_country_name(html, target.country_name_ko)
    records: list[RawOptionRecord] = []

    for day_key, options in day_options.items():
        for index, option in enumerate(options):
            option_name = str(option["optionName"])
            quota = option.get("quota")
            days = option.get("days")
            quota_value = int(quota) if quota is not None else None
            is_unlimited = "완전 무제한" in option_name
            records.append(
                RawOptionRecord(
                    option_name=option_name,
                    days=int(days) if isinstance(days, int) else int(day_key),
                    data_quota_mb=None if is_unlimited else quota_value,
                    data_quota_label=quota_label_from_option(option_name, quota_value),
                    speed_policy="daily_cap_then_throttled" if "이후 저속 무제한" in option_name else "full_speed",
                    network_type=network_type,
                    price_krw=int(option["price"]),
                    parser_mode="next_stream",
                    evidence={
                        "payload_path": f"dayOptions.{day_key}[{index}]",
                        "country_name": country_name,
                        "option_id": option.get("optionId"),
                        "quota": quota,
                    },
                    raw_payload_hash=str(option.get("optionId") or ""),
                )
            )

    return records


class UsimsaAdapter(SiteAdapter):
    site_name = "usimsa"

    def fetch(self, target: SourceTarget) -> list[RawOptionRecord]:
        request = Request(target.source_url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=30) as response:
            html = response.read().decode("utf-8")
        return parse_usimsa_html(html, target)


def load_fixture(path: Path, target: SourceTarget) -> list[RawOptionRecord]:
    return parse_usimsa_html(path.read_text(encoding="utf-8"), target)


register_adapter("usimsa", UsimsaAdapter())
