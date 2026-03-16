from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.models import OutputContract


DEFAULT_DATA_ROOT = Path("data")


def build_output_contract(root: Path = DEFAULT_DATA_ROOT) -> OutputContract:
    day_stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    latest_dir = root / "latest"
    history_dir = root / "history" / day_stamp
    runs_dir = root / "runs"
    failed_log = root / "failed.jsonl"
    return OutputContract(
        root=root,
        latest_dir=latest_dir,
        history_dir=history_dir,
        runs_dir=runs_dir,
        failed_log=failed_log,
    )
