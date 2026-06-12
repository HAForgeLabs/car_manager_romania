"""Modul pentru normalizarea datelor brute."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
import zlib

from .helpers import clean_text, parse_date_string, parse_unix_timestamp, safe_float
from .models import AccountData, OrderData, VehicleData

SOURCE_E_ROVINIETA = "e-rovinieta.ro"
SOURCE_CNAIR = "erovinieta.ro"


def _vehicle_from_raw(raw: dict[str, Any]) -> VehicleData:
    active_items = raw.get("vignette_active_status") or []
    active_item = active_items[0] if active_items else None

    expiry = None
    if active_item:
        expiry = (
            parse_unix_timestamp(active_item.get("oProdTransactionEndDate"))
            or parse_date_string(active_item.get("date_stop_availability"))
            or parse_unix_timestamp(raw.get("end_date"))
        )
    else:
        expiry = parse_unix_timestamp(raw.get("end_date"))

    days_remaining = None
    if expiry:
        days_remaining = (expiry.date() - datetime.now(UTC).date()).days

    return VehicleData(
        id=int(raw["id"]),
        plate_no=str(raw.get("_plateNo", "")),
        chasis_no=clean_text(raw.get("_chasisNo")),
        country_name=clean_text((raw.get("country") or {}).get("country")),
        country_code=clean_text((raw.get("country") or {}).get("ccode")),
        category_vignette_title=clean_text((raw.get("category_vignette") or {}).get("title")),
        category_vignette_desc=clean_text((raw.get("category_vignette") or {}).get("desc")),
        category_toll_title=clean_text((raw.get("category_toll") or {}).get("title")),
        category_toll_desc=clean_text((raw.get("category_toll") or {}).get("desc")),
        active_count=int(raw.get("vignette_active_status_count") or 0),
        all_time_count=int(raw.get("vignette_all_time_status_count") or 0),
        has_active_vignette=bool(raw.get("vignette_active_status_count")),
        expiry=expiry,
        days_remaining=days_remaining,
        active_vignette=active_item,
        source=SOURCE_E_ROVINIETA,
        raw=raw,
    )


def _extract_plate_numbers(order: dict[str, Any]) -> list[str]:
    numbers: list[str] = []

    for candidate in (
        order.get("plate_numbers"),
        order.get("plates"),
        order.get("vehicles"),
    ):
        if isinstance(candidate, list):
            for value in candidate:
                if value:
                    numbers.append(str(value))

    for key, value in order.items():
        if "plate" in key.lower() and value:
            if isinstance(value, list):
                numbers.extend(str(item) for item in value if item)
            else:
                numbers.append(str(value))

    deduped: list[str] = []
    seen: set[str] = set()
    for number in numbers:
        normalized = number.strip().upper()
        if normalized and normalized not in seen:
            seen.add(normalized)
            deduped.append(normalized)

    return deduped


def _order_from_raw(raw: dict[str, Any], order_type: str) -> OrderData:
    return OrderData(
        id=int(raw["id"]),
        order_type=order_type,
        status_name=clean_text((raw.get("status") or {}).get("name")) or "Necunoscută",
        date=clean_text(raw.get("date")),
        emitted_at=parse_unix_timestamp(raw.get("orderEmittedTime")) or parse_unix_timestamp(raw.get("orderSaveTime")),
        total_lei=safe_float(raw.get("orderTotalLei")),
        total_euro=safe_float(raw.get("orderTotalEuro")),
        value_total=safe_float(raw.get("valueTotal")),
        plate_numbers=_extract_plate_numbers(raw),
        invoice=clean_text(raw.get("orderInvoice")),
        source=SOURCE_E_ROVINIETA,
        raw=raw,
    )


def normalize_payload(payload: dict[str, Any]) -> AccountData:
    """Funcție pentru normalizare payload."""
    raw_vehicles = ((payload.get("vehicles") or {}).get("data") or {}).get("vehicles") or []
    raw_orders = (payload.get("orders") or {}).get("orders") or {}
    raw_profiles = (payload.get("profiles") or {}).get("profiles") or []
    raw_tokens = (payload.get("tokens") or {}).get("tokens") or []

    vehicles = [_vehicle_from_raw(item) for item in raw_vehicles]

    orders: list[OrderData] = []
    orders.extend(_order_from_raw(item, "rovinieta") for item in (raw_orders.get("orders_vignette") or []))
    orders.extend(_order_from_raw(item, "taxa_pod") for item in (raw_orders.get("orders_toll") or []))
    orders.sort(key=lambda item: item.emitted_at or datetime.min.replace(tzinfo=UTC), reverse=True)

    return AccountData(
        account=payload.get("account") or {},
        vehicles=vehicles,
        orders=orders[:10],
        profiles=list(raw_profiles),
        tokens=list(raw_tokens),
        fetched_at=datetime.now(UTC),
    )



def _vehicle_from_cnair_raw(raw: dict[str, Any]) -> VehicleData | None:
    """Normalizează un vehicul primit din portalul oficial CNAIR."""

    entity = raw.get("entity") or {}
    if not isinstance(entity, dict):
        return None

    plate_no = clean_text(entity.get("plateNo"))
    if not plate_no:
        return None

    raw_vignettes = raw.get("userDetailsVignettes") or []
    if not isinstance(raw_vignettes, list):
        raw_vignettes = []

    active_items: list[dict[str, Any]] = []
    now_date = datetime.now(UTC).date()
    for item in raw_vignettes:
        if not isinstance(item, dict):
            continue
        start = parse_unix_timestamp(item.get("vignetteStartDate"))
        stop = parse_unix_timestamp(item.get("vignetteStopDate"))
        normalized_item = {
            **item,
            "date_start_availability": start.date().isoformat() if start else None,
            "date_stop_availability": stop.date().isoformat() if stop else None,
            "oProdVignetteSerie": item.get("vignetteSeries") or item.get("series"),
            "oProdPeriodName": item.get("vignettePeriod") or item.get("period"),
            "oProdPrice": item.get("priceLei") or item.get("price"),
            "oProdPriceEuro": item.get("priceEuro"),
            "oProdTransactionID": item.get("transactionId") or item.get("id"),
            "source": SOURCE_CNAIR,
        }
        if stop is not None and stop.date() >= now_date:
            active_items.append(normalized_item)

    active_items.sort(
        key=lambda item: parse_unix_timestamp(item.get("vignetteStopDate")) or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    active_item = active_items[0] if active_items else None
    expiry = parse_unix_timestamp(active_item.get("vignetteStopDate")) if active_item else None

    days_remaining = None
    if expiry:
        days_remaining = (expiry.date() - now_date).days

    sold = entity.get("sold") or {}
    if not isinstance(sold, dict):
        sold = {}

    vehicle_category = clean_text(sold.get("vehicleCategory"))
    vignette_category = None
    if active_item:
        vignette_category = clean_text(active_item.get("vignetteCategory"))

    return VehicleData(
        id=int(entity.get("id") or zlib.crc32(f"{SOURCE_CNAIR}:{plate_no}".encode("utf-8"))),
        plate_no=plate_no,
        chasis_no=clean_text(entity.get("vin")),
        country_name="România" if entity.get("tara") == 1 else clean_text(entity.get("tara")),
        country_code="RO" if entity.get("tara") == 1 else None,
        category_vignette_title=vignette_category,
        category_vignette_desc=vehicle_category,
        category_toll_title=vehicle_category,
        category_toll_desc=vehicle_category,
        active_count=len(active_items),
        all_time_count=len(raw_vignettes),
        has_active_vignette=active_item is not None,
        expiry=expiry,
        days_remaining=days_remaining,
        active_vignette=active_item,
        source=SOURCE_CNAIR,
        raw=raw,
    )


def normalize_cnair_payload(payload: dict[str, Any]) -> AccountData:
    """Normalizează payload-ul primit din portalul oficial CNAIR erovinieta.ro."""

    raw_pages = payload.get("dashboard_pages") or []
    vehicles: list[VehicleData] = []

    for page in raw_pages:
        if not isinstance(page, dict):
            continue
        for item in page.get("view") or []:
            if not isinstance(item, dict):
                continue
            vehicle = _vehicle_from_cnair_raw(item)
            if vehicle is not None:
                vehicles.append(vehicle)

    return AccountData(
        account=payload.get("account") or {},
        vehicles=vehicles,
        orders=[],
        profiles=[],
        tokens=[],
        fetched_at=datetime.now(UTC),
    )


def _plate_key(value: str | None) -> str:
    """Normalizează numărul de înmatriculare pentru deduplicare."""

    return "".join(ch for ch in str(value or "").upper() if ch.isalnum())


def _vehicle_rank(vehicle: VehicleData) -> tuple[int, int, datetime]:
    """Calculează prioritatea vehiculului când aceeași mașină apare în două portaluri."""

    has_active = 1 if vehicle.has_active_vignette else 0
    expiry_known = 1 if vehicle.expiry is not None else 0
    expiry = vehicle.expiry or datetime.min.replace(tzinfo=UTC)
    return has_active, expiry_known, expiry


def merge_account_data(accounts: list[AccountData]) -> AccountData:
    """Combină datele din e-rovinieta.ro și portalul oficial CNAIR."""

    vehicles_by_plate: dict[str, VehicleData] = {}
    orders: list[OrderData] = []
    profiles: list[dict[str, Any]] = []
    tokens: list[dict[str, Any]] = []
    account: dict[str, Any] = {}
    fetched_at = datetime.now(UTC)

    for item in accounts:
        if not account and item.account:
            account = item.account
        profiles.extend(item.profiles)
        tokens.extend(item.tokens)
        orders.extend(item.orders)
        fetched_at = max(fetched_at, item.fetched_at)

        for vehicle in item.vehicles:
            key = _plate_key(vehicle.plate_no)
            if not key:
                continue
            existing = vehicles_by_plate.get(key)
            if existing is None or _vehicle_rank(vehicle) > _vehicle_rank(existing):
                vehicles_by_plate[key] = vehicle

    orders.sort(key=lambda item: item.emitted_at or datetime.min.replace(tzinfo=UTC), reverse=True)

    return AccountData(
        account=account,
        vehicles=list(vehicles_by_plate.values()),
        orders=orders[:10],
        profiles=profiles,
        tokens=tokens,
        fetched_at=fetched_at,
    )
