// uvp-tool.mjs  —  Schöler&Micke-Katalog UVP -> Shopify compareAtPrice
//
// Vorbereitung (einmalig), im Ordner tools/:
//   npm install            # installiert pdfjs-dist, csv-stringify, csv-parse (siehe package.json)
//
// Umgebungsvariablen setzen (Token NICHT ins Script schreiben):
//   export SHOP=e7ee88-2.myshopify.com
//   export TOKEN=shpat_xxx           # Admin-API-Token mit read_products + write_products
//
// STUFE 1 – nur lesen, Prüf-CSV erzeugen:
//   node uvp-tool.mjs match ./SuM-Katalog-2025.pdf
//   -> erzeugt uvp-review.csv   (NICHTS wird geschrieben)
//
// STUFE 2 – nach manueller Prüfung der CSV die UVPs setzen:
//   node uvp-tool.mjs apply ./uvp-review.csv
//   -> setzt compareAtPrice nur für Zeilen mit setzen=ja (und nur wenn UVP > aktueller VK)

import fs from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { stringify } from "csv-stringify/sync";
import { parse } from "csv-parse/sync";

const SHOP = process.env.SHOP;
const TOKEN = process.env.TOKEN;
const API = `https://${SHOP}/admin/api/2025-01/graphql.json`;

if (!SHOP || !TOKEN) { console.error("SHOP und TOKEN müssen gesetzt sein."); process.exit(1); }

// Round-trip-sichere Preis-Zahl. Akzeptiert "64.95", "64,95" und "1.234,56".
function toNum(s) {
  let t = String(s ?? "").trim();
  if (t === "") return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); // dt.: Punkt=Tausender, Komma=Dezimal
  return parseFloat(t);
}

/* ---------- Shopify GraphQL Helper (mit Throttle-Retry) ---------- */
async function gql(query, variables = {}) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json();
    if (j.errors && JSON.stringify(j.errors).includes("THROTTLED") && attempt < 8) {
      await new Promise(s => setTimeout(s, 2000 * (attempt + 1))); continue;
    }
    if (j.errors) throw new Error(JSON.stringify(j.errors));
    return j.data;
  }
}

/* ---------- Normalisierung für den Namensabgleich ---------- */
// Kleinschreibung, Akzente/Sonderzeichen weg, Mehrfach-Leerzeichen weg.
function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
// Token-Set für tolerantes Matching (Reihenfolge egal)
function tokens(s) { return new Set(norm(s).split(" ").filter(Boolean)); }
// Jaccard-Ähnlichkeit zweier Token-Mengen (0..1)
function sim(aSet, bSet) {
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  return inter / (aSet.size + bSet.size - inter || 1);
}

/* ---------- PDF -> Textzeilen ---------- */
// Wir rekonstruieren Zeilen anhand der y-Position der Textfragmente.
async function pdfLines(path) {
  const data = new Uint8Array(fs.readFileSync(path));
  const doc = await getDocument({ data }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map(); // y (gerundet) -> [{x, str}]
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);   // vertikale Position
      const x = it.transform[4];                // horizontale Position
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x, str: it.str });
    }
    // y absteigend (oben->unten), innerhalb der Zeile x aufsteigend (links->rechts)
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const parts = rows.get(y).sort((a, b) => a.x - b.x).map(o => o.str);
      const line = parts.join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push({ page: p, line });
    }
  }
  return lines;
}

/* ---------- Preis-Parsing ---------- */
// Findet den LETZTEN Geldbetrag in einer Zeile (Katalog: Name … UVP rechts).
// Deutsche Schreibweise: 1.234,56 oder 64,95.  Gibt Zahl als String "64.95" zurück.
function lastPrice(line) {
  const matches = [...line.matchAll(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\b/g)];
  if (!matches.length) return null;
  const m = matches[matches.length - 1];
  const euros = m[1].replace(/\./g, "");
  return `${euros}.${m[2]}`;
}
// Name = Zeile ohne den/die Geldbeträge und ohne führende Artikelnummern
function nameFromLine(line) {
  return line
    .replace(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\b/g, " ")  // Preise raus
    .replace(/\b\d{5,}\b/g, " ")                            // lange Artikelnummern raus
    .replace(/\s+/g, " ").trim();
}

/* ---------- Shopify: alle Produkte laden ---------- */
async function loadShopProducts() {
  const out = [];
  let cursor = null;
  do {
    const d = await gql(`
      query($cursor: String) {
        products(first: 100, after: $cursor) {
          nodes {
            id title vendor
            variants(first: 100) { nodes { id price compareAtPrice } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`, { cursor });
    for (const p of d.products.nodes) out.push(p);
    cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
    process.stdout.write(`\rShop-Produkte geladen: ${out.length}`);
  } while (cursor);
  console.log("");
  return out;
}

