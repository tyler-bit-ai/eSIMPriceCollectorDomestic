from __future__ import annotations

import json
from pathlib import Path

from app.adapters.base import clear_adapters, register_adapter
from app.adapters.maaltalk import (
    MaaltalkAdapter,
    load_html_fixture as load_maaltalk_html_fixture,
    load_payload_fixture as load_maaltalk_payload_fixture,
)
from app.adapters.rokebi import parse_rokebi_html
from app.pipeline.run_crawl import run_crawl


def test_smoke_subset_crawl_generates_dashboard_and_history(tmp_path: Path) -> None:
    project_root = Path(__file__).resolve().parents[1]
    registry_path = project_root / "config" / "source_registry.yml"
    dashboard_latest = project_root / "dashboard" / "data" / "latest.json"
    dashboard_before = dashboard_latest.stat().st_mtime_ns if dashboard_latest.exists() else None

    summary = run_crawl(
        registry_path=registry_path,
        output_root=tmp_path / "data",
        selected_sites=["usimsa", "pindirect"],
        selected_countries=["JP"],
    )

    latest_records = tmp_path / "data" / "latest" / "records.json"
    latest_metadata = tmp_path / "data" / "latest" / "run_metadata.json"
    history_records = next((tmp_path / "data" / "history").glob("*/records.json"))
    dashboard_index = project_root / "dashboard" / "data" / "index.json"
    dashboard_index_before = dashboard_index.stat().st_mtime_ns if dashboard_index.exists() else None

    assert summary.record_count > 0
    assert summary.metadata.failure_count == 0
    assert latest_records.exists()
    assert latest_metadata.exists()
    assert history_records.exists()
    assert dashboard_latest.exists()
    assert dashboard_latest.stat().st_mtime_ns == dashboard_before
    if dashboard_index_before is not None:
        assert dashboard_index.stat().st_mtime_ns == dashboard_index_before


def test_publish_dashboard_flag_does_not_refresh_dashboard_latest_for_subset_run(
    tmp_path: Path,
    monkeypatch,
) -> None:
    project_root = Path(__file__).resolve().parents[1]
    registry_path = project_root / "config" / "source_registry.yml"
    output_root = tmp_path / "data"
    dashboard_latest = tmp_path / "dashboard" / "data" / "latest.json"
    dashboard_index = tmp_path / "dashboard" / "data" / "index.json"
    dashboard_latest.parent.mkdir(parents=True, exist_ok=True)
    dashboard_latest.write_text('{"summary":{"site_count":99}}', encoding="utf-8")
    dashboard_index.write_text('{"latest_run_id":"old-run","snapshots":[]}', encoding="utf-8")
    before = dashboard_latest.read_text(encoding="utf-8")
    index_before = dashboard_index.read_text(encoding="utf-8")

    monkeypatch.chdir(tmp_path)

    summary = run_crawl(
        registry_path=registry_path,
        output_root=output_root,
        selected_sites=["usimsa", "pindirect"],
        selected_countries=["JP"],
        publish_dashboard=True,
    )

    assert summary.record_count > 0
    assert dashboard_latest.read_text(encoding="utf-8") == before
    assert dashboard_index.read_text(encoding="utf-8") == index_before


def test_publish_dashboard_flag_refreshes_dashboard_latest_for_full_run(
    tmp_path: Path,
    monkeypatch,
) -> None:
    project_root = Path(__file__).resolve().parents[1]
    registry_path = project_root / "config" / "source_registry.yml"
    output_root = tmp_path / "data"

    monkeypatch.chdir(tmp_path)

    summary = run_crawl(
        registry_path=registry_path,
        output_root=output_root,
        publish_dashboard=True,
    )

    dashboard_data_dir = tmp_path / "dashboard" / "data"
    dashboard_payload = json.loads((dashboard_data_dir / "latest.json").read_text(encoding="utf-8"))
    dashboard_index = json.loads((dashboard_data_dir / "index.json").read_text(encoding="utf-8"))
    snapshot_path = dashboard_data_dir / "snapshots" / f"{summary.metadata.run_id}.json"

    assert summary.record_count > 0
    assert dashboard_payload["summary"]["site_count"] >= 4
    assert dashboard_payload["summary"]["country_count"] >= 4
    assert len(dashboard_payload["comparison_rows"]) > 0
    assert "price_band_matrix" in dashboard_payload
    assert "network_premium_summary" in dashboard_payload
    assert dashboard_index["latest_run_id"] == summary.metadata.run_id
    assert dashboard_index["snapshots"][0]["run_id"] == summary.metadata.run_id
    assert snapshot_path.exists()


def test_subset_crawl_with_fixture_adapters_for_rokebi_and_maaltalk(tmp_path: Path) -> None:
    rokebi_html = Path("tests/fixtures/rokebi_japan_roaming.html").read_text(encoding="utf-8")
    maaltalk_html = load_maaltalk_html_fixture(Path("tests/fixtures/maaltalk_japan.html"))
    maaltalk_payload = load_maaltalk_payload_fixture(Path("tests/fixtures/maaltalk_japan_option_select_step1.json"))

    class FixtureRokebiAdapter:
        def fetch(self, target):
            return parse_rokebi_html(rokebi_html, target)

    class FixtureMaaltalkAdapter(MaaltalkAdapter):
        def fetch_html(self, source_url: str) -> str:
            return maaltalk_html

        def fetch_option_payloads_direct(
            self,
            source_url: str,
            first_options: list[str],
            csrf_token: str | None,
            option_count: int,
        ):
            return [([first_options[0]], maaltalk_payload)]

    clear_adapters()
    register_adapter("rokebi", FixtureRokebiAdapter())
    register_adapter("maaltalk", FixtureMaaltalkAdapter())

    registry_path = tmp_path / "registry.yml"
    registry_path.write_text(
        "\n".join(
            [
                "version: 1",
                "targets:",
                "  - site: rokebi",
                "    site_label: 로밍도깨비",
                "    parser_hint: next_stream",
                "    countries:",
                "      - country_code: JP",
                "        country_name_ko: 일본",
                "        source_url: https://www.rokebi.com/store?keyword=%EC%9D%BC%EB%B3%B8&tab=search&categoryItem=463",
                "  - site: maaltalk",
                "    site_label: 말톡",
                "    parser_hint: static_html",
                "    countries:",
                "      - country_code: JP",
                "        country_name_ko: 일본",
                "        source_url: https://store.maaltalk.com/goods/goods_view.php?goodsNo=1000000265",
            ]
        ),
        encoding="utf-8",
    )

    summary = run_crawl(
        registry_path=registry_path,
        output_root=tmp_path / "data",
        selected_sites=["rokebi", "maaltalk"],
        selected_countries=["JP"],
    )

    latest_records = json.loads((tmp_path / "data" / "latest" / "records.json").read_text(encoding="utf-8"))

    assert summary.record_count > 0
    assert summary.metadata.failure_count == 0
    assert {record["site"] for record in latest_records} == {"rokebi", "maaltalk"}
    assert any(record["network_type"] == "local" for record in latest_records)
