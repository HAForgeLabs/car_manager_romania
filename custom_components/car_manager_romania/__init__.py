"""Modul principal pentru integrarea Car Manager România."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from datetime import datetime, timedelta
import inspect
import logging
from typing import Any

import voluptuous as vol


from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall

try:
    from homeassistant.core import SupportsResponse
except ImportError:  # pragma: no cover - compatibilitate cu versiuni mai vechi Home Assistant
    SupportsResponse = None  # type: ignore[assignment]
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.dispatcher import dispatcher_send
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import slugify

from .const import (
    CONF_KM,
    CONF_FUEL_PROFILE,
    CONF_LEGAL_TERMS,
    CONF_LICENSE_PLATE,
    CONF_REGISTRATION_CERTIFICATE,
    CONF_REGISTRATION_COUNTRY,
    CONF_IMPORT_SOURCE,
    CONF_NOTIFICATIONS_ENABLED,
    CONF_NOTIFY_MAINTENANCE,
    CONF_NOTIFY_LEGAL,
    CONF_NOTIFY_EQUIPMENT,
    CONF_NOTIFY_BATTERY,
    CONF_NOTIFY_EXPENSES,
    DEFAULT_NOTIFICATIONS_ENABLED,
    DEFAULT_NOTIFY_MAINTENANCE,
    DEFAULT_NOTIFY_LEGAL,
    DEFAULT_NOTIFY_EQUIPMENT,
    DEFAULT_NOTIFY_BATTERY,
    DEFAULT_NOTIFY_EXPENSES,
    CONF_NAME,
    CONF_REMOVED,
    CONF_ROVINIETA_PASSWORD,
    CONF_ROVINIETA_SCAN_INTERVAL,
    CONF_ROVINIETA_PROVIDER,
    ROVINIETA_PROVIDER_CNAIR,
    ROVINIETA_PROVIDER_E_ROVINIETA,
    ROVINIETA_PROVIDERS,
    CONF_ROVINIETA_USERNAME,
    CONF_ROVINIETA_CATEGORY,
    CONF_FETESTI_BRIDGE_CATEGORY,
    CONF_VEHICLES,
    CONF_VEHICLE_ID,
    CONF_VIN,
    COST_AMOUNT,
    DEFAULT_ROVINIETA_SCAN_INTERVAL,
    MIN_ROVINIETA_SCAN_INTERVAL,
    DOMAIN,
    PLATFORMS,
    SERVICE_ADD_VEHICLE,
    SERVICE_EDIT_VEHICLE,
    SERVICE_REMOVE_VEHICLE,
    SERVICE_RESTORE_VEHICLE,
    SERVICE_RESTORE_ALL_VEHICLES,
    SERVICE_ADD_SERVICE_RECORD,
    SERVICE_RESTORE_SERVICE_RECORD,
    SERVICE_RESTORE_LAST_SERVICE_RECORD,
    SERVICE_DELETE_SERVICE_RECORD,
    SERVICE_UPDATE_SERVICE_RECORD,
    SERVICE_EXPORT_DATA,
    SERVICE_VALIDATE_BACKUP,
    SERVICE_IMPORT_DATA,
    SERVICE_SET_LEGAL_OPTION,
    SERVICE_CLEANUP_ORPHAN_ENTITIES,
    SERVICE_REFRESH_LICENSE_STATUS,
    SERVICE_SET_NOTIFICATION_OPTIONS,
    SERVICE_SET_ROVINIETA_ACCOUNT,
    SERVICE_GET_ROVINIETA_ACCOUNT,
    SERVICE_SCAN_ROVINIETA_IMPORT_VEHICLES,
    SERVICE_IMPORT_ROVINIETA_VEHICLE,
    SERVICE_REFRESH_ROVINIETA_NOW,
    SERVICE_ADD_FUEL_RECEIPT,
    SERVICE_UPDATE_FUEL_RECEIPT,
    SERVICE_DELETE_FUEL_RECEIPT,
    SERVICE_ADD_TIRE_SET,
    SERVICE_UPDATE_TIRE_SET,
    SERVICE_DELETE_TIRE_SET,
    LEGAL_DATA_SOURCE,
    LEGAL_END_DATE,
    LEGAL_OPTION_IGNORED,
    LEGAL_SOURCE_CNAIR_EROVINIETA,
    LEGAL_SOURCE_EROVINIETA,
    LEGAL_START_DATE,
    LEGAL_TYPE_CASCO,
    LEGAL_TYPE_ROVINIETA,
    STORAGE_KEY_NOTIFICATIONS,
    STORAGE_VERSION_NOTIFICATIONS,
    FUEL_TYPES,
    FUEL_TYPES_BY_PROFILE,
    FUEL_PROFILES,
    CONF_CONSUMABLES,
    CONSUMABLE_TYPES,
    MAINTENANCE_LAST_DATE,
    MAINTENANCE_LAST_KM,
    MAINTENANCE_INTERVAL_KM,
    MAINTENANCE_INTERVAL_DAYS,
    LEGAL_COST_TYPES,
    LEGAL_TYPES,
    LEGAL_START_DATE,
    LEGAL_END_DATE,
    RCA_TEXT_FIELDS,
    CASCO_TEXT_FIELDS,
    ITP_TEXT_FIELDS,
    MAINTENANCE_TYPES,
    SIGNAL_VEHICLES_UPDATED,
    SIGNAL_LICENSE_UPDATED,
    VERSION,
)
from .maintenance import get_maintenance_value, normalize_vehicles, set_maintenance_value
from .legal import set_legal_ignored, set_legal_value
from .rovinieta.api import ERovinietaApiClient
from .rovinieta.cnair_api import CnairERovinietaApiClient
from .rovinieta.coordinator import CarManagerRovinietaCoordinator
from .rovinieta.parser import merge_account_data, normalize_cnair_payload, normalize_payload
from .storage import CarManagerFuelReceiptStore, CarManagerServiceHistoryStore, CarManagerVehicleStore, merge_vehicle_sources
from .tire import CarManagerTireSetStore
from .equipment import CarManagerEquipmentItemStore
from .battery import CarManagerBatteryStore
from .backup import (
    EXPORT_DATA_SERVICE_SCHEMA,
    IMPORT_DATA_SERVICE_SCHEMA,
    VALIDATE_BACKUP_SERVICE_SCHEMA,
    async_export_data as _async_backup_export_data,
    async_import_data as _async_backup_import_data,
    async_validate_backup as _async_backup_validate_backup,
)
from .fuel_services import async_register_fuel_services
from .history_services import async_register_history_services
from .equipment_services import async_register_equipment_services
from .tire_services import async_register_tire_services
from .battery_services import async_register_battery_services

_LOGGER = logging.getLogger(__name__)

LOVELACE_CARD_URL = "/car_manager_romania/car-manager-romania-card.js"
PANEL_MODULE_URL = "/car_manager_romania/car-manager-romania-panel.js"
PANEL_URL_PATH = "car-manager-romania"
LOVELACE_CARD_NOTIFICATION_ID = "car_manager_romania_lovelace_card"


@dataclass(slots=True)
class CarManagerRuntimeData:
    """Clasă pentru runtime date."""

    integration_version: str
    vehicles: list[dict[str, Any]]
    all_vehicles: list[dict[str, Any]]
    vehicle_store: CarManagerVehicleStore
    service_history_store: CarManagerServiceHistoryStore
    fuel_receipt_store: CarManagerFuelReceiptStore
    tire_set_store: CarManagerTireSetStore
    equipment_item_store: CarManagerEquipmentItemStore
    battery_store: CarManagerBatteryStore
    rovinieta_coordinator: CarManagerRovinietaCoordinator | None = None


type CarManagerConfigEntry = ConfigEntry[CarManagerRuntimeData]


def _normalize_resource_url(value: Any) -> str:
    """Funcție internă pentru normalizare resursă URL."""

    if value is None:
        return ""

    normalized = str(value).strip()
    if not normalized:
        return ""

    # Resursele Lovelace sunt adesea versionate cu parametri de tip ?v=0.7.1.
    normalized = normalized.split("?", 1)[0].split("#", 1)[0].rstrip("/")
    return normalized


def _resource_url_matches(value: Any) -> bool:
    """Funcție internă pentru resursă URL matches."""

    normalized = _normalize_resource_url(value)
    expected = _normalize_resource_url(LOVELACE_CARD_URL)
    return normalized == expected or normalized.endswith(expected)


async def _maybe_await(value: Any) -> Any:
    """Funcție internă pentru maybe await."""

    if inspect.isawaitable(value):
        return await value
    return value


def _extract_resource_urls(value: Any) -> list[str]:
    """Funcție internă pentru extract resursă URL-uri."""

    urls: list[str] = []

    if value is None:
        return urls

    if isinstance(value, str):
        return [value]

    if isinstance(value, dict):
        resource_url = value.get("url")
        if resource_url is not None:
            urls.append(str(resource_url))

        for item in value.values():
            urls.extend(_extract_resource_urls(item))

        return urls

    if isinstance(value, (list, tuple, set)):
        for item in value:
            urls.extend(_extract_resource_urls(item))
        return urls

    resource_url = getattr(value, "url", None)
    if resource_url is not None:
        urls.append(str(resource_url))

    return urls


async def _async_lovelace_card_resource_exists(hass: HomeAssistant) -> bool:
    """Funcție internă pentru Lovelace card resursă exists."""

    candidates: list[Any] = []

    try:
        lovelace_data = hass.data.get("lovelace")

        if lovelace_data is not None:
            if isinstance(lovelace_data, dict):
                candidates.extend(
                    candidate
                    for candidate in (
                        lovelace_data.get("resources"),
                        lovelace_data.get("resource_collection"),
                    )
                    if candidate is not None
                )
            else:
                candidates.extend(
                    candidate
                    for candidate in (
                        getattr(lovelace_data, "resources", None),
                        getattr(lovelace_data, "resource_collection", None),
                    )
                    if candidate is not None
                )

        # Fallbackuri defensive pentru schimbări interne Home Assistant.
        for key, value in hass.data.items():
            if "lovelace" in str(key).lower() and "resource" in str(key).lower():
                candidates.append(value)

        # Cea mai importantă verificare: resursele Lovelace în modul de stocare sunt
        # persistate în .storage/lovelace_resources și nu sunt întotdeauna încărcate
        # în hass.data în momentul în care se setează integrarea.
        try:
            from homeassistant.helpers.storage import Store

            stored_resources = await Store(
                hass,
                1,
                "lovelace_resources",
            ).async_load()
            if stored_resources is not None:
                candidates.append(stored_resources)
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug(
                "Nu am putut citi .storage/lovelace_resources pentru verificarea cardului: %s",
                err,
            )

        seen_candidate_ids: set[int] = set()
        for candidate in candidates:
            candidate_id = id(candidate)
            if candidate_id in seen_candidate_ids:
                continue
            seen_candidate_ids.add(candidate_id)

            for url in _extract_resource_urls(candidate):
                if _resource_url_matches(url):
                    return True

            for method_name in ("async_items", "items", "async_get_info"):
                method = getattr(candidate, method_name, None)
                if method is None or not callable(method):
                    continue

                try:
                    result = await _maybe_await(method())
                except Exception as err:  # noqa: BLE001
                    _LOGGER.debug(
                        "Nu am putut citi resursele Lovelace prin %s: %s",
                        method_name,
                        err,
                    )
                    continue

                for url in _extract_resource_urls(result):
                    if _resource_url_matches(url):
                        return True

    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("Nu am putut verifica resursa Lovelace a cardului: %s", err)

    return False


async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Funcție internă pentru înregistrare frontend."""

    base_path = Path(__file__).parent
    frontend_path = base_path / "frontend"
    brand_path = base_path / "brand"
    if not frontend_path.exists():
        return

    try:
        from homeassistant.components.http import StaticPathConfig

        static_paths = [
            StaticPathConfig(
                "/car_manager_romania",
                str(frontend_path),
                True,
            )
        ]
        if brand_path.exists():
            static_paths.append(
                StaticPathConfig(
                    "/car_manager_romania_brand",
                    str(brand_path),
                    True,
                )
            )

        await hass.http.async_register_static_paths(static_paths)
    except Exception:  # noqa: BLE001
        try:
            hass.http.async_register_static_path(
                "/car_manager_romania",
                str(frontend_path),
                True,
            )
            if brand_path.exists():
                hass.http.async_register_static_path(
                    "/car_manager_romania_brand",
                    str(brand_path),
                    True,
                )
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("Nu am putut publica fișierul cardului Lovelace: %s", err)
            return

    try:
        from homeassistant.components import persistent_notification

        if await _async_lovelace_card_resource_exists(hass):
            persistent_notification.async_dismiss(hass, LOVELACE_CARD_NOTIFICATION_ID)
            return

        persistent_notification.async_create(
            hass,
            "Cardul Lovelace Car Manager România este disponibil.\n\n"
            "Dacă nu apare automat în interfață, adaugă manual resursa:\n\n"
            f"URL: `{LOVELACE_CARD_URL}`\n\n"
            "Tip: `JavaScript Module`\n\n"
            "Apoi adaugă un card manual cu:\n\n"
            "`type: custom:car-manager-romania-card`",
            title="Car Manager România - card Lovelace",
            notification_id=LOVELACE_CARD_NOTIFICATION_ID,
        )
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("Nu am putut crea notificarea pentru cardul Lovelace: %s", err)



