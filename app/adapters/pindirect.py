from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.adapters.base import RawOptionRecord, SiteAdapter, register_adapter
from app.models import SourceTarget


NEXT_DATA_RE = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>')


def parse_product_id_from_html(html: str) -> str:
    match = NEXT_DATA_RE.search(html)
    if match is None:
        raise ValueError("Could not locate __NEXT_DATA__ payload")
    payload = json.loads(match.group(1))
    product_id = payload.get("props", {}).get("pageProps", {}).get("productId")
    if not product_id:
        raise ValueError("Could not locate productId in __NEXT_DATA__ payload")
    return str(product_id)


def parse_product_payload(payload: dict, target: SourceTarget, fetch_mode: str) -> list[RawOptionRecord]:
    product_info = payload["productInfo"]
    options = payload["productOptions"]["list"]
    country_name = product_info.get("productName") or target.country_name_ko

    records: list[RawOptionRecord] = []
    for index, option in enumerate(options):
        option_name = str(option["optionName"])
        quota_text = str(option.get("quotaText") or "").strip()
        quota_value = option.get("quota")
        is_unlimited = quota_text == "무제한" or "무제한" in option_name
        records.append(
            RawOptionRecord(
                option_name=option_name,
                days=int(option["period"]),
                data_quota_mb=None if is_unlimited else int(quota_value),
                data_quota_label="unlimited" if is_unlimited else quota_text,
                speed_policy="full_speed",
                network_type="local" if option.get("isLocalNetwork") == "Y" else "roaming",
                price_krw=int(option["price"]),
                parser_mode="browser" if fetch_mode == "browser_capture" else "next_data",
                evidence={
                    "fetch_mode": fetch_mode,
                    "payload_path": f"productOptions.list[{index}]",
                    "product_id": product_info["productId"],
                    "country_name": country_name,
                    "option_id": option.get("optionId"),
                },
                raw_payload_hash=str(option.get("optionId") or ""),
            )
        )

    return records


class PindirectAdapter(SiteAdapter):
    site_name = "pindirect"
    api_base_url = "https://z-api.pindirectshop.com"

    def fetch(self, target: SourceTarget) -> list[RawOptionRecord]:
        html = self.fetch_html(target.source_url)
        product_id = parse_product_id_from_html(html)

        try:
            payload = self.fetch_product_payload(product_id)
            return parse_product_payload(payload, target, fetch_mode="direct_api")
        except (HTTPError, URLError, ValueError):
            payload = self.fetch_product_payload_via_browser(target.source_url)
            return parse_product_payload(payload, target, fetch_mode="browser_capture")

    def fetch_html(self, source_url: str) -> str:
        request = Request(source_url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8")

    def fetch_product_payload(self, product_id: str) -> dict:
        request = Request(
            f"{self.api_base_url}/roaming/products/{product_id}",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))

    def fetch_product_payload_via_browser(self, source_url: str) -> dict:
        from playwright.sync_api import sync_playwright

        captured_payload: dict | None = None

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()

            def on_response(response) -> None:
                nonlocal captured_payload
                if "/roaming/products/" not in response.url:
                    return
                if captured_payload is not None:
                    return
                try:
                    captured_payload = response.json()
                except Exception:
                    return

            page.on("response", on_response)
            page.goto(source_url, wait_until="networkidle", timeout=60000)
            browser.close()

        if captured_payload is None:
            raise ValueError("Could not capture pindirect product payload via browser")
        return captured_payload


def load_html_fixture(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_payload_fixture(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


register_adapter("pindirect", PindirectAdapter())
