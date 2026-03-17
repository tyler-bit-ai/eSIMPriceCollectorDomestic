from __future__ import annotations

import json
import re
from html import unescape
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen

from app.adapters.base import RawOptionRecord, SiteAdapter, register_adapter
from app.models import SourceTarget


TITLE_RE = re.compile(r"<h3>([^<]+)</h3>")
BASE_PRICE_RE = re.compile(r"'setGoodsPrice'\s*:\s*'(\d+)'")
FIRST_OPTION_SELECT_RE = re.compile(r'<select name="optionNo_0".*?</select>', re.DOTALL)
OPTION_RE = re.compile(r'<option[^>]*value="([^"]*)".*?>(.*?)</option>', re.DOTALL)
CSRF_RE = re.compile(r'<meta name="csrf-token" content="([^"]+)"')
OPTION_COUNT_RE = re.compile(r'<input type="hidden" name="optionCntInput" value="(\d+)"')
CODE_PREFIX_RE = re.compile(r"^[A-Z0-9]+\.")
DATA_AMOUNT_RE = re.compile(r"(\d+)\s*(GB|MB)")
DAY_RE = re.compile(r"(\d+)일")


def _clean_text(raw: str) -> str:
    text = re.sub(r"<[^>]+>", "", unescape(raw))
    return " ".join(text.split())


def parse_product_page(html: str, target: SourceTarget) -> dict[str, object]:
    title_match = TITLE_RE.search(html)
    if title_match is None:
        raise ValueError("Could not locate maaltalk product title")

    price_match = BASE_PRICE_RE.search(html)
    if price_match is None:
        raise ValueError("Could not locate maaltalk base price")

    select_match = FIRST_OPTION_SELECT_RE.search(html)
    if select_match is None:
        raise ValueError("Could not locate maaltalk first option select")

    first_options: list[str] = []
    for value, _label in OPTION_RE.findall(select_match.group(0)):
        if value:
            first_options.append(_clean_text(value))

    csrf_match = CSRF_RE.search(html)
    option_count_match = OPTION_COUNT_RE.search(html)
    option_count = int(option_count_match.group(1)) if option_count_match else 2
    return {
        "title": _clean_text(title_match.group(1)),
        "base_price_krw": int(price_match.group(1)),
        "first_options": first_options,
        "csrf_token": csrf_match.group(1) if csrf_match else None,
        "option_count": option_count,
    }


def _parse_network_type(title: str) -> str:
    return "local" if "로컬망" in title or "(로컬)" in title else "roaming"


def _parse_quota(first_option: str) -> tuple[int | None, str | None]:
    if "무제한" in first_option:
        return None, "unlimited"
    match = DATA_AMOUNT_RE.search(first_option)
    if match is None:
        return None, None
    amount = int(match.group(1))
    unit = match.group(2)
    if unit == "GB":
        return amount * 1024, f"{amount}GB"
    return amount, f"{amount}MB"


def _parse_speed_policy(first_option: str) -> str:
    if "매일" in first_option:
        return "daily_cap_then_throttled"
    if "무제한" in first_option:
        return "full_speed"
    return "full_speed_until_quota_exhausted"


def _normalize_first_option(first_option: str) -> str:
    return CODE_PREFIX_RE.sub("", first_option).strip()


def _parse_days(option_value: str) -> int:
    match = DAY_RE.search(option_value)
    if match is None:
        raise ValueError(f"Could not parse days from option value '{option_value}'")
    return int(match.group(1))


def parse_option_select_payload(
    payload: dict[str, object],
    target: SourceTarget,
    first_option: str,
    base_price_krw: int,
    fetch_mode: str,
    title: str,
    selected_values: list[str] | None = None,
) -> list[RawOptionRecord]:
    next_options = payload.get("nextOption")
    option_prices = payload.get("optionPrice")
    if not isinstance(next_options, list) or not isinstance(option_prices, list):
        raise ValueError("Invalid maaltalk option_select payload")

    quota_mb, quota_label = _parse_quota(first_option)
    selected = list(selected_values or [first_option])
    normalized_first_option = " / ".join(_normalize_first_option(value) for value in selected)
    network_type = _parse_network_type(title)
    parser_mode = "static_html" if fetch_mode == "direct_api" else "browser"

    records: list[RawOptionRecord] = []
    for index, option_value in enumerate(next_options):
        if index >= len(option_prices):
            break
        price_delta = int(float(option_prices[index]))
        days = _parse_days(str(option_value))
        records.append(
            RawOptionRecord(
                option_name=f"{normalized_first_option} / {days}일",
                days=days,
                data_quota_mb=quota_mb,
                data_quota_label=quota_label,
                speed_policy=_parse_speed_policy(first_option),
                network_type=network_type,
                price_krw=base_price_krw + price_delta,
                parser_mode=parser_mode,
                evidence={
                    "fetch_mode": fetch_mode,
                    "title": title,
                    "first_option": first_option,
                    "option_value": option_value,
                    "price_delta": price_delta,
                },
                raw_payload_hash=f"{first_option}|{option_value}",
            )
        )

    return records


