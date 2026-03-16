from __future__ import annotations

from pathlib import Path

import yaml

from app.models import SourceTarget


def load_source_targets(
    registry_path: Path,
    selected_sites: list[str] | None = None,
    selected_countries: list[str] | None = None,
) -> list[SourceTarget]:
    payload = yaml.safe_load(registry_path.read_text(encoding="utf-8"))
    selected_site_set = {site.lower() for site in (selected_sites or [])}
    selected_country_set = {country.upper() for country in (selected_countries or [])}
    targets: list[SourceTarget] = []

    for site_entry in payload.get("targets", []):
        site = site_entry["site"]
        if selected_site_set and site.lower() not in selected_site_set:
            continue

        for country in site_entry.get("countries", []):
            country_code = country["country_code"]
            if selected_country_set and country_code.upper() not in selected_country_set:
                continue
            targets.append(
                SourceTarget(
                    site=site,
                    site_label=site_entry["site_label"],
                    country_code=country_code,
                    country_name_ko=country["country_name_ko"],
                    source_url=country["source_url"],
                    parser_hint=site_entry.get("parser_hint", "unknown"),
                )
            )

    return targets