def _async_register_dashboard_panel(hass: HomeAssistant) -> None:
    """Înregistrează panoul dedicat Car Manager România în meniul lateral."""

    hass.data.setdefault(DOMAIN, {})
    if hass.data[DOMAIN].get("_dashboard_panel_registered"):
        return

    try:
        from homeassistant.components.frontend import async_register_built_in_panel
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("Nu am putut importa înregistrarea panoului frontend: %s", err)
        return

    try:
        async_register_built_in_panel(
            hass,
            component_name="custom",
            sidebar_title="Car Manager",
            sidebar_icon="mdi:car-cog",
            frontend_url_path=PANEL_URL_PATH,
            require_admin=False,
            config={
                "_panel_custom": {
                    "name": "car-manager-romania-panel",
                    "module_url": PANEL_MODULE_URL,
                },
                "domain": DOMAIN,
            },
        )
        hass.data[DOMAIN]["_dashboard_panel_registered"] = True
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Nu am putut înregistra panoul Car Manager România: %s", err)


ADD_VEHICLE_SERVICE_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
        vol.Required(CONF_NAME): str,
        vol.Optional(CONF_LICENSE_PLATE, default=""): str,
        vol.Optional(CONF_VIN, default=""): str,
        vol.Optional(CONF_KM, default=0): vol.Coerce(int),
    }
)

EDIT_VEHICLE_SERVICE_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
        vol.Required(CONF_VEHICLE_ID): str,
        vol.Optional(CONF_NAME): str,
        vol.Optional(CONF_LICENSE_PLATE): str,
        vol.Optional(CONF_VIN): str,
        vol.Optional(CONF_KM): vol.Coerce(int),
        vol.Optional(CONF_REGISTRATION_COUNTRY): str,
        vol.Optional(CONF_REGISTRATION_CERTIFICATE): str,
        vol.Optional(CONF_FUEL_PROFILE): str,
        vol.Optional("maintenance"): dict,
        vol.Optional(CONF_LEGAL_TERMS): dict,
        vol.Optional(CONF_CONSUMABLES): dict,
    },
    extra=vol.ALLOW_EXTRA,
)

REMOVE_VEHICLE_SERVICE_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
        vol.Required(CONF_VEHICLE_ID): str,
    }
)

RESTORE_VEHICLE_SERVICE_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
        vol.Required(CONF_VEHICLE_ID): str,
    }
)

RESTORE_ALL_VEHICLES_SERVICE_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
    }
)

SET_LEGAL_OPTION_SERVICE_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
        vol.Required(CONF_VEHICLE_ID): str,
        vol.Required("legal_type"): vol.In([LEGAL_TYPE_CASCO]),
        vol.Required(LEGAL_OPTION_IGNORED): bool,
    }
)

CLEANUP_ORPHAN_ENTITIES_SERVICE_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
        vol.Optional("dry_run", default=False): bool,
    }
)

REFRESH_LICENSE_STATUS_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
    }
)

REFRESH_ROVINIETA_NOW_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
    }
)


