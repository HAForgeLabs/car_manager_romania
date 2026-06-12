"""Client API pentru portalul oficial CNAIR erovinieta.ro."""

from __future__ import annotations

import asyncio
from datetime import datetime, UTC
import logging
from typing import Any

from aiohttp import ClientError, ClientResponseError, ClientSession

from .exceptions import ERovinietaApiError, ERovinietaAuthError

_LOGGER = logging.getLogger(__name__)

CNAIR_BASE_URL = "https://www.erovinieta.ro/vignettes-portal-web"


class CnairERovinietaApiClient:
    """Client pentru portalul oficial CNAIR erovinieta.ro."""

    def __init__(self, session: ClientSession, username: str, password: str) -> None:
        """Inițializează clientul API."""

        self._session = session
        self._username = username
        self._password = password
        self._logged_in = False

    @property
    def headers(self) -> dict[str, str]:
        """Returnează headerele comune pentru portalul CNAIR."""

        return {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",
            "Origin": "https://www.erovinieta.ro",
            "Referer": f"{CNAIR_BASE_URL}/",
            "User-Agent": "Home Assistant Car Manager Romania",
            "X-Requested-With": "XMLHttpRequest",
        }

    async def async_login(self) -> dict[str, Any]:
        """Autentifică utilizatorul în portalul oficial CNAIR."""

        # Portalul setează sesiunea pe baza aplicației web. Citirea paginii inițiale
        # permite inițializarea cookie-urilor înainte de cererea de login.
        await self._request("GET", "/", expect_json=False, auth_call=True)

        payload = {
            "username": self._username,
            "password": self._password,
            "_spring_security_remember_me": "on",
        }
        data = await self._request("POST", "/login", json=payload, auth_call=True)

        if data.get("success") is not True:
            raise ERovinietaAuthError("Login failed on erovinieta.ro")

        self._logged_in = True
        return data

    async def async_get_user_data(self) -> dict[str, Any]:
        """Returnează datele contului autentificat."""

        timestamp = self._timestamp_ms()
        return await self._ensure_auth_then_request(
            "GET",
            f"/rest/anonymous/getUserData?{timestamp}",
        )

    async def async_get_dashboard_page(self, page: int, limit: int = 50) -> dict[str, Any]:
        """Returnează o pagină cu vehiculele și rovinietele active."""

        timestamp = self._timestamp_ms()
        return await self._ensure_auth_then_request(
            "GET",
            f"/rest/desktop/home/getDataPaginated?limit={limit}&page={page}&timestamp={timestamp}",
        )

    async def async_fetch_all(self) -> dict[str, Any]:
        """Returnează toate datele necesare pentru roviniete din portalul CNAIR."""

        if not self._logged_in:
            await self.async_login()

        account = await self.async_get_user_data()
        pages: list[dict[str, Any]] = []
        page = 0
        limit = 50

        while True:
            page_data = await self.async_get_dashboard_page(page, limit=limit)
            pages.append(page_data)

            total_count = int(page_data.get("totalCount") or 0)
            start = int(page_data.get("start") or page * limit)
            current_count = len(page_data.get("view") or [])

            if current_count <= 0 or start + current_count >= total_count:
                break

            page += 1
            if page > 20:
                _LOGGER.debug("Oprire defensivă paginare erovinieta.ro după 20 de pagini")
                break

        return {
            "account": account,
            "dashboard_pages": pages,
            "fetched_at": datetime.now(UTC).isoformat(),
        }

    async def _ensure_auth_then_request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execută cererea și reautentifică sesiunea dacă este nevoie."""

        try:
            return await self._request(method, path, json=json)
        except ERovinietaAuthError:
            _LOGGER.debug("Sesiunea erovinieta.ro a expirat, încerc reautentificarea")
            self._logged_in = False
            await self.async_login()
            return await self._request(method, path, json=json)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        expect_json: bool = True,
        auth_call: bool = False,
    ) -> dict[str, Any]:
        """Execută o cerere HTTP către portalul CNAIR."""

        url = f"{CNAIR_BASE_URL}{path}"
        headers = dict(self.headers)
        if method == "GET":
            headers.pop("Content-Type", None)

        try:
            async with self._session.request(
                method,
                url,
                headers=headers,
                json=json,
                timeout=30,
            ) as response:
                response.raise_for_status()
                if not expect_json:
                    await response.text()
                    return {}
                data: dict[str, Any] = await response.json(content_type=None)

        except ClientResponseError as err:
            if err.status in (401, 403):
                raise ERovinietaAuthError("Invalid credentials or expired erovinieta.ro session") from err
            raise ERovinietaApiError(f"HTTP error {err.status} while calling erovinieta.ro {path}") from err
        except (ClientError, asyncio.TimeoutError) as err:
            raise ERovinietaApiError(f"Communication error while calling erovinieta.ro {path}") from err
        except ValueError as err:
            raise ERovinietaApiError(f"Invalid JSON received from erovinieta.ro {path}") from err

        if not isinstance(data, dict):
            raise ERovinietaApiError(f"Unexpected response type from erovinieta.ro {path}")

        if auth_call and data and data.get("success") is False:
            raise ERovinietaAuthError("Login failed on erovinieta.ro")

        return data

    @staticmethod
    def _timestamp_ms() -> int:
        """Returnează timestamp curent în milisecunde."""

        return int(datetime.now(UTC).timestamp() * 1000)
