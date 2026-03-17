from __future__ import annotations

from pathlib import Path

from app.adapters.maaltalk import (
    MaaltalkAdapter,
    load_html_fixture,
    load_payload_fixture,
    parse_option_select_payload,
    parse_product_page,
)
from app.models import SourceTarget


def _target() -> SourceTarget:
    return SourceTarget(
        site="maaltalk",
        site_label="말톡",
        country_code="JP",
        country_name_ko="일본",
        source_url="https://store.maaltalk.com/goods/goods_view.php?goodsNo=1000000265",
        parser_hint="static_html",
    )


def test_parse_maaltalk_product_page_fixture() -> None:
    html = load_html_fixture(Path("tests/fixtures/maaltalk_japan.html"))

    page = parse_product_page(html, _target())

    assert "로컬망" in page["title"]
    assert page["base_price_krw"] == 1200
    assert len(page["first_options"]) > 10
    assert page["first_options"][0] == "RD328.일본Softbank 매일 1GB"


def test_parse_option_select_payload_fixture() -> None:
    html = load_html_fixture(Path("tests/fixtures/maaltalk_japan.html"))
    page = parse_product_page(html, _target())
    payload = load_payload_fixture(Path("tests/fixtures/maaltalk_japan_option_select_step1.json"))

    records = parse_option_select_payload(
        payload=payload,
        target=_target(),
        first_option="RD328.일본Softbank 매일 1GB",
        base_price_krw=page["base_price_krw"],
        fetch_mode="browser_capture",
        title=page["title"],
    )

    assert len(records) == 30
    assert records[0].days == 1
    assert records[0].price_krw == 1200
    assert records[1].price_krw == 1900
    assert records[0].data_quota_mb == 1024
    assert records[0].data_quota_label == "1GB"
    assert records[0].network_type == "local"
    assert records[0].parser_mode == "browser"
    assert records[0].evidence["fetch_mode"] == "browser_capture"


def test_adapter_uses_browser_fallback_when_direct_fails() -> None:
    html = load_html_fixture(Path("tests/fixtures/maaltalk_japan.html"))
    payload = load_payload_fixture(Path("tests/fixtures/maaltalk_japan_option_select_step1.json"))

    class BrowserFallbackAdapter(MaaltalkAdapter):
        def fetch_html(self, source_url: str) -> str:
            return html

        def fetch_option_payloads_direct(
            self,
            source_url: str,
            first_options: list[str],
            csrf_token: str | None,
            option_count: int,
        ):
            raise ValueError("simulate direct failure")

        def fetch_option_payloads_via_browser(self, source_url: str, first_options: list[str], option_count: int):
            return [([first_options[0]], payload)]

    records = BrowserFallbackAdapter().fetch(_target())

    assert len(records) == 30
    assert records[0].parser_mode == "browser"
    assert records[0].evidence["fetch_mode"] == "browser_capture"


def test_adapter_supports_direct_payload_path() -> None:
    html = load_html_fixture(Path("tests/fixtures/maaltalk_japan.html"))
    payload = load_payload_fixture(Path("tests/fixtures/maaltalk_japan_option_select_step1.json"))

    class DirectAdapter(MaaltalkAdapter):
        def fetch_html(self, source_url: str) -> str:
            return html

        def fetch_option_payloads_direct(
            self,
            source_url: str,
            first_options: list[str],
            csrf_token: str | None,
            option_count: int,
        ):
            return [([first_options[0]], payload)]

    records = DirectAdapter().fetch(_target())

    assert len(records) == 30
    assert records[0].parser_mode == "static_html"
    assert records[0].evidence["fetch_mode"] == "direct_api"
