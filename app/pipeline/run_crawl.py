from __future__ import annotations

import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.adapters import ensure_adapter_module
from app.adapters.base import get_adapter
from app.models import NormalizedPriceRecord, OutputContract, RunMetadata
from app.output.dashboard_data import write_dashboard_publish_bundle
from app.output.paths import build_output_contract
from app.output.writer import append_failures, ensure_output_dirs, write_records, write_run_metadata
from app.pipeline.normalize import normalize_option, validate_record
from app.utils.registry import load_source_targets


@dataclass(slots=True)
class CrawlSummary:
    metadata: RunMetadata
    output: OutputContract
    records: list[NormalizedPriceRecord]

    @property
    def record_count(self) -> int:
        return len(self.records)


def run_crawl(
    registry_path: Path,
    output_root: Path,
    selected_sites: list[str] | None = None,
    selected_countries: list[str] | None = None,
    publish_dashboard: bool = False,
) -> CrawlSummary:
    contract = build_output_contract(output_root)
    ensure_output_dirs(contract)

    targets = load_source_targets(registry_path, selected_sites, selected_countries)
    metadata = RunMetadata(
        run_id=f"run-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}",
        registry_path=str(registry_path),
        output_root=str(output_root),
        selected_sites=list(selected_sites or []),
        selected_countries=list(selected_countries or []),
    )

    records: list[NormalizedPriceRecord] = []
    failures: list[dict[str, str]] = []

    for target in targets:
        ensure_adapter_module(target.site)
        adapter = get_adapter(target.site)
        if adapter is None:
            failures.append(
                {
                    "site": target.site,
                    "country_code": target.country_code,
                    "source_url": target.source_url,
                    "error": f"Adapter not registered for site '{target.site}'",
                }
            )
            continue

        try:
            raw_records = adapter.fetch(target)
            normalized = [normalize_option(target, raw) for raw in raw_records]
            for record in normalized:
                validate_record(record)
            records.extend(normalized)
        except Exception as exc:  # pragma: no cover - exercised in tests
            failures.append(
                {
                    "site": target.site,
                    "country_code": target.country_code,
                    "source_url": target.source_url,
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                }
            )

    metadata.success_count = len(records)
    metadata.failure_count = len(failures)

    write_records(contract, records)
    write_run_metadata(contract, metadata)
    append_failures(contract, failures)
    is_subset_run = bool(selected_sites or selected_countries)
    if publish_dashboard and not is_subset_run:
        write_dashboard_publish_bundle(records, metadata)

    return CrawlSummary(metadata=metadata, output=contract, records=records)
