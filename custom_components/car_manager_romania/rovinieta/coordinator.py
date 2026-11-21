"""Coordonator pentru sursa de roviniete selectată în Car Manager România.

Compatibil cu furnizorii existenți; TollRo se activează doar atunci când
este selectat și configurat în integrare.
"""
from __future__ import annotations

from datetime import timedelta
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import ERovinietaApiClient
from .cnair_api import CnairERovinietaApiClient
from .exceptions import ERovinietaApiError, ERovinietaAuthError
from .models import AccountData
from .parser import merge_account_data, normalize_cnair_payload, normalize_payload
from .tollro_account import TollRoAccountFetcher
from .tollro_async_client import TollRoAuthError, TollRoError

PROVIDER_CNAIR = "cnair"
PROVIDER_E_ROVINIETA = "e_rovinieta"
PROVIDER_TOLLRO = "tollro"

_LOGGER = logging.getLogger(__name__)


class CarManagerRovinietaCoordinator(DataUpdateCoordinator[AccountData]):
    """Actualizează numai sursa selectată, fără amestecarea conturilor."""

    def __init__(
        self,
        hass: HomeAssistant,
        client: ERovinietaApiClient | None,
        scan_interval_seconds: int,
        cnair_client: CnairERovinietaApiClient | None = None,
        config_entry: ConfigEntry | None = None,
        provider: str = PROVIDER_CNAIR,
        *,
        tollro_client: TollRoAccountFetcher | None = None,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name="car_manager_romania_rovinieta",
            update_interval=timedelta(seconds=scan_interval_seconds),
            always_update=True,
            config_entry=config_entry,
        )
        self.client = client
        self.cnair_client = cnair_client
        self.tollro_client = tollro_client
        self.provider = provider if provider in {
            PROVIDER_CNAIR, PROVIDER_E_ROVINIETA, PROVIDER_TOLLRO
        } else PROVIDER_CNAIR

    async def _async_update_data(self) -> AccountData:
        accounts: list[AccountData] = []
        errors: list[str] = []

        if self.provider == PROVIDER_TOLLRO:
            if self.tollro_client is None:
                raise UpdateFailed("Clientul TollRo nu este configurat.")
            try:
                # Atomic: o actualizare incompletă NU înlocuiește datele existente.
                return await self.tollro_client.async_fetch_all()
            except TollRoAuthError as err:
                raise UpdateFailed("Autentificarea TollRo a eșuat; verifică datele contului.") from err
            except TollRoError as err:
                raise UpdateFailed(f"Actualizarea TollRo a eșuat: {err}") from err

        if self.provider == PROVIDER_E_ROVINIETA:
            if self.client is None:
                errors.append("Clientul e-rovinieta.ro nu este configurat.")
            else:
                try:
                    payload = await self.client.async_fetch_all()
                    accounts.append(normalize_payload(payload))
                except ERovinietaAuthError as err:
                    errors.append(f"Autentificarea e-rovinieta.ro a eșuat: {err}")
                except ERovinietaApiError as err:
                    errors.append(str(err))

        if self.provider == PROVIDER_CNAIR and self.cnair_client is not None:
            try:
                cnair_payload = await self.cnair_client.async_fetch_all()
                accounts.append(normalize_cnair_payload(cnair_payload))
            except ERovinietaAuthError as err:
                errors.append(f"Autentificarea erovinieta.ro CNAIR a eșuat: {err}")
            except ERovinietaApiError as err:
                errors.append(str(err))
        elif self.provider == PROVIDER_CNAIR:
            errors.append("Clientul CNAIR nu este configurat.")

        if accounts:
            if errors:
                _LOGGER.debug("Unele portaluri nu au returnat datele cerute.")
            return merge_account_data(accounts)

        raise UpdateFailed("; ".join(errors) or "Nu s-au putut actualiza datele rovinietei")
