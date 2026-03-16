from __future__ import annotations

import argparse
from pathlib import Path

from app.output.paths import DEFAULT_DATA_ROOT
from app.pipeline.run_crawl import run_crawl


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app",
        description="Domestic eSIM price collector CLI.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    crawl_parser = subparsers.add_parser(
        "crawl",
        help="Run the crawl pipeline using the configured source registry.",
    )
    crawl_parser.add_argument(
        "--registry",
        type=Path,
        default=Path("config/source_registry.yml"),
        help="Path to the source registry file.",
    )
    crawl_parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_DATA_ROOT,
        help="Root directory for latest/history outputs.",
    )
    crawl_parser.add_argument(
        "--site",
        action="append",
        default=[],
        help="Optional site filter. Repeat to select multiple sites.",
    )
    crawl_parser.add_argument(
        "--country",
        action="append",
        default=[],
        help="Optional country filter. Repeat to select multiple countries.",
    )
    crawl_parser.set_defaults(handler=handle_crawl)
    return parser


def handle_crawl(args: argparse.Namespace) -> int:
    summary = run_crawl(
        registry_path=args.registry,
        output_root=args.out,
        selected_sites=args.site,
        selected_countries=args.country,
    )
    print(f"run_id={summary.metadata.run_id}")
    print(f"success_count={summary.metadata.success_count}")
    print(f"failure_count={summary.metadata.failure_count}")
    print(f"records_written={summary.record_count}")
    print(f"latest_dir={summary.output.latest_dir}")
    print(f"history_dir={summary.output.history_dir}")
    print(f"failed_log={summary.output.failed_log}")
    return 0 if summary.metadata.failure_count == 0 else 2


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    handler = getattr(args, "handler", None)
    if handler is None:
        parser.print_help()
        return 1
    return handler(args)