/* ====================== STUFE 1: MATCH ====================== */
async function runMatch(pdfPath) {
  if (!fs.existsSync(pdfPath)) { console.error(`PDF nicht gefunden: ${pdfPath}`); process.exit(1); }

  console.log("Lese PDF …");
  const lines = await pdfLines(pdfPath);

  // Katalog-Kandidaten: Zeilen mit Name UND Preis
  const catalog = [];
  for (const { page, line } of lines) {
    const price = lastPrice(line);
    if (!price) continue;
    const name = nameFromLine(line);
    if (norm(name).split(" ").filter(Boolean).length < 2) continue; // zu wenig Name -> skip
    catalog.push({ page, name, uvp: price, tokens: tokens(name), raw: line });
  }
  console.log(`Katalog-Zeilen mit Preis: ${catalog.length}`);

  console.log("Lade Shopify-Produkte …");
  const products = await loadShopProducts();

  // Für jedes Shop-Produkt die beste Katalogzeile suchen
  const rows = [];
  for (const p of products) {
    const pTok = tokens(p.title); // enthält schon die Marke
    let best = null, bestScore = 0, second = 0;
    for (const c of catalog) {
      const sc = sim(pTok, c.tokens);
      if (sc > bestScore) { second = bestScore; bestScore = sc; best = c; }
      else if (sc > second) { second = sc; }
    }
    const v0 = p.variants.nodes[0];
    const curCompare = v0?.compareAtPrice ?? null;
    const curPrice = v0?.price ?? "";
    const hatBereitsUVP = curCompare && curCompare !== "0.00";

    const uvpNum = best ? toNum(best.uvp) : 0;
    const vkNum = toNum(curPrice) || 0;

    // Empfehlung "ja" nur, wenn: sicher genug & eindeutig & noch keine echte UVP
    // & die neue UVP wirklich ÜBER dem aktuellen VK liegt (sonst kein/komischer Angebotsstrich).
    const sicher = bestScore >= 0.6 && (bestScore - second) >= 0.15 && uvpNum > vkNum;
    rows.push({
      setzen: (sicher && !hatBereitsUVP) ? "ja" : "PRUEFEN",
      score: bestScore.toFixed(2),
      abstand_zu_2: (bestScore - second).toFixed(2),
      shop_titel: p.title,
      vendor: p.vendor,
      aktueller_vk: curPrice,
      aktuelle_uvp: curCompare ?? "",
      neue_uvp: best ? best.uvp : "",
      katalog_name: best ? best.name : "",
      katalog_seite: best ? best.page : "",
      product_id: p.id,
      variant_ids: p.variants.nodes.map(v => v.id).join("|"),
    });
  }

  // Sortierung: erst die zum Prüfen, dann nach Score
  rows.sort((a, b) =>
    (a.setzen === b.setzen ? 0 : a.setzen === "PRUEFEN" ? -1 : 1) ||
    (a.score - b.score));

  fs.writeFileSync("uvp-review.csv", stringify(rows, { header: true }));
  const ja = rows.filter(r => r.setzen === "ja").length;
  console.log(`\nFertig. uvp-review.csv geschrieben.`);
  console.log(`  ${rows.length} Produkte gesamt`);
  console.log(`  ${ja} mit Empfehlung "ja" (sicheres, eindeutiges Match, UVP > VK, noch ohne UVP)`);
  console.log(`  ${rows.length - ja} auf "PRUEFEN" (unsicher / mehrdeutig / hat schon UVP / UVP <= VK)`);
  console.log(`\nJetzt CSV öffnen, Spalte "setzen" prüfen:`);
  console.log(`  - "ja"  -> wird gesetzt`);
  console.log(`  - alles andere wird ÜBERSPRUNGEN. Zum Setzen manuell auf "ja" ändern.`);
  console.log(`  - WICHTIG: CSV als Text bearbeiten; "neue_uvp" mit Punkt ODER Komma ist ok (apply parst beides).`);
  console.log(`Dann: node uvp-tool.mjs apply ./uvp-review.csv`);
}

/* ====================== STUFE 2: APPLY ====================== */
async function runApply(csvPath) {
  if (!fs.existsSync(csvPath)) { console.error(`CSV nicht gefunden: ${csvPath}`); process.exit(1); }

  const rows = parse(fs.readFileSync(csvPath), { columns: true });
  const toSet = rows.filter(r => (r.setzen || "").trim().toLowerCase() === "ja" && r.neue_uvp);
  console.log(`${toSet.length} Produkte markiert (setzen=ja) von ${rows.length} Zeilen.`);

  const M = `
    mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }`;

  let ok = 0, errors = 0, skipped = 0;
  for (const r of toSet) {
    const uvp = toNum(r.neue_uvp);       // round-trip-sicher (Komma/Punkt)
    const vk = toNum(r.aktueller_vk);    // kann leer sein -> NaN

    // Sicherheits-Check: gültige UVP, und (falls VK bekannt) UVP echt darüber.
    if (!(uvp > 0)) { skipped++; console.log(`\nÜberspringe (UVP ungültig): ${r.shop_titel} -> "${r.neue_uvp}"`); continue; }
    if (Number.isFinite(vk) && !(uvp > vk)) { skipped++; console.log(`\nÜberspringe (UVP ${uvp} <= VK ${vk}): ${r.shop_titel}`); continue; }

    const compareAtPrice = uvp.toFixed(2);
    const variants = (r.variant_ids || "").split("|").filter(Boolean)
      .map(id => ({ id, compareAtPrice }));
    if (!variants.length) { skipped++; console.log(`\nÜberspringe (keine variant_ids): ${r.shop_titel}`); continue; }

    const d = await gql(M, { productId: r.product_id, variants });
    const ue = d.productVariantsBulkUpdate.userErrors;
    if (ue.length) { errors++; console.log(`\nFehler ${r.shop_titel}:`, ue); }
    else { ok++; }
    if ((ok + errors) % 25 === 0) process.stdout.write(`\rGesetzt: ${ok}  Fehler: ${errors}`);
  }
  console.log(`\nFertig. Gesetzt: ${ok}, Fehler: ${errors}, übersprungen: ${skipped}.`);
}

/* ---------- CLI ---------- */
const [, , cmd, file] = process.argv;
if (cmd === "match" && file) await runMatch(file);
else if (cmd === "apply" && file) await runApply(file);
else { console.log('Aufruf:\n  node uvp-tool.mjs match ./SuM-Katalog-2025.pdf\n  node uvp-tool.mjs apply ./uvp-review.csv'); }
