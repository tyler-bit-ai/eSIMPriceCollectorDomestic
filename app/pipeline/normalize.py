from __future__ import annotations

from app.adapters.base import RawOptionRecord
from app.models import NormalizedPriceRecord, SourceTarget


def normalize_option(target: SourceTarget, raw: RawOptionRecord) -> NormalizedPriceRecord:
    return NormalizedPriceRecord(
        site=target.site,
        site_label=target.site_label,
        country_code=target.country_code,
        country_name_ko=target.country_name_ko,
        source_url=target.source_url,
        option_name=raw.option_name,
        days=raw.days,
        data_quota_mb=raw.data_quota_mb,
        data_quota_label=raw.data_quota_label,
        speed_policy=raw.speed_policy,
        network_type=raw.network_type,
        product_type=raw.product_type,
        price_krw=raw.price_krw,
        currency=raw.currency,
        availability_status=raw.availability_status,
        parser_mode=raw.parser_mode,
        evidence=raw.evidence,
        raw_payload_hash=raw.raw_payload_hash,
    )


def validate_record(record: NormalizedPriceRecord) -> None:
    required_text = {
        "site": record.site,
        "country_code": record.country_code,
        "source_url": record.source_url,
        "option_name": record.option_name,
        "currency": record.currency,
        "availability_status": record.availability_status,
    }
    missing = [name for name, value in required_text.items() if not value]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")