def _active_vehicles(vehicles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Funcție internă pentru active vehicule."""

    return [
        vehicle
        for vehicle in vehicles
        if isinstance(vehicle, dict) and not bool(vehicle.get(CONF_REMOVED))
    ]


def _expected_entity_unique_ids(entry: CarManagerConfigEntry) -> set[str]:
    """Funcție internă pentru așteptate entitate unic ID-uri."""

    from .const import (
        CASCO_TEXT_FIELDS,
        CONF_FUEL_PROFILE,
        CONSUMABLE_TYPES,
        COST_AMOUNT,
        ITP_TEXT_FIELDS,
        LEGAL_END_DATE,
        LEGAL_START_DATE,
        LEGAL_COST_TYPES,
        LEGAL_TYPES,
        LEGAL_TYPE_ITP,
        LEGAL_TYPE_RCA,
        MAINTENANCE_INTERVAL_DAYS,
        MAINTENANCE_INTERVAL_KM,
        MAINTENANCE_LAST_DATE,
        MAINTENANCE_LAST_KM,
        MAINTENANCE_TIME_ONLY_TYPES,
        MAINTENANCE_TYPE_SERVICE,
        RCA_TEXT_FIELDS,
    )
    from .rovinieta.helpers import slugify_plate

    entry_id = entry.entry_id
    expected: set[str] = {
        f"{entry_id}_status",
        f"{entry_id}_vehicle_count",
        # Entități globale pentru licențiere.
        # Sunt create pe hub, nu pe autovehicule, deci trebuie păstrate explicit
        # de mecanismul de cleanup al registry-ului. Fără aceste unique_id-uri,
        # cleanup-ul automat le șterge imediat după ce platformele le creează.
        f"{entry_id}_license_v2_status",
        f"{entry_id}_license_v2_plan",
        f"{entry_id}_license_v2_expires_at",
        f"{entry_id}_license_v2_checked_at",
        f"{entry_id}_license_v2_utilizator",
        f"{entry_id}_license_v2_masked_key",
        f"{entry_id}_license_v2_message",
        f"{entry_id}_license_v2_key_text",
        f"{entry_id}_license_v2_apply",
        f"{entry_id}_license_v2_refresh",
    }

    if entry.runtime_data.rovinieta_coordinator is not None:
        expected.add(f"{entry_id}_rovinieta_refresh")

    legal_text_fields = {
        LEGAL_TYPE_RCA: RCA_TEXT_FIELDS,
        LEGAL_TYPE_CASCO: CASCO_TEXT_FIELDS,
        LEGAL_TYPE_ITP: ITP_TEXT_FIELDS,
    }

    coordinator = entry.runtime_data.rovinieta_coordinator
    rovinieta_plates: set[str] = set()
    if coordinator is not None and coordinator.data is not None:
        for item in getattr(coordinator.data, "vehicles", []) or []:
            plate = str(getattr(item, "plate_no", "") or "").replace(" ", "").upper()
            if plate:
                rovinieta_plates.add(plate)

    for vehicle in entry.runtime_data.vehicles:
        vehicle_id = str(vehicle.get(CONF_VEHICLE_ID) or vehicle.get("vehicle_id") or "").strip()
        if not vehicle_id:
            continue

        expected.update(
            {
                f"{entry_id}_{vehicle_id}_km",
                f"{entry_id}_{vehicle_id}_status",
                f"{entry_id}_{vehicle_id}_upcoming_expenses_30_days",
                f"{entry_id}_{vehicle_id}_upcoming_expenses_90_days",
                f"{entry_id}_{vehicle_id}_annual_costs_current_year",
                f"{entry_id}_{vehicle_id}_fuel_costs_current_year",
                f"{entry_id}_{vehicle_id}_fuel_costs_current_month",
                f"{entry_id}_{vehicle_id}_fuel_average_consumption",
            }
        )

        for maintenance_type in MAINTENANCE_TYPES:
            if maintenance_type == MAINTENANCE_TYPE_SERVICE:
                expected.update(
                    {
                        f"{entry_id}_{vehicle_id}_service_date",
                        f"{entry_id}_{vehicle_id}_last_service_km",
                        f"{entry_id}_{vehicle_id}_service_interval_km",
                        f"{entry_id}_{vehicle_id}_service_interval_days",
                        f"{entry_id}_{vehicle_id}_service_km_remaining",
                        f"{entry_id}_{vehicle_id}_service_days_remaining",
                        f"{entry_id}_{vehicle_id}_service_status",
                        f"{entry_id}_{vehicle_id}_maintenance_{maintenance_type}_{COST_AMOUNT}",
                    }
                )
                continue

            expected.add(f"{entry_id}_{vehicle_id}_maintenance_{maintenance_type}_last_date")
            expected.add(f"{entry_id}_{vehicle_id}_maintenance_{maintenance_type}_interval_days")
            expected.add(f"{entry_id}_{vehicle_id}_maintenance_{maintenance_type}_cost")
            expected.add(f"{entry_id}_{vehicle_id}_maintenance_{maintenance_type}_days_remaining")
            expected.add(f"{entry_id}_{vehicle_id}_maintenance_{maintenance_type}_status")

            if maintenance_type not in MAINTENANCE_TIME_ONLY_TYPES:
                expected.add(f"{entry_id}_{vehicle_id}_maintenance_{maintenance_type}_last_km")
                expected.add(f"{entry_id}_{vehicle_id}_maintenance_{maintenance_type}_interval_km")
                expected.add(f"{entry_id}_{vehicle_id}_maintenance_{maintenance_type}_km_remaining")

        for legal_type in LEGAL_TYPES:
            expected.update(
                {
                    f"{entry_id}_{vehicle_id}_{legal_type}_start_date",
                    f"{entry_id}_{vehicle_id}_{legal_type}_end_date",
                    f"{entry_id}_{vehicle_id}_{legal_type}_days_remaining",
                    f"{entry_id}_{vehicle_id}_{legal_type}_status",
                }
            )

        for legal_type in LEGAL_COST_TYPES:
            expected.add(f"{entry_id}_{vehicle_id}_legal_{legal_type}_cost")

        expected.add(f"{entry_id}_{vehicle_id}_{CONF_FUEL_PROFILE}")

        for consumable_key in CONSUMABLE_TYPES:
            expected.add(f"{entry_id}_{vehicle_id}_consumable_{consumable_key}")

        for legal_type, fields in legal_text_fields.items():
            for field in fields:
                expected.add(f"{entry_id}_{vehicle_id}_{legal_type}_{field}")

        plate = str(vehicle.get(CONF_LICENSE_PLATE) or "").replace(" ", "").upper()
        if plate and plate in rovinieta_plates:
            slug = slugify_plate(vehicle.get(CONF_LICENSE_PLATE, vehicle_id))
            expected.update(
                {
                    f"{entry_id}_{vehicle_id}_{slug}_rovinieta_status",
                    f"{entry_id}_{vehicle_id}_{slug}_rovinieta_expiry",
                    f"{entry_id}_{vehicle_id}_{slug}_rovinieta_days_remaining",
                    f"{entry_id}_{vehicle_id}_{slug}_rovinieta_series",
                    f"{entry_id}_{vehicle_id}_{slug}_rovinieta_category",
                    f"{entry_id}_{vehicle_id}_{slug}_rovinieta_period",
                }
            )

    return expected


async def _async_cleanup_orphan_entities(
    hass: HomeAssistant,
    entry: CarManagerConfigEntry,
    *,
    dry_run: bool = False,
) -> list[dict[str, str]]:
    """Funcție internă pentru curățare orfane entități."""

    from homeassistant.helpers import entity_registry as er

    registry = er.async_get(hass)
    expected = _expected_entity_unique_ids(entry)
    removed: list[dict[str, str]] = []

    for registry_entry in er.async_entries_for_config_entry(registry, entry.entry_id):
        unique_id = str(getattr(registry_entry, "unique_id", "") or "")
        entity_id = str(getattr(registry_entry, "entity_id", "") or "")

        if not unique_id or not entity_id:
            continue
        if unique_id in expected:
            continue
        if not unique_id.startswith(f"{entry.entry_id}_"):
            continue

        # Rovinieta poate fi temporar indisponibilă dacă portalul extern sau autentificarea eșuează.
        # Nu ștergem automat aceste entități decât dacă nu mai sunt generate explicit.
        if "rovinieta" in unique_id:
            continue

        removed.append({"entity_id": entity_id, "unique_id": unique_id})
        if not dry_run:
            registry.async_remove(entity_id)

    if removed:
        action = "ar fi curățate" if dry_run else "curățate"
        _LOGGER.info(
            "Car Manager România: %s entități orfane %s din registry: %s",
            len(removed),
            action,
            ", ".join(item["entity_id"] for item in removed),
        )

    return removed


def _generate_vehicle_id(vehicles: list[dict[str, Any]], license_plate: str, vehicle_name: str) -> str:
    """Funcție internă pentru generate vehicul ID."""

    base_id = slugify(license_plate) or slugify(vehicle_name) or "autovehicul"
    existing_ids = {str(vehicle.get("vehicle_id")) for vehicle in vehicles if vehicle.get("vehicle_id")}

    if base_id not in existing_ids:
        return base_id

    counter = 2
    while f"{base_id}_{counter}" in existing_ids:
        counter += 1

    return f"{base_id}_{counter}"


def _find_loaded_config_entry(hass: HomeAssistant, entry_id: str | None = None) -> CarManagerConfigEntry:
    """Funcție internă pentru căutare loaded configurare intrare."""

    entries = hass.config_entries.async_entries(DOMAIN)
    if entry_id:
        entries = [entry for entry in entries if entry.entry_id == entry_id]

    for entry in entries:
        runtime_data = getattr(entry, "runtime_data", None)
        if runtime_data is not None and isinstance(runtime_data, CarManagerRuntimeData):
            return entry  # type: ignore[return-value]

    raise HomeAssistantError(
        "Nu există nicio instanță Car Manager România încărcată pentru adăugarea autovehiculului."
    )


def _normalize_vehicle_reference(value: Any) -> str:
    """Funcție internă pentru normalizare vehicul referință."""

    return "".join(ch for ch in str(value or "").strip().lower() if ch.isalnum())


def _find_vehicle_by_reference(vehicles: list[dict[str, Any]], reference: str) -> dict[str, Any] | None:
    """Funcție internă pentru căutare vehicul by referință."""

    wanted = _normalize_vehicle_reference(reference)
    if not wanted:
        return None

    for vehicle in vehicles:
        if not isinstance(vehicle, dict):
            continue

        candidates = (
            vehicle.get(CONF_VEHICLE_ID),
            vehicle.get(CONF_VIN),
            vehicle.get(CONF_LICENSE_PLATE),
            vehicle.get(CONF_NAME),
        )
        if any(_normalize_vehicle_reference(candidate) == wanted for candidate in candidates):
            return vehicle

    return None


def _find_vehicle_by_online_identity(
    vehicles: list[dict[str, Any]],
    *,
    vin: str | None,
    license_plate: str | None,
) -> dict[str, Any] | None:
    """Caută defensiv un autovehicul existent după VIN sau număr de înmatriculare."""

    normalized_vin = _normalize_vehicle_reference(vin)
    normalized_plate = _normalize_vehicle_reference(license_plate)

    for vehicle in vehicles:
        if not isinstance(vehicle, dict):
            continue
        if normalized_vin and _normalize_vehicle_reference(vehicle.get(CONF_VIN)) == normalized_vin:
            return vehicle
        if normalized_plate and _normalize_vehicle_reference(vehicle.get(CONF_LICENSE_PLATE)) == normalized_plate:
            return vehicle

    return None


def _first_text_from_nested(data: Any, wanted_parts: tuple[str, ...]) -> str | None:
    """Caută o valoare text într-un dicționar brut, fără să expună date sensibile în loguri."""

    if isinstance(data, dict):
        for key, value in data.items():
            key_text = str(key).lower()
            if all(part in key_text for part in wanted_parts) and isinstance(value, (str, int, float)):
                text_value = str(value).strip()
                if text_value:
                    return text_value
        for value in data.values():
            found = _first_text_from_nested(value, wanted_parts)
            if found:
                return found
    elif isinstance(data, list):
        for item in data:
            found = _first_text_from_nested(item, wanted_parts)
            if found:
                return found

    return None


def _rovinieta_vehicle_import_dict(rovinieta_vehicle: Any, existing_vehicles: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Transformă un vehicul online într-un obiect sigur pentru afișare/import."""

    plate = str(getattr(rovinieta_vehicle, "plate_no", "") or "").strip().upper().replace(" ", "")
    if not plate:
        return None

    vin = str(getattr(rovinieta_vehicle, "chasis_no", "") or "").strip().upper()
    country = str(getattr(rovinieta_vehicle, "country_name", "") or getattr(rovinieta_vehicle, "country_code", "") or "").strip()
    source = str(getattr(rovinieta_vehicle, "source", "") or LEGAL_SOURCE_EROVINIETA)
    raw = getattr(rovinieta_vehicle, "raw", {}) or {}
    active_vignette = getattr(rovinieta_vehicle, "active_vignette", None)
    if not isinstance(active_vignette, dict):
        active_vignette = {}

    registration_certificate = (
        _first_text_from_nested(raw, ("cert",))
        or _first_text_from_nested(raw, ("talon",))
        or _first_text_from_nested(raw, ("document",))
    )
    vignette_category = (
        str(getattr(rovinieta_vehicle, "category_vignette_title", "") or "").strip()
        or str(active_vignette.get("vignetteCategory") or active_vignette.get("category") or "").strip()
    )
    toll_category = str(getattr(rovinieta_vehicle, "category_toll_title", "") or "").strip()

    existing = _find_vehicle_by_online_identity(existing_vehicles, vin=vin, license_plate=plate)
    expiry = _rovinieta_date_value(getattr(rovinieta_vehicle, "expiry", None))
    start_date = _active_rovinieta_start_date(rovinieta_vehicle)
    price = _active_rovinieta_price(rovinieta_vehicle)

    return {
        "import_key": _rovinieta_plate_key(plate),
        "license_plate": plate,
        "country": country,
        "vin": vin,
        "registration_certificate": registration_certificate or "",
        "rovinieta_category": vignette_category,
        "fetesti_bridge_category": toll_category,
        "rovinieta_status": "activă" if bool(getattr(rovinieta_vehicle, "has_active_vignette", False)) else "fără rovinietă activă",
        "rovinieta_start_date": start_date or "",
        "rovinieta_end_date": expiry or "",
        "rovinieta_days_remaining": getattr(rovinieta_vehicle, "days_remaining", None),
        "rovinieta_cost": price,
        "source": source,
        "source_label": "CNAIR / erovinieta.ro" if "erovinieta.ro" in source and "e-rovinieta" not in source else "e-rovinieta.ro",
        "existing": existing is not None,
        "existing_vehicle_id": str(existing.get(CONF_VEHICLE_ID) or "") if existing else "",
        "existing_vehicle_name": str(existing.get(CONF_NAME) or "") if existing else "",
        "can_import": existing is None,
    }



def _rovinieta_account_store_key(entry: CarManagerConfigEntry) -> str:
    """Returnează cheia de stocare dedicată contului de rovinietă pentru intrarea curentă.

    Cheia include `entry_id` ca să nu amestecăm niciodată date între mai multe
    instanțe ale integrării sau valori rămase din versiuni beta anterioare.
    """

    return f"{DOMAIN}_rovinieta_account_{entry.entry_id}"


async def _async_load_rovinieta_account_store(hass: HomeAssistant, entry: CarManagerConfigEntry) -> dict[str, Any]:
    """Încarcă datele contului de rovinietă salvate separat pentru dashboard.

    Citim doar store-ul asociat intrării curente. Nu mai folosim store-ul global
    din versiunile beta anterioare, deoarece putea afișa în UI un utilizator
    rămas din cache/local storage și crea confuzie.
    """

    try:
        from homeassistant.helpers.storage import Store

        store: Store[dict[str, Any]] = Store(
            hass,
            1,
            _rovinieta_account_store_key(entry),
        )
        raw = await store.async_load()
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("Nu am putut încărca store-ul contului de rovinietă: %s", err)
        return {}

    if not isinstance(raw, dict):
        return {}

    # Protecție suplimentară pentru migrații sau fișiere copiate manual.
    stored_entry_id = raw.get("entry_id")
    if stored_entry_id and stored_entry_id != entry.entry_id:
        return {}

    return raw


async def _async_save_rovinieta_account_store(hass: HomeAssistant, entry: CarManagerConfigEntry, data: dict[str, Any]) -> None:
    """Salvează datele contului de rovinietă într-un store intern per config entry."""

    try:
        from homeassistant.helpers.storage import Store

        store: Store[dict[str, Any]] = Store(
            hass,
            1,
            _rovinieta_account_store_key(entry),
        )
        payload = dict(data)
        payload["entry_id"] = entry.entry_id
        await store.async_save(payload)
    except Exception as err:  # noqa: BLE001
        raise HomeAssistantError("Nu am putut salva local contul de rovinietă online.") from err


async def _async_rovinieta_account_options(hass: HomeAssistant, entry: CarManagerConfigEntry) -> dict[str, Any]:
    """Returnează setările contului de rovinietă, cu prioritate pentru store.

    Ordinea este: data inițială config entry, options, apoi store-ul dedicat.
    Store-ul are prioritate pentru că este actualizat direct din dashboard.
    """

    stored = await _async_load_rovinieta_account_store(hass, entry)
    options = {**dict(entry.data), **dict(entry.options), **stored}

    provider = str(options.get(CONF_ROVINIETA_PROVIDER) or ROVINIETA_PROVIDER_CNAIR).strip()
    if provider not in ROVINIETA_PROVIDERS:
        provider = ROVINIETA_PROVIDER_CNAIR
    options[CONF_ROVINIETA_PROVIDER] = provider

    try:
        interval = int(options.get(CONF_ROVINIETA_SCAN_INTERVAL) or DEFAULT_ROVINIETA_SCAN_INTERVAL)
    except (TypeError, ValueError):
        interval = DEFAULT_ROVINIETA_SCAN_INTERVAL
    options[CONF_ROVINIETA_SCAN_INTERVAL] = max(MIN_ROVINIETA_SCAN_INTERVAL, interval)

    return options


async def _async_fetch_rovinieta_account_data_direct(
    hass: HomeAssistant,
    entry: CarManagerConfigEntry,
) -> Any:
    """Citește direct datele din portaluri, fără să depindă de reload-ul coordonatorului.

    Folosim aceeași pereche user/parolă salvată în configurarea integrării.
    Dacă unul dintre portaluri eșuează, păstrăm rezultatul celuilalt portal, iar
    erorile sunt întoarse doar dacă niciun portal nu livrează date utile.
    """

    options = await _async_rovinieta_account_options(hass, entry)
    username = str(options.get(CONF_ROVINIETA_USERNAME) or "").strip()
    password = str(options.get(CONF_ROVINIETA_PASSWORD) or "")
    provider = str(options.get(CONF_ROVINIETA_PROVIDER) or ROVINIETA_PROVIDER_CNAIR).strip()

    if not username or not password:
        raise HomeAssistantError("Contul de rovinietă online nu este configurat. Alege portalul, salvează utilizatorul și parola, apoi încearcă din nou.")

    session = async_get_clientsession(hass)

    if provider == ROVINIETA_PROVIDER_E_ROVINIETA:
        try:
            payload = await ERovinietaApiClient(session, username=username, password=password).async_fetch_all()
            account_data = normalize_payload(payload)
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Scanarea importului e-rovinieta.ro a eșuat: %s", err)
            raise HomeAssistantError("Nu am putut citi autovehiculele din e-rovinieta.ro. Verifică portalul selectat, utilizatorul și parola.") from err
    else:
        try:
            cnair_payload = await CnairERovinietaApiClient(session, username=username, password=password).async_fetch_all()
            account_data = normalize_cnair_payload(cnair_payload)
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Scanarea importului CNAIR / erovinieta.ro a eșuat: %s", err)
            raise HomeAssistantError("Nu am putut citi autovehiculele din CNAIR / erovinieta.ro. Verifică portalul selectat, utilizatorul și parola.") from err

    portal_label = "e-rovinieta.ro" if provider == ROVINIETA_PROVIDER_E_ROVINIETA else "CNAIR / erovinieta.ro"
    _LOGGER.debug(
        "Scanare import rovinietă %s: %s vehicule primite",
        portal_label,
        len(account_data.vehicles),
    )

    if account_data.vehicles:
        return account_data

    raise HomeAssistantError(f"Nu am găsit autovehicule disponibile în contul selectat: {portal_label}.")


async def _async_reconfigure_rovinieta_coordinator(
    hass: HomeAssistant,
    entry: CarManagerConfigEntry,
) -> None:
    """Reconstruiește coordonatorul rovinietei fără reload complet al integrării."""

    runtime_data = entry.runtime_data
    try:
        runtime_data.rovinieta_coordinator = await _async_setup_rovinieta_coordinator(hass, entry)
    except Exception as err:  # noqa: BLE001
        # Salvarea contului nu trebuie să eșueze doar pentru că portalul extern
        # nu poate fi citit în acel moment. Contul rămâne salvat, iar scanarea
        # manuală va afișa utilizatorului eroarea concretă când este apăsată.
        runtime_data.rovinieta_coordinator = None
        _LOGGER.debug("Nu am putut recrea coordonatorul rovinietei după salvarea contului: %s", err)

    if runtime_data.rovinieta_coordinator is not None:
        try:
            await _async_sync_rovinieta_manual_terms(hass, entry, dispatch_updates=True)
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Nu am putut sincroniza rovinieta după salvarea contului online: %s", err)


async def _async_refresh_rovinieta_now(
    hass: HomeAssistant,
    entry: CarManagerConfigEntry,
) -> dict[str, Any]:
    """Actualizează rovinietele imediat din portalul selectat în setări."""

    options = await _async_rovinieta_account_options(hass, entry)
    username = str(options.get(CONF_ROVINIETA_USERNAME) or "").strip()
    password = str(options.get(CONF_ROVINIETA_PASSWORD) or "")
    provider = str(options.get(CONF_ROVINIETA_PROVIDER) or ROVINIETA_PROVIDER_CNAIR).strip()
    portal_label = "e-rovinieta.ro" if provider == ROVINIETA_PROVIDER_E_ROVINIETA else "CNAIR / erovinieta.ro"

    if not username or not password:
        raise HomeAssistantError("Contul de rovinietă online nu este configurat. Salvează utilizatorul și parola, apoi încearcă din nou.")

    account_data = await _async_fetch_rovinieta_account_data_direct(hass, entry)
    runtime_data = entry.runtime_data

    coordinator = getattr(runtime_data, "rovinieta_coordinator", None)
    if coordinator is None or getattr(coordinator, "provider", None) != provider:
        coordinator = await _async_setup_rovinieta_coordinator(hass, entry)
        runtime_data.rovinieta_coordinator = coordinator

    if coordinator is not None:
        coordinator.async_set_updated_data(account_data)

    changed = await _async_sync_rovinieta_manual_terms(hass, entry, dispatch_updates=True)

    vehicle_count = len(getattr(account_data, "vehicles", []) or [])
    return {
        "status": "ok",
        "provider": provider,
        "provider_label": portal_label,
        "vehicles_found": vehicle_count,
        "updated": bool(changed),
        "message": (
            f"Rovinietele au fost actualizate din {portal_label}. "
            f"Vehicule găsite în cont: {vehicle_count}."
        ),
    }


async def _async_rovinieta_import_candidates(
    hass: HomeAssistant,
    entry: CarManagerConfigEntry,
    *,
    refresh: bool = True,
) -> list[dict[str, Any]]:
    """Returnează lista de autovehicule disponibile în conturile de rovinietă."""

    runtime_data = entry.runtime_data
    existing_vehicles = await runtime_data.vehicle_store.async_get_vehicles()
    if not existing_vehicles:
        existing_vehicles = list(runtime_data.all_vehicles or runtime_data.vehicles)

    # Pentru import folosim o citire directă la apăsarea butonului. Așa evităm
    # situațiile în care coordonatorul încă nu s-a recreat după salvarea contului.
    if refresh or runtime_data.rovinieta_coordinator is None or runtime_data.rovinieta_coordinator.data is None:
        account_data = await _async_fetch_rovinieta_account_data_direct(hass, entry)
    else:
        account_data = runtime_data.rovinieta_coordinator.data

    if account_data is None:
        raise HomeAssistantError("Nu există date disponibile din contul de rovinietă online.")

    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for rovinieta_vehicle in account_data.vehicles:
        candidate = _rovinieta_vehicle_import_dict(rovinieta_vehicle, existing_vehicles)
        if candidate is None:
            continue
        key = str(candidate.get("import_key") or "")
        if not key or key in seen:
            continue
        seen.add(key)
        candidates.append(candidate)

    candidates.sort(key=lambda item: (bool(item.get("existing")), str(item.get("license_plate") or "")))
    return candidates


def _vehicle_internal_id(vehicle: dict[str, Any]) -> str:
    """Funcție internă pentru vehicul intern ID."""

    vehicle_id = str(vehicle.get(CONF_VEHICLE_ID, "")).strip()
    if not vehicle_id:
        raise HomeAssistantError("Autovehiculul selectat nu are ID intern stabil.")
    return vehicle_id


SET_NOTIFICATION_OPTIONS_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
        vol.Optional(CONF_NOTIFICATIONS_ENABLED): bool,
        vol.Optional(CONF_NOTIFY_MAINTENANCE): bool,
        vol.Optional(CONF_NOTIFY_LEGAL): bool,
        vol.Optional(CONF_NOTIFY_EQUIPMENT): bool,
        vol.Optional(CONF_NOTIFY_BATTERY): bool,
        vol.Optional(CONF_NOTIFY_EXPENSES): bool,
    }
)

