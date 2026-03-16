from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from app.models import NormalizedPriceRecord, RunMetadata


DEFAULT_DASHBOARD_DATA_DIR = Path("dashboard/data")


def _safe_min_price(rows: list[dict]) -> int | None:
    prices = [item["lowest_price_krw"] for item in rows if item["lowest_price_krw"] is not None]
    return min(prices) if prices else None


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

    competitive_summary = []
    price_gap_rows = []
    grouped_competition: dict[tuple, list[dict]] = defaultdict(list)
    for row in comparison_rows:
        key = (
            row["country_code"],
            row["days"],
            row["data_quota_label"],
            row["network_type"],
        )
        grouped_competition[key].append(row)

    for key, grouped in grouped_competition.items():
        grouped_sorted = sorted(
            grouped,
            key=lambda item: (
                item["lowest_price_krw"] is None,
                item["lowest_price_krw"] if item["lowest_price_krw"] is not None else 10**12,
            ),
        )
        winner = grouped_sorted[0]
        runner_up = grouped_sorted[1] if len(grouped_sorted) > 1 else None
        gap_krw = None
        gap_pct = None
        if runner_up and winner["lowest_price_krw"] is not None and runner_up["lowest_price_krw"] is not None:
            gap_krw = runner_up["lowest_price_krw"] - winner["lowest_price_krw"]
            if runner_up["lowest_price_krw"] > 0:
                gap_pct = round(gap_krw / runner_up["lowest_price_krw"] * 100, 2)

        competitive_summary.append(
            {
                "country_code": key[0],
                "country_name_ko": winner["country_name_ko"],
                "days": key[1],
                "data_quota_label": key[2],
                "network_type": key[3],
                "winner_site": winner["site"],
                "winner_site_label": winner["site_label"],
                "winner_price_krw": winner["lowest_price_krw"],
                "runner_up_site": runner_up["site"] if runner_up else None,
                "runner_up_site_label": runner_up["site_label"] if runner_up else None,
                "runner_up_price_krw": runner_up["lowest_price_krw"] if runner_up else None,
                "gap_krw": gap_krw,
                "gap_pct": gap_pct,
            }
        )

        if runner_up:
            price_gap_rows.append(
                {
                    "country_code": key[0],
                    "country_name_ko": winner["country_name_ko"],
                    "days": key[1],
                    "data_quota_label": key[2],
                    "network_type": key[3],
                    "winner_site": winner["site"],
                    "winner_site_label": winner["site_label"],
                    "winner_price_krw": winner["lowest_price_krw"],
                    "loser_site": runner_up["site"],
                    "loser_site_label": runner_up["site_label"],
                    "loser_price_krw": runner_up["lowest_price_krw"],
                    "gap_krw": gap_krw,
                    "gap_pct": gap_pct,
                    "source_url": winner["source_url"],
                }
            )

    price_gap_rows.sort(
        key=lambda item: (
            item["gap_krw"] is None,
            -(item["gap_krw"] or -1),
            item["country_code"],
            item["days"],
        )
    )

    network_premium_summary = []
    grouped_network: dict[tuple, dict[str, dict]] = defaultdict(dict)
    for row in comparison_rows:
        key = (row["country_code"], row["site"], row["days"], row["data_quota_label"])
        grouped_network[key][row["network_type"]] = row

    for key, network_rows in grouped_network.items():
        local_row = network_rows.get("local")
        roaming_row = network_rows.get("roaming")
        if not local_row or not roaming_row:
            continue
        local_price = local_row["lowest_price_krw"]
        roaming_price = roaming_row["lowest_price_krw"]
        premium_krw = None
        premium_pct = None
        if local_price is not None and roaming_price is not None:
            premium_krw = local_price - roaming_price
            if roaming_price > 0:
                premium_pct = round(premium_krw / roaming_price * 100, 2)
        network_premium_summary.append(
            {
                "country_code": key[0],
                "country_name_ko": local_row["country_name_ko"],
                "site": key[1],
                "site_label": local_row["site_label"],
                "days": key[2],
                "data_quota_label": key[3],
                "local_price_krw": local_price,
                "roaming_price_krw": roaming_price,
                "premium_krw": premium_krw,
                "premium_pct": premium_pct,
                "price_gap_direction": "local_higher" if premium_krw is not None and premium_krw > 0 else "roaming_higher" if premium_krw is not None and premium_krw < 0 else "same",
                "source_url": local_row["source_url"],
            }
        )

    network_premium_summary.sort(
        key=lambda item: (
            item["premium_krw"] is None,
            -(item["premium_krw"] or -1),
            item["country_code"],
            item["site"],
        )
    )

    opportunity_flags = []
    for row in price_gap_rows:
        if row["gap_krw"] is None:
            continue
        if row["gap_krw"] >= 2000 or (row["gap_pct"] is not None and row["gap_pct"] >= 20):
            opportunity_flags.append(
                {
                    "flag_type": "price_gap",
                    "severity": "high" if row["gap_krw"] >= 5000 else "medium",
                    "country_code": row["country_code"],
                    "country_name_ko": row["country_name_ko"],
                    "days": row["days"],
                    "data_quota_label": row["data_quota_label"],
                    "network_type": row["network_type"],
                    "winner_site": row["winner_site"],
                    "winner_site_label": row["winner_site_label"],
                    "loser_site": row["loser_site"],
                    "loser_site_label": row["loser_site_label"],
                    "gap_krw": row["gap_krw"],
                    "gap_pct": row["gap_pct"],
                    "message": f"{row['country_name_ko']} {row['days']}일 {row['data_quota_label']} {row['network_type']}에서 {row['winner_site_label']}가 {row['loser_site_label']} 대비 {row['gap_krw']}원 저렴",
                }
            )

    for row in network_premium_summary:
        if row["premium_krw"] is None:
            continue
        if abs(row["premium_krw"]) >= 1500:
            direction = "비쌈" if row["premium_krw"] > 0 else "저렴"
            opportunity_flags.append(
                {
                    "flag_type": "network_premium",
                    "severity": "medium",
                    "country_code": row["country_code"],
                    "country_name_ko": row["country_name_ko"],
                    "days": row["days"],
                    "data_quota_label": row["data_quota_label"],
                    "site": row["site"],
                    "site_label": row["site_label"],
                    "premium_krw": row["premium_krw"],
                    "premium_pct": row["premium_pct"],
                    "message": f"{row['country_name_ko']} {row['days']}일 {row['data_quota_label']}에서 {row['site_label']} local이 roaming 대비 {abs(row['premium_krw'])}원 {direction}",
                }
            )

    opportunity_flags.sort(
        key=lambda item: (
            0 if item["severity"] == "high" else 1,
            -(item.get("gap_krw") or abs(item.get("premium_krw") or 0)),
        )
    )

    price_band_matrix = []
    grouped_price_band: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in comparison_rows:
        grouped_price_band[(row["country_code"], row["country_name_ko"])].append(row)

    for (country_code, country_name), grouped in grouped_price_band.items():
        day_cells = []
        grouped_days: dict[int, list[dict]] = defaultdict(list)
        for row in grouped:
            if row["days"] is not None:
                grouped_days[row["days"]].append(row)
        for days, day_group in sorted(grouped_days.items()):
            day_cells.append(
                {
                    "days": days,
                    "lowest_price_krw": _safe_min_price(day_group),
                    "site_winners": sorted({item["site_label"] for item in day_group if item["lowest_price_krw"] == _safe_min_price(day_group)}),
                    "quota_count": len({item["data_quota_label"] for item in day_group}),
                }
            )
        price_band_matrix.append(
            {
                "country_code": country_code,
                "country_name_ko": country_name,
                "day_cells": day_cells,
            }
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
        "network_premium_case_count": len(network_premium_summary),
    }

    return {
        "summary": summary,
        "filters": filters,
        "country_summary": country_summary,
        "site_summary": site_summary,
        "comparison_rows": comparison_rows,
        "competitive_summary": competitive_summary,
        "price_gap_rows": price_gap_rows,
        "network_premium_summary": network_premium_summary,
        "opportunity_flags": opportunity_flags,
        "price_band_matrix": price_band_matrix,
    }


