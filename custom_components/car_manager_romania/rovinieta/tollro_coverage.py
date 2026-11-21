"""Interpretarea defensivă a perioadelor de rovinietă raportate de TollRo.

Nu considerăm `eligibleIntervals` drept roviniete cumpărate: sunt opțiuni
pentru achiziție. Nu deducem lipsa rovinietei oficiale din lipsa datelor API.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any


def parse_day(value: Any) -> date | None:
    """Zi calendaristică în fusul specificat de API în șirul ISO 8601."""
    if not isinstance(value, str) or len(value) < 10:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def normalize_plate(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    plate = "".join(char for char in value.upper() if char.isalnum())
    return plate or None


def _result(state: str, *, current_expiry: date | None = None,
            coverage_end: date | None = None, next_start: date | None = None,
            interval_count: int | None = None, warning: str | None = None) -> dict[str, Any]:
    return {
        "state": state,
        "current_expiry": current_expiry.isoformat() if current_expiry else None,
        "continuous_coverage_end": coverage_end.isoformat() if coverage_end else None,
        "next_start_after_gap": next_start.isoformat() if next_start else None,
        "interval_count": interval_count,
        "warning": warning,
    }


def analyze_coverage(service: Any, on_day: date) -> dict[str, Any]:
    """Calculează acoperirea neîntreruptă, fără să inventeze valabilitate.

    `fara_interval_activ` înseamnă doar absență în răspunsul portalului.
    """
    if not isinstance(service, dict):
        return _result("date_neconfirmate", warning="raspuns_api_invalid")
    if service.get("vignetteServiceUnavailable") is True:
        return _result("serviciu_indisponibil", warning="serviciu_indisponibil")
    eligibility = service.get("vignetteEligibility")
    if not isinstance(eligibility, dict):
        return _result("date_neconfirmate", warning="lipseste_vignetteEligibility")
    raw = eligibility.get("activeVignetteIntervals", [])
    if not isinstance(raw, list):
        return _result("date_neconfirmate", warning="intervale_invalide")

    periods: list[tuple[date, date]] = []
    for interval in raw:
        if not isinstance(interval, dict):
            return _result("date_neconfirmate", warning="interval_invalid")
        start, end = parse_day(interval.get("start")), parse_day(interval.get("end"))
        if start is None or end is None or start > end:
            return _result("date_neconfirmate", warning="date_interval_invalide")
        periods.append((start, end))
    periods.sort()

    merged: list[list[date]] = []
    for start, end in periods:
        if merged and start <= merged[-1][1] + timedelta(days=1):
            if end > merged[-1][1]:
                merged[-1][1] = end
        else:
            merged.append([start, end])

    current_raw = eligibility.get("expirationDateCurrentVignette")
    expiry = parse_day(current_raw)
    if current_raw is not None and expiry is None:
        return _result("date_neconfirmate", warning="expirare_curenta_invalida")

    active = next((p for p in merged if p[0] <= on_day <= p[1]), None)
    upcoming = next((p for p in merged if p[0] > on_day), None)
    if active:
        # „expiry” desemnează rovinieta curentă, nu expirarea celei viitoare.
        warning = "expirare_neconcordanta" if expiry and (expiry < on_day or expiry > active[1]) else None
        return _result("activa", current_expiry=expiry, coverage_end=active[1],
                       next_start=upcoming[0] if upcoming else None,
                       interval_count=len(periods), warning=warning)
    if upcoming:
        warning = "data_curenta_neconcordanta" if expiry and expiry >= on_day else None
        return _result("doar_viitoare", current_expiry=expiry,
                       coverage_end=upcoming[1], next_start=upcoming[0],
                       interval_count=len(periods), warning=warning)
    if expiry and expiry >= on_day:
        return _result("activa_fara_intervale", current_expiry=expiry,
                       coverage_end=expiry, interval_count=len(periods),
                       warning="nu_exista_intervale_detaliate")
    return _result("fara_interval_activ", current_expiry=expiry,
                   interval_count=len(periods))


def summarize_vehicle(vehicle: dict[str, Any], service: Any, on_day: date) -> dict[str, Any]:
    """Exportă strict câmpurile utile, fără obiecte HTTP/tokenuri/cookie-uri."""
    result = analyze_coverage(service, on_day)
    eligibility = service.get("vignetteEligibility") if isinstance(service, dict) else None
    if not isinstance(eligibility, dict):
        eligibility = {}
    raw = eligibility.get("activeVignetteIntervals")
    periods = [
        {"start": item.get("start"), "end": item.get("end")}
        for item in raw if isinstance(item, dict)
    ] if isinstance(raw, list) else None
    return {
        "plate_number": vehicle.get("plateNumber"),
        "normalized_plate": normalize_plate(vehicle.get("plateNumber")),
        "vehicle_id": vehicle.get("id"),
        "vin": vehicle.get("vin"),
        "country_code": vehicle.get("countryCode"),
        "vehicle_type": vehicle.get("vehicleType"),
        **result,
        "api_current_expiration_raw": eligibility.get("expirationDateCurrentVignette"),
        "api_active_intervals": periods,
        "service_unavailable": service.get("vignetteServiceUnavailable") if isinstance(service, dict) else None,
    }