SET_ROVINIETA_ACCOUNT_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
        vol.Optional(CONF_ROVINIETA_USERNAME, default=""): str,
        vol.Optional(CONF_ROVINIETA_PASSWORD, default=""): str,
        vol.Optional(CONF_ROVINIETA_PROVIDER, default=ROVINIETA_PROVIDER_CNAIR): vol.In(ROVINIETA_PROVIDERS),
        vol.Optional(
            CONF_ROVINIETA_SCAN_INTERVAL,
            default=DEFAULT_ROVINIETA_SCAN_INTERVAL,
        ): vol.Coerce(int),
    }
)

GET_ROVINIETA_ACCOUNT_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
    }
)

SCAN_ROVINIETA_IMPORT_VEHICLES_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
        vol.Optional("refresh", default=True): bool,
    }
)

IMPORT_ROVINIETA_VEHICLE_SCHEMA = vol.Schema(
    {
        vol.Optional("entry_id"): str,
        vol.Required("import_key"): str,
    }
)


def _normalized_vehicle_identity(value: Any) -> str:
    """Normalizează o identitate auto pentru comparații fără spații și litere mici/mari."""

    return str(value or "").strip().upper().replace(" ", "").replace("-", "")


def _find_duplicate_vehicle_identity(
    vehicles: list[dict[str, Any]],
    *,
    current_vehicle_id: str,
    license_plate: str,
    vin: str,
) -> str | None:
    """Verifică dacă noul număr sau VIN aparțin altui autovehicul."""

    wanted_plate = _normalized_vehicle_identity(license_plate)
    wanted_vin = _normalized_vehicle_identity(vin)
    for vehicle in vehicles:
        if str(vehicle.get(CONF_VEHICLE_ID) or "") == current_vehicle_id:
            continue
        if vehicle.get(CONF_REMOVED):
            continue
        vehicle_name = str(vehicle.get(CONF_NAME) or vehicle.get(CONF_LICENSE_PLATE) or vehicle.get(CONF_VEHICLE_ID) or "alt autovehicul")
        existing_plate = _normalized_vehicle_identity(vehicle.get(CONF_LICENSE_PLATE))
        existing_vin = _normalized_vehicle_identity(vehicle.get(CONF_VIN))
        if wanted_plate and existing_plate and wanted_plate == existing_plate:
            return f"Numărul de înmatriculare este deja folosit de {vehicle_name}."
        if wanted_vin and existing_vin and wanted_vin == existing_vin:
            return f"VIN-ul este deja folosit de {vehicle_name}."
    return None

