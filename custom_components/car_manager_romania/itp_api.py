"""Client simplu pentru verificarea ITP prin RAR AutoPass."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import re
from typing import Any

from aiohttp import ClientError, ClientSession


ITP_AUTOPASS_ENDPOINT = "https://rar-autopass.ro/wp-json/verify/v1/itp"


@dataclass(slots=True)
class ItpAutopassResult:
    """Rezultat normalizat pentru verificarea ITP online."""

    ok: bool
    vin: str
    expires_at: str | None = None
    raw_text: str = ""
    message: str = ""


_MONTHS_RO = {
    "ian": 1,
    "ianuarie": 1,
    "feb": 2,
    "februarie": 2,
    "mar": 3,
    "martie": 3,
    "apr": 4,
    "aprilie": 4,
    "mai": 5,
    "iun": 6,
    "iunie": 6,
    "iul": 7,
    "iulie": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "septembrie": 9,
    "oct": 10,
    "octombrie": 10,
    "noi": 11,
    "nov": 11,
    "noiembrie": 11,
    "dec": 12,
    "decembrie": 12,
}


def _normalizare_luna(value: str) -> int | None:
    """Normalizează luna românească primită în textul rezultatului."""

    key = re.sub(r"[^a-zăâîșţț]", "", str(value or "").lower())
    key = key.replace("ş", "ș").replace("ţ", "ț")
    return _MONTHS_RO.get(key)


def parse_itp_expiry_from_text(text: str) -> str | None:
    """Extrage data expirării ITP din textul returnat de RAR AutoPass."""

    if not text:
        return None

    patterns = [
        r"I\.T\.P\.\s+valabil[ăa]\s+p[âa]n[ăa]\s+la\s+(\d{1,2})[-\s.]([A-Za-zăâîșşţț]+)[-\s.](\d{4})",
        r"ITP\s+valabil[ăa]\s+p[âa]n[ăa]\s+la\s+(\d{1,2})[-\s.]([A-Za-zăâîșşţț]+)[-\s.](\d{4})",
        r"valabil[ăa]\s+p[âa]n[ăa]\s+la\s+(\d{1,2})[-\s.]([A-Za-zăâîșşţț]+)[-\s.](\d{4})",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.UNICODE)
        if not match:
            continue
        day = int(match.group(1))
        month = _normalizare_luna(match.group(2))
        year = int(match.group(3))
        if not month:
            continue
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            return None

    return None


class ItpAutopassClient:
    """Client HTTP pentru endpoint-ul public de verificare ITP."""

    def __init__(self, session: ClientSession) -> None:
        self._session = session

    async def async_check_itp(self, vin: str) -> ItpAutopassResult:
        """Verifică online valabilitatea ITP pentru VIN-ul primit."""

        normalized_vin = str(vin or "").strip().upper()
        if not normalized_vin:
            return ItpAutopassResult(ok=False, vin="", message="VIN-ul lipsește.")

        try:
            async with self._session.get(
                ITP_AUTOPASS_ENDPOINT,
                params={"vin": normalized_vin},
                timeout=30,
                headers={
                    "Accept": "application/json, text/plain, */*",
                    "User-Agent": "CarManagerRomania/1.0 HomeAssistant",
                },
            ) as response:
                if response.status != 200:
                    return ItpAutopassResult(
                        ok=False,
                        vin=normalized_vin,
                        message=f"Serviciul RAR AutoPass a răspuns cu status HTTP {response.status}.",
                    )
                payload: Any = await response.json(content_type=None)
        except (ClientError, TimeoutError) as err:
            return ItpAutopassResult(
                ok=False,
                vin=normalized_vin,
                message=f"Nu am putut contacta RAR AutoPass: {err}",
            )
        except Exception as err:  # noqa: BLE001
            return ItpAutopassResult(
                ok=False,
                vin=normalized_vin,
                message=f"Răspuns invalid de la RAR AutoPass: {err}",
            )

        if not isinstance(payload, dict):
            return ItpAutopassResult(ok=False, vin=normalized_vin, message="Răspuns invalid de la RAR AutoPass.")

        raw_text = str(payload.get("text") or "")
        expires_at = parse_itp_expiry_from_text(raw_text)
        ok = bool(payload.get("ok")) and bool(expires_at)
        message = "ITP verificat online." if ok else raw_text or "Nu am găsit o dată ITP validă în răspuns."
        return ItpAutopassResult(
            ok=ok,
            vin=normalized_vin,
            expires_at=expires_at,
            raw_text=raw_text,
            message=message,
        )
