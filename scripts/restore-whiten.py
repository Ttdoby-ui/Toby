#!/usr/bin/env python3
"""
Rollback des Weiß-Hintergrund-Laufs: stellt je Produkt die ORIGINAL-Bilder aus
whiten-backup.json wieder her und entfernt die geweißten "white-*"-Ersatzbilder.

Zuordnung ist exakt: der Weiß-Lauf hat jedes Ersatzbild `white-<alteMediaId>.jpg`
genannt. Backup-Eintrag hat `oldMedia = .../MediaImage/<alteMediaId>` + `oldUrl`.
=> aktuelles Media, dessen URL `white-<alteMediaId>` enthält, ist der Ersatz, der
   durch das Original (oldUrl) ersetzt wird. Position + Varianten-Zuordnung des
   Ersatzbilds werden aufs wiederhergestellte Original übertragen.

Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, DRY_RUN(true),
     ONLY (Komma Produkt-IDs, sonst alle im Backup), BACKUP (Pfad, Default whiten-backup.json).
"""
import io
import json
import os
import time
import requests

DOMAIN = (os.environ.get("SHOPIFY_STORE_DOMAIN") or "").strip()
TOKEN = (os.environ.get("SHOPIFY_ACCESS_TOKEN") or "").strip()
API = "2025-01"
DRY_RUN = (os.environ.get("DRY_RUN", "true").lower() != "false")
ONLY = set(x.strip() for x in os.environ.get("ONLY", "").split(",") if x.strip())
BACKUP = os.environ.get("BACKUP", "whiten-backup.json")

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


PROD_Q = """
query($id: ID!) {
  product(id: $id) {
    id title
    media(first: 50) { nodes { ... on MediaImage { id image { url } } } }
    variants(first: 100) { nodes { id media(first: 5) { nodes { ... on MediaImage { id } } } } }
  }
}"""


def restore_product(pid, entries):
    p = gql(PROD_Q, {"id": f"gid://shopify/Product/{pid}"})["product"]
    if not p:
        print(f"- {pid} nicht gefunden"); return "SKIP"
    media = p["media"]["nodes"]
    order = [m["id"] for m in media]
    url_by_id = {m["id"]: (m.get("image") or {}).get("url", "") for m in media}
    var_of = {}
    for v in p["variants"]["nodes"]:
        for m in v["media"]["nodes"]:
            var_of.setdefault(m["id"], []).append(v["id"])

    # Ersatz-Media (white-<oldId>) je Backup-Eintrag finden
    todo = []  # (whiteMediaId, oldUrl, alt)
    for e in entries:
        old_num = e["oldMedia"].split("/")[-1]
        needle = f"white-{old_num}"
        white_id = next((mid for mid, u in url_by_id.items() if needle in (u or "")), None)
        if white_id:
            todo.append((white_id, e["oldUrl"], e.get("alt", "")))
    if not todo:
        print(f"- {p['title']} - kein white-* gefunden (schon restauriert?)"); return "SKIP"

    print(f"> {p['title']} - {len(todo)} Bild(er) zurueck")
    if DRY_RUN:
        return "PLANNED"

    idmap = {}  # whiteId -> newOriginalId
    for white_id, old_url, alt in todo:
        cr = gql("mutation($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){media{... on MediaImage{id}} mediaUserErrors{message}}}",
                 {"productId": p["id"], "media": [{"originalSource": old_url, "alt": alt, "mediaContentType": "IMAGE"}]})
        err = cr["productCreateMedia"]["mediaUserErrors"]
        if err:
            print(f"   x create ({old_url[:60]}): {err}"); continue
        idmap[white_id] = cr["productCreateMedia"]["media"][0]["id"]
    if not idmap:
        return "ERROR"
    time.sleep(1.0)

    # Reihenfolge: Original an die Position seines white-Ersatzes
    desired = [idmap.get(mid, mid) for mid in order]
    moves = [{"id": mid, "newPosition": str(i)} for i, mid in enumerate(desired)]
    gql("mutation($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){mediaUserErrors{message}}}",
        {"id": p["id"], "moves": moves})

    # Varianten-Zuordnung vom white-Bild aufs Original umhaengen
    for white_id, new_id in idmap.items():
        vids = var_of.get(white_id)
        if not vids:
            continue
        gql("mutation($p:ID!,$vm:[ProductVariantDetachMediaInput!]!){productVariantDetachMedia(productId:$p,variantMedia:$vm){userErrors{message}}}",
            {"p": p["id"], "vm": [{"variantId": v, "mediaIds": [white_id]} for v in vids]})
        gql("mutation($p:ID!,$vm:[ProductVariantAppendMediaInput!]!){productVariantAppendMedia(productId:$p,variantMedia:$vm){userErrors{message}}}",
            {"p": p["id"], "vm": [{"variantId": v, "mediaIds": [new_id]} for v in vids]})

    # white-Bilder loeschen
    gql("mutation($id:ID!,$mediaIds:[ID!]!){productDeleteMedia(productId:$id,mediaIds:$mediaIds){deletedMediaIds mediaUserErrors{message}}}",
        {"id": p["id"], "mediaIds": list(idmap.keys())})
    print(f"   ok {len(idmap)} Original(e) wiederhergestellt")
    return "DONE"


def main():
    data = json.load(open(BACKUP))
    by_prod = {}
    for e in data:
        pid = e["product"].split("/")[-1]
        if ONLY and pid not in ONLY:
            continue
        by_prod.setdefault(pid, []).append(e)
    print(f"=== Restore === DRY_RUN={DRY_RUN} Produkte={len(by_prod)} (Backup-Eintraege={len(data)}) ONLY={len(ONLY)}")
    c = {"DONE": 0, "PLANNED": 0, "SKIP": 0, "ERROR": 0}
    for pid, entries in by_prod.items():
        try:
            c[restore_product(pid, entries)] += 1
        except Exception as ex:
            c["ERROR"] += 1; print(f"x {pid}: {str(ex)[:160]}")
        time.sleep(0.25)
    print(f"\n=== Fertig === Wiederhergestellt: {c['DONE']}  Geplant: {c['PLANNED']}  Uebersprungen: {c['SKIP']}  Fehler: {c['ERROR']}")


if __name__ == "__main__":
    main()