async def _async_register_services(hass: HomeAssistant) -> None:
    """Funcție internă pentru înregistrare services."""

    hass.data.setdefault(DOMAIN, {})
    if (
        hass.data[DOMAIN].get("services_registered")
        and hass.services.has_service(DOMAIN, SERVICE_ADD_VEHICLE)
        and hass.services.has_service(DOMAIN, SERVICE_EDIT_VEHICLE)
        and hass.services.has_service(DOMAIN, SERVICE_REMOVE_VEHICLE)
        and hass.services.has_service(DOMAIN, SERVICE_RESTORE_VEHICLE)
        and hass.services.has_service(DOMAIN, SERVICE_RESTORE_ALL_VEHICLES)
        and hass.services.has_service(DOMAIN, SERVICE_ADD_SERVICE_RECORD)
        and hass.services.has_service(DOMAIN, SERVICE_RESTORE_SERVICE_RECORD)
        and hass.services.has_service(DOMAIN, SERVICE_RESTORE_LAST_SERVICE_RECORD)
        and hass.services.has_service(DOMAIN, SERVICE_DELETE_SERVICE_RECORD)
        and hass.services.has_service(DOMAIN, SERVICE_UPDATE_SERVICE_RECORD)
        and hass.services.has_service(DOMAIN, SERVICE_EXPORT_DATA)
        and hass.services.has_service(DOMAIN, SERVICE_VALIDATE_BACKUP)
        and hass.services.has_service(DOMAIN, SERVICE_IMPORT_DATA)
        and hass.services.has_service(DOMAIN, SERVICE_SET_LEGAL_OPTION)
        and hass.services.has_service(DOMAIN, SERVICE_CLEANUP_ORPHAN_ENTITIES)
        and hass.services.has_service(DOMAIN, SERVICE_REFRESH_LICENSE_STATUS)
        and hass.services.has_service(DOMAIN, SERVICE_SET_NOTIFICATION_OPTIONS)
        and hass.services.has_service(DOMAIN, SERVICE_SET_ROVINIETA_ACCOUNT)
        and hass.services.has_service(DOMAIN, SERVICE_SCAN_ROVINIETA_IMPORT_VEHICLES)
        and hass.services.has_service(DOMAIN, SERVICE_IMPORT_ROVINIETA_VEHICLE)
        and hass.services.has_service(DOMAIN, SERVICE_REFRESH_ROVINIETA_NOW)
        and hass.services.has_service(DOMAIN, SERVICE_ADD_FUEL_RECEIPT)
        and hass.services.has_service(DOMAIN, SERVICE_UPDATE_FUEL_RECEIPT)
        and hass.services.has_service(DOMAIN, SERVICE_DELETE_FUEL_RECEIPT)
        and hass.services.has_service(DOMAIN, SERVICE_ADD_TIRE_SET)
        and hass.services.has_service(DOMAIN, SERVICE_UPDATE_TIRE_SET)
        and hass.services.has_service(DOMAIN, SERVICE_DELETE_TIRE_SET)
    ):
        return

    async def async_refresh_license_status(call: ServiceCall) -> None:
        """Gestionează asincron actualizarea statusului licenței."""

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))

        from .license import (
            async_obtine_context_licenta,
            async_salveaza_licenta_globala,
            async_valideaza_licenta,
        )

        username, license_key, _storage = await async_obtine_context_licenta(hass, intrare=entry)
        license_key = str(license_key or "").strip() or "TRIAL"
        result = await async_valideaza_licenta(hass, license_key, username)

        await async_salveaza_licenta_globala(hass, license_key, username, result)
        dispatcher_send(hass, SIGNAL_LICENSE_UPDATED)

        if result.connection_error:
            raise HomeAssistantError(result.message or "Serverul de licențiere nu a putut fi contactat.")

        if not result.valid:
            raise HomeAssistantError(result.message or "Licența nu este validă.")


    async def async_set_notification_options(call: ServiceCall) -> None:
        """Actualizează opțiunile de notificare dintr-un apel de service."""

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        options = dict(entry.options or {})

        fields = {
            CONF_NOTIFICATIONS_ENABLED: DEFAULT_NOTIFICATIONS_ENABLED,
            CONF_NOTIFY_MAINTENANCE: DEFAULT_NOTIFY_MAINTENANCE,
            CONF_NOTIFY_LEGAL: DEFAULT_NOTIFY_LEGAL,
            CONF_NOTIFY_EQUIPMENT: DEFAULT_NOTIFY_EQUIPMENT,
            CONF_NOTIFY_BATTERY: DEFAULT_NOTIFY_BATTERY,
            CONF_NOTIFY_EXPENSES: DEFAULT_NOTIFY_EXPENSES,
        }

        changed = False
        for key, default in fields.items():
            if key not in call.data:
                continue
            value = bool(call.data.get(key, default))
            if bool(options.get(key, default)) != value:
                options[key] = value
                changed = True

        if not changed:
            return

        hass.config_entries.async_update_entry(entry, options=options)

        try:
            from .notify import async_check_maintenance_notifications

            await async_check_maintenance_notifications(hass, entry)
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Nu am putut reevalua notificările după actualizarea setărilor: %s", err)

    async def async_set_rovinieta_account(call: ServiceCall) -> None:
        """Actualizează contul online de rovinietă din dashboard sau servicii.

        Parola nu se loghează și nu se modifică atunci când este trimisă goală,
        cu excepția cazului în care utilizatorul golește și numele de utilizator.
        """

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        options = dict(entry.options or {})
        data = dict(entry.data or {})
        stored = await _async_load_rovinieta_account_store(hass, entry)

        username = str(call.data.get(CONF_ROVINIETA_USERNAME) or "").strip()
        password = str(call.data.get(CONF_ROVINIETA_PASSWORD) or "")

        # Portalul este ales explicit de utilizator. Dacă, din motive de
        # compatibilitate, apelul nu trimite câmpul, păstrăm valoarea salvată
        # anterior în opțiuni sau în data config entry.
        provider = str(
            call.data.get(CONF_ROVINIETA_PROVIDER)
            or stored.get(CONF_ROVINIETA_PROVIDER)
            or options.get(CONF_ROVINIETA_PROVIDER)
            or data.get(CONF_ROVINIETA_PROVIDER)
            or ROVINIETA_PROVIDER_CNAIR
        ).strip()
        if provider not in ROVINIETA_PROVIDERS:
            provider = ROVINIETA_PROVIDER_CNAIR

        scan_interval = max(
            MIN_ROVINIETA_SCAN_INTERVAL,
            int(call.data.get(CONF_ROVINIETA_SCAN_INTERVAL) or DEFAULT_ROVINIETA_SCAN_INTERVAL),
        )

        options[CONF_ROVINIETA_USERNAME] = username
        options[CONF_ROVINIETA_PROVIDER] = provider
        if password:
            options[CONF_ROVINIETA_PASSWORD] = password
        elif not username:
            options.pop(CONF_ROVINIETA_PASSWORD, None)
        else:
            preserved_password = (
                stored.get(CONF_ROVINIETA_PASSWORD)
                or options.get(CONF_ROVINIETA_PASSWORD)
                or data.get(CONF_ROVINIETA_PASSWORD)
            )
            if preserved_password:
                options[CONF_ROVINIETA_PASSWORD] = preserved_password
        options[CONF_ROVINIETA_SCAN_INTERVAL] = scan_interval

        await _async_save_rovinieta_account_store(
            hass,
            entry,
            {
                CONF_ROVINIETA_USERNAME: options.get(CONF_ROVINIETA_USERNAME, ""),
                CONF_ROVINIETA_PASSWORD: options.get(CONF_ROVINIETA_PASSWORD, ""),
                CONF_ROVINIETA_PROVIDER: options.get(CONF_ROVINIETA_PROVIDER, ROVINIETA_PROVIDER_CNAIR),
                CONF_ROVINIETA_SCAN_INTERVAL: options.get(CONF_ROVINIETA_SCAN_INTERVAL, DEFAULT_ROVINIETA_SCAN_INTERVAL),
            },
        )

        # Persistăm contul și în `data`, și în `options`, pe lângă store-ul dedicat.
        # În unele scenarii de reload / cache frontend, doar opțiunile pot fi citite
        # târziu de panel. Păstrând aceleași valori în ambele locuri, statusul
        # contului rămâne coerent după restart și după Ctrl+F5.
        data[CONF_ROVINIETA_USERNAME] = options.get(CONF_ROVINIETA_USERNAME, "")
        data[CONF_ROVINIETA_PROVIDER] = options.get(CONF_ROVINIETA_PROVIDER, ROVINIETA_PROVIDER_CNAIR)
        data[CONF_ROVINIETA_SCAN_INTERVAL] = options.get(CONF_ROVINIETA_SCAN_INTERVAL, DEFAULT_ROVINIETA_SCAN_INTERVAL)
        if options.get(CONF_ROVINIETA_PASSWORD):
            data[CONF_ROVINIETA_PASSWORD] = options.get(CONF_ROVINIETA_PASSWORD)
        elif not username:
            data.pop(CONF_ROVINIETA_PASSWORD, None)

        hass.config_entries.async_update_entry(entry, data=data, options=options)
        # Nu reconstruim coordonatorul aici. Salvarea contului trebuie să fie rapidă
        # și să nu depindă de portalul extern. Căutarea/importul citesc direct
        # portalul selectat de utilizator.


    async def async_get_rovinieta_account(call: ServiceCall) -> dict[str, Any]:
        """Returnează sumarul contului de rovinietă salvat, fără parolă."""

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        options = await _async_rovinieta_account_options(hass, entry)

        username = str(options.get(CONF_ROVINIETA_USERNAME) or "").strip()
        password = str(options.get(CONF_ROVINIETA_PASSWORD) or "")
        provider = str(options.get(CONF_ROVINIETA_PROVIDER) or ROVINIETA_PROVIDER_CNAIR).strip()
        scan_interval = int(options.get(CONF_ROVINIETA_SCAN_INTERVAL) or DEFAULT_ROVINIETA_SCAN_INTERVAL)

        return {
            "configured": bool(username and password),
            "username": username,
            "has_password": bool(password),
            "provider": provider,
            "provider_label": "e-rovinieta.ro" if provider == ROVINIETA_PROVIDER_E_ROVINIETA else "CNAIR / erovinieta.ro",
            "scan_interval": scan_interval,
        }


    async def async_refresh_rovinieta_now(call: ServiceCall) -> dict[str, Any]:
        """Actualizează imediat rovinietele din portalul selectat în setări."""

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        return await _async_refresh_rovinieta_now(hass, entry)


    async def async_scan_rovinieta_import_vehicles(call: ServiceCall) -> dict[str, Any]:
        """Scanează conturile de rovinietă și returnează vehiculele disponibile pentru import."""

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        candidates = await _async_rovinieta_import_candidates(
            hass,
            entry,
            refresh=bool(call.data.get("refresh", True)),
        )
        return {
            "vehicles": candidates,
            "count": len(candidates),
            "importable_count": sum(1 for item in candidates if item.get("can_import")),
            "existing_count": sum(1 for item in candidates if item.get("existing")),
        }

    async def async_import_rovinieta_vehicle(call: ServiceCall) -> dict[str, Any]:
        """Importă un singur autovehicul selectat din contul de rovinietă."""

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        import_key = _rovinieta_plate_key(call.data.get("import_key"))
        if not import_key:
            raise HomeAssistantError("Cheia autovehiculului de import este obligatorie.")

        candidates = await _async_rovinieta_import_candidates(hass, entry, refresh=False)
        candidate = next((item for item in candidates if item.get("import_key") == import_key), None)
        if candidate is None:
            raise HomeAssistantError("Autovehiculul selectat nu mai este disponibil în contul de rovinietă.")

        if candidate.get("existing"):
            return {
                "status": "already_exists",
                "message": "Autovehiculul există deja în Car Manager România.",
                "vehicle": candidate,
            }

        runtime_data = entry.runtime_data
        stored_vehicles = await runtime_data.vehicle_store.async_get_vehicles()
        option_vehicles = entry.options.get(CONF_VEHICLES, entry.data.get(CONF_VEHICLES, []))
        vehicles = merge_vehicle_sources(list(option_vehicles), stored_vehicles)

        # Verificăm încă o dată înainte de salvare, pentru a evita duplicatele dacă datele s-au schimbat între scanare și import.
        existing = _find_vehicle_by_online_identity(
            vehicles,
            vin=str(candidate.get("vin") or ""),
            license_plate=str(candidate.get("license_plate") or ""),
        )
        if existing is not None:
            return {
                "status": "already_exists",
                "message": "Autovehiculul există deja în Car Manager România.",
                "vehicle": candidate | {
                    "existing": True,
                    "existing_vehicle_id": str(existing.get(CONF_VEHICLE_ID) or ""),
                    "existing_vehicle_name": str(existing.get(CONF_NAME) or ""),
                    "can_import": False,
                },
            }

        license_plate = str(candidate.get("license_plate") or "").strip().upper()
        vehicle_name = f"Autovehicul {license_plate}" if license_plate else "Autovehicul importat"
        vehicle_id = _generate_vehicle_id(vehicles, license_plate, vehicle_name)

        rovinieta_term: dict[str, Any] = {}
        if candidate.get("rovinieta_start_date"):
            rovinieta_term[LEGAL_START_DATE] = candidate["rovinieta_start_date"]
        if candidate.get("rovinieta_end_date"):
            rovinieta_term[LEGAL_END_DATE] = candidate["rovinieta_end_date"]
        if candidate.get("source"):
            rovinieta_term[LEGAL_DATA_SOURCE] = candidate["source"]
        if candidate.get("rovinieta_cost") is not None:
            rovinieta_term[COST_AMOUNT] = candidate["rovinieta_cost"]

        new_vehicle = {
            CONF_VEHICLE_ID: vehicle_id,
            CONF_NAME: vehicle_name,
            CONF_LICENSE_PLATE: license_plate,
            CONF_VIN: str(candidate.get("vin") or "").strip().upper(),
            CONF_KM: 0,
            CONF_REGISTRATION_COUNTRY: str(candidate.get("country") or "").strip(),
            CONF_REGISTRATION_CERTIFICATE: str(candidate.get("registration_certificate") or "").strip(),
            CONF_ROVINIETA_CATEGORY: str(candidate.get("rovinieta_category") or "").strip(),
            CONF_FETESTI_BRIDGE_CATEGORY: str(candidate.get("fetesti_bridge_category") or "").strip(),
            CONF_IMPORT_SOURCE: str(candidate.get("source") or "").strip(),
            CONF_LEGAL_TERMS: {
                LEGAL_TYPE_ROVINIETA: rovinieta_term,
            },
        }

        vehicles.append(new_vehicle)
        normalized_vehicles, _ = normalize_vehicles(vehicles)
        active_vehicles = _active_vehicles(normalized_vehicles)
        await runtime_data.vehicle_store.async_save_vehicles(normalized_vehicles)
        runtime_data.vehicles = active_vehicles
        runtime_data.all_vehicles = normalized_vehicles
        dispatcher_send(hass, SIGNAL_VEHICLES_UPDATED, active_vehicles)

        # Nu facem reload complet la fiecare actualizare de opțiuni, pentru că pe mobil
    # aruncă utilizatorul în susul paginii. Coordonatorii citesc valorile actualizate
    # la următorul refresh sau la scanarea manuală.

        return {
            "status": "imported",
            "message": f"Autovehiculul {vehicle_name} a fost importat.",
            "vehicle": new_vehicle,
        }


    async def async_add_vehicle(call: ServiceCall) -> None:
        """Gestionează asincron operațiunea pentru adăugare vehicul."""

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        vehicle_store = entry.runtime_data.vehicle_store

        current_vehicles = await vehicle_store.async_get_vehicles()
        if not current_vehicles:
            current_vehicles = list(entry.runtime_data.vehicles)

        vehicle_name = str(call.data[CONF_NAME]).strip()
        if not vehicle_name:
            raise HomeAssistantError("Numele autovehiculului este obligatoriu.")

        license_plate = str(call.data.get(CONF_LICENSE_PLATE, "")).strip().upper()
        vin = str(call.data.get(CONF_VIN, "")).strip().upper()
        km = max(0, int(call.data.get(CONF_KM, 0) or 0))

        vehicle_id = _generate_vehicle_id(current_vehicles, license_plate, vehicle_name)
        vehicles = list(current_vehicles)
        vehicles.append(
            {
                CONF_VEHICLE_ID: vehicle_id,
                CONF_NAME: vehicle_name,
                CONF_LICENSE_PLATE: license_plate,
                CONF_VIN: vin,
                CONF_KM: km,
            }
        )

        normalized_vehicles, _ = normalize_vehicles(vehicles)
        active_vehicles = _active_vehicles(normalized_vehicles)
        await vehicle_store.async_save_vehicles(normalized_vehicles)
        entry.runtime_data.vehicles = active_vehicles
        entry.runtime_data.all_vehicles = normalized_vehicles
        dispatcher_send(hass, SIGNAL_VEHICLES_UPDATED, active_vehicles)

        _LOGGER.info(
            "Autovehicul adăugat în Car Manager România: %s (%s)",
            vehicle_name,
            license_plate or "fără număr",
        )

        # Reîncărcăm integrarea ca Home Assistant să creeze entitățile noului autovehicul.
        await hass.config_entries.async_reload(entry.entry_id)

    async def async_edit_vehicle(call: ServiceCall) -> None:
        """Actualizează datele principale ale unui autovehicul existent.

        ID-ul intern al autovehiculului rămâne neschimbat. Astfel nu se rup
        istoricul, costurile, reviziile și entitățile deja create.
        """

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        runtime_data = entry.runtime_data
        vehicle_store = runtime_data.vehicle_store

        vehicle_id = str(call.data[CONF_VEHICLE_ID]).strip()
        if not vehicle_id:
            raise HomeAssistantError("ID-ul intern al autovehiculului este obligatoriu.")

        stored_vehicles = await vehicle_store.async_get_vehicles()
        option_vehicles = entry.options.get(
            CONF_VEHICLES,
            entry.data.get(CONF_VEHICLES, []),
        )
        vehicles = merge_vehicle_sources(list(option_vehicles), stored_vehicles)

        target_index: int | None = None
        for index, vehicle in enumerate(vehicles):
            if str(vehicle.get(CONF_VEHICLE_ID) or "") == vehicle_id:
                target_index = index
                break

        if target_index is None:
            raise HomeAssistantError("Autovehiculul selectat nu există în Car Manager România.")

        current_vehicle = dict(vehicles[target_index])
        new_name = str(call.data.get(CONF_NAME, current_vehicle.get(CONF_NAME, "")) or "").strip()
        new_plate = str(call.data.get(CONF_LICENSE_PLATE, current_vehicle.get(CONF_LICENSE_PLATE, "")) or "").strip().upper()
        new_vin = str(call.data.get(CONF_VIN, current_vehicle.get(CONF_VIN, "")) or "").strip().upper()

        if not new_name:
            raise HomeAssistantError("Numele autovehiculului este obligatoriu.")

        duplicate_message = _find_duplicate_vehicle_identity(
            vehicles,
            current_vehicle_id=vehicle_id,
            license_plate=new_plate,
            vin=new_vin,
        )
        if duplicate_message:
            raise HomeAssistantError(duplicate_message)

        current_vehicle[CONF_NAME] = new_name
        current_vehicle[CONF_LICENSE_PLATE] = new_plate
        current_vehicle[CONF_VIN] = new_vin

        if CONF_KM in call.data:
            current_vehicle[CONF_KM] = max(0, int(call.data.get(CONF_KM) or 0))
        if CONF_REGISTRATION_COUNTRY in call.data:
            current_vehicle[CONF_REGISTRATION_COUNTRY] = str(call.data.get(CONF_REGISTRATION_COUNTRY) or "").strip()
        if CONF_REGISTRATION_CERTIFICATE in call.data:
            current_vehicle[CONF_REGISTRATION_CERTIFICATE] = str(call.data.get(CONF_REGISTRATION_CERTIFICATE) or "").strip().upper()
        if CONF_FUEL_PROFILE in call.data:
            fuel_profile = str(call.data.get(CONF_FUEL_PROFILE) or "").strip()
            if fuel_profile in FUEL_PROFILES:
                current_vehicle[CONF_FUEL_PROFILE] = fuel_profile

        # Actualizare completă din dashboard: mentenanță, termene legale și consumabile.
        # Datele sunt transmise grupat ca dicționare, pentru a evita sute de servicii
        # separate și pentru a păstra ID-ul intern al autovehiculului neschimbat.
        maintenance_payload = call.data.get("maintenance")
        if isinstance(maintenance_payload, dict):
            for maintenance_type, values in maintenance_payload.items():
                if maintenance_type not in MAINTENANCE_TYPES or not isinstance(values, dict):
                    continue
                for field in (
                    MAINTENANCE_LAST_DATE,
                    MAINTENANCE_LAST_KM,
                    MAINTENANCE_INTERVAL_KM,
                    MAINTENANCE_INTERVAL_DAYS,
                    COST_AMOUNT,
                ):
                    if field not in values:
                        continue
                    raw_value = values.get(field)
                    if field in (MAINTENANCE_LAST_KM, MAINTENANCE_INTERVAL_KM, MAINTENANCE_INTERVAL_DAYS):
                        value = max(0, int(raw_value or 0))
                    elif field == COST_AMOUNT:
                        value = round(float(raw_value or 0), 2)
                    else:
                        value = str(raw_value or "").strip()
                    set_maintenance_value(current_vehicle, str(maintenance_type), field, value)

        legal_payload = call.data.get(CONF_LEGAL_TERMS)
        legal_text_fields = {
            "rca": RCA_TEXT_FIELDS,
            "casco": CASCO_TEXT_FIELDS,
            "itp": ITP_TEXT_FIELDS,
        }
        if isinstance(legal_payload, dict):
            for legal_type, values in legal_payload.items():
                if legal_type not in LEGAL_TYPES or not isinstance(values, dict):
                    continue
                allowed_fields = {
                    LEGAL_START_DATE,
                    LEGAL_END_DATE,
                    COST_AMOUNT,
                    *(legal_text_fields.get(str(legal_type), {}) or {}).keys(),
                }
                if str(legal_type) == LEGAL_TYPE_ROVINIETA:
                    # Pentru rovinietă păstrăm explicit sursa valorii afișate.
                    # Utilizatorul poate alege manual / CNAIR / e-rovinieta din dashboard.
                    allowed_fields.add(LEGAL_DATA_SOURCE)
                for field, raw_value in values.items():
                    if field not in allowed_fields:
                        continue
                    if field == COST_AMOUNT:
                        value = round(float(raw_value or 0), 2)
                    else:
                        value = str(raw_value or "").strip()
                    set_legal_value(current_vehicle, str(legal_type), str(field), value)

        consumables_payload = call.data.get(CONF_CONSUMABLES)
        if isinstance(consumables_payload, dict):
            consumables = current_vehicle.setdefault(CONF_CONSUMABLES, {})
            if not isinstance(consumables, dict):
                consumables = {}
                current_vehicle[CONF_CONSUMABLES] = consumables
            for field, raw_value in consumables_payload.items():
                if field not in CONSUMABLE_TYPES:
                    continue
                consumables[str(field)] = str(raw_value or "").strip()

        vehicles[target_index] = current_vehicle
        normalized_vehicles, _ = normalize_vehicles(vehicles)
        active_vehicles = _active_vehicles(normalized_vehicles)
        await vehicle_store.async_save_vehicles(normalized_vehicles)
        runtime_data.vehicles = active_vehicles
        runtime_data.all_vehicles = normalized_vehicles
        dispatcher_send(hass, SIGNAL_VEHICLES_UPDATED, active_vehicles)

        _LOGGER.info(
            "Autovehicul actualizat în Car Manager România: %s (%s)",
            new_name,
            new_plate or "fără număr",
        )


    async def async_remove_vehicle(call: ServiceCall) -> None:
        """Gestionează asincron operațiunea pentru eliminare vehicul."""

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        vehicle_store = entry.runtime_data.vehicle_store

        vehicle_id = str(call.data[CONF_VEHICLE_ID]).strip()
        if not vehicle_id:
            raise HomeAssistantError("ID-ul intern al autovehiculului este obligatoriu.")

        stored_vehicles = await vehicle_store.async_get_vehicles()
        option_vehicles = entry.options.get(
            CONF_VEHICLES,
            entry.data.get(CONF_VEHICLES, []),
        )
        vehicles = merge_vehicle_sources(list(option_vehicles), stored_vehicles)

        found = False
        updated_vehicles: list[dict[str, Any]] = []
        for vehicle in vehicles:
            if not isinstance(vehicle, dict):
                continue

            vehicle_copy = dict(vehicle)
            if str(vehicle_copy.get(CONF_VEHICLE_ID, "")) == vehicle_id:
                vehicle_copy[CONF_REMOVED] = True
                found = True
            updated_vehicles.append(vehicle_copy)

        if not found:
            raise HomeAssistantError("Autovehiculul selectat nu a fost găsit în Car Manager România.")

        normalized_vehicles, _ = normalize_vehicles(updated_vehicles)
        active_vehicles = _active_vehicles(normalized_vehicles)
        await vehicle_store.async_save_vehicles(normalized_vehicles)
        entry.runtime_data.vehicles = active_vehicles
        entry.runtime_data.all_vehicles = normalized_vehicles
        dispatcher_send(hass, SIGNAL_VEHICLES_UPDATED, active_vehicles)

        _LOGGER.info(
            "Autovehicul dezactivat în Car Manager România: %s",
            vehicle_id,
        )

        # Reîncărcăm integrarea ca Home Assistant să elimine entitățile autovehiculului din runtime.
        await hass.config_entries.async_reload(entry.entry_id)

    async def async_restore_vehicle(call: ServiceCall) -> None:
        """Gestionează asincron operațiunea pentru restaurare vehicul."""

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        vehicle_store = entry.runtime_data.vehicle_store

        vehicle_id = str(call.data[CONF_VEHICLE_ID]).strip()
        if not vehicle_id:
            raise HomeAssistantError("ID-ul intern al autovehiculului este obligatoriu.")

        stored_vehicles = await vehicle_store.async_get_vehicles()
        option_vehicles = entry.options.get(
            CONF_VEHICLES,
            entry.data.get(CONF_VEHICLES, []),
        )
        vehicles = merge_vehicle_sources(list(option_vehicles), stored_vehicles)

        found = False
        updated_vehicles: list[dict[str, Any]] = []
        for vehicle in vehicles:
            if not isinstance(vehicle, dict):
                continue

            vehicle_copy = dict(vehicle)
            if str(vehicle_copy.get(CONF_VEHICLE_ID, "")) == vehicle_id:
                vehicle_copy[CONF_REMOVED] = False
                found = True
            updated_vehicles.append(vehicle_copy)

        if not found:
            raise HomeAssistantError("Autovehiculul selectat nu a fost găsit în Car Manager România.")

        normalized_vehicles, _ = normalize_vehicles(updated_vehicles)
        active_vehicles = _active_vehicles(normalized_vehicles)
        await vehicle_store.async_save_vehicles(normalized_vehicles)
        entry.runtime_data.vehicles = active_vehicles
        entry.runtime_data.all_vehicles = normalized_vehicles
        dispatcher_send(hass, SIGNAL_VEHICLES_UPDATED, active_vehicles)

        _LOGGER.info(
            "Autovehicul reactivat în Car Manager România: %s",
            vehicle_id,
        )

        # Reîncărcăm integrarea ca Home Assistant să creeze din nou entitățile autovehiculului.
        await hass.config_entries.async_reload(entry.entry_id)


    async def async_restore_all_vehicles(call: ServiceCall) -> None:
        """Gestionează asincron operațiunea pentru restaurare all vehicule."""

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        vehicle_store = entry.runtime_data.vehicle_store

        stored_vehicles = await vehicle_store.async_get_vehicles()
        option_vehicles = entry.options.get(
            CONF_VEHICLES,
            entry.data.get(CONF_VEHICLES, []),
        )
        vehicles = merge_vehicle_sources(list(option_vehicles), stored_vehicles)

        updated_vehicles: list[dict[str, Any]] = []
        changed = False
        for vehicle in vehicles:
            if not isinstance(vehicle, dict):
                continue

            vehicle_copy = dict(vehicle)
            if bool(vehicle_copy.get(CONF_REMOVED)):
                vehicle_copy[CONF_REMOVED] = False
                changed = True
            updated_vehicles.append(vehicle_copy)

        if not changed:
            raise HomeAssistantError("Nu există autovehicule dezactivate de reactivat.")

        normalized_vehicles, _ = normalize_vehicles(updated_vehicles)
        active_vehicles = _active_vehicles(normalized_vehicles)
        await vehicle_store.async_save_vehicles(normalized_vehicles)
        entry.runtime_data.vehicles = active_vehicles
        entry.runtime_data.all_vehicles = normalized_vehicles
        dispatcher_send(hass, SIGNAL_VEHICLES_UPDATED, active_vehicles)

        _LOGGER.info("Toate autovehiculele dezactivate au fost reactivate în Car Manager România.")

        await hass.config_entries.async_reload(entry.entry_id)

    async def async_export_data(call: ServiceCall) -> None:
        """Delegă exportul de date către modulul dedicat pentru backup."""

        await _async_backup_export_data(hass, call, _find_loaded_config_entry)

    async def async_validate_backup(call: ServiceCall) -> None:
        """Delegă validarea backup-ului către modulul dedicat pentru backup."""

        await _async_backup_validate_backup(hass, call, _find_loaded_config_entry)

    async def async_import_data(call: ServiceCall) -> None:
        """Delegă importul de date către modulul dedicat pentru backup."""

        await _async_backup_import_data(hass, call, _find_loaded_config_entry)

    async def async_set_legal_option(call: ServiceCall) -> None:
        """Gestionează asincron operațiunea pentru set legal option."""

        entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        vehicle_store = entry.runtime_data.vehicle_store

        legal_type = str(call.data["legal_type"]).strip()
        vehicle_reference = str(call.data[CONF_VEHICLE_ID]).strip()
        ignored = bool(call.data[LEGAL_OPTION_IGNORED])

        stored_vehicles = await vehicle_store.async_get_vehicles()
        option_vehicles = entry.options.get(
            CONF_VEHICLES,
            entry.data.get(CONF_VEHICLES, []),
        )
        vehicles = merge_vehicle_sources(list(option_vehicles), stored_vehicles)

        found_vehicle = _find_vehicle_by_reference(vehicles, vehicle_reference)
        if found_vehicle is None:
            raise HomeAssistantError(
                f"Nu am găsit autovehiculul '{vehicle_reference}' pentru actualizarea opțiunii."
            )

        set_legal_ignored(found_vehicle, legal_type, ignored)

        normalized_vehicles, _ = normalize_vehicles(vehicles)
        active_vehicles = _active_vehicles(normalized_vehicles)
        await vehicle_store.async_save_vehicles(normalized_vehicles)
        entry.runtime_data.vehicles = active_vehicles
        entry.runtime_data.all_vehicles = normalized_vehicles
        dispatcher_send(hass, SIGNAL_VEHICLES_UPDATED, active_vehicles)

        await hass.config_entries.async_reload(entry.entry_id)

    async def async_cleanup_orphan_entities(call: ServiceCall) -> None:
        """Gestionează asincron operațiunea pentru curățare orfane entități."""

        target_entry = _find_loaded_config_entry(hass, call.data.get("entry_id"))
        dry_run = bool(call.data.get("dry_run", False))
        cleaned = await _async_cleanup_orphan_entities(hass, target_entry, dry_run=dry_run)

        try:
            from homeassistant.components import persistent_notification

            if cleaned:
                sample = "\n".join(f"- `{item['entity_id']}`" for item in cleaned[:20])
                extra = "" if len(cleaned) <= 20 else f"\n... încă {len(cleaned) - 20} entități."
                persistent_notification.async_create(
                    hass,
                    f"Entități {'găsite' if dry_run else 'curățate'}: {len(cleaned)}\n\n{sample}{extra}",
                    title="Car Manager România - curățare entități orfane",
                    notification_id="car_manager_romania_cleanup_orphan_entities",
                )
            else:
                persistent_notification.async_create(
                    hass,
                    "Nu am găsit entități orfane pentru Car Manager România.",
                    title="Car Manager România - curățare entități orfane",
                    notification_id="car_manager_romania_cleanup_orphan_entities",
                )
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Nu am putut crea notificarea pentru curățarea entităților: %s", err)

        if cleaned and not dry_run:
            await hass.config_entries.async_reload(target_entry.entry_id)


    if not hass.services.has_service(DOMAIN, SERVICE_REFRESH_LICENSE_STATUS):
        hass.services.async_register(
            DOMAIN,
            SERVICE_REFRESH_LICENSE_STATUS,
            async_refresh_license_status,
            schema=REFRESH_LICENSE_STATUS_SCHEMA,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_SET_NOTIFICATION_OPTIONS):
        hass.services.async_register(
            DOMAIN,
            SERVICE_SET_NOTIFICATION_OPTIONS,
            async_set_notification_options,
            schema=SET_NOTIFICATION_OPTIONS_SCHEMA,
        )

    # Înregistrăm serviciul de salvare cont separat de serviciile cu răspuns.
    # În varianta anterioară, constantele pentru import ajunseseră accidental
    # ca argumente în același apel async_register, ceea ce bloca încărcarea integrării.
    if not hass.services.has_service(DOMAIN, SERVICE_SET_ROVINIETA_ACCOUNT):
        hass.services.async_register(
            DOMAIN,
            SERVICE_SET_ROVINIETA_ACCOUNT,
            async_set_rovinieta_account,
            schema=SET_ROVINIETA_ACCOUNT_SCHEMA,
        )

    service_response_kwargs: dict[str, Any] = {}
    if SupportsResponse is not None:
        service_response_kwargs["supports_response"] = SupportsResponse.ONLY

    if not hass.services.has_service(DOMAIN, SERVICE_GET_ROVINIETA_ACCOUNT):
        hass.services.async_register(
            DOMAIN,
            SERVICE_GET_ROVINIETA_ACCOUNT,
            async_get_rovinieta_account,
            schema=GET_ROVINIETA_ACCOUNT_SCHEMA,
            **service_response_kwargs,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_SCAN_ROVINIETA_IMPORT_VEHICLES):
        hass.services.async_register(
            DOMAIN,
            SERVICE_SCAN_ROVINIETA_IMPORT_VEHICLES,
            async_scan_rovinieta_import_vehicles,
            schema=SCAN_ROVINIETA_IMPORT_VEHICLES_SCHEMA,
            **service_response_kwargs,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_IMPORT_ROVINIETA_VEHICLE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_IMPORT_ROVINIETA_VEHICLE,
            async_import_rovinieta_vehicle,
            schema=IMPORT_ROVINIETA_VEHICLE_SCHEMA,
            **service_response_kwargs,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_REFRESH_ROVINIETA_NOW):
        hass.services.async_register(
            DOMAIN,
            SERVICE_REFRESH_ROVINIETA_NOW,
            async_refresh_rovinieta_now,
            schema=REFRESH_ROVINIETA_NOW_SCHEMA,
            **service_response_kwargs,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_ADD_VEHICLE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_ADD_VEHICLE,
            async_add_vehicle,
            schema=ADD_VEHICLE_SERVICE_SCHEMA,
        )
    if not hass.services.has_service(DOMAIN, SERVICE_EDIT_VEHICLE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_EDIT_VEHICLE,
            async_edit_vehicle,
            schema=EDIT_VEHICLE_SERVICE_SCHEMA,
        )
    if not hass.services.has_service(DOMAIN, SERVICE_REMOVE_VEHICLE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_REMOVE_VEHICLE,
            async_remove_vehicle,
            schema=REMOVE_VEHICLE_SERVICE_SCHEMA,
        )
    if not hass.services.has_service(DOMAIN, SERVICE_RESTORE_VEHICLE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_RESTORE_VEHICLE,
            async_restore_vehicle,
            schema=RESTORE_VEHICLE_SERVICE_SCHEMA,
        )
    if not hass.services.has_service(DOMAIN, SERVICE_RESTORE_ALL_VEHICLES):
        hass.services.async_register(
            DOMAIN,
            SERVICE_RESTORE_ALL_VEHICLES,
            async_restore_all_vehicles,
            schema=RESTORE_ALL_VEHICLES_SERVICE_SCHEMA,
        )
    if not hass.services.has_service(DOMAIN, SERVICE_EXPORT_DATA):
        hass.services.async_register(
            DOMAIN,
            SERVICE_EXPORT_DATA,
            async_export_data,
            schema=EXPORT_DATA_SERVICE_SCHEMA,
        )
    if not hass.services.has_service(DOMAIN, SERVICE_VALIDATE_BACKUP):
        hass.services.async_register(
            DOMAIN,
            SERVICE_VALIDATE_BACKUP,
            async_validate_backup,
            schema=VALIDATE_BACKUP_SERVICE_SCHEMA,
        )
    if not hass.services.has_service(DOMAIN, SERVICE_IMPORT_DATA):
        hass.services.async_register(
            DOMAIN,
            SERVICE_IMPORT_DATA,
            async_import_data,
            schema=IMPORT_DATA_SERVICE_SCHEMA,
        )
    if not hass.services.has_service(DOMAIN, SERVICE_SET_LEGAL_OPTION):
        hass.services.async_register(
            DOMAIN,
            SERVICE_SET_LEGAL_OPTION,
            async_set_legal_option,
            schema=SET_LEGAL_OPTION_SERVICE_SCHEMA,
        )
    if not hass.services.has_service(DOMAIN, SERVICE_CLEANUP_ORPHAN_ENTITIES):
        hass.services.async_register(
            DOMAIN,
            SERVICE_CLEANUP_ORPHAN_ENTITIES,
            async_cleanup_orphan_entities,
            schema=CLEANUP_ORPHAN_ENTITIES_SERVICE_SCHEMA,
        )

    await async_register_fuel_services(
        hass,
        _find_loaded_config_entry,
        _find_vehicle_by_reference,
        _vehicle_internal_id,
        _active_vehicles,
    )

    await async_register_history_services(
        hass,
        _find_loaded_config_entry,
        _find_vehicle_by_reference,
        _vehicle_internal_id,
        _active_vehicles,
    )
    await async_register_tire_services(
        hass,
        _find_loaded_config_entry,
        _find_vehicle_by_reference,
        _vehicle_internal_id,
    )

    await async_register_equipment_services(
        hass,
        _find_loaded_config_entry,
        _find_vehicle_by_reference,
        _vehicle_internal_id,
    )

    await async_register_battery_services(
        hass,
        _find_loaded_config_entry,
        _find_vehicle_by_reference,
        _vehicle_internal_id,
    )
    hass.data[DOMAIN]["services_registered"] = True


