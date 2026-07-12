#!/usr/bin/env python3
"""
Kombi-Vorschaubild ("Farbübersicht") fuer zusammengefuehrte Farb-Produkte.

Baut je Master-Produkt (Farbe = 1. Option, > 1 Farbe) aus dem ERSTEN Bild jeder
Farbe eine Montage (Raster). Jeder Hintergrund wird per rembg freigestellt und
auf WEISS gesetzt -> einheitliches Bild. Wird als ERSTES Produktbild (featured)
gesetzt -> erscheint nur auf Kachel/Vorschau. Auf der PDP blendet der bestehende
Alt-Text-Filter (Alt enthaelt ALLE Farbnamen) es bei jeder Farbe aus.

Python (rembg) statt Node/@imgly, weil die Node-Variante in CI nativ abstuerzt.
Modell wird EINMAL geladen (new_session) -> schnell.

Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN (write_products),
     DRY_RUN (Default true), REBUILD (Default false), RMBG (Default true),
     ONLY (Komma-IDs), LIMIT.
"""
import io
import math
import os
import time
import requests
from PIL import Image

DOMAIN = (os.environ.get("SHOPIFY_STORE_DOMAIN") or "").strip()
TOKEN = (os.environ.get("SHOPIFY_ACCESS_TOKEN") or "").strip()  # .strip(): Secret hat evtl. \n am Ende (requests lehnt \n im Header ab)
API = "2025-01"
DRY_RUN = (os.environ.get("DRY_RUN", "true").lower() != "false")
REBUILD = (os.environ.get("REBUILD", "false").lower() == "true")
RMBG = (os.environ.get("RMBG", "true").lower() != "false")
ONLY = [int(x) for x in os.environ.get("ONLY", "").replace(" ", "").split(",") if x.strip()]
LIMIT = int(os.environ["LIMIT"]) if os.environ.get("LIMIT") else None

if not DOMAIN or not TOKEN:
    raise SystemExit("SHOPIFY_STORE_DOMAIN und SHOPIFY_ACCESS_TOKEN muessen gesetzt sein.")

MARKER = "Farbübersicht"
CELL = 600

MASTERS = [15636463714652, 15153550164316, 15165142139228, 15131662221660, 15611559969116, 15150198620508, 15180613779804, 15153528602972, 15119891595612, 14999779148124, 14999742447964, 15532251349340, 15119026585948, 15131005714780, 15119937765724, 15131113193820, 15532716032348, 15532695978332, 15558821740892, 15158872506716, 15515536916828, 14905680298332, 15164665233756, 15164668477788, 15203470442844, 15203469820252, 15153488920924, 15566001242460, 15566001111388, 15153492197724, 15150989279580, 15131684831580, 15150386446684, 15150256161116, 15150385693020, 15150255571292, 15630973174108, 15164385952092, 15151222587740, 15164630958428, 15118978384220, 15153498947932, 15558833766748, 15558838714716, 15558843564380, 15558827573596, 15562736959836, 15562729226588, 15558849167708, 15558872531292, 15150387855708, 15150547239260, 15562756227420, 15164671459676, 15202464006492, 15202467709276, 15630380335452, 15166066917724, 15187271319900, 15626535403868, 15187287179612, 15187306742108, 15202044805468, 15202457092444, 15203463692636, 15203468673372, 15566029357404, 15566030766428, 15178899587420, 15566028964188, 15165111468380, 15521611219292, 15521627996508, 15203452420444, 15203433808220, 15203426009436, 15150233485660, 15165110944092, 15566030143836, 15165132570972, 15571176259932, 15521636680028, 15521646575964, 15131706032476, 15521656471900, 15521649918300, 15163423261020, 15150551728476, 15521625669980, 15202471215452, 15202481635676, 15202476786012, 15166040801628, 15180426936668, 15150994751836, 15150253146460, 15150251802972, 15032817353052, 15032812896604, 15630973403484, 15166045258076, 15137910915420, 15147771199836, 15566026735964, 15566017757532, 15566007337308, 15137979498844, 15150160118108, 15180697928028, 15164638822748, 15164642427228, 15454802084188, 15484397388124, 15163534049628, 15484221030748, 15158885122396, 15164481339740, 15164463743324, 15473067524444, 15157691646300, 15456485081436, 15456417972572, 15268861903196, 15456079708508, 15456294535516, 15365702680924, 15494370722140, 15456440287580, 15164411445596, 15485208658268, 15164443820380, 15158870638940, 15375457190236, 15476698546524, 15164424913244, 15208144175452, 15164506112348, 14937860637020]

SESSION = None
if RMBG:
    from rembg import new_session
    SESSION = new_session("u2netp")  # klein + schnell, gute Produkt-Freistellung


