from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from app.models import NormalizedPriceRecord, OutputContract, RunMetadata


def ensure_output_dirs(contract: OutputContract) -> None:
    contract.root.mkdir(parents=True, exist_ok=True)
    contract.latest_dir.mkdir(parents=True, exist_ok=True)
    contract.history_dir.mkdir(parents=True, exist_ok=True)
    contract.runs_dir.mkdir(parents=True, exist_ok=True)


def write_records(contract: OutputContract, records: list[NormalizedPriceRecord]) -> None:
    payload = [asdict(record) for record in records]
    _write_json(contract.latest_dir / "records.json", payload)
    _write_json(contract.history_dir / "records.json", payload)


def write_run_metadata(contract: OutputContract, metadata: RunMetadata) -> None:
    payload = asdict(metadata)
    _write_json(contract.latest_dir / "run_metadata.json", payload)
    _write_json(contract.runs_dir / f"{metadata.run_id}.json", payload)


def append_failures(contract: OutputContract, failures: list[dict[str, Any]]) -> None:
    if not failures:
        return
    with contract.failed_log.open("a", encoding="utf-8") as handle:
        for failure in failures:
            handle.write(json.dumps(failure, ensure_ascii=False) + "\n")


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