async def _async_revalidate_license_non_blocking(
    hass: HomeAssistant,
    entry: CarManagerConfigEntry,
) -> None:
    """Funcție internă pentru revalidare licență non blocking."""

    await asyncio.sleep(15)

    try:
        from .license import (
            async_obtine_context_licenta,
            async_salveaza_licenta_globala,
            async_valideaza_licenta,
        )

        username, license_key, _storage = await async_obtine_context_licenta(hass, intrare=entry)
        license_key = str(license_key or "").strip() or "TRIAL"
        result = await async_valideaza_licenta(hass, license_key, username)

        # Dacă serverul de licențiere nu poate fi contactat, nu suprascriem ultimul
        # status local cunoscut. Un răspuns clar revoked/expired/invalid se salvează.
        if result.connection_error:
            _LOGGER.warning(
                "Car Manager România: revalidarea licenței după pornire nu a reușit: %s",
                result.message or result.status,
            )
            return

        await async_salveaza_licenta_globala(hass, license_key, username, result)
        dispatcher_send(hass, SIGNAL_LICENSE_UPDATED)
    except asyncio.CancelledError:
        raise
    except Exception as err:  # noqa: BLE001 - startup helper must never block HA
        _LOGGER.warning(
            "Car Manager România: revalidarea licenței după pornire a eșuat: %s",
            err,
        )

