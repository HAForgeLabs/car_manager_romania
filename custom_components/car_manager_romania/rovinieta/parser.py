"""Modul pentru normalizarea datelor brute."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
import zlib

from .helpers import clean_text, parse_date_string, parse_unix_timestamp, safe_float
from .models import AccountData, OrderData, VehicleData

SOURCE_E_ROVINIETA = "e-rovinieta.ro"
SOURCE_CNAIR = "erovinieta.ro"


def _first_value(raw: dict[str, Any], *keys: str) -> Any:
    """Returnează prima valoare non-goală dintr-un dicționar."""

    for key in keys:
        value = raw.get(key)
        if value not in (None, ""):
            return value
    return None


def _dict_text(raw: dict[str, Any] | None, *keys: str) -> str | None:
    """Returnează primul text curat dintr-un dicționar imbricat."""

    if not isinstance(raw, dict):
        return None
    for key in keys:
        value = clean_text(raw.get(key))
        if value:
            return value
    return None


def _extract_e_rovinieta_vehicle_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Extrage defensiv vehiculele din răspunsul e-rovinieta.ro.

    Portalul a avut în timp mici variații de structură. Pentru import nu vrem
    să depindem de o singură formă exactă, mai ales când datele sunt deja
    disponibile în răspunsul serviciului.
    """

    vehicles_payload = payload.get("vehicles") or {}
    candidates = (
        ((vehicles_payload.get("data") or {}).get("vehicles") if isinstance(vehicles_payload, dict) else None),
        (vehicles_payload.get("vehicles") if isinstance(vehicles_payload, dict) else None),
        (vehicles_payload.get("data") if isinstance(vehicles_payload, dict) else None),
        payload.get("vehicle_list"),
        payload.get("items"),
        payload.get("item"),
    )

    for candidate in candidates:
        if isinstance(candidate, list):
            return [item for item in candidate if isinstance(item, dict)]

    return []


