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


# Kuratierte Quellseiten je Handle (per Websuche ermittelt, Hersteller zuerst).
# Die Seite wird gefetcht, og:image extrahiert und das Bild hochgeladen.
SOURCES = {
    "barna-super-glanti-new-blue-edition": [
        "https://www.der-materialspezialist.com/en/Rubbers/Barna-Original/Anti-Top/SUPER-GLANTI-NEW-BLUE-EDITION::231.html",
    ],
    "barna-virus-2": [
        "https://www.der-materialspezialist.com/en/Rubbers/Barna-Original/Long-pimples/VIRUS-2::197.html",
        "https://www.spinfactory.de/tischtennis-belaege/barna-langnoppe-virus-2.html",
    ],
    "der-materialspezialist-kamikaze": [
        "https://www.der-materialspezialist.com/en/Rubbers/der-materialspezialist/Long-pimples/KAMIKAZE::133.html",
        "https://www.spinfactory.de/tischtennis-belaege/tischtennis-belag-der-materialspezialist-kamikaze.html",
    ],
    "donic-coppa-jo-silver": [
        "https://tischtennis-billiger.de/belaege/donic/donic-coppa-jo-silver.html",
        "https://www.tischtennisbedarf.at/xt/de/Donic-Belag-Coppa-JO-Silver",
    ],
    "joola-vizon": [
        "https://joola.de/de-eu/products/joola-belag-vizon",
        "https://derttshop.de/belaege/noppen-innen/2647/joola-vizon",
        "https://www.tischtennis.biz/joola-tischtennisbelaege/joola-vizon.html",
    ],
    "sauer-troger-hass": [
        "https://www.sauer-troeger.com/en/products/hass",
        "https://www.sauer-troeger.com/products/hass",
        "https://www.spinfactory.de/tischtennis-belaege/tischtennis-belag-sauer-troeger-hass.html",
    ],
    "sauer-troger-blackout": [
        "https://www.sauer-troeger.com/products/blackout-anti",
        "https://tischtennis-billiger.de/belaege/sauer-troeger/sauer-troeger-blackout.html",
    ],
    "tibhar-hybrid-k3-pro": [
        "https://ttstore.de/produkt/tibhar-hybrid-k3-pro/",
        "https://www.racket-company.de/tischtennis/tibhar-hybrid-k3-pro.html",
        "https://tischtennis-billiger.de/belaege/tibhar/tibhar-hybrid-k3-pro.html",
    ],
    "tibhar-shang-kun-hybrid-ac": [
        "https://tibhar.info/en/shop/shang-kun-hybrid-ac/",
        "https://ttstore.de/produkt/tibhar-shang-kun-hybrid-ac/",
        "https://tt-shop-duesseldorf.de/products/tibhar-holz-shang-kun-hybrid-ac",
    ],
    "dhs-hurricane-long-5x": [
        "https://www.racket-company.de/dhs-hurricane-long-5x.html",
        "https://li-ning.de/products/dhs-hurricane-long-5x-holz-st-dxcr003-1",
        "https://tischtennis-billiger.de/nach-hersteller/dhs/dhs-hurricane-long-5x.html",
    ],
    "red-black-flow": [
        "https://www.spinfactory.de/tischtennis-hoelzer/tischtennis-holz-red-and-black-flow.html",
    ],
    "red-black-kazak": [
        "https://www.spinfactory.de/tischtennis-hoelzer/kazak.html",
    ],
    "red-black-kazak-a": [
        "https://www.spinfactory.de/tischtennis-hoelzer/kazak-a-allround.html",
    ],
    "red-black-kazak-c": [
        "https://www.spinfactory.de/tischtennis-hoelzer/tischtennis-holz-red-black-kazak-c-combi.html",
    ],
    "red-black-kazak-d": [
        "https://www.spinfactory.de/tischtennis-hoelzer/tischtennis-holz-red-black-kazak-defense.html",
    ],
    "red-black-ruby": [
        "https://www.spinfactory.de/tischtennis-hoelzer/ruby.html",
    ],
    "xiom-solo": [
        "https://www.tt-center.de/xiom-solo",
        "https://www.racket-company.de/tischtennis/xiom-solo-off.html",
        "https://tischtennis-billiger.de/hoelzer/xiom/xiom-solo.html",
    ],
    "xiom-tmxi-an-jaehyun": [
        "https://www.racket-company.de/xiom-ajh-tmxi.html",
        "https://tt-xpert.de/xiom-tmxi-an-jaehyun/000001363701",
    ],
    "xiom-tmxi-an-jaehyun-kopie": [
        "https://www.vetts.de/conk_de/xiom-holz-an-jaehyun-tmxi-pro.html",
        "https://www.tms-tischtennis.de/XIOM-Holz-An-JaeHyun-TMXi-Pro/11112",
    ],
    # futurespin-innercarbon: Eigenmarke, keine externe Quelle -> manuell
}