async def async_setup_entry(
    hass: HomeAssistant,
    entry: CarManagerConfigEntry,
) -> bool:
    """Configurează componentele integrației în Home Assistant."""

    vehicle_store = CarManagerVehicleStore(hass)
    service_history_store = CarManagerServiceHistoryStore(hass)
    fuel_receipt_store = CarManagerFuelReceiptStore(hass)
    tire_set_store = CarManagerTireSetStore(hass)
    equipment_item_store = CarManagerEquipmentItemStore(hass)
    battery_store = CarManagerBatteryStore(hass)
    await service_history_store.async_load()
    await fuel_receipt_store.async_load()
    await tire_set_store.async_load()
    await equipment_item_store.async_load()
    await battery_store.async_load()
    stored_vehicles = await vehicle_store.async_get_vehicles()

    option_vehicles = entry.options.get(
        CONF_VEHICLES,
        entry.data.get(CONF_VEHICLES, []),
    )
    vehicles = merge_vehicle_sources(list(option_vehicles), stored_vehicles)
    normalized_vehicles, changed = normalize_vehicles(list(vehicles))
    active_vehicles = _active_vehicles(normalized_vehicles)

    if changed or normalized_vehicles != stored_vehicles:
        await vehicle_store.async_save_vehicles(normalized_vehicles)

    rovinieta_coordinator = await _async_setup_rovinieta_coordinator(hass, entry)

    entry.runtime_data = CarManagerRuntimeData(
        integration_version=VERSION,
        vehicles=active_vehicles,
        all_vehicles=normalized_vehicles,
        vehicle_store=vehicle_store,
        service_history_store=service_history_store,
        fuel_receipt_store=fuel_receipt_store,
        tire_set_store=tire_set_store,
        equipment_item_store=equipment_item_store,
        battery_store=battery_store,
        rovinieta_coordinator=rovinieta_coordinator,
    )

    def _register_unload_callback(callback: Any) -> None:
        """Înregistrează curățarea la unload fără să returneze valori booleene către Home Assistant."""

        if not callable(callback):
            return

        def _safe_unload_callback() -> None:
            callback()

        entry.async_on_unload(_safe_unload_callback)

    if rovinieta_coordinator is not None:
        await _async_sync_rovinieta_manual_terms(hass, entry, dispatch_updates=False)

        def _schedule_rovinieta_manual_sync() -> None:
            hass.async_create_task(_async_sync_rovinieta_manual_terms(hass, entry))

        remove_rovinieta_manual_sync = rovinieta_coordinator.async_add_listener(
            _schedule_rovinieta_manual_sync
        )
        _register_unload_callback(remove_rovinieta_manual_sync)

    # Înregistrăm listener-ul pentru actualizarea opțiunilor într-un mod compatibil
    # cu versiunile Home Assistant în care callback-urile pot întoarce valori
    # booleene. Wrapper-ul de mai sus aruncă rezultatul și păstrează unload-ul sigur.
    remove_update_listener = entry.add_update_listener(async_update_options)
    _register_unload_callback(remove_update_listener)

    await _async_register_services(hass)
    await _async_register_frontend(hass)
    _async_register_dashboard_panel(hass)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    cleaned_entities = await _async_cleanup_orphan_entities(hass, entry, dry_run=False)
    if cleaned_entities:
        _LOGGER.info(
            "Car Manager România: am curățat automat %s entități orfane după încărcarea platformelor.",
            len(cleaned_entities),
        )

    from .notify import async_check_maintenance_notifications

    await async_check_maintenance_notifications(hass, entry)

    def _schedule_notification_check(*_: Any) -> None:
        """Funcție internă pentru schedule notificare verificare."""

        hass.async_create_task(async_check_maintenance_notifications(hass, entry))

    remove_notification_interval = async_track_time_interval(
        hass,
        _schedule_notification_check,
        timedelta(hours=6),
    )
    _register_unload_callback(remove_notification_interval)

    if rovinieta_coordinator is not None:
        remove_rovinieta_notification_listener = rovinieta_coordinator.async_add_listener(
            _schedule_notification_check
        )
        _register_unload_callback(remove_rovinieta_notification_listener)

    license_revalidation_task = hass.async_create_task(
        _async_revalidate_license_non_blocking(hass, entry)
    )
    _register_unload_callback(license_revalidation_task.cancel)

    return True




