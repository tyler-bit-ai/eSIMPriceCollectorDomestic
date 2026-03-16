from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal


AvailabilityStatus = Literal["available", "sold_out", "unknown", "error"]
ParserMode = Literal["static_html", "next_stream", "next_data", "browser", "unknown"]


@dataclass(slots=True)
class SourceTarget:
    site: str
    site_label: str
    country_code: str
    country_name_ko: str
    source_url: str
    parser_hint: ParserMode = "unknown"


@dataclass(slots=True)
class NormalizedPriceRecord:
    site: str
    site_label: str
    country_code: str
    country_name_ko: str
    source_url: str
    option_name: str
    days: int | None
    data_quota_mb: int | None
    data_quota_label: str | None
    speed_policy: str | None
    network_type: str | None
    product_type: str = "esim"
    price_krw: int | None = None
    currency: str = "KRW"
    availability_status: AvailabilityStatus = "unknown"
    collected_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    parser_mode: ParserMode = "unknown"
    evidence: dict[str, Any] = field(default_factory=dict)
    raw_payload_hash: str | None = None


@dataclass(slots=True)
class RunMetadata:
    run_id: str
    collected_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    registry_path: str = "config/source_registry.yml"
    output_root: str = "data"
    selected_sites: list[str] = field(default_factory=list)
    selected_countries: list[str] = field(default_factory=list)
    success_count: int = 0
    failure_count: int = 0


@dataclass(slots=True)
class OutputContract:
    root: Path
    latest_dir: Path
    history_dir: Path
    runs_dir: Path
    failed_log: Path

