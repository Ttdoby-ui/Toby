"""
Shopify-Admin-API-Zugriff fuer die Einstellungs-Oberflaeche.

TOKEN
Wir holen den Store-Admin-Token per Client-Credentials-Grant am OAuth-Endpunkt
DES STORES - nicht an api.shopify.com. Das ist derselbe Weg, den
vip-discount-function/scripts/create-kollektionsrabatt.mjs benutzt und der dort
nachweislich funktioniert. Vorteil gegenueber einem statischen Token: die
Zugangsdaten gehoeren der App "VIP Belaege Discount", damit sind spaeter auch
Mutationen moeglich, die NUR die besitzende App ausfuehren darf
(discountAutomaticAppUpdate: aktivieren/pausieren, combinesWith).

Alternativ laesst sich ueber SHOPIFY_ACCESS_TOKEN ein fertiger Admin-Token
setzen; dann reicht es fuer das Config-Metafeld, nicht aber fuer die
App-eigenen Mutationen.

502-WIEDERHOLUNG
Shopify antwortet bei laengeren Abfragen gelegentlich mit 502. Ein einzelner
Aussetzer darf den Lauf nicht zerlegen - deshalb vier Anlaeufe mit wachsender
Pause, analog zu _gql(...) in einkauf.py auf dem Server.
"""

import json
import os
import threading
import time
import urllib.error
import urllib.request

API_VERSION = "2025-01"
_TOKEN_LOCK = threading.Lock()
_token_cache = {"value": None, "expires_at": 0.0}


class ShopifyError(RuntimeError):
    pass


def _shop_domain() -> str:
    domain = (os.environ.get("SHOPIFY_STORE_DOMAIN") or "").strip()
    if not domain:
        raise ShopifyError("SHOPIFY_STORE_DOMAIN fehlt in der .env")
    return domain


def _post_json(url: str, payload: dict, headers: dict, timeout: int = 30) -> tuple[int, str]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    for key, value in {"Content-Type": "application/json", **headers}.items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")


def access_token() -> str:
    """Admin-Token, gecacht bis kurz vor Ablauf (Shopify: 24 h)."""
    static = (os.environ.get("SHOPIFY_ACCESS_TOKEN") or "").strip()
    if static:
        return static

    with _TOKEN_LOCK:
        if _token_cache["value"] and time.time() < _token_cache["expires_at"]:
            return _token_cache["value"]

        client_id = (os.environ.get("SHOPIFY_API_KEY") or "").strip()
        client_secret = (os.environ.get("SHOPIFY_API_SECRET") or "").strip()
        if not client_id or not client_secret:
            raise ShopifyError(
                "Weder SHOPIFY_ACCESS_TOKEN noch SHOPIFY_API_KEY/SHOPIFY_API_SECRET gesetzt."
            )

        status, text = _post_json(
            f"https://{_shop_domain()}/admin/oauth/access_token",
            {
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "client_credentials",
            },
            {},
        )
        if status != 200:
            raise ShopifyError(f"Token-Abruf fehlgeschlagen (HTTP {status}): {text[:300]}")
        data = json.loads(text)
        token = data.get("access_token")
        if not token:
            raise ShopifyError(f"Antwort ohne access_token: {text[:300]}")

        # Etwas Puffer, damit wir nie mit einem gerade abgelaufenen Token arbeiten.
        ttl = int(data.get("expires_in") or 86400)
        _token_cache["value"] = token
        _token_cache["expires_at"] = time.time() + max(60, ttl - 300)
        return token


def gql(query: str, variables: dict | None = None, attempts: int = 4) -> dict:
    """GraphQL-Aufruf mit Wiederholung bei 502/503/429."""
    url = f"https://{_shop_domain()}/admin/api/{API_VERSION}/graphql.json"
    payload = {"query": query, "variables": variables or {}}
    last = ""

    for attempt in range(1, attempts + 1):
        status, text = _post_json(url, payload, {"X-Shopify-Access-Token": access_token()})
        if status in (429, 502, 503, 504) and attempt < attempts:
            time.sleep(1.5 * attempt)
            last = f"HTTP {status}: {text[:200]}"
            continue
        if status != 200:
            raise ShopifyError(f"HTTP {status}: {text[:400]}")

        data = json.loads(text)
        if data.get("errors"):
            message = json.dumps(data["errors"], ensure_ascii=False)
            # THROTTLED ist wiederholbar, alles andere nicht.
            if "THROTTLED" in message and attempt < attempts:
                time.sleep(1.5 * attempt)
                last = message[:200]
                continue
            raise ShopifyError(f"GraphQL-Fehler: {message[:400]}")
        return data["data"]

    raise ShopifyError(f"Nach {attempts} Versuchen aufgegeben. Zuletzt: {last}")
