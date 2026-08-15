#!/usr/bin/env python3
"""
Selbsttest: stimmen die Zugangsdaten und antwortet Shopify?

    cd /home/futurespin/einstellungen && .venv/bin/python selftest.py

Rein lesend - es wird nichts geaendert. Liest die .env selbst ein, damit der
Test auch ausserhalb von systemd laeuft.
"""

import os
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent


def lade_env():
    pfad = BASE / ".env"
    if not pfad.exists():
        print(f"FEHLT: {pfad}")
        sys.exit(1)
    for zeile in pfad.read_text(encoding="utf-8").splitlines():
        zeile = zeile.strip()
        if not zeile or zeile.startswith("#") or "=" not in zeile:
            continue
        schluessel, wert = zeile.split("=", 1)
        os.environ.setdefault(schluessel.strip(), wert.strip())


def main():
    lade_env()
    sys.path.insert(0, str(BASE))

    fehlend = [
        name
        for name in ("SHOPIFY_STORE_DOMAIN", "EINSTELLUNGEN_PASSWORT", "FLASK_SECRET_KEY")
        if not os.environ.get(name)
    ]
    if not os.environ.get("SHOPIFY_ACCESS_TOKEN") and not (
        os.environ.get("SHOPIFY_API_KEY") and os.environ.get("SHOPIFY_API_SECRET")
    ):
        fehlend.append("SHOPIFY_API_KEY/SHOPIFY_API_SECRET (oder SHOPIFY_ACCESS_TOKEN)")
    if fehlend:
        print("Leer in der .env:")
        for name in fehlend:
            print("  -", name)
        sys.exit(1)
    print("[1/3] .env vollstaendig")

    import rabatte
    from shopify_api import ShopifyError, gql

    try:
        shop = gql("{ shop { name myshopifyDomain } }")["shop"]
        print(f"[2/3] Shopify erreichbar: {shop['name']} ({shop['myshopifyDomain']})")
    except ShopifyError as exc:
        print(f"[2/3] FEHLER beim Shopify-Zugriff: {exc}")
        print("      Pruefen: Client-ID/Secret der App 'VIP Belaege Discount',")
        print("      und ob die App auf diesem Store installiert ist.")
        sys.exit(2)

    try:
        gefunden = rabatte.list_discounts()
    except ShopifyError as exc:
        print(f"[3/3] FEHLER beim Lesen der Rabatte: {exc}")
        print("      Fehlt dem Token der Bereich read_discounts?")
        sys.exit(3)

    print(f"[3/3] {len(gefunden)} Rabatt(e) mit Konfiguration gefunden:")
    for d in gefunden:
        staffeln = d["config"].get("tiers") or []
        text = (
            ", ".join(f"ab {t['quantity']} Stk. {t['percentage']:g}%" for t in staffeln)
            or "keine (nur VIP)"
        )
        print(f"      - {d['title']} [{d['status']}]: {text}")

    print("\nAlles in Ordnung.")


if __name__ == "__main__":
    main()