BROWSER_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
              "Accept-Language": "de-DE,de;q=0.9,en;q=0.8"}


def og_image_from(page_url):
    r = requests.get(page_url, headers=BROWSER_UA, timeout=45)
    if r.status_code != 200:
        return None, f"HTTP {r.status_code}"
    m = re.search(r'property="og:image(?::secure_url)?"\s+content="([^"]+)"', r.text) or \
        re.search(r'content="([^"]+)"\s+property="og:image(?::secure_url)?"', r.text) or \
        re.search(r'<link\s+rel="image_src"\s+href="([^"]+)"', r.text) or \
        re.search(r'name="twitter:image"\s+content="([^"]+)"', r.text)
    if not m:
        return None, "kein og:image"
    u = m.group(1)
    if u.startswith("//"):
        u = "https:" + u
    return u, None


def source_image(handle):
    """Kuratierte Quellseiten -> og:image -> Bild-Bytes."""
    for page in SOURCES.get(handle, []):
        host = page.split("/")[2]
        try:
            img_url, err = og_image_from(page)
            if not img_url:
                print(f"   ~ {host}: {err}")
                continue
            r = requests.get(img_url, headers=BROWSER_UA, timeout=90)
            ctype = r.headers.get("Content-Type", "")
            if r.status_code != 200 or len(r.content) < 3000 or "image" not in ctype:
                print(f"   ~ {host}: Bild nicht ladbar ({r.status_code}, {ctype}, {len(r.content)}B)")
                continue
            return r.content, f"{host}"
        except Exception as e:
            print(f"   ~ {host}: {str(e)[:70]}")
    return None, "keine Quellseite lieferte ein Bild"


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
    mime = "image/png" if data[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
    d = gql("mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}",
            {"input": [{"filename": filename, "mimeType": mime, "httpMethod": "POST", "resource": "IMAGE"}]})
    t = d["stagedUploadsCreate"]["stagedTargets"][0]
    form = {p["name"]: p["value"] for p in t["parameters"]}
    up = requests.post(t["url"], data=form, files={"file": (filename, data, mime)}, timeout=120)
    up.raise_for_status()
    cr = gql("mutation($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){media{... on MediaImage{id}} mediaUserErrors{message}}}",
             {"productId": pid, "media": [{"originalSource": t["resourceUrl"], "alt": "", "mediaContentType": "IMAGE"}]})
    err = cr["productCreateMedia"]["mediaUserErrors"]
    if err:
        return None, str(err)
    mid = cr["productCreateMedia"]["media"][0]["id"]
    # Lehre aus dem Whiten-Restore: IMMER auf finalen Status warten (READY),
    # PROCESSING/FAILED nie als Erfolg werten.
    for _ in range(15):
        time.sleep(2)
        n = gql("query($id:ID!){node(id:$id){... on MediaImage{status mediaErrors{message}}}}", {"id": mid})["node"]
        if n["status"] == "READY":
            return mid, None
        if n["status"] == "FAILED":
            gql("mutation($id:ID!,$m:[ID!]!){productDeleteMedia(productId:$id,mediaIds:$m){deletedMediaIds mediaUserErrors{message}}}",
                {"id": pid, "m": [mid]})
            return None, f"Media FAILED: {n.get('mediaErrors')}"
    return None, "Media blieb PROCESSING (Timeout)"


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
        data, note = source_image(p["handle"])
        if not data:
            data, note2 = wayback_image(p["handle"])
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
