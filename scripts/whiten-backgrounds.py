#!/usr/bin/env python3
"""
Produktbilder mit EINFARBIGEM Hintergrund katalogweit auf WEISS setzen.

Pro Bild wird geprueft, ob der Hintergrund einfarbig ist (Rand-Pixel gleichmaessig).
- schon (nahezu) weiss  -> uebersprungen (nichts zu tun)
- einfarbig, nicht weiss -> per rembg freigestellt + auf Weiss gesetzt, ERSETZT
- unruhig/Lifestyle       -> uebersprungen (nicht anfassen)
- Kombi-Bilder ("Farbübersicht") -> uebersprungen

Ersetzen ERHAELT Alt-Text, Reihenfolge und Varianten-Zuordnung (Detach/Attach),
damit der Farbfilter der zusammengefuehrten Produkte intakt bleibt.

Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, DRY_RUN(true), ONLY(IDs),
     LIMIT, SOLID_STD(14), WHITE_MEAN(244), RMBG(true).
Backup: schreibt whiten-backup.json (Produkt-/Media-ID + alte CDN-URL) -> Rollback.
"""
import io
import json
import os
import time
import statistics
import requests
import numpy as np
from scipy import ndimage
from PIL import Image

DOMAIN = (os.environ.get("SHOPIFY_STORE_DOMAIN") or "").strip()
TOKEN = (os.environ.get("SHOPIFY_ACCESS_TOKEN") or "").strip()
API = "2025-01"
DRY_RUN = (os.environ.get("DRY_RUN", "true").lower() != "false")
# RMBG=true erzwingt die KI-Freistellung (rembg). DEFAULT ist FALSE -> Flood-Fill,
# weil rembg helle/kontrastarme Produkte "frisst" (Handtuch wurde weiss statt der Hintergrund).
RMBG = (os.environ.get("RMBG", "false").lower() == "true")
ONLY = [x.strip() for x in os.environ.get("ONLY", "").split(",") if x.strip()]
LIMIT = int(os.environ["LIMIT"]) if os.environ.get("LIMIT") else None
SOLID_STD = float(os.environ.get("SOLID_STD", "14"))   # max Rand-Streuung fuer "einfarbig"
WHITE_MEAN = float(os.environ.get("WHITE_MEAN", "244"))  # ab hier gilt Hintergrund als weiss
FILL_TOL = float(os.environ.get("FILL_TOL", "42"))     # Farbabstand (0-441) zum Rand -> gilt als Hintergrund
FILL_DILATE = int(os.environ.get("FILL_DILATE", "2"))  # Rand der Maske aufweiten (Halo/Antialias schlucken)
BACKUP = "whiten-backup.json"

if not DOMAIN or not TOKEN:
    raise SystemExit("SHOPIFY_STORE_DOMAIN und SHOPIFY_ACCESS_TOKEN muessen gesetzt sein.")

