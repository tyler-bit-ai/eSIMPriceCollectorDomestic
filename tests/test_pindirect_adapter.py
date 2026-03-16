from __future__ import annotations

from pathlib import Path

from app.adapters.pindirect import (
    PindirectAdapter,
    load_html_fixture,
    load_payload_fixture,
    parse_product_id_from_html,
    parse_product_payload,
)
from app.models import SourceTarget


def _target() -> SourceTarget:
    return SourceTarget(
        site="pindirect",
        site_label="핀다이렉트",
        country_code="JP",
        country_name_ko="일본",
        source_url="https://www.pindirectshop.com/roaming/select-option/7D1AFA8A-098C-4EF8-BBE2-0F9B211EC46B",
        parser_hint="next_data",
    )


def test_parse_product_id_from_ssr_fixture() -> None:
    html = load_html_fixture(Path("tests/fixtures/pindirect_japan.html"))

    product_id = parse_product_id_from_html(html)

    assert product_id == "7D1AFA8A-098C-4EF8-BBE2-0F9B211EC46B"


def test_parse_product_payload_from_api_fixture() -> None:
    payload = load_payload_fixture(Path("tests/fixtures/pindirect_japan_product.json"))

    records = parse_product_payload(payload, _target(), fetch_mode="direct_api")

    assert len(records) > 10
    first = records[0]
    assert first.days == 1
    assert first.price_krw is not None
    assert first.option_name
    assert first.evidence["fetch_mode"] == "direct_api"
    assert first.evidence["payload_path"].startswith("productOptions.list[")

    unlimited = next(record for record in records if "무제한" in record.option_name)
    assert unlimited.data_quota_mb is None
    assert unlimited.data_quota_label == "unlimited"


def test_adapter_uses_browser_fallback_when_direct_api_fails() -> None:
    html = load_html_fixture(Path("tests/fixtures/pindirect_japan.html"))
    payload = load_payload_fixture(Path("tests/fixtures/pindirect_japan_product.json"))

    class BrowserFallbackAdapter(PindirectAdapter):
        def fetch_html(self, source_url: str) -> str:
            return html

        def fetch_product_payload(self, product_id: str) -> dict:
            raise ValueError("simulate direct api failure")

        def fetch_product_payload_via_browser(self, source_url: str) -> dict:
            return payload

    records = BrowserFallbackAdapter().fetch(_target())

    assert len(records) > 10
    assert records[0].evidence["fetch_mode"] == "browser_capture"
    assert records[0].parser_mode == "browser"
