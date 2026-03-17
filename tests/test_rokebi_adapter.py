from __future__ import annotations

from pathlib import Path

from app.adapters.rokebi import parse_rokebi_html
from app.models import SourceTarget


def _target() -> SourceTarget:
    return SourceTarget(
        site="rokebi",
        site_label="로밍도깨비",
        country_code="JP",
        country_name_ko="일본",
        source_url="https://www.rokebi.com/store?keyword=%EC%9D%BC%EB%B3%B8&tab=search&categoryItem=463",
        parser_hint="next_stream",
    )


def test_parse_rokebi_fixture_extracts_local_and_roaming_records() -> None:
    html = Path("tests/fixtures/rokebi_japan_roaming.html").read_text(encoding="utf-8")

    records = parse_rokebi_html(html, _target())

    assert len(records) > 50
    assert {"local", "roaming"} <= {record.network_type for record in records}
    assert {record.speed_policy for record in records} >= {
        "daily_cap_then_throttled",
        "full_speed",
        "full_speed_until_quota_exhausted",
    }

    total_plan = next(record for record in records if "3GB 30일" in record.option_name and record.network_type == "local")
    daily_plan = next(record for record in records if record.option_name == "무제한 1일")
    allday_plan = next(record for record in records if "올데이 플러스" in record.option_name)

    assert total_plan.data_quota_mb == 3072
    assert total_plan.data_quota_label == "3GB"
    assert total_plan.speed_policy == "full_speed_until_quota_exhausted"
    assert daily_plan.speed_policy == "daily_cap_then_throttled"
    assert allday_plan.data_quota_mb is None
    assert allday_plan.data_quota_label == "unlimited"
    assert allday_plan.evidence["payload_path"].startswith("allProd[")
