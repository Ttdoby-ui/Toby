#!/usr/bin/env python3
"""
Quiz-Bilder-Rettung: findet AKTIVE Produkte in den Kollektionen belage/holzer
OHNE brauchbares Bild (featuredMedia fehlt/FAILED) und versucht, das Original
aus der Wayback Machine (archivierte futurespin.de-Produktseite -> og:image)
wiederherzustellen. Hintergrund: fehlende Bilder erzeugen im Schläger-Finder-
JSON einen Liquid-Fehler ("invalid url input") -> Quiz liefert keine Ergebnisse.

Ablauf je Produkt:
  1. Wayback availability API fuer futurespin.de/products/<handle>
  2. Snapshot-HTML -> og:image (CDN-URL des damaligen Produktbilds)
  3. Bild-Bytes via web.archive.org/web/<ts>id_/<url> laden
  4. stagedUploadsCreate + Upload + productCreateMedia (wird featured)

Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, DRY_RUN(true), ONLY(Handles).
"""
import io
import json
import os
import re
import time
import requests

DOMAIN = (os.environ.get("SHOPIFY_STORE_DOMAIN") or "").strip()
TOKEN = (os.environ.get("SHOPIFY_ACCESS_TOKEN") or "").strip()
API = "2025-01"
DRY_RUN = (os.environ.get("DRY_RUN", "true").lower() != "false")
ONLY = set(x.strip() for x in os.environ.get("ONLY", "").split(",") if x.strip())
UA = {"User-Agent": "Mozilla/5.0 (compatible; futurespin-image-rescue)"}

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


def broken_products():
    """Aktive Produkte in belage+holzer ohne READY-Featured-Bild."""
    out = []
    for handle in ("belage", "holzer"):
        cursor = None
        while True:
            d = gql("""
              query($h: String!, $after: String) {
                collectionByHandle(handle: $h) {
                  products(first: 250, after: $after) {
                    nodes { id handle title status
                      featuredMedia { ... on MediaImage { status } }
                    }
                    pageInfo { hasNextPage endCursor }
                  }
                }
              }""", {"h": handle, "after": cursor})
            conn = d["collectionByHandle"]["products"]
            for p in conn["nodes"]:
                fm = p.get("featuredMedia")
                ok = fm and fm.get("status") == "READY"
                if p["status"] == "ACTIVE" and not ok:
                    out.append(p)
            if not conn["pageInfo"]["hasNextPage"]:
                break
            cursor = conn["pageInfo"]["endCursor"]
    return out


def contra_image(title):
    """Zweite Quelle: contra.de (Lieferant) - Suche -> Produktseite -> og:image."""
    q = re.sub(r"\bKopie( von)?\b", "", title, flags=re.I).strip()
    try:
        sr = requests.get("https://www.contra.de/search",
                          params={"sSearch": q}, headers=UA, timeout=45)
        if sr.status_code != 200:
            return None, f"contra Suche HTTP {sr.status_code}"
        links = re.findall(r'<a[^>]+href="(https://www\.contra\.de/[^"]+)"[^>]*class="[^"]*product--title', sr.text)
        if not links:
            links = re.findall(r'class="[^"]*product--title[^"]*"[^>]*href="(https://www\.contra\.de/[^"]+)"', sr.text)
        if not links:
            return None, "contra: kein Treffer"
        pr = requests.get(links[0], headers=UA, timeout=45)
        m = re.search(r'property="og:image"\s+content="([^"]+)"', pr.text) or \
            re.search(r'content="([^"]+)"\s+property="og:image"', pr.text)
        if not m:
            return None, "contra: kein og:image"
        r = requests.get(m.group(1), headers=UA, timeout=60)
        if r.status_code != 200 or len(r.content) < 2000:
            return None, f"contra: Bild nicht ladbar ({r.status_code})"
        return r.content, f"contra.de ({links[0].split('/')[-1][:40]})"
    except Exception as e:
        return None, f"contra Fehler: {str(e)[:80]}"


def wayback_image(handle):
    """Snapshot der Produktseite suchen -> og:image -> Roh-Bild-Bytes."""
    page = f"https://futurespin.de/products/{handle}"
    try:
        av = requests.get("https://archive.org/wayback/available",
                          params={"url": page}, headers=UA, timeout=30).json()
        snap = (((av or {}).get("archived_snapshots") or {}).get("closest") or {})
        if not snap.get("available"):
            return None, "kein Snapshot"
        snap_url = snap["url"]
        ts = snap.get("timestamp", "")
        html = requests.get(snap_url, headers=UA, timeout=60).text
        m = re.search(r'property="og:image"\s+content="([^"]+)"', html) or \
            re.search(r'content="([^"]+)"\s+property="og:image"', html)
        if not m:
            return None, f"Snapshot {ts}: kein og:image"
        img_url = m.group(1)
        if img_url.startswith("//"):
            img_url = "https:" + img_url
        img_url = re.sub(r"^https?://web\.archive\.org/web/[^/]+/", "", img_url)
        raw_url = f"https://web.archive.org/web/{ts}id_/{img_url}"
        r = requests.get(raw_url, headers=UA, timeout=90)
        if r.status_code != 200 or len(r.content) < 2000:
            return None, f"Snapshot {ts}: Bild nicht ladbar ({r.status_code})"
        return r.content, f"Snapshot {ts}"
    except Exception as e:
        return None, f"Fehler: {str(e)[:80]}"


def upload_and_attach(pid, data, filename):
    d = gql("mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}",
            {"input": [{"filename": filename, "mimeType": "image/jpeg", "httpMethod": "POST", "resource": "IMAGE"}]})
    t = d["stagedUploadsCreate"]["stagedTargets"][0]
    form = {p["name"]: p["value"] for p in t["parameters"]}
    up = requests.post(t["url"], data=form, files={"file": (filename, data, "image/jpeg")}, timeout=120)
    up.raise_for_status()
    cr = gql("mutation($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){media{... on MediaImage{id}} mediaUserErrors{message}}}",
             {"productId": pid, "media": [{"originalSource": t["resourceUrl"], "alt": "", "mediaContentType": "IMAGE"}]})
    err = cr["productCreateMedia"]["mediaUserErrors"]
    if err:
        return None, str(err)
    return cr["productCreateMedia"]["media"][0]["id"], None


def main():
    print(f"=== Quiz-Bilder-Rettung === DRY_RUN={DRY_RUN}")
    broken = broken_products()
    if ONLY:
        broken = [p for p in broken if p["handle"] in ONLY]
    print(f"{len(broken)} aktive Produkte ohne Bild in belage/holzer:")
    for p in broken:
        print(f"  - {p['handle']} ({p['title']})")
    ok = fail = 0
    for p in broken:
        data, note = wayback_image(p["handle"])
        if not data:
            data, note2 = contra_image(p["title"])
            note = f"{note}; {note2}" if not data else note2
        if not data:
            print(f"x {p['handle']}: {note}")
            fail += 1
            continue
        if DRY_RUN:
            print(f"> {p['handle']}: Bild gefunden ({len(data)//1024} KB, {note}) - DRY_RUN")
            ok += 1
            continue
        mid, err = upload_and_attach(p["id"], data, f"rescue-{p['handle']}.jpg")
        if err:
            print(f"x {p['handle']}: Upload/Attach: {err}")
            fail += 1
        else:
            print(f"> {p['handle']}: Bild wiederhergestellt ({note})")
            ok += 1
        time.sleep(0.5)
    print(f"\n=== Fertig === OK: {ok}  Fehlgeschlagen/übrig: {fail}")


if __name__ == "__main__":
    main()