def _rovinieta_plate_key(value: Any) -> str:
    """Funcție internă pentru rovinietă număr de înmatriculare cheie."""

    return "".join(ch for ch in str(value or "").upper() if ch.isalnum())


def _rovinieta_date_value(value: Any) -> str | None:
    """Funcție internă pentru rovinietă dată valoare."""

    if value is None:
        return None

    if hasattr(value, "astimezone"):
        return value.astimezone().date().isoformat()

    if hasattr(value, "isoformat"):
        return value.isoformat()

    return None


def _active_rovinieta_start_date(rovinieta_vehicle: Any) -> str | None:
    """Funcție internă pentru active rovinietă început dată."""

    active_vignette = getattr(rovinieta_vehicle, "active_vignette", None)
    if not isinstance(active_vignette, dict):
        return None

    for key in ("date_start_availability", "oProdTransactionStartDate"):
        raw_value = active_vignette.get(key)
        if not raw_value:
            continue

        if isinstance(raw_value, str):
            candidate = raw_value.strip()
            if len(candidate) >= 10:
                return candidate[:10]

    return None


def _active_rovinieta_price(rovinieta_vehicle: Any) -> float | None:
    """Funcție internă pentru active rovinietă preț."""

    active_vignette = getattr(rovinieta_vehicle, "active_vignette", None)
    if not isinstance(active_vignette, dict):
        return None

    raw_value = active_vignette.get("oProdPrice")
    if raw_value in (None, ""):
        return None

    try:
        return round(float(str(raw_value).replace(",", ".")), 2)
    except (TypeError, ValueError):
        return None


async def _async_sync_rovinieta_manual_terms(
    hass: HomeAssistant,
    entry: CarManagerConfigEntry,
    *,
    dispatch_updates: bool = True,
) -> bool:
    """Funcție internă pentru sync rovinietă manual termene."""

    runtime_data = getattr(entry, "runtime_data", None)
    if runtime_data is None:
        return False

    coordinator = getattr(runtime_data, "rovinieta_coordinator", None)
    if coordinator is None or coordinator.data is None:
        return False

    all_vehicles = deepcopy(getattr(runtime_data, "all_vehicles", []))
    if not all_vehicles:
        return False

    rovinieta_by_plate = {
        _rovinieta_plate_key(getattr(rovinieta_vehicle, "plate_no", "")): rovinieta_vehicle
        for rovinieta_vehicle in coordinator.data.vehicles
        if _rovinieta_plate_key(getattr(rovinieta_vehicle, "plate_no", ""))
    }

    changed = False
    for vehicle in all_vehicles:
        if not isinstance(vehicle, dict):
            continue

        plate_key = _rovinieta_plate_key(vehicle.get(CONF_LICENSE_PLATE))
        rovinieta_vehicle = rovinieta_by_plate.get(plate_key)
        if rovinieta_vehicle is None:
            continue

        end_date = _rovinieta_date_value(getattr(rovinieta_vehicle, "expiry", None))
        if not end_date:
            continue

        legal_terms = vehicle.setdefault(CONF_LEGAL_TERMS, {})
        if not isinstance(legal_terms, dict):
            legal_terms = {}
            vehicle[CONF_LEGAL_TERMS] = legal_terms

        rovinieta_term = legal_terms.setdefault(LEGAL_TYPE_ROVINIETA, {})
        if not isinstance(rovinieta_term, dict):
            rovinieta_term = {}
            legal_terms[LEGAL_TYPE_ROVINIETA] = rovinieta_term

        current_source = rovinieta_term.get(LEGAL_DATA_SOURCE)
        current_end_date = rovinieta_term.get(LEGAL_END_DATE)
        may_update_from_auto = current_source in (
            None,
            "",
            LEGAL_SOURCE_EROVINIETA,
            LEGAL_SOURCE_CNAIR_EROVINIETA,
        )
        if not may_update_from_auto:
            continue

        start_date = _active_rovinieta_start_date(rovinieta_vehicle)
        price = _active_rovinieta_price(rovinieta_vehicle)

        source = getattr(rovinieta_vehicle, "source", None) or LEGAL_SOURCE_EROVINIETA
        updates: dict[str, Any] = {
            LEGAL_END_DATE: end_date,
            LEGAL_DATA_SOURCE: source,
        }
        if start_date:
            updates[LEGAL_START_DATE] = start_date
        if price is not None:
            updates[COST_AMOUNT] = price

        for key, value in updates.items():
            if rovinieta_term.get(key) != value:
                rovinieta_term[key] = value
                changed = True

    if not changed:
        return False

    active_vehicles = _active_vehicles(all_vehicles)
    runtime_data.all_vehicles = all_vehicles
    runtime_data.vehicles = active_vehicles
    await runtime_data.vehicle_store.async_save_vehicles(all_vehicles)

    if dispatch_updates:
        dispatcher_send(hass, SIGNAL_VEHICLES_UPDATED, active_vehicles)

    return True

async def _async_setup_rovinieta_coordinator(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> CarManagerRovinietaCoordinator | None:
    """Funcție internă pentru configurare rovinietă coordonator."""

    options = await _async_rovinieta_account_options(hass, entry)
    username = (options.get(CONF_ROVINIETA_USERNAME) or "").strip()
    password = options.get(CONF_ROVINIETA_PASSWORD) or ""
    provider = str(options.get(CONF_ROVINIETA_PROVIDER) or ROVINIETA_PROVIDER_CNAIR).strip()

    if not username or not password:
        return None

    scan_interval_seconds = options.get(
        CONF_ROVINIETA_SCAN_INTERVAL,
        DEFAULT_ROVINIETA_SCAN_INTERVAL,
    )
    try:
        scan_interval_seconds = int(scan_interval_seconds)
    except (TypeError, ValueError):
        scan_interval_seconds = DEFAULT_ROVINIETA_SCAN_INTERVAL

    scan_interval_seconds = max(MIN_ROVINIETA_SCAN_INTERVAL, scan_interval_seconds)

    session = async_get_clientsession(hass)
    client = ERovinietaApiClient(
        session,
        username=username,
        password=password,
    )
    cnair_client = None
    if provider == ROVINIETA_PROVIDER_CNAIR:
        # Coordonatorul folosește doar portalul selectat de utilizator.
        # Clientul e-rovinieta.ro este păstrat pentru semnătura coordonatorului,
        # dar este ignorat în funcție de provider.
        cnair_client = CnairERovinietaApiClient(
            session,
            username=username,
            password=password,
        )
    coordinator = CarManagerRovinietaCoordinator(
        hass,
        client,
        scan_interval_seconds=scan_interval_seconds,
        cnair_client=cnair_client,
        config_entry=entry,
        provider=provider,
    )

    try:
        await coordinator.async_config_entry_first_refresh()
    except Exception as err:  # noqa: BLE001
        # Integrarea trebuie să rămână funcțională și cu introducere manuală
        # chiar dacă portalurile de rovinietă nu pot fi citite la pornire.
        _LOGGER.debug("Coordonatorul rovinietei nu a putut face prima actualizare: %s", err)
    return coordinator


async def async_update_options(
    hass: HomeAssistant,
    entry: CarManagerConfigEntry,
) -> None:
    """Gestionează asincron operațiunea pentru actualizare opțiuni."""

    vehicle_store = entry.runtime_data.vehicle_store
    stored_vehicles = await vehicle_store.async_get_vehicles()
    option_vehicles = entry.options.get(
        CONF_VEHICLES,
        entry.data.get(CONF_VEHICLES, []),
    )
    merged_vehicles = merge_vehicle_sources(list(option_vehicles), stored_vehicles)
    normalized_vehicles, changed = normalize_vehicles(list(merged_vehicles))
    active_vehicles = _active_vehicles(normalized_vehicles)

    if changed or normalized_vehicles != stored_vehicles:
        await vehicle_store.async_save_vehicles(normalized_vehicles)

    entry.runtime_data.vehicles = active_vehicles
    entry.runtime_data.all_vehicles = normalized_vehicles

    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(
    hass: HomeAssistant,
    entry: CarManagerConfigEntry,
) -> bool:
    """Descarcă integrarea din Home Assistant."""

    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
