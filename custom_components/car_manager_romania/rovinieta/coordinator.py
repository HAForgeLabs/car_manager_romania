"""Modul coordonator pentru date externe."""

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

PROVIDER_CNAIR = "cnair"
PROVIDER_E_ROVINIETA = "e_rovinieta"

_LOGGER = logging.getLogger(__name__)


class CarManagerRovinietaCoordinator(DataUpdateCoordinator[AccountData]):
    """Clasă pentru rovinietă coordonator."""

    def __init__(
        self,
        hass: HomeAssistant,
        client: ERovinietaApiClient,
        scan_interval_seconds: int,
        cnair_client: CnairERovinietaApiClient | None = None,
        config_entry: ConfigEntry | None = None,
        provider: str = PROVIDER_CNAIR,
    ) -> None:
        """Funcție internă pentru init."""

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
        self.provider = provider if provider in {PROVIDER_CNAIR, PROVIDER_E_ROVINIETA} else PROVIDER_CNAIR

    async def _async_update_data(self) -> AccountData:
        """Funcție internă pentru actualizare date."""

        accounts: list[AccountData] = []
        errors: list[str] = []

        if self.provider == PROVIDER_E_ROVINIETA:
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

        if accounts:
            if errors:
                _LOGGER.debug(
                    "Actualizare rovinietă parțială. Unele portaluri nu au returnat date: %s",
                    "; ".join(errors),
                )
            return merge_account_data(accounts)

        raise UpdateFailed("; ".join(errors) or "Nu s-au putut actualiza datele rovinietei")
