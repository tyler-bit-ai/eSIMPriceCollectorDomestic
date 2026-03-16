from __future__ import annotations

import json
from pathlib import Path

from app.adapters.base import RawOptionRecord, SiteAdapter, clear_adapters, register_adapter
from app.pipeline.run_crawl import run_crawl


class SuccessAdapter(SiteAdapter):
    site_name = "success_site"

    def fetch(self, target):
        return [
            RawOptionRecord(
                option_name="매일 1GB",
                days=3,
                data_quota_mb=1000,
                data_quota_label="1GB",
                speed_policy="daily_cap",
                network_type="roaming",
                price_krw=9900,
                parser_mode="static_html",
                evidence={"selector": "fixture-success"},
            )
        ]


class FailingAdapter(SiteAdapter):
    site_name = "failing_site"

    def fetch(self, target):
        raise RuntimeError("fixture failure")


def test_run_crawl_writes_latest_history_and_failed_log(tmp_path: Path) -> None:
    clear_adapters()
    register_adapter("success_site", SuccessAdapter())
    register_adapter("failing_site", FailingAdapter())

    registry_path = tmp_path / "registry.yml"
    registry_path.write_text(
        "\n".join(
            [
                "version: 1",
                "targets:",
                "  - site: success_site",
                "    site_label: 성공",
                "    parser_hint: static_html",
                "    countries:",
                "      - country_code: JP",
                "        country_name_ko: 일본",
                "        source_url: https://example.com/success",
                "  - site: failing_site",
                "    site_label: 실패",
                "    parser_hint: static_html",
                "    countries:",
                "      - country_code: US",
                "        country_name_ko: 미국",
                "        source_url: https://example.com/failure",
            ]
        ),
        encoding="utf-8",
    )

    summary = run_crawl(registry_path=registry_path, output_root=tmp_path / "data")

    latest_records = json.loads((summary.output.latest_dir / "records.json").read_text(encoding="utf-8"))
    history_records = json.loads((summary.output.history_dir / "records.json").read_text(encoding="utf-8"))
    metadata = json.loads((summary.output.latest_dir / "run_metadata.json").read_text(encoding="utf-8"))
    failed_lines = summary.output.failed_log.read_text(encoding="utf-8").strip().splitlines()

    assert summary.record_count == 1
    assert summary.metadata.success_count == 1
    assert summary.metadata.failure_count == 1
    assert latest_records == history_records
    assert latest_records[0]["site"] == "success_site"
    assert latest_records[0]["country_code"] == "JP"
    assert latest_records[0]["option_name"] == "매일 1GB"
    assert latest_records[0]["price_krw"] == 9900
    assert latest_records[0]["currency"] == "KRW"
    assert latest_records[0]["availability_status"] == "available"
    assert latest_records[0]["evidence"]["selector"] == "fixture-success"
    assert metadata["success_count"] == 1
    assert metadata["failure_count"] == 1
    assert len(failed_lines) == 1
    assert "fixture failure" in failed_lines[0]


def test_run_crawl_filters_sites_and_countries(tmp_path: Path) -> None:
    clear_adapters()
    register_adapter("success_site", SuccessAdapter())

    registry_path = tmp_path / "registry.yml"
    registry_path.write_text(
        "\n".join(
            [
                "version: 1",
                "targets:",
                "  - site: success_site",
                "    site_label: 성공",
                "    parser_hint: static_html",
                "    countries:",
                "      - country_code: JP",
                "        country_name_ko: 일본",
                "        source_url: https://example.com/jp",
                "      - country_code: VN",
                "        country_name_ko: 베트남",
                "        source_url: https://example.com/vn",
            ]
        ),
        encoding="utf-8",
    )

    summary = run_crawl(
        registry_path=registry_path,
        output_root=tmp_path / "data",
        selected_sites=["success_site"],
        selected_countries=["VN"],
    )

    latest_records = json.loads((summary.output.latest_dir / "records.json").read_text(encoding="utf-8"))

    assert summary.record_count == 1
    assert latest_records[0]["country_code"] == "VN"
