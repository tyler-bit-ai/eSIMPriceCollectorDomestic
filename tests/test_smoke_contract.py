from __future__ import annotations

import json
from pathlib import Path

from app.pipeline.run_crawl import run_crawl


def test_smoke_subset_crawl_generates_dashboard_and_history(tmp_path: Path) -> None:
    project_root = Path(__file__).resolve().parents[1]
    registry_path = project_root / "config" / "source_registry.yml"

    summary = run_crawl(
        registry_path=registry_path,
        output_root=tmp_path / "data",
        selected_sites=["usimsa", "pindirect"],
        selected_countries=["JP"],
    )

    latest_records = tmp_path / "data" / "latest" / "records.json"
    latest_metadata = tmp_path / "data" / "latest" / "run_metadata.json"
    history_records = next((tmp_path / "data" / "history").glob("*/records.json"))
    dashboard_latest = project_root / "dashboard" / "data" / "latest.json"

    assert summary.record_count > 0
    assert summary.metadata.failure_count == 0
    assert latest_records.exists()
    assert latest_metadata.exists()
    assert history_records.exists()
    assert dashboard_latest.exists()

    dashboard_payload = json.loads(dashboard_latest.read_text(encoding="utf-8"))
    assert dashboard_payload["summary"]["site_count"] >= 2
    assert dashboard_payload["summary"]["country_count"] >= 1
    assert len(dashboard_payload["comparison_rows"]) > 0
