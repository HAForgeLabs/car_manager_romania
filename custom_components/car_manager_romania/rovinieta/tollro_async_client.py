"""Client asincron TollRo/OIDC PKCE pentru Home Assistant (fără configurare HA).

Este utilizat atunci când furnizorul TollRo este configurat. Sesiunea HTTPS este
proprie (cookie-uri SSO în memorie) și trebuie închisă cu `async_close`.
Doar operațiuni de citire; toate redirecționările sunt controlate.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
from html.parser import HTMLParser
import json
import secrets
import time
from typing import Any
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

from aiohttp import ClientError, ClientResponseError, ClientSession, ClientTimeout, CookieJar

SSO_ORIGIN = "https://sso.etoll.ro"
PORTAL_ORIGIN = "https://portal.etoll.ro"
AUTH_ENDPOINT = SSO_ORIGIN + "/auth/realms/external/protocol/openid-connect/auth"
TOKEN_ENDPOINT = SSO_ORIGIN + "/auth/realms/external/protocol/openid-connect/token"
USERINFO_ENDPOINT = SSO_ORIGIN + "/auth/realms/external/protocol/openid-connect/userinfo"
REDIRECT_URI = PORTAL_ORIGIN + "/portal-extern/authentication/login-callback"
CLIENT_ID = "ddcm-authz-client"
ALLOWED_HOSTS = frozenset({"sso.etoll.ro", "portal.etoll.ro"})
USER_AGENT = "Mozilla/5.0 (compatible; CarManagerRomania-TollRoTest/1.0)"
MAX_RESPONSE_BYTES = 1_000_000
MAX_REDIRECTS = 12


class TollRoError(Exception):
    """Eroare curată, fără tokenuri sau URL-uri care conțin codul OIDC."""


class TollRoAuthError(TollRoError):
    """Sesiunea este invalidă ori portalul solicită autentificare nouă."""


class TollRoHTTPError(TollRoError):
    """Cod de răspuns HTTP disponibil pentru tratarea unui 401."""

    def __init__(self, status: int, stage: str):
        self.status = status
        super().__init__(f"HTTP {status} la {stage}")


class _LoginFormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.forms: list[dict[str, Any]] = []
        self.current: dict[str, Any] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if tag == "form":
            self.current = {
                "id": data.get("id", ""),
                "method": str(data.get("method") or "get").lower(),
                "action": data.get("action") or "",
                "inputs": {},
            }
            self.forms.append(self.current)
        elif tag == "input" and self.current is not None:
            name = data.get("name")
            if name and str(data.get("type") or "text").lower() == "hidden":
                self.current["inputs"][name] = data.get("value") or ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "form":
            self.current = None


def _login_form(html: str, base_url: str) -> tuple[str, dict[str, str]]:
    parser = _LoginFormParser()
    parser.feed(html)
    forms = [f for f in parser.forms if f["id"] == "kc-form-login" and f["method"] == "post"]
    if len(forms) != 1:
        raise TollRoAuthError(
            "Formularul standard SSO lipsește; verifică dacă portalul cere CAPTCHA sau autentificare suplimentară."
        )
    form = forms[0]
    url = urljoin(base_url, form["action"])
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "sso.etoll.ro" or not parsed.path.startswith(
        "/auth/realms/external/login-actions/authenticate"
    ):
        raise TollRoAuthError("Adresa formularului SSO nu este cea așteptată.")
    return url, form["inputs"]


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).decode("ascii").rstrip("=")
    return verifier, challenge


def _check_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS or parsed.username or parsed.password:
        raise TollRoError("Conexiune blocată: adresă HTTPS nepermisă.")
    try:
        port = parsed.port
    except ValueError:
        raise TollRoError("Conexiune blocată: port HTTPS invalid.") from None
    if port not in (None, 443):
        raise TollRoError("Conexiune blocată: port HTTPS neașteptat.")


class AsyncTollRoClient:
    """Client asincron, fără persistența parolei/tokenurilor.

    O instanță este destinată unui singur cont. Evităm bucle de refresh;
    un 401 conduce la o singură reîncercare prin refresh_token.
    """

    def __init__(self) -> None:
        self._session: ClientSession | None = None
        self._access_token: str | None = None
        self._refresh_token: str | None = None
        self._expiry_monotonic: float | None = None
        self._auth_lock = asyncio.Lock()

    async def _session_ready(self) -> ClientSession:
        if self._session is None or self._session.closed:
            self._session = ClientSession(
                cookie_jar=CookieJar(),
                timeout=ClientTimeout(total=25),
                trust_env=False,
            )
        return self._session

    async def async_close(self) -> None:
        self._access_token = None
        self._refresh_token = None
        self._expiry_monotonic = None
        if self._session is not None:
            await self._session.close()
            self._session = None

    async def _request(
        self,
        url: str,
        *,
        method: str = "GET",
        form: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        stage: str,
    ) -> tuple[bytes, str, str]:
        """Urmărește cel mult 12 redirecționări, fără a accesa callback-ul OIDC."""
        session = await self._session_ready()
        request_headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
            "Cache-Control": "no-store",
        }
        if headers:
            request_headers.update(headers)

        current_url = url
        current_method = method
        current_form = form
        for _ in range(MAX_REDIRECTS + 1):
            _check_url(current_url)
            try:
                async with session.request(
                    current_method,
                    current_url,
                    data=current_form,
                    headers=request_headers,
                    allow_redirects=False,
                    ssl=True,
                ) as response:
                    status = response.status
                    if status in (301, 302, 303, 307, 308):
                        location = response.headers.get("Location")
                        if not location:
                            raise TollRoError(f"Redirecționare fără destinație la {stage}.")
                        new_url = urljoin(str(response.url), location)
                        _check_url(new_url)
                        if (
                            urlparse(new_url).hostname == "portal.etoll.ro"
                            and urlparse(new_url).path == urlparse(REDIRECT_URI).path
                        ):
                            return b"", new_url, "callback-oidc"
                        # Niciodată nu transferăm Bearer token între domenii.
                        if urlparse(new_url).hostname != urlparse(current_url).hostname:
                            request_headers.pop("Authorization", None)
                        if status in (301, 302, 303) and current_method == "POST":
                            current_method = "GET"
                            current_form = None
                        current_url = new_url
                        continue
                    if status >= 400:
                        raise TollRoHTTPError(status, stage)
                    body = await response.content.read(MAX_RESPONSE_BYTES + 1)
                    if len(body) > MAX_RESPONSE_BYTES:
                        raise TollRoError(f"Răspuns prea mare în etapa {stage}.")
                    return body, str(response.url), response.headers.get("Content-Type", "")
            except TollRoError:
                raise
            except (ClientError, asyncio.TimeoutError, OSError, ValueError) as exc:
                raise TollRoError(
                    f"Eroare conexiune HTTPS în etapa {stage}; verifică rețeaua și portalul."
                ) from None
        raise TollRoError("Prea multe redirecționări OIDC.")

    @staticmethod
    def _tokens_from_json(body: bytes, stage: str) -> tuple[str, str | None, float | None]:
        try:
            data = json.loads(body)
        except (ValueError, UnicodeError):
            raise TollRoAuthError(f"Răspuns token invalid la {stage}.") from None
        if not isinstance(data, dict) or str(data.get("token_type", "")).lower() != "bearer":
            raise TollRoAuthError(f"SSO nu a furnizat token Bearer valid la {stage}.")
        access = data.get("access_token")
        refresh = data.get("refresh_token")
        if not isinstance(access, str) or not access:
            raise TollRoAuthError(f"SSO nu a furnizat access_token la {stage}.")
        if refresh is not None and (not isinstance(refresh, str) or not refresh):
            raise TollRoAuthError(f"SSO a furnizat refresh_token invalid la {stage}.")
        seconds = data.get("expires_in")
        if isinstance(seconds, bool) or not isinstance(seconds, (int, float)) or seconds <= 0:
            seconds = None
        return access, refresh, seconds

    def _set_tokens(self, access: str, refresh: str | None, expires_in: float | None) -> None:
        self._access_token = access
        self._refresh_token = refresh
        self._expiry_monotonic = time.monotonic() + expires_in if expires_in is not None else None

    async def async_login(self, username: str, password: str) -> None:
        if not username or not username.strip() or not password:
            raise TollRoAuthError("Emailul și parola sunt obligatorii.")
        async with self._auth_lock:
            verifier, challenge = _pkce()
            state = secrets.token_urlsafe(24)
            params = {
                "client_id": CLIENT_ID,
                "redirect_uri": REDIRECT_URI,
                "response_type": "code",
                "scope": "openid profile",
                "state": state,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "response_mode": "query",
            }
            body, final_url, content_type = await self._request(
                AUTH_ENDPOINT + "?" + urlencode(params),
                headers={"Accept": "text/html,application/xhtml+xml"},
                stage="încărcare SSO",
            )
            if content_type != "callback-oidc":
                if "html" not in content_type.lower():
                    raise TollRoAuthError("SSO nu a returnat formularul HTML de autentificare.")
                action, hidden = _login_form(body.decode("utf-8", "replace"), final_url)
                fields = {k: v for k, v in hidden.items() if k.lower() not in {"username", "password"}}
                fields.update({"loginMethod": "password", "username": username.strip(), "password": password})
                _, final_url, content_type = await self._request(
                    action,
                    method="POST",
                    form=fields,
                    headers={"Accept": "text/html,application/xhtml+xml", "Origin": "null"},
                    stage="autentificare SSO",
                )
                if content_type != "callback-oidc":
                    raise TollRoAuthError(
                        "Autentificarea nu a întors cod OIDC. Verifică emailul, parola și eventualele cerințe SSO."
                    )

            callback = urlparse(final_url)
            q = parse_qs(callback.query)
            if (
                callback.scheme != "https"
                or callback.hostname != "portal.etoll.ro"
                or callback.path != urlparse(REDIRECT_URI).path
                or q.get("state") != [state]
                or len(q.get("code", [])) != 1
                or "error" in q
            ):
                raise TollRoAuthError("Callback OIDC sau verificarea de securitate state este invalidă.")
            code = q["code"][0]
            token_body, _, _ = await self._request(
                TOKEN_ENDPOINT,
                method="POST",
                form={
                    "client_id": CLIENT_ID,
                    "code": code,
                    "redirect_uri": REDIRECT_URI,
                    "code_verifier": verifier,
                    "grant_type": "authorization_code",
                },
                headers={"Accept": "application/json", "Origin": PORTAL_ORIGIN, "Referer": REDIRECT_URI},
                stage="schimb PKCE token",
            )
            self._set_tokens(*self._tokens_from_json(token_body, "login"))

    async def async_refresh_session(self) -> None:
        async with self._auth_lock:
            await self._refresh_locked()

    async def _refresh_locked(self) -> None:
        if not self._refresh_token:
            self._access_token = None
            raise TollRoAuthError("Sesiune fără refresh_token; trebuie reluată autentificarea.")
        try:
            token_body, _, _ = await self._request(
                TOKEN_ENDPOINT,
                method="POST",
                form={"grant_type": "refresh_token", "client_id": CLIENT_ID, "refresh_token": self._refresh_token},
                headers={"Accept": "application/json", "Origin": PORTAL_ORIGIN, "Referer": REDIRECT_URI},
                stage="refresh token",
            )
            access, rotated_refresh, ttl = self._tokens_from_json(token_body, "refresh")
            self._set_tokens(access, rotated_refresh or self._refresh_token, ttl)
        except TollRoError:
            self._access_token = None
            self._refresh_token = None
            self._expiry_monotonic = None
            raise TollRoAuthError("Reînnoirea sesiunii a eșuat; este necesară autentificare nouă.") from None

    async def _token(self) -> str:
        async with self._auth_lock:
            if not self._access_token:
                raise TollRoAuthError("Nu există sesiune TollRo activă.")
            if self._expiry_monotonic is not None and time.monotonic() >= self._expiry_monotonic - 30:
                await self._refresh_locked()
            if not self._access_token:
                raise TollRoAuthError("Sesiunea TollRo este invalidă.")
            return self._access_token

    async def _authorized_response(self, url: str, stage: str) -> tuple[bytes, str]:
        token = await self._token()
        for attempt in range(2):
            try:
                body, final_url, content_type = await self._request(
                    url,
                    headers={"Accept": "application/json, application/jwt", "Authorization": "Bearer " + token},
                    stage=stage,
                )
                if urlparse(final_url).hostname != urlparse(url).hostname:
                    raise TollRoAuthError("Răspunsul autorizat provine din alt domeniu.")
                return body, content_type
            except TollRoHTTPError as exc:
                if exc.status != 401 or attempt == 1:
                    if exc.status == 401:
                        raise TollRoAuthError("SSO a respins tokenul după reînnoire.") from None
                    raise
                await self.async_refresh_session()
                token = await self._token()
        raise TollRoAuthError("Autentificarea TollRo a eșuat.")

    async def _authorized_json(self, url: str, stage: str) -> Any:
        body, content_type = await self._authorized_response(url, stage)
        try:
            return json.loads(body)
        except (ValueError, UnicodeError):
            raise TollRoError(f"API nu a returnat JSON valid la {stage}.") from None

    async def async_verify_identity(self) -> bool:
        # În HAR /userinfo răspunde 200 cu application/jwt, nu cu JSON.
        # Verificăm răspunsul SSO fără a exporta conținutul JWT.
        body, content_type = await self._authorized_response(USERINFO_ENDPOINT, "validare userinfo")
        if "application/jwt" in content_type.lower():
            return body.count(b".") == 2 and len(body) > 20
        if "application/json" in content_type.lower():
            try:
                payload = json.loads(body)
            except (ValueError, UnicodeError):
                return False
            return isinstance(payload, dict) and bool(payload.get("sub"))
        return False

    async def async_fetch_vehicles(self) -> list[dict[str, Any]]:
        url = PORTAL_ORIGIN + "/api/vehicles?vehicleType=CAR&computeVignetteEligibility=false&size=50"
        payload = await self._authorized_json(url, "lista vehicule")
        if not isinstance(payload, dict) or not isinstance(payload.get("vehicles"), list):
            raise TollRoError("API a returnat un format necunoscut pentru lista vehiculelor.")
        if payload.get("nextCursor"):
            raise TollRoError("Lista vehiculelor este paginată; este necesară implementarea paginării înainte de utilizare.")
        vehicles: list[dict[str, Any]] = []
        seen: set[str] = set()
        for vehicle in payload["vehicles"]:
            if not isinstance(vehicle, dict) or not isinstance(vehicle.get("id"), str) or not vehicle["id"]:
                raise TollRoError("API a returnat un vehicul cu ID invalid.")
            if vehicle["id"] not in seen:
                seen.add(vehicle["id"])
                vehicles.append(vehicle)
        return vehicles

    async def async_fetch_service(self, vehicle_id: str) -> dict[str, Any]:
        if not isinstance(vehicle_id, str) or not vehicle_id:
            raise TollRoError("ID-ul vehiculului este invalid.")
        url = PORTAL_ORIGIN + "/api/tolls/services/?" + urlencode({"vehicleId": vehicle_id})
        data = await self._authorized_json(url, "citire rovinietă")
        if not isinstance(data, dict):
            raise TollRoError("API rovinietă nu a returnat un obiect JSON.")
        return data
