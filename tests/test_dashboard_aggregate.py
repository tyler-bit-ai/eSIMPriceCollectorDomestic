from __future__ import annotations

import json
from pathlib import Path

from app.models import NormalizedPriceRecord, RunMetadata
from app.output.dashboard_data import build_dashboard_payload, write_dashboard_latest


def _record(
    *,
    site: str,
    site_label: str,
    country_code: str,
    country_name_ko: str,
    option_name: str,
    days: int,
    data_quota_label: str,
    network_type: str,
    price_krw: int,
    collected_at: str,
) -> NormalizedPriceRecord:
    return NormalizedPriceRecord(
        site=site,
        site_label=site_label,
        country_code=country_code,
        country_name_ko=country_name_ko,
        source_url=f"https://example.com/{site}/{country_code}",
        option_name=option_name,
        days=days,
        data_quota_mb=None if data_quota_label == "unlimited" else 1024,
        data_quota_label=data_quota_label,
        speed_policy="full_speed",
        network_type=network_type,
        price_krw=price_krw,
        availability_status="available",
        collected_at=collected_at,
        parser_mode="next_data",
        evidence={"fixture": True},
    )


def test_build_dashboard_payload_computes_summary_and_comparison_rows() -> None:
    records = [
        _record(
            site="usimsa",
            site_label="유심사",
            country_code="JP",
            country_name_ko="일본",
            option_name="일본 3일 1GB",
            days=3,
            data_quota_label="1GB",
            network_type="roaming",
            price_krw=5000,
            collected_at="2026-03-16T01:00:00+00:00",
        ),
        _record(
            site="pindirect",
            site_label="핀다이렉트",
            country_code="JP",
            country_name_ko="일본",
            option_name="일본 3일 1GB",
            days=3,
            data_quota_label="1GB",
            network_type="roaming",
            price_krw=4800,
            collected_at="2026-03-16T02:00:00+00:00",
        ),
        _record(
            site="pindirect",
            site_label="핀다이렉트",
            country_code="US",
            country_name_ko="미국",
            option_name="미국 5일 unlimited",
            days=5,
            data_quota_label="unlimited",
            network_type="local",
            price_krw=12000,
            collected_at="2026-03-16T03:00:00+00:00",
        ),
    ]
    metadata = RunMetadata(
        run_id="run-test",
        collected_at="2026-03-16T03:30:00+00:00",
        selected_sites=["usimsa", "pindirect"],
        selected_countries=["JP", "US"],
        success_count=3,
        failure_count=0,
    )

    payload = build_dashboard_payload(records, metadata)

    assert payload["summary"]["record_count"] == 3
    assert payload["summary"]["country_count"] == 2
    assert payload["summary"]["site_count"] == 2
    assert payload["summary"]["lowest_price_krw"] == 4800
    assert payload["filters"]["days"] == [3, 5]
    assert ("JP", "일본") in payload["filters"]["countries"]
    assert ("US", "미국") in payload["filters"]["countries"]

    row = next(
        item
        for item in payload["comparison_rows"]
        if item["country_code"] == "JP"
        and item["site"] == "pindirect"
        and item["days"] == 3
        and item["data_quota_label"] == "1GB"
    )
    assert row["lowest_price_krw"] == 4800
    assert row["option_count"] == 1
    assert row["last_collected_at"] == "2026-03-16T02:00:00+00:00"


def test_write_dashboard_latest_creates_json_file(tmp_path: Path) -> None:
    records = [
        _record(
            site="usimsa",
            site_label="유심사",
            country_code="JP",
            country_name_ko="일본",
            option_name="일본 1일 unlimited",
            days=1,
            data_quota_label="unlimited",
            network_type="roaming",
            price_krw=4000,
            collected_at="2026-03-16T00:00:00+00:00",
        )
    ]
    metadata = RunMetadata(
        run_id="run-write",
        collected_at="2026-03-16T00:10:00+00:00",
        success_count=1,
        failure_count=0,
    )

    output_path = tmp_path / "dashboard" / "data" / "latest.json"
    write_dashboard_latest(records, metadata, output_path=output_path)
    payload = json.loads(output_path.read_text(encoding="utf-8"))

    assert output_path.exists()
    assert payload["summary"]["run_id"] == "run-write"
    assert payload["comparison_rows"][0]["country_code"] == "JP"
