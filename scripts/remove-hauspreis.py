#!/usr/bin/env python3
"""
Hauspreis entfernen (gefiltert): fuer alle Produkte, die QUERY matchen
(Default: vendor:Tibhar tag:Hauspreis tag:Belag) wird der Hauspreis
rueckgaengig gemacht:
  - je Variante: Preis <- Vergleichspreis (= UVP), Vergleichspreis <- leer
  - Produkt-Tag "Hauspreis" entfernen
  - Badge-Metafelder custom.price_badge_text / price_badge_color loeschen

Varianten OHNE Vergleichspreis werden nicht angefasst (nichts zu restaurieren).
Produkte mit laufendem Zeitangebot (custom.pre_sale_price gesetzt) werden
uebersprungen (der scheduled_sale-Job verwaltet deren Preise).

Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN (write_products),
     DRY_RUN (Default true), QUERY (Default s.o.), LIMIT.
"""
import os
import time
import requests

DOMAIN = (os.environ.get("SHOPIFY_STORE_DOMAIN") or "").strip()
TOKEN = (os.environ.get("SHOPIFY_ACCESS_TOKEN") or "").strip()
API = "2025-01"
DRY_RUN = (os.environ.get("DRY_RUN", "true").lower() != "false")
QUERY = os.environ.get("QUERY") or "vendor:Tibhar tag:Hauspreis tag:Belag status:active"
LIMIT = int(os.environ["LIMIT"]) if os.environ.get("LIMIT") else None

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


def fetch_products():
    out, cursor = [], None
    while True:
        d = gql("""
          query($q: String!, $after: String) {
            products(first: 50, query: $q, after: $after) {
              nodes {
                id title tags
                presale: metafield(namespace: "custom", key: "pre_sale_price") { id }
                variants(first: 100) { nodes { id title price compareAtPrice } }
              }
              pageInfo { hasNextPage endCursor }
            }
          }""", {"q": QUERY, "after": cursor})
        conn = d["products"]
        out.extend(conn["nodes"])
        if not conn["pageInfo"]["hasNextPage"]:
            break
        cursor = conn["pageInfo"]["endCursor"]
    return out


def process(p):
    if p.get("presale"):
        print(f"- {p['title']}: laufendes Zeitangebot (pre_sale) -> uebersprungen")
        return "SKIP"
    todo = [v for v in p["variants"]["nodes"] if v.get("compareAtPrice")]
    if "Hauspreis" not in p["tags"] and not todo:
        print(f"- {p['title']}: kein Hauspreis-Zustand -> uebersprungen")
        return "SKIP"
    sample = f"{todo[0]['price']} -> {todo[0]['compareAtPrice']}" if todo else "nur Tag/Badge"
    print(f"> {p['title']}: {len(todo)} Varianten ({sample})")
    if DRY_RUN:
        return "PLANNED"
    if todo:
        upd = [{"id": v["id"], "price": v["compareAtPrice"], "compareAtPrice": None} for v in todo]
        d = gql("""
          mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { field message }
            }
          }""", {"productId": p["id"], "variants": upd})
        errs = d["productVariantsBulkUpdate"]["userErrors"]
        if errs:
            print(f"   x Preise: {errs}"); return "ERROR"
    if "Hauspreis" in p["tags"]:
        d = gql("mutation($id: ID!, $tags: [String!]!){tagsRemove(id:$id, tags:$tags){userErrors{message}}}",
                {"id": p["id"], "tags": ["Hauspreis"]})
        errs = d["tagsRemove"]["userErrors"]
        if errs:
            print(f"   x Tag: {errs}"); return "ERROR"
    d = gql("""
      mutation($mf: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $mf) { userErrors { field message } }
      }""", {"mf": [
        {"ownerId": p["id"], "namespace": "custom", "key": "price_badge_text"},
        {"ownerId": p["id"], "namespace": "custom", "key": "price_badge_color"},
    ]})
    errs = d["metafieldsDelete"]["userErrors"]
    if errs:
        print(f"   x Badge: {errs}"); return "ERROR"
    print("   ok Preis=UVP, Vergleichspreis leer, Tag+Badge entfernt")
    return "DONE"


def main():
    print(f"=== Hauspreis entfernen === DRY_RUN={DRY_RUN} QUERY={QUERY!r}")
    prods = fetch_products()
    if LIMIT:
        prods = prods[:LIMIT]
    print(f"{len(prods)} Produkte gefunden")
    c = {"DONE": 0, "PLANNED": 0, "SKIP": 0, "ERROR": 0}
    for p in prods:
        try:
            c[process(p)] += 1
        except Exception as e:
            c["ERROR"] += 1; print(f"x {p['title']}: {str(e)[:160]}")
        time.sleep(0.3)
    print(f"\n=== Fertig === Entfernt: {c['DONE']}  Geplant: {c['PLANNED']}  Uebersprungen: {c['SKIP']}  Fehler: {c['ERROR']}")


if __name__ == "__main__":
    main()
