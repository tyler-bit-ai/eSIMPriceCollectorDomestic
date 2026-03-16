from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import asdict
from pathlib import Path

from app.models import NormalizedPriceRecord, RunMetadata


def build_dashboard_payload(
    records: list[NormalizedPriceRecord],
    metadata: RunMetadata,
) -> dict:
    record_dicts = [asdict(record) for record in records]
    available_records = [
        record for record in record_dicts if record["availability_status"] == "available"
    ]

    filters = {
        "sites": sorted({record["site"] for record in record_dicts}),
        "site_labels": sorted({record["site_label"] for record in record_dicts}),
        "countries": sorted(
            {
                record["country_code"]: record["country_name_ko"]
                for record in record_dicts
            }.items()
        ),
        "days": sorted({record["days"] for record in record_dicts if record["days"] is not None}),
        "data_quota_labels": sorted(
            {record["data_quota_label"] for record in record_dicts if record["data_quota_label"]}
        ),
        "network_types": sorted(
            {record["network_type"] for record in record_dicts if record["network_type"]}
        ),
    }

    comparison_rows = []
    grouped_rows: dict[tuple, list[dict]] = defaultdict(list)
    for record in available_records:
        key = (
            record["country_code"],
            record["site"],
            record["days"],
            record["data_quota_label"],
            record["network_type"],
        )
        grouped_rows[key].append(record)

    for key, grouped in grouped_rows.items():
        cheapest = min(
            grouped,
            key=lambda item: (
                item["price_krw"] is None,
                item["price_krw"] if item["price_krw"] is not None else 10**12,
            ),
        )
        comparison_rows.append(
            {
                "country_code": key[0],
                "country_name_ko": cheapest["country_name_ko"],
                "site": key[1],
                "site_label": cheapest["site_label"],
                "days": key[2],
                "data_quota_label": key[3],
                "network_type": key[4],
                "lowest_price_krw": cheapest["price_krw"],
                "option_count": len(grouped),
                "source_url": cheapest["source_url"],
                "last_collected_at": max(item["collected_at"] for item in grouped),
                "sample_option_name": cheapest["option_name"],
            }
        )

    comparison_rows.sort(
        key=lambda item: (
            item["country_code"],
            item["days"] if item["days"] is not None else 10**9,
            item["data_quota_label"] or "",
            item["site"],
            item["network_type"] or "",
        )
    )

    country_summary = []
    grouped_country: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for record in available_records:
        grouped_country[(record["country_code"], record["country_name_ko"])].append(record)

    for (country_code, country_name), grouped in grouped_country.items():
        prices = [item["price_krw"] for item in grouped if item["price_krw"] is not None]
        country_summary.append(
            {
                "country_code": country_code,
                "country_name_ko": country_name,
                "site_count": len({item["site"] for item in grouped}),
                "option_count": len(grouped),
                "lowest_price_krw": min(prices) if prices else None,
                "last_collected_at": max(item["collected_at"] for item in grouped),
            }
        )

    country_summary.sort(key=lambda item: item["country_code"])

    site_summary = []
    grouped_site: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for record in available_records:
        grouped_site[(record["site"], record["site_label"])].append(record)

    for (site, site_label), grouped in grouped_site.items():
        prices = [item["price_krw"] for item in grouped if item["price_krw"] is not None]
        site_summary.append(
            {
                "site": site,
                "site_label": site_label,
                "country_count": len({item["country_code"] for item in grouped}),
                "option_count": len(grouped),
                "lowest_price_krw": min(prices) if prices else None,
                "last_collected_at": max(item["collected_at"] for item in grouped),
            }
        )

    site_summary.sort(key=lambda item: item["site"])

    prices = [record["price_krw"] for record in available_records if record["price_krw"] is not None]
    summary = {
        "run_id": metadata.run_id,
        "last_collected_at": metadata.collected_at,
        "record_count": len(record_dicts),
        "available_record_count": len(available_records),
        "country_count": len(country_summary),
        "site_count": len(site_summary),
        "comparison_row_count": len(comparison_rows),
        "lowest_price_krw": min(prices) if prices else None,
        "selected_sites": metadata.selected_sites,
        "selected_countries": metadata.selected_countries,
    }

    return {
        "summary": summary,
        "filters": filters,
        "country_summary": country_summary,
        "site_summary": site_summary,
        "comparison_rows": comparison_rows,
    }


def write_dashboard_latest(
    records: list[NormalizedPriceRecord],
    metadata: RunMetadata,
    output_path: Path = Path("dashboard/data/latest.json"),
) -> dict:
    payload = build_dashboard_payload(records, metadata)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return payload
