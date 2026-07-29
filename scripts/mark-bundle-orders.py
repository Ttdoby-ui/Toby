#!/usr/bin/env python3
"""
Bundle-Kennzeichnung fuer Bestellungen: Order Printer's Liquid-Kontext (die
"Packzettel neu"-Vorlage in der Order-Printer-App) hat KEINEN Zugriff auf
line_item.line_item_group (das GraphQL-Feld existiert, ist aber im
Order-Printer-Liquid nicht verfuegbar - per echtem Testdruck an Bestellung
#9951 verifiziert, 2026-07-29: keine Bundle-Kopfzeile erschienen).

Deshalb: dieses Skript liest die Bundle-Zuordnung ueber die Admin-GraphQL-API
(LineItem.lineItemGroup, DORT verlaesslich befuellt) und schreibt eine klare
Bundle-Zeile in order.note - das Feld, das die "Packzettel neu"-Vorlage
bereits prominent (gelbe Box vor der Artikeltabelle) anzeigt. Kein weiterer
Liquid-Umbau noetig.

Deckt AUCH alte/bereits abgeschlossene Bestellungen ab (kein Live-Hook noetig,
einfach den Katalog aller Bestellungen scannen).

Idempotent: ueberspringt Bestellungen, deren Notiz den Marker "📦 BUNDLE-BESTELLUNG"
bereits enthaelt.

Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, DRY_RUN (Default true),
     QUERY (Default: alle Bestellungen), LIMIT.
"""
import os
import time
import requests

DOMAIN = (os.environ.get("SHOPIFY_STORE_DOMAIN") or "").strip()
TOKEN = (os.environ.get("SHOPIFY_ACCESS_TOKEN") or "").strip()
API = "2025-01"
DRY_RUN = (os.environ.get("DRY_RUN", "true").lower() != "false")
QUERY = os.environ.get("QUERY") or ""
LIMIT = int(os.environ["LIMIT"]) if os.environ.get("LIMIT") else None
MARKER = "📦 BUNDLE-BESTELLUNG"

if not DOMAIN or not TOKEN:
    raise SystemExit("SHOPIFY_STORE_DOMAIN und SHOPIFY_ACCESS_TOKEN muessen gesetzt sein.")


def gql(query, variables=None, attempt=0):
    r = requests.post(
        f"https://{DOMAIN}/admin/api/{API}/graphql.json",
        headers={"Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN},
        json={"query": query, "variables": variables or {}}, timeout=60)
    if r.status_code == 429 and attempt < 6:
        time.sleep(2 * (attempt + 1)); return gql(query, variables, attempt + 1)
    r.raise_for_status()
    d = r.json()
    if d.get("errors"):
        if "THROTTLED" in str(d["errors"]).upper() and attempt < 6:
            time.sleep(2 * (attempt + 1)); return gql(query, variables, attempt + 1)
        raise RuntimeError(str(d["errors"]))
    return d["data"]


def fetch_orders():
    out, cursor = [], None
    while True:
        d = gql("""
          query($q: String, $after: String) {
            orders(first: 50, query: $q, after: $after, sortKey: CREATED_AT) {
              nodes {
                id name note
                lineItems(first: 100) {
                  nodes {
                    title variantTitle quantity
                    lineItemGroup { id title quantity }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }""", {"q": QUERY, "after": cursor})
        conn = d["orders"]
        out.extend(conn["nodes"])
        if not conn["pageInfo"]["hasNextPage"]:
            break
        cursor = conn["pageInfo"]["endCursor"]
    return out


def component_name(it):
    base = it["title"]
    vt = it.get("variantTitle")
    return f"{base} ({vt})" if vt and vt != "Default Title" else base


def build_bundle_lines(order):
    groups = {}  # group_id -> {"title":..., "items":[...]}
    for it in order["lineItems"]["nodes"]:
        grp = it.get("lineItemGroup")
        if not grp:
            continue
        g = groups.setdefault(grp["id"], {"title": grp["title"], "items": []})
        g["items"].append(component_name(it))
    if not groups:
        return None
    lines = [MARKER]
    for g in groups.values():
        lines.append(f"{g['title']}: {', '.join(g['items'])}")
    return "\n".join(lines)


def process(order):
    note = order.get("note") or ""
    if MARKER in note:
        return "SKIP"
    bundle_block = build_bundle_lines(order)
    if not bundle_block:
        return "SKIP"
    new_note = f"{note}\n\n{bundle_block}" if note.strip() else bundle_block
    print(f"> {order['name']}: {bundle_block.splitlines()[1] if len(bundle_block.splitlines()) > 1 else bundle_block}")
    if DRY_RUN:
        return "PLANNED"
    d = gql("""
      mutation($input: OrderInput!) {
        orderUpdate(input: $input) { order { id } userErrors { field message } }
      }""", {"input": {"id": order["id"], "note": new_note}})
    errs = d["orderUpdate"]["userErrors"]
    if errs:
        print(f"   x {errs}"); return "ERROR"
    d2 = gql("""
      mutation($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
      }""", {"id": order["id"], "tags": ["Bundle"]})
    errs2 = d2["tagsAdd"]["userErrors"]
    if errs2:
        print(f"   ~ Tag: {errs2}")
    return "DONE"


def main():
    print(f"=== Bundle-Kennzeichnung === DRY_RUN={DRY_RUN} QUERY={QUERY!r}")
    orders = fetch_orders()
    if LIMIT:
        orders = orders[:LIMIT]
    print(f"{len(orders)} Bestellungen gefunden")
    c = {"DONE": 0, "PLANNED": 0, "SKIP": 0, "ERROR": 0}
    for o in orders:
        try:
            c[process(o)] += 1
        except Exception as e:
            c["ERROR"] += 1; print(f"x {o['name']}: {str(e)[:160]}")
        time.sleep(0.2)
    print(f"\n=== Fertig === Markiert: {c['DONE']}  Geplant: {c['PLANNED']}  Uebersprungen: {c['SKIP']}  Fehler: {c['ERROR']}")


if __name__ == "__main__":
    main()
