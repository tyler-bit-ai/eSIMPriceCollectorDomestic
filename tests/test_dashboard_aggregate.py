from __future__ import annotations

import json
from pathlib import Path

from app.models import NormalizedPriceRecord, RunMetadata
from app.output.dashboard_data import (
    build_dashboard_payload,
    write_dashboard_latest,
    write_dashboard_publish_bundle,
)


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
            site="usimsa",
            site_label="유심사",
            country_code="JP",
            country_name_ko="일본",
            option_name="일본 3일 1GB local",
            days=3,
            data_quota_label="1GB",
            network_type="local",
            price_krw=6800,
            collected_at="2026-03-16T02:10:00+00:00",
        ),
        _record(
            site="pindirect",
            site_label="핀다이렉트",
            country_code="JP",
            country_name_ko="일본",
            option_name="일본 3일 1GB local",
            days=3,
            data_quota_label="1GB",
            network_type="local",
            price_krw=4300,
            collected_at="2026-03-16T02:20:00+00:00",
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

    assert payload["summary"]["record_count"] == 5
    assert payload["summary"]["country_count"] == 2
    assert payload["summary"]["site_count"] == 2
    assert payload["summary"]["lowest_price_krw"] == 4300
    assert payload["summary"]["network_premium_case_count"] == 2
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
        and item["network_type"] == "roaming"
    )
    assert row["lowest_price_krw"] == 4800
    assert row["option_count"] == 1
    assert row["last_collected_at"] == "2026-03-16T02:00:00+00:00"

    premium = next(
        item
        for item in payload["network_premium_summary"]
        if item["country_code"] == "JP" and item["site"] == "usimsa"
    )
    assert premium["premium_krw"] == 1800
    assert premium["premium_pct"] == 36.0
    assert premium["price_gap_direction"] == "local_higher"

    japan_band = next(
        item for item in payload["price_band_matrix"] if item["country_code"] == "JP"
    )
    assert japan_band["day_cells"][0]["days"] == 3
    assert japan_band["day_cells"][0]["lowest_price_krw"] == 4300
    assert japan_band["day_cells"][0]["quota_count"] == 1
    assert japan_band["day_cells"][0]["site_winners"] == ["핀다이렉트"]


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
    assert "network_premium_summary" in payload
    assert "price_band_matrix" in payload
    assert "competitive_group_count" not in payload["summary"]
    assert "largest_price_gap_krw" not in payload["summary"]
    assert "opportunity_flag_count" not in payload["summary"]
    assert payload["summary"]["network_premium_case_count"] == 0


def test_write_dashboard_publish_bundle_creates_index_and_snapshot_file(tmp_path: Path) -> None:
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
        run_id="run-publish",
        collected_at="2026-03-16T00:10:00+00:00",
        selected_sites=[],
        selected_countries=[],
        success_count=1,
        failure_count=0,
    )

    data_dir = tmp_path / "dashboard" / "data"
    payload = write_dashboard_publish_bundle(records, metadata, data_dir=data_dir)

    latest_path = data_dir / "latest.json"
    index_path = data_dir / "index.json"
    snapshot_path = data_dir / "snapshots" / "run-publish.json"
    index_payload = json.loads(index_path.read_text(encoding="utf-8"))
    snapshot_payload = json.loads(snapshot_path.read_text(encoding="utf-8"))

    assert payload["summary"]["run_id"] == "run-publish"
    assert latest_path.exists()
    assert index_path.exists()
    assert snapshot_path.exists()
    assert index_payload["latest_run_id"] == "run-publish"
    assert index_payload["snapshots"][0]["relative_path"] == "snapshots/run-publish.json"
    assert index_payload["snapshots"][0]["history_date"] == "2026-03-16"
    assert snapshot_payload["summary"]["run_id"] == "run-publish"


def test_dashboard_payload_exposes_empty_premium_rows_when_no_local_roaming_pair() -> None:
    records = [
        _record(
            site="usimsa",
            site_label="유심사",
            country_code="PH",
            country_name_ko="필리핀",
            option_name="필리핀 1일 unlimited",
            days=1,
            data_quota_label="unlimited",
            network_type="roaming",
            price_krw=3500,
            collected_at="2026-03-16T00:00:00+00:00",
        )
    ]
    metadata = RunMetadata(
        run_id="run-single",
        collected_at="2026-03-16T00:10:00+00:00",
        success_count=1,
        failure_count=0,
    )

    payload = build_dashboard_payload(records, metadata)

    assert payload["network_premium_summary"] == []
    assert payload["summary"]["network_premium_case_count"] == 0