def gql(query, variables=None, attempt=0):
    r = requests.post(
        f"https://{DOMAIN}/admin/api/{API}/graphql.json",
        headers={"Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN},
        json={"query": query, "variables": variables or {}},
        timeout=60,
    )
    if r.status_code == 429 and attempt < 6:
        time.sleep(2 * (attempt + 1))
        return gql(query, variables, attempt + 1)
    r.raise_for_status()
    d = r.json()
    if d.get("errors"):
        if "THROTTLED" in str(d["errors"]).upper() and attempt < 6:
            time.sleep(2 * (attempt + 1))
            return gql(query, variables, attempt + 1)
        raise RuntimeError(str(d["errors"]))
    return d["data"]


PRODUCT_Q = """
query($id: ID!) {
  product(id: $id) {
    id title
    options(first: 3) { name position optionValues { name } }
    media(first: 50) { nodes { ... on MediaImage { id alt } } }
    variants(first: 100) {
      nodes { selectedOptions { name value } media(first: 1) { nodes { ... on MediaImage { image { url } } } } }
    }
  }
}"""


def color_images(p):
    opts = p["options"]
    opt1 = next((o for o in opts if o["position"] == 1), opts[0])
    order = [v["name"] for v in opt1["optionValues"]]
    by = {}
    for v in p["variants"]["nodes"]:
        color = next((o["value"] for o in v["selectedOptions"] if o["name"] == opt1["name"]), None)
        nodes = v["media"]["nodes"]
        url = nodes[0]["image"]["url"] if nodes and nodes[0].get("image") else None
        if color and url and color not in by:
            by[color] = url
    return order, [by[c] for c in order if c in by]


def cell_image(raw):
    """Freistellen -> weiss, contain in CELL x CELL auf weiss."""
    src = raw
    if RMBG:
        try:
            from rembg import remove
            src = remove(raw, session=SESSION)  # PNG-Bytes mit Alpha
        except Exception as e:
            print(f"   ! Freistellen fehlgeschlagen, Original: {str(e)[:80]}")
            src = raw
    im = Image.open(io.BytesIO(src))
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        im = bg
    else:
        im = im.convert("RGB")
    im.thumbnail((CELL, CELL), Image.LANCZOS)
    cell = Image.new("RGB", (CELL, CELL), (255, 255, 255))
    cell.paste(im, ((CELL - im.width) // 2, (CELL - im.height) // 2))
    return cell


def build_montage(urls):
    n = len(urls)
    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    canvas = Image.new("RGB", (cols * CELL, rows * CELL), (255, 255, 255))
    for i, u in enumerate(urls):
        uu = u + ("&" if "?" in u else "?") + f"width={CELL}"
        resp = requests.get(uu, timeout=60)
        resp.raise_for_status()
        cell = cell_image(resp.content)
        canvas.paste(cell, ((i % cols) * CELL, (i // cols) * CELL))
    out = io.BytesIO()
    canvas.save(out, format="JPEG", quality=82)
    return out.getvalue()


def upload(data, filename):
    d = gql(
        "mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}",
        {"input": [{"filename": filename, "mimeType": "image/jpeg", "httpMethod": "POST", "resource": "IMAGE"}]},
    )
    t = d["stagedUploadsCreate"]["stagedTargets"][0]
    form = {p["name"]: p["value"] for p in t["parameters"]}
    up = requests.post(t["url"], data=form, files={"file": (filename, data, "image/jpeg")}, timeout=120)
    up.raise_for_status()
    return t["resourceUrl"]


def process_one(pid):
    product = gql(PRODUCT_Q, {"id": f"gid://shopify/Product/{pid}"})["product"]
    if not product:
        print(f"- {pid} nicht gefunden"); return "SKIP"
    existing = [m for m in product["media"]["nodes"] if MARKER in (m.get("alt") or "")]
    if existing and not REBUILD:
        print(f"- {product['title']} - hat schon Kombi-Bild"); return "SKIP"
    order, images = color_images(product)
    opt1 = next((o for o in product["options"] if o["position"] == 1), product["options"][0])
    if opt1["name"] != "Farbe" or len(images) < 2:
        print(f"- {product['title']} - keine Farb-Option/<2 Bilder"); return "SKIP"
    print(f"> {product['title']} - {len(images)} Farben: {', '.join(order)}")
    if DRY_RUN:
        return "PLANNED"
    if existing:
        gql("mutation($id:ID!,$mediaIds:[ID!]!){productDeleteMedia(productId:$id,mediaIds:$mediaIds){deletedMediaIds mediaUserErrors{message}}}",
            {"id": product["id"], "mediaIds": [m["id"] for m in existing]})
        print(f"   ~ altes Kombi-Bild geloescht ({len(existing)})")
    data = build_montage(images)
    src = upload(data, f"farbuebersicht-{pid}.jpg")
    alt = f"{product['title']} {MARKER} {' '.join(order)}"
    cr = gql("mutation($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){media{... on MediaImage{id}} mediaUserErrors{message}}}",
             {"productId": product["id"], "media": [{"originalSource": src, "alt": alt, "mediaContentType": "IMAGE"}]})
    errs = cr["productCreateMedia"]["mediaUserErrors"]
    if errs:
        print(f"   x {errs}"); return "ERROR"
    mid = cr["productCreateMedia"]["media"][0]["id"]
    time.sleep(0.8)
    gql("mutation($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){mediaUserErrors{message}}}",
        {"id": product["id"], "moves": [{"id": mid, "newPosition": "0"}]})
    print(f"   ok Kombi-Bild gesetzt ({len(images)} Farben, freigestellt={RMBG})")
    return "DONE"


def main():
    print(f"=== Kombi-Vorschaubilder (Python) === DRY_RUN={DRY_RUN} RMBG={RMBG} REBUILD={REBUILD} ONLY={len(ONLY)} LIMIT={LIMIT}")
    ids = [i for i in MASTERS if not ONLY or i in ONLY]
    if LIMIT:
        ids = ids[:LIMIT]
    c = {"DONE": 0, "PLANNED": 0, "SKIP": 0, "ERROR": 0}
    for pid in ids:
        try:
            c[process_one(pid)] += 1
        except Exception as e:
            c["ERROR"] += 1
            print(f"x {pid}: {str(e)[:200]}")
        time.sleep(0.3)
    print(f"\n=== Fertig === Erstellt: {c['DONE']}  Geplant: {c['PLANNED']}  Uebersprungen: {c['SKIP']}  Fehler: {c['ERROR']}")


if __name__ == "__main__":
    main()