def write_dashboard_latest(
    records: list[NormalizedPriceRecord],
    metadata: RunMetadata,
    output_path: Path = DEFAULT_DASHBOARD_DATA_DIR / "latest.json",
) -> dict:
    payload = build_dashboard_payload(records, metadata)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return payload


def write_dashboard_publish_bundle(
    records: list[NormalizedPriceRecord],
    metadata: RunMetadata,
    data_dir: Path = DEFAULT_DASHBOARD_DATA_DIR,
) -> dict:
    payload = write_dashboard_latest(
        records,
        metadata,
        output_path=data_dir / "latest.json",
    )

    snapshots_dir = data_dir / "snapshots"
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    snapshot_path = snapshots_dir / f"{metadata.run_id}.json"
    snapshot_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    snapshot_entry = _build_snapshot_entry(metadata, snapshot_path.relative_to(data_dir))
    index_path = data_dir / "index.json"
    index_payload = _load_dashboard_index(index_path)
    snapshots = [
        item
        for item in index_payload.get("snapshots", [])
        if item.get("run_id") != metadata.run_id
    ]
    snapshots.append(snapshot_entry)
    snapshots.sort(
        key=lambda item: (
            item.get("collected_at") is None,
            item.get("collected_at") or "",
        ),
        reverse=True,
    )

    index_payload = {
        "latest_run_id": metadata.run_id,
        "generated_at": metadata.collected_at,
        "snapshots": snapshots,
    }
    index_path.write_text(
        json.dumps(index_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return payload


def _load_dashboard_index(index_path: Path) -> dict:
    if not index_path.exists():
        return {"latest_run_id": None, "generated_at": None, "snapshots": []}
    try:
        return json.loads(index_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"latest_run_id": None, "generated_at": None, "snapshots": []}


def _build_snapshot_entry(metadata: RunMetadata, relative_path: Path) -> dict:
    collected_at = metadata.collected_at
    label = metadata.run_id
    try:
        stamp = datetime.fromisoformat(collected_at).strftime("%Y-%m-%d %H:%M UTC")
        label = f"{stamp} · {metadata.run_id}"
    except ValueError:
        pass

    history_date = None
    try:
        history_date = datetime.fromisoformat(collected_at).date().isoformat()
    except ValueError:
        history_date = None

    return {
        "run_id": metadata.run_id,
        "collected_at": metadata.collected_at,
        "label": label,
        "history_date": history_date,
        "relative_path": relative_path.as_posix(),
        "selected_sites": list(metadata.selected_sites),
        "selected_countries": list(metadata.selected_countries),
    }
