from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.models import ParserMode, SourceTarget


@dataclass(slots=True)
class RawOptionRecord:
    option_name: str
    days: int | None = None
    data_quota_mb: int | None = None
    data_quota_label: str | None = None
    speed_policy: str | None = None
    network_type: str | None = None
    product_type: str = "esim"
    price_krw: int | None = None
    currency: str = "KRW"
    availability_status: str = "available"
    parser_mode: ParserMode = "unknown"
    evidence: dict[str, Any] = field(default_factory=dict)
    raw_payload_hash: str | None = None


class SiteAdapter(ABC):
    site_name: str

    @abstractmethod
    def fetch(self, target: SourceTarget) -> list[RawOptionRecord]:
        raise NotImplementedError


_ADAPTERS: dict[str, SiteAdapter] = {}


def register_adapter(site: str, adapter: SiteAdapter) -> None:
    _ADAPTERS[site] = adapter


def get_adapter(site: str) -> SiteAdapter | None:
    return _ADAPTERS.get(site)


def clear_adapters() -> None:
    _ADAPTERS.clear()
