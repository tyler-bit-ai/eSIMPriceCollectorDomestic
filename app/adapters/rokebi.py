from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.request import Request, urlopen

from app.adapters.base import RawOptionRecord, SiteAdapter, register_adapter
from app.models import SourceTarget


ALL_PROD_RE = re.compile(r'\\"allProd\\":\[')


def _extract_all_prod_payload(html: str) -> list[dict[str, object]]:
    match = ALL_PROD_RE.search(html)
    if match is None:
        raise ValueError("Could not locate rokebi allProd payload")

    start = match.end() - 1
    depth = 0
    end = None
    for index in range(start, len(html)):
        char = html[index]
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                end = index + 1
                break

    if end is None:
        raise ValueError("Could not determine rokebi allProd payload boundary")

    payload = (
        html[start:end]
        .replace('\\"', '"')
        .replace("\\/", "/")
        .replace("\\u003c", "<")
        .replace("\\u003e", ">")
        .replace("\\u0026", "&")
    )
    return json.loads(payload)


def _matches_country(product_name: str, target: SourceTarget) -> bool:
    return target.country_name_ko in product_name


def _detect_network_type(product_name: str) -> str:
    return "local" if "로컬" in product_name else "roaming"


def _normalize_option_name(product_name: str, target: SourceTarget) -> str:
    option_name = product_name.strip()
    if option_name.startswith("(더블팩) "):
        option_name = option_name[len("(더블팩) ") :]
    if option_name.startswith(f"{target.country_name_ko} "):
        option_name = option_name[len(target.country_name_ko) + 1 :]
    return option_name


def _quota_from_product(product: dict[str, object]) -> tuple[int | None, str | None]:
    product_name = str(product["name"])
    description = str(product.get("field_description") or "")
    volume_raw = str(product.get("volume") or "0")
    volume = int(volume_raw) if volume_raw.isdigit() else None
    is_full_unlimited = (
        "올데이" in product_name
        or "완전 무제한" in description
        or ("무제한" in product_name and str(product.get("fup") or "") == "0")
    )
    if is_full_unlimited:
        return None, "unlimited"
    if volume is None:
        return None, None
    if volume >= 1000 and volume % 1024 == 0:
        return volume, f"{volume // 1024}GB"
    if volume >= 1000 and volume % 1000 == 0:
        return volume, f"{volume // 1000}GB"
    return volume, f"{volume}MB"


def _speed_policy(product: dict[str, object]) -> str:
    product_name = str(product["name"])
    field_daily = str(product.get("field_daily") or "")
    description = str(product.get("field_description") or "")
    if "올데이 플러스" in product_name or "올데이" in product_name or "완전 무제한" in description:
        return "full_speed"
    if field_daily == "total":
        return "full_speed_until_quota_exhausted"
    if "속도제어" in description or "소진 후" in description:
        return "daily_cap_then_throttled"
    return "full_speed"


def parse_rokebi_html(html: str, target: SourceTarget) -> list[RawOptionRecord]:
    all_prod = _extract_all_prod_payload(html)
    records: list[RawOptionRecord] = []

    for index, product in enumerate(all_prod):
        product_name = str(product.get("name") or "")
        if not _matches_country(product_name, target):
            continue

        quota_mb, quota_label = _quota_from_product(product)
        records.append(
            RawOptionRecord(
                option_name=_normalize_option_name(product_name, target),
                days=int(product["days"]),
                data_quota_mb=quota_mb,
                data_quota_label=quota_label,
                speed_policy=_speed_policy(product),
                network_type=_detect_network_type(product_name),
                price_krw=int(product["price"]["value"]),
                parser_mode="next_stream",
                evidence={
                    "payload_path": f"allProd[{index}]",
                    "uuid": product.get("uuid"),
                    "sku": product.get("sku"),
                    "field_daily": product.get("field_daily"),
                    "field_description": product.get("field_description"),
                    "network": product.get("network"),
                    "partner_id": product.get("partnerId"),
                },
                raw_payload_hash=str(product.get("uuid") or ""),
            )
        )

    if not records:
        raise ValueError(f"Could not find rokebi products for country {target.country_code}")

    return records


class RokebiAdapter(SiteAdapter):
    site_name = "rokebi"

    def fetch(self, target: SourceTarget) -> list[RawOptionRecord]:
        request = Request(target.source_url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=30) as response:
            html = response.read().decode("utf-8")
        return parse_rokebi_html(html, target)


def load_fixture(path: Path, target: SourceTarget) -> list[RawOptionRecord]:
    return parse_rokebi_html(path.read_text(encoding="utf-8"), target)


register_adapter("rokebi", RokebiAdapter())