SESSION = None
if RMBG:
    from rembg import new_session
    SESSION = new_session("u2netp")


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
    media(first: 50) { nodes { ... on MediaImage { id alt image { url } } } }
    variants(first: 100) { nodes { id media(first: 5) { nodes { ... on MediaImage { id } } } } }
  }
}"""


def border_stats(im):
    im = im.convert("RGB")
    w, h = im.size
    px = im.load()
    b = max(3, min(w, h) // 40)
    samples = []
    for x in range(0, w, max(1, w // 60)):
        for y in list(range(0, b)) + list(range(h - b, h)):
            samples.append(px[x, min(max(y, 0), h - 1)])
    for y in range(0, h, max(1, h // 60)):
        for x in list(range(0, b)) + list(range(w - b, w)):
            samples.append(px[min(max(x, 0), w - 1), y])
    means = [statistics.fmean(c[i] for c in samples) for i in range(3)]
    stds = [statistics.pstdev(c[i] for c in samples) for i in range(3)]
    return means, stds


def _flatten(raw):
    """PNG/Alpha auf Weiss flach machen -> RGB-PIL-Bild."""
    im = Image.open(io.BytesIO(raw))
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        return bg
    return im.convert("RGB")


def flood_whiten(im):
    """
    Nur den EINFARBIGEN Hintergrund durch Weiss ersetzen, ohne das Produkt anzufassen.
    Vorgehen (deterministisch, keine KI): Hintergrundfarbe = Median der Rand-Pixel;
    Maske = Pixel innerhalb FILL_TOL um diese Farbe; davon werden nur die
    zusammenhaengenden Regionen ersetzt, die den BILDRAND beruehren (= echter
    Hintergrund). Produktinnere Pixel gleicher Farbe bleiben, weil nicht mit dem
    Rand verbunden. So wird NIE das Produkt selbst weiss gemacht.
    """
    arr = np.asarray(im, dtype=np.int16)
    h, w, _ = arr.shape
    b = max(3, min(w, h) // 40)
    border = np.concatenate([
        arr[:b, :, :].reshape(-1, 3), arr[-b:, :, :].reshape(-1, 3),
        arr[:, :b, :].reshape(-1, 3), arr[:, -b:, :].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((arr - bg) ** 2).sum(axis=2))
    near = dist < FILL_TOL
    # nur Regionen behalten, die den Rand beruehren
    lbl, n = ndimage.label(near)
    edge = set(np.unique(lbl[0, :])) | set(np.unique(lbl[-1, :])) \
        | set(np.unique(lbl[:, 0])) | set(np.unique(lbl[:, -1]))
    edge.discard(0)
    if not edge:
        return im  # nichts am Rand -> nichts ersetzen (Sicherheit)
    mask = np.isin(lbl, list(edge))
    if FILL_DILATE > 0:
        # Maske leicht ins Produkt aufweiten, um den Antialias-/Farbsaum-Ring zu schlucken
        mask = ndimage.binary_dilation(mask, iterations=FILL_DILATE)
    out = arr.copy()
    out[mask] = [255, 255, 255]
    return Image.fromarray(out.astype(np.uint8), "RGB")


def whiten(raw):
    if RMBG:
        from rembg import remove
        im = _flatten(remove(raw, session=SESSION))
    else:
        im = flood_whiten(_flatten(raw))
    out = io.BytesIO(); im.save(out, format="JPEG", quality=88)
    return out.getvalue()


def upload(data, filename):
    d = gql("mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}",
            {"input": [{"filename": filename, "mimeType": "image/jpeg", "httpMethod": "POST", "resource": "IMAGE"}]})
    t = d["stagedUploadsCreate"]["stagedTargets"][0]
    form = {p["name"]: p["value"] for p in t["parameters"]}
    up = requests.post(t["url"], data=form, files={"file": (filename, data, "image/jpeg")}, timeout=120)
    up.raise_for_status()
    return t["resourceUrl"]


def process(pid, backup):
    p = gql(PROD_Q, {"id": f"gid://shopify/Product/{pid}"})["product"]
    if not p:
        return "SKIP"
    media = p["media"]["nodes"]
    # Variante -> Media-ID(s)
    var_of = {}
    for v in p["variants"]["nodes"]:
        for m in v["media"]["nodes"]:
            var_of.setdefault(m["id"], []).append(v["id"])

    order = [m["id"] for m in media]
    todo = []  # (old_id, alt, orig_url, new_bytes)
    for m in media:
        if "Farbübersicht" in (m.get("alt") or ""):
            continue
        url = (m.get("image") or {}).get("url")
        if not url:
            continue
        try:
            resp = requests.get(url + ("&" if "?" in url else "?") + "width=900", timeout=60)
            resp.raise_for_status()
            im = Image.open(io.BytesIO(resp.content))
            has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
            means, stds = border_stats(im)
            uniform = max(stds) < SOLID_STD
            near_white = all(x > WHITE_MEAN for x in means)
            # Kandidat: einfarbiger, nicht-weisser Rand ODER transparenter PNG-Rand,
            # der auf der (cremefarbenen) Kachel nicht weiss erscheint.
            if near_white and not has_alpha:
                continue
            if not uniform and not (has_alpha and near_white is False):
                # unruhiger Hintergrund und nicht transparent -> Lifestyle -> auslassen
                if not has_alpha:
                    continue
            todo.append((m["id"], m.get("alt") or "", url, resp.content))
        except Exception as e:
            print(f"   ! Analyse {m['id']}: {str(e)[:70]}")
    if not todo:
        print(f"- {p['title']} - nichts zu tun"); return "SKIP"

    print(f"> {p['title']} - {len(todo)}/{len(media)} Bild(er) weißen")
    if DRY_RUN:
        return "PLANNED"

    idmap = {}  # old_id -> new_id
    for old_id, alt, orig_url, raw in todo:
        data = whiten(raw)
        src = upload(data, f"white-{old_id.split('/')[-1]}.jpg")
        cr = gql("mutation($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){media{... on MediaImage{id}} mediaUserErrors{message}}}",
                 {"productId": p["id"], "media": [{"originalSource": src, "alt": alt, "mediaContentType": "IMAGE"}]})
        err = cr["productCreateMedia"]["mediaUserErrors"]
        if err:
            print(f"   x create {old_id}: {err}"); continue
        idmap[old_id] = cr["productCreateMedia"]["media"][0]["id"]
        backup.append({"product": p["id"], "oldMedia": old_id, "oldUrl": orig_url, "alt": alt})
    if not idmap:
        return "ERROR"
    time.sleep(1.0)

    # Reihenfolge: neue an die Position der alten
    desired = [idmap.get(mid, mid) for mid in order]
    moves = [{"id": mid, "newPosition": str(i)} for i, mid in enumerate(desired)]
    gql("mutation($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){mediaUserErrors{message}}}",
        {"id": p["id"], "moves": moves})

    # Varianten-Zuordnung: alte abhaengen, neue anhaengen
    for old_id, new_id in idmap.items():
        vids = var_of.get(old_id)
        if not vids:
            continue
        gql("mutation($p:ID!,$vm:[ProductVariantDetachMediaInput!]!){productVariantDetachMedia(productId:$p,variantMedia:$vm){userErrors{message}}}",
            {"p": p["id"], "vm": [{"variantId": v, "mediaIds": [old_id]} for v in vids]})
        gql("mutation($p:ID!,$vm:[ProductVariantAppendMediaInput!]!){productVariantAppendMedia(productId:$p,variantMedia:$vm){userErrors{message}}}",
            {"p": p["id"], "vm": [{"variantId": v, "mediaIds": [new_id]} for v in vids]})

    # Alte Bilder loeschen
    gql("mutation($id:ID!,$mediaIds:[ID!]!){productDeleteMedia(productId:$id,mediaIds:$mediaIds){deletedMediaIds mediaUserErrors{message}}}",
        {"id": p["id"], "mediaIds": list(idmap.keys())})
    print(f"   ok {len(idmap)} Bild(er) ersetzt (Alt/Position/Variante erhalten)")
    return "DONE"


def all_active_ids():
    ids, cursor = [], None
    while True:
        d = gql("query($after:String){products(first:250,query:\"status:active\",after:$after){nodes{id} pageInfo{hasNextPage endCursor}}}", {"after": cursor})
        for n in d["products"]["nodes"]:
            ids.append(n["id"].split("/")[-1])
        if not d["products"]["pageInfo"]["hasNextPage"]:
            break
        cursor = d["products"]["pageInfo"]["endCursor"]
    return ids


def main():
    print(f"=== Weißer Hintergrund === DRY_RUN={DRY_RUN} RMBG={RMBG} ONLY={len(ONLY)} LIMIT={LIMIT}")
    ids = ONLY if ONLY else all_active_ids()
    if LIMIT:
        ids = ids[:LIMIT]
    print(f"{len(ids)} Produkte")
    backup, c = [], {"DONE": 0, "PLANNED": 0, "SKIP": 0, "ERROR": 0}
    for pid in ids:
        try:
            c[process(pid, backup)] += 1
        except Exception as e:
            c["ERROR"] += 1; print(f"x {pid}: {str(e)[:160]}")
        time.sleep(0.25)
    with open(BACKUP, "w") as f:
        json.dump(backup, f, indent=2)
    print(f"\n=== Fertig === Ersetzt: {c['DONE']}  Geplant: {c['PLANNED']}  Uebersprungen: {c['SKIP']}  Fehler: {c['ERROR']}")


if __name__ == "__main__":
    main()
