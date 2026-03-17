from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.request import Request, urlopen

from app.adapters.base import RawOptionRecord, SiteAdapter, register_adapter
from app.models import SourceTarget


PAYLOAD_BLOCK_RE = re.compile(
    r'\\"networkType\\":\\"(?P<network_type>[^\\"]+)\\".*?\\"dayOptions\\":(?P<day_options>\{.*?\}),\\"recommendDay\\":',
    re.DOTALL,
)
TITLE_RE = re.compile(r'data-testid="product-title">([^<]+)<')


def _unescape_json_fragment(fragment: str) -> str:
    return fragment.replace('\\"', '"').replace("\\\\", "\\")


def extract_day_option_blocks(html: str) -> list[tuple[str | None, dict[str, list[dict[str, object]]]]]:
    blocks: list[tuple[str | None, dict[str, list[dict[str, object]]]]] = []
    for match in PAYLOAD_BLOCK_RE.finditer(html):
        network_type = match.group("network_type")
        day_options = json.loads(_unescape_json_fragment(match.group("day_options")))
        blocks.append((network_type, day_options))
    if not blocks:
        raise ValueError("Could not locate usimsa dayOptions payload")
    return blocks


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
    payload_blocks = extract_day_option_blocks(html)
    country_name = detect_country_name(html, target.country_name_ko)
    records: list[RawOptionRecord] = []
    seen_keys: set[tuple[str, str | None]] = set()

    for block_index, (network_type, day_options) in enumerate(payload_blocks):
        for day_key, options in day_options.items():
            for index, option in enumerate(options):
                option_name = str(option["optionName"])
                quota = option.get("quota")
                days = option.get("days")
                option_id = str(option.get("optionId") or "")
                dedupe_key = (option_id, network_type)
                if option_id and dedupe_key in seen_keys:
                    continue
                if option_id:
                    seen_keys.add(dedupe_key)

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
                            "payload_path": f"blocks.{block_index}.dayOptions.{day_key}[{index}]",
                            "country_name": country_name,
                            "option_id": option.get("optionId"),
                            "quota": quota,
                        },
                        raw_payload_hash=option_id,
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
