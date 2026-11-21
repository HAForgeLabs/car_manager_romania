"""Adaptarea datelor TollRo la modelele rovinietei din Car Manager România.

Nu face cereri HTTP, nu importă Home Assistant și nu schimbă datele stocate.
Datele rezultate sunt utilizate de coordonatorul rovinietelor.
"""
from __future__ import annotations

from datetime import UTC, date, datetime, time
from hashlib import sha256
from typing import Any
from zoneinfo import ZoneInfo

from .models import AccountData, VehicleData
from .tollro_coverage import normalize_plate, parse_day, summarize_vehicle

SOURCE_TOLLRO = "TollRo (portal.etoll.ro)"
ROMANIA_TZ = ZoneInfo("Europe/Bucharest")
ACTIVE_STATES = frozenset({"activa", "activa_fara_intervale"})
NONCONCLUSIVE_STATES = frozenset({"date_neconfirmate", "serviciu_indisponibil"})


def stable_vehicle_id(plate_number: str, country_code: str = "RO") -> int:
    """ID numeric determinist, fără dependență de ID-ul intern al portalului."""
    plate = normalize_plate(plate_number)
    if not plate:
        raise ValueError("Număr de înmatriculare invalid")
    key = f"tollro:{country_code.upper()}:{plate}".encode("utf-8")
    return int.from_bytes(sha256(key).digest()[:8], "big")


def _romania_end_of_day(day: date | None) -> datetime | None:
    if day is None:
        return None
    return datetime.combine(day, time(23, 59, 59), tzinfo=ROMANIA_TZ).astimezone(UTC)


def _active_period_start(summary: dict[str, Any], on_day: date) -> str | None:
    periods = summary.get("api_active_intervals")
    if not isinstance(periods, list):
        return None
    for item in periods:
        if not isinstance(item, dict):
            continue
        start, end = parse_day(item.get("start")), parse_day(item.get("end"))
        if start and end and start <= on_day <= end:
            return start.isoformat()
    return None


def adapt_tollro_records(
    records: list[tuple[dict[str, Any], dict[str, Any] | None]],
    *,
    on_day: date | None = None,
) -> tuple[AccountData, list[dict[str, Any]]]:
    """Normalizează perechi (vehicul API, serviciu rovinietă).

    Întoarce contul compatibil cu `AccountData` și diagnostic fără secrete.
    Datele neconcludente nu sunt transformate în „expirată”. Vehiculele
    cu răspuns incomplet nu sunt expuse ca valabilități confirmate.
    """
    if on_day is None:
        on_day = datetime.now(ROMANIA_TZ).date()
    if not isinstance(on_day, date):
        raise ValueError("on_day trebuie să fie o dată calendaristică")

    vehicles: list[VehicleData] = []
    diagnostics: list[dict[str, Any]] = []
    plates_seen: set[str] = set()

    for vehicle, service in records:
        if not isinstance(vehicle, dict):
            raise ValueError("Vehiculul primit din API trebuie să fie obiect JSON")
        plate = normalize_plate(vehicle.get("plateNumber"))
        country = str(vehicle.get("countryCode") or "RO").upper()
        if not plate:
            raise ValueError("API a returnat un vehicul fără număr de înmatriculare")
        key = f"{country}:{plate}"
        if key in plates_seen:
            raise ValueError(f"Vehicul duplicat în răspuns: {plate}")
        plates_seen.add(key)

        summary = summarize_vehicle(vehicle, service, on_day)
        state = summary["state"]
        warning = summary.get("warning")
        if state in NONCONCLUSIVE_STATES or warning:
            decision = "nu_actualiza"
        elif state in ACTIVE_STATES:
            decision = "valabilitate_confirmata"
        else:
            decision = "fara_valabilitate_confirmata"

        diagnostics.append({
            "plate_number": plate,
            "country_code": country,
            "vin": vehicle.get("vin"),
            "api_vehicle_id": vehicle.get("id"),
            "state": state,
            "warning": warning,
            "decision": decision,
            "current_expiry": summary.get("current_expiry"),
            "continuous_coverage_end": summary.get("continuous_coverage_end"),
            "next_start_after_gap": summary.get("next_start_after_gap"),
            "interval_count": summary.get("interval_count"),
            "raw_intervals": summary.get("api_active_intervals"),
        })

        # Nu prezentăm un răspuns incomplet ca stare negativă.
        if decision == "nu_actualiza":
            continue

        active = state in ACTIVE_STATES
        end_day = parse_day(summary.get("continuous_coverage_end")) if active else None
        if active and end_day is None:
            diagnostics[-1]["decision"] = "nu_actualiza"
            diagnostics[-1]["warning"] = "lipsește data expirării acoperirii"
            continue

        expiry = _romania_end_of_day(end_day)
        days = (end_day - on_day).days if end_day else None
        active_vignette = None
        if active:
            # Datele de început și sfârșit descriu acoperirea, nu o tranzacție.
            active_vignette = {
                "source": SOURCE_TOLLRO,
                "date_start_availability": _active_period_start(summary, on_day),
                "date_stop_availability": end_day.isoformat(),
                "oProdPeriodName": "Acoperire continuă",
                "current_vignette_expires": summary.get("current_expiry"),
                "continuous_coverage_end": summary.get("continuous_coverage_end"),
            }

        count = summary.get("interval_count")
        known_intervals = count if isinstance(count, int) and count >= 0 else 0
        vehicles.append(VehicleData(
            id=stable_vehicle_id(plate, country),
            plate_no=plate,
            chasis_no=vehicle.get("vin") or None,
            country_name="România" if country == "RO" else None,
            country_code=country,
            category_vignette_title=None,
            category_vignette_desc=None,
            category_toll_title=None,
            category_toll_desc=None,
            active_count=1 if active else 0,
            # Este doar numărul perioadelor cunoscute (active/viitoare).
            all_time_count=known_intervals,
            has_active_vignette=active,
            expiry=expiry,
            days_remaining=days,
            active_vignette=active_vignette,
            source=SOURCE_TOLLRO,
            raw={
                "tollro_state": state,
                "tollro_coverage_end": summary.get("continuous_coverage_end"),
                "tollro_current_expiry": summary.get("current_expiry"),
                "tollro_intervals": summary.get("api_active_intervals"),
                "tollro_vehicle_id": vehicle.get("id"),
                "tollro_count_is_active_or_future_only": True,
            },
        ))

    account = AccountData(
        account={"provider": "tollro", "date_evaluated": on_day.isoformat()},
        vehicles=vehicles,
        orders=[],
        profiles=[],
        tokens=[],
        fetched_at=datetime.now(UTC),
    )
    return account, diagnostics


def find_by_plate(
    account: AccountData,
    plate_number: str,
    vin: str | None = None,
    country_code: str = "RO",
) -> VehicleData | None:
    """Asociere prin număr și țară; verifică VIN-ul dacă este disponibil."""
    wanted = normalize_plate(plate_number)
    if not wanted:
        return None
    for item in account.vehicles:
        if normalize_plate(item.plate_no) != wanted or item.country_code != country_code.upper():
            continue
        if vin and item.chasis_no and item.chasis_no.strip().upper() != vin.strip().upper():
            return None
        return item
    return None