class MaaltalkAdapter(SiteAdapter):
    site_name = "maaltalk"

    def fetch(self, target: SourceTarget) -> list[RawOptionRecord]:
        html = self.fetch_html(target.source_url)
        page_info = parse_product_page(html, target)
        title = str(page_info["title"])
        base_price_krw = int(page_info["base_price_krw"])
        first_options = list(page_info["first_options"])

        try:
            payloads = self.fetch_option_payloads_direct(
                source_url=target.source_url,
                first_options=first_options,
                csrf_token=page_info.get("csrf_token"),
                option_count=int(page_info["option_count"]),
            )
            fetch_mode = "direct_api"
        except (HTTPError, URLError, ValueError):
            payloads = self.fetch_option_payloads_via_browser(
                source_url=target.source_url,
                first_options=first_options,
                option_count=int(page_info["option_count"]),
            )
            fetch_mode = "browser_capture"

        records: list[RawOptionRecord] = []
        for selected_values, payload in payloads:
            first_option = selected_values[0]
            records.extend(
                parse_option_select_payload(
                    payload=payload,
                    target=target,
                    first_option=first_option,
                    base_price_krw=base_price_krw,
                    fetch_mode=fetch_mode,
                    title=title,
                    selected_values=selected_values,
                )
            )

        if not records:
            raise ValueError(f"Could not extract maaltalk option records for {target.country_code}")
        return records

    def fetch_html(self, source_url: str) -> str:
        request = Request(source_url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8")

    def fetch_option_payloads_direct(
        self,
        source_url: str,
        first_options: list[str],
        csrf_token: str | None,
        option_count: int,
    ) -> list[tuple[list[str], dict]]:
        goods_no = source_url.split("goodsNo=")[-1]
        opener = build_opener(HTTPCookieProcessor())
        opener.open(Request(source_url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30)

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": source_url,
        }
        if csrf_token:
            headers["X-CSRF-Token"] = csrf_token

        terminal_payloads: list[tuple[list[str], dict]] = []

        def request_payload(selected_values: list[str], option_key: int) -> dict:
            request = Request(
                "https://store.maaltalk.com/goods/goods_ps.php",
                data=urlencode(
                    {
                        "mode": "option_select",
                        "optionVal": selected_values,
                        "optionKey": str(option_key),
                        "goodsNo": goods_no,
                        "mileageFl": " c",
                    },
                    doseq=True,
                ).encode(),
                headers=headers,
            )
            with opener.open(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))

        def walk(selected_values: list[str], option_key: int) -> None:
            payload = request_payload(selected_values, option_key)
            next_key = int(payload.get("nextKey", option_key + 1))
            if next_key >= option_count - 1:
                terminal_payloads.append((selected_values, payload))
                return
            for next_option in payload.get("nextOption", []):
                walk(selected_values + [str(next_option)], next_key)

        for first_option in first_options:
            walk([first_option], 0)

        return terminal_payloads

    def fetch_option_payloads_via_browser(
        self,
        source_url: str,
        first_options: list[str],
        option_count: int,
    ) -> list[tuple[list[str], dict]]:
        from playwright.sync_api import sync_playwright

        payloads: list[tuple[list[str], dict]] = []
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(source_url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(2000)

            def select_and_capture(level: int, option_value: str) -> dict:
                with page.expect_response(
                    lambda response: "goods_ps.php" in response.url
                    and response.request.method == "POST"
                    and "mode=option_select" in (response.request.post_data or "")
                    and f"optionKey={level}" in (response.request.post_data or "")
                ) as response_info:
                    page.eval_on_selector(
                        f"select[name='optionNo_{level}']",
                        """(el, value) => {
                            el.value = value;
                            el.dispatchEvent(new Event("change", { bubbles: true }));
                        }""",
                        option_value,
                    )
                page.wait_for_timeout(300)
                return response_info.value.json()

            def walk(selected_values: list[str], level: int) -> None:
                options = first_options if level == 0 else []
                if level > 0:
                    raise ValueError("Browser walk options must be provided by payload recursion")
                for first_option in options:
                    payload = select_and_capture(0, first_option)
                    next_key = int(payload.get("nextKey", 1))
                    if next_key >= option_count - 1:
                        payloads.append(([first_option], payload))
                        continue
                    for next_option in payload.get("nextOption", []):
                        payload2 = select_and_capture(next_key, str(next_option))
                        next_key2 = int(payload2.get("nextKey", next_key + 1))
                        if next_key2 >= option_count - 1:
                            payloads.append(([first_option, str(next_option)], payload2))
                        else:
                            raise ValueError("Maaltalk browser fallback supports up to 3 option levels")

            walk([], 0)

            browser.close()

        return payloads


def load_html_fixture(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_payload_fixture(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


register_adapter("maaltalk", MaaltalkAdapter())
