"""Planificare persistentă a verificărilor ITP prin RAR AutoPass."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Any, Awaitable, Callable

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import CONF_REMOVED, CONF_VEHICLE_ID, CONF_VIN

ITP_CHECK_INTERVAL = timedelta(days=3)
ITP_SCHEDULE_POLL_INTERVAL = timedelta(hours=6)


class ItpVerificationSchedule:
    """Ține minte ultimele verificări reușite, inclusiv după restart."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store = Store(hass, 1, f"car_manager_romania_itp_checks_{entry_id}")
        self._successful: dict[str, dict[str, str]] = {}
        self.lock = asyncio.Lock()

    async def async_load(self) -> None:
        payload = await self._store.async_load()
        values = payload.get("successful", {}) if isinstance(payload, dict) else {}
        if isinstance(values, dict):
            self._successful = {
                str(key): value
                for key, value in values.items()
                if isinstance(value, dict)
                and isinstance(value.get("at"), str)
                and isinstance(value.get("vin_hash"), str)
            }

    @staticmethod
    def _vin_hash(vin: str) -> str:
        return sha256(vin.strip().upper().encode("utf-8")).hexdigest()

    def is_due(self, vehicle: dict[str, Any]) -> bool:
        """Fără VIN sau mașină dezactivată nu efectuăm verificări."""
        if vehicle.get(CONF_REMOVED):
            return False
        vehicle_id = str(vehicle.get(CONF_VEHICLE_ID) or "").strip()
        vin = str(vehicle.get(CONF_VIN) or "").strip()
        if not vehicle_id or not vin:
            return False
        record = self._successful.get(vehicle_id, {})
        if record.get("vin_hash") != self._vin_hash(vin):
            return True
        try:
            checked_at = datetime.fromisoformat(record["at"])
            if checked_at.tzinfo is None:
                return True
            return datetime.now(timezone.utc) - checked_at >= ITP_CHECK_INTERVAL
        except (KeyError, ValueError, TypeError):
            return True

    async def async_record_successes(self, successes: list[tuple[str, str]]) -> None:
        """Actualizează exclusiv verificările care au returnat o dată validă."""
        if not successes:
            return
        now = datetime.now(timezone.utc).isoformat()
        for vehicle_id, vin in successes:
            if vehicle_id and vin:
                self._successful[vehicle_id] = {
                    "at": now,
                    "vin_hash": self._vin_hash(vin),
                }
        await self._store.async_save({"successful": self._successful})

    async def async_check_due(
        self,
        vehicles: list[dict[str, Any]],
        refresh_one: Callable[[str], Awaitable[Any]],
    ) -> None:
        """Interoghează doar vehiculele pentru care au trecut 72 de ore."""
        for vehicle in vehicles:
            if not isinstance(vehicle, dict) or not self.is_due(vehicle):
                continue
            vehicle_id = str(vehicle[CONF_VEHICLE_ID])
            await refresh_one(vehicle_id)