def _vehicle_from_raw(raw: dict[str, Any]) -> VehicleData | None:
    """Normalizează defensiv un vehicul primit din e-rovinieta.ro."""

    active_items = raw.get("vignette_active_status") or raw.get("active_vignettes") or []
    if not isinstance(active_items, list):
        active_items = []
    active_item = active_items[0] if active_items else None

    expiry = None
    if active_item:
        expiry = (
            parse_unix_timestamp(active_item.get("oProdTransactionEndDate"))
            or parse_date_string(active_item.get("date_stop_availability"))
            or parse_unix_timestamp(active_item.get("vignetteStopDate"))
            or parse_unix_timestamp(raw.get("end_date"))
        )
    else:
        expiry = (
            parse_unix_timestamp(raw.get("end_date"))
            or parse_date_string(raw.get("vignette_expiry"))
            or parse_date_string(raw.get("vignette_expiry_date"))
        )

    days_remaining = None
    if expiry:
        days_remaining = (expiry.date() - datetime.now(UTC).date()).days

    plate_no = clean_text(
        _first_value(
            raw,
            "_plateNo",
            "plateNo",
            "plate_no",
            "plate",
            "registration_number",
            "registrationNumber",
            "license_plate",
        )
    )
    if not plate_no:
        return None

    country = raw.get("country") if isinstance(raw.get("country"), dict) else {}
    category_vignette = raw.get("category_vignette") if isinstance(raw.get("category_vignette"), dict) else {}
    category_toll = raw.get("category_toll") if isinstance(raw.get("category_toll"), dict) else {}

    active_count = raw.get("vignette_active_status_count")
    if active_count in (None, ""):
        active_count = len(active_items)

    all_time_count = raw.get("vignette_all_time_status_count")
    if all_time_count in (None, ""):
        all_time_count = len(active_items)

    try:
        vehicle_id = int(raw.get("id") or zlib.crc32(f"{SOURCE_E_ROVINIETA}:{plate_no}".encode("utf-8")))
    except (TypeError, ValueError):
        vehicle_id = zlib.crc32(f"{SOURCE_E_ROVINIETA}:{plate_no}".encode("utf-8"))

    return VehicleData(
        id=vehicle_id,
        plate_no=plate_no,
        chasis_no=clean_text(_first_value(raw, "_chasisNo", "chasisNo", "chassisNo", "vin", "VIN")),
        country_name=_dict_text(country, "country", "name", "denumire") or clean_text(raw.get("country_name")),
        country_code=_dict_text(country, "ccode", "code", "cod") or clean_text(raw.get("country_code")),
        category_vignette_title=_dict_text(category_vignette, "title", "name", "cod") or clean_text(raw.get("vignetteCategory")),
        category_vignette_desc=_dict_text(category_vignette, "desc", "description", "name"),
        category_toll_title=_dict_text(category_toll, "title", "name", "cod") or clean_text(raw.get("tollCategory")),
        category_toll_desc=_dict_text(category_toll, "desc", "description", "name"),
        active_count=int(active_count or 0),
        all_time_count=int(all_time_count or 0),
        has_active_vignette=bool(active_count or active_item or (expiry and expiry.date() >= datetime.now(UTC).date())),
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
    raw_vehicles = _extract_e_rovinieta_vehicle_items(payload)
    raw_orders = (payload.get("orders") or {}).get("orders") or {}
    raw_profiles = (payload.get("profiles") or {}).get("profiles") or []
    raw_tokens = (payload.get("tokens") or {}).get("tokens") or []

    vehicles = [vehicle for item in raw_vehicles if (vehicle := _vehicle_from_raw(item)) is not None]

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


def _vehicle_from_cnair_personal_raw(raw: dict[str, Any]) -> VehicleData | None:
    """Normalizează un vehicul din lista personală CNAIR."""

    if not isinstance(raw, dict):
        return None

    # Refolosim normalizatorul pentru dashboard prin aceeași structură internă.
    wrapped = {
        "entity": raw,
        "userDetailsVignettes": raw.get("userDetailsVignettes") or raw.get("vignettes") or [],
    }
    vehicle = _vehicle_from_cnair_raw(wrapped)
    if vehicle is not None:
        return vehicle

    plate_no = clean_text(raw.get("plateNo"))
    if not plate_no:
        return None

    sold = raw.get("sold") if isinstance(raw.get("sold"), dict) else {}
    vehicle_category = clean_text(sold.get("vehicleCategory"))

    return VehicleData(
        id=int(raw.get("id") or zlib.crc32(f"{SOURCE_CNAIR}:{plate_no}".encode("utf-8"))),
        plate_no=plate_no,
        chasis_no=clean_text(raw.get("vin")),
        country_name="România" if raw.get("tara") == 1 else clean_text(raw.get("tara")),
        country_code="RO" if raw.get("tara") == 1 else None,
        category_vignette_title=None,
        category_vignette_desc=vehicle_category,
        category_toll_title=vehicle_category,
        category_toll_desc=vehicle_category,
        active_count=0,
        all_time_count=0,
        has_active_vignette=False,
        expiry=None,
        days_remaining=None,
        active_vignette=None,
        source=SOURCE_CNAIR,
        raw={"entity": raw, "userDetailsVignettes": []},
    )


def _cnair_vehicle_key(vehicle: VehicleData) -> str:
    """Cheie pentru combinarea vehiculelor CNAIR."""

    vin = clean_text(vehicle.chasis_no)
    if vin:
        return f"vin:{vin.upper()}"
    return f"plate:{''.join(ch for ch in vehicle.plate_no.upper() if ch.isalnum())}"


def _prefer_cnair_vehicle(current: VehicleData | None, candidate: VehicleData) -> VehicleData:
    """Alege vehiculul CNAIR cu cele mai multe informații utile."""

    if current is None:
        return candidate
    current_score = (
        1 if current.has_active_vignette else 0,
        1 if current.expiry is not None else 0,
        1 if clean_text(current.category_vignette_title) else 0,
    )
    candidate_score = (
        1 if candidate.has_active_vignette else 0,
        1 if candidate.expiry is not None else 0,
        1 if clean_text(candidate.category_vignette_title) else 0,
    )
    return candidate if candidate_score > current_score else current



def _looks_like_cnair_vehicle(raw: dict[str, Any]) -> bool:
    """Verifică defensiv dacă un dicționar seamănă cu un vehicul CNAIR."""

    if not isinstance(raw, dict):
        return False
    if clean_text(raw.get("plateNo")) and ("vin" in raw or "certificateSeries" in raw or "tara" in raw):
        return True
    entity = raw.get("entity")
    return isinstance(entity, dict) and bool(clean_text(entity.get("plateNo")))


def _collect_cnair_vehicle_dicts(raw: Any) -> list[dict[str, Any]]:
    """Colectează recursiv vehicule CNAIR din răspunsuri ușor diferite.

    Portalul poate întoarce lista sub `item`, `items`, `vehicles`, `data.item`
    sau chiar în răspunsul dashboard sub `view`. Pentru import este mai sigur să
    recunoaștem forma obiectului vehicul, nu doar calea fixă.
    """

    found: list[dict[str, Any]] = []
    if isinstance(raw, dict):
        if _looks_like_cnair_vehicle(raw):
            found.append(raw)
        for key in ("item", "items", "vehicles", "vehicleList", "view", "data", "result", "content"):
            value = raw.get(key)
            if value is not None:
                found.extend(_collect_cnair_vehicle_dicts(value))
    elif isinstance(raw, list):
        for item in raw:
            found.extend(_collect_cnair_vehicle_dicts(item))
    return found


def normalize_cnair_payload(payload: dict[str, Any]) -> AccountData:
    """Normalizează payload-ul primit din portalul oficial CNAIR erovinieta.ro."""

    raw_pages = payload.get("dashboard_pages") or []
    raw_personal = payload.get("personal_vehicles") or {}
    vehicles_by_key: dict[str, VehicleData] = {}

    for page in raw_pages:
        if not isinstance(page, dict):
            continue
        for item in page.get("view") or []:
            if not isinstance(item, dict):
                continue
            vehicle = _vehicle_from_cnair_raw(item)
            if vehicle is None:
                continue
            key = _cnair_vehicle_key(vehicle)
            vehicles_by_key[key] = _prefer_cnair_vehicle(vehicles_by_key.get(key), vehicle)

    personal_items = _collect_cnair_vehicle_dicts(raw_personal)

    for item in personal_items:
        if not isinstance(item, dict):
            continue
        if "entity" in item and isinstance(item.get("entity"), dict):
            vehicle = _vehicle_from_cnair_raw(item)
        else:
            vehicle = _vehicle_from_cnair_personal_raw(item)
        if vehicle is None:
            continue
        key = _cnair_vehicle_key(vehicle)
        vehicles_by_key[key] = _prefer_cnair_vehicle(vehicles_by_key.get(key), vehicle)

    vehicles = sorted(vehicles_by_key.values(), key=lambda vehicle: vehicle.plate_no or "")

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
