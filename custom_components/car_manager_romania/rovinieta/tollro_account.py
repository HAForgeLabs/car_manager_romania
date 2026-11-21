"""Preluare atomică a contului TollRo pentru coordonatorul de roviniete.

Acest modul poate fi rulat fără Home Assistant. Nu efectuează persistări și nu
înlocuiește date manuale. Instanța trebuie închisă prin ``async_close``.
"""
from __future__ import annotations

import asyncio
from datetime import date
from typing import Any

from .models import AccountData
from .tollro_adapter import adapt_tollro_records
from .tollro_async_client import AsyncTollRoClient, TollRoAuthError, TollRoError


class TollRoAccountFetcher:
    """O sesiune per cont, cu un singur retry de login la eșecul autentificării.

    Datele pentru TOATE vehiculele sunt confirmate înainte să fie publicat
    noul AccountData. Orice rezultat neconcludent blochează actualizarea, astfel
    încât coordonatorul păstrează ultima stare validă, fără să șteargă termene.
    """

    def __init__(
        self,
        username: str,
        password: str,
        *,
        client: AsyncTollRoClient | None = None,
        on_day: date | None = None,
    ) -> None:
        if not isinstance(username, str) or not username.strip() or not isinstance(password, str) or not password:
            raise ValueError("Emailul și parola TollRo sunt obligatorii.")
        self._username = username.strip()
        self._password = password
        self._client = client if client is not None else AsyncTollRoClient()
        self._logged_in = False
        self._lock = asyncio.Lock()
        self._on_day = on_day  # numai pentru teste; altfel ziua României este evaluată la fiecare actualizare
        self._diagnostics: list[dict[str, Any]] = []

    @property
    def diagnostics(self) -> list[dict[str, Any]]:
        """Ultimele diagnostice VALIDATE, fără secrete de autentificare."""
        return [dict(item) for item in self._diagnostics]

    async def async_close(self) -> None:
        """Eliberează sesiunea HTTPS și elimină tokenurile din client."""
        async with self._lock:
            await self._client.async_close()
            self._logged_in = False
            self._diagnostics = []

    async def _async_login(self) -> None:
        await self._client.async_login(self._username, self._password)
        self._logged_in = True

    async def _async_fetch_once(self) -> tuple[AccountData, list[dict[str, Any]]]:
        vehicles = await self._client.async_fetch_vehicles()
        if not vehicles:
            # Răspunsul gol nu trebuie să șteargă accidental vehiculele existente.
            raise TollRoError("TollRo nu a returnat vehicule; datele existente sunt păstrate.")
        records: list[tuple[dict[str, Any], dict[str, Any]]] = []
        for vehicle in vehicles:
            vehicle_id = vehicle.get("id")
            if not isinstance(vehicle_id, str) or not vehicle_id:
                raise TollRoError("TollRo a returnat un ID de vehicul invalid.")
            service = await self._client.async_fetch_service(vehicle_id)
            records.append((vehicle, service))
        try:
            account, diagnostics = adapt_tollro_records(records, on_day=self._on_day)
        except (ValueError, TypeError) as exc:
            raise TollRoError("Datele primite de la TollRo nu pot fi interpretate în siguranță.") from exc
        unresolved = sum(item["decision"] == "nu_actualiza" for item in diagnostics)
        if unresolved or len(account.vehicles) != len(vehicles):
            raise TollRoError(
                f"TollRo a returnat {unresolved} vehicule cu date neconcludente; "
                "datele existente sunt păstrate."
            )
        return account, diagnostics

    async def async_fetch_all(self) -> AccountData:
        """Actualizare atomică; login nou la nevoie dacă refresh-ul a eșuat.

        Nu repetăm cererile la 429/500/timeout; doar o eroare de autentificare
        poate declanșa un singur login și o singură reluare.
        """
        async with self._lock:
            if not self._logged_in:
                await self._async_login()
            try:
                account, diagnostics = await self._async_fetch_once()
            except TollRoAuthError:
                self._logged_in = False
                await self._async_login()
                account, diagnostics = await self._async_fetch_once()
            self._diagnostics = diagnostics
            return account
