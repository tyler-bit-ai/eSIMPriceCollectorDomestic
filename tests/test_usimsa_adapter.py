from __future__ import annotations

import json
from pathlib import Path

from app.adapters.base import clear_adapters
from app.adapters.usimsa import UsimsaAdapter, parse_usimsa_html
from app.models import SourceTarget
from app.pipeline.run_crawl import run_crawl


def _target() -> SourceTarget:
    return SourceTarget(
        site="usimsa",
        site_label="유심사",
        country_code="JP",
        country_name_ko="일본",
        source_url="https://shop.usimsa.com/sim/179D30E5-6A69-EE11-BBF0-28187860D6D3",
        parser_hint="next_stream",
    )


def test_parse_usimsa_fixture_extracts_multiple_records() -> None:
    html = Path("tests/fixtures/usimsa_japan.html").read_text(encoding="utf-8")

    records = parse_usimsa_html(html, _target())

    assert len(records) > 10
    first = records[0]
    assert first.days == 1
    assert first.option_name
    assert first.price_krw is not None
    assert first.network_type == "roaming"
    assert first.parser_mode == "next_stream"
    assert first.evidence["payload_path"].startswith("dayOptions.")

    unlimited = next(record for record in records if record.option_name == "완전 무제한" and record.days == 1)
    throttled = next(record for record in records if "이후 저속 무제한" in record.option_name)
    assert unlimited.data_quota_mb is None
    assert unlimited.data_quota_label == "unlimited"
    assert throttled.data_quota_mb is not None
    assert throttled.data_quota_label is not None


def test_run_crawl_with_usimsa_adapter_writes_records(tmp_path: Path) -> None:
    clear_adapters()
    # Re-import adapter registration after clearing the registry.
    from app.adapters.base import register_adapter

    register_adapter("usimsa", UsimsaAdapter())

    registry_path = tmp_path / "registry.yml"
    registry_path.write_text(
        "\n".join(
            [
                "version: 1",
                "targets:",
                "  - site: usimsa",
                "    site_label: 유심사",
                "    parser_hint: next_stream",
                "    countries:",
                "      - country_code: JP",
                "        country_name_ko: 일본",
                "        source_url: https://shop.usimsa.com/sim/179D30E5-6A69-EE11-BBF0-28187860D6D3",
            ]
        ),
        encoding="utf-8",
    )

    fixture_path = Path("tests/fixtures/usimsa_japan.html")

    class FixtureAdapter(UsimsaAdapter):
        def fetch(self, target: SourceTarget):
            return parse_usimsa_html(fixture_path.read_text(encoding="utf-8"), target)

    clear_adapters()
    register_adapter("usimsa", FixtureAdapter())

    summary = run_crawl(registry_path=registry_path, output_root=tmp_path / "data")
    latest_records = json.loads((summary.output.latest_dir / "records.json").read_text(encoding="utf-8"))

    assert summary.record_count > 10
    assert summary.metadata.failure_count == 0
    assert latest_records[0]["site"] == "usimsa"
    assert latest_records[0]["source_url"] == _target().source_url
    assert latest_records[0]["evidence"]["payload_path"].startswith("dayOptions.")
