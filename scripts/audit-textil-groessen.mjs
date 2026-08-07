#!/usr/bin/env node
/**
 * Textil-Größen-Audit: welche Größen ein Artikel EINMAL hatte und heute NICHT mehr.
 *
 * HINTERGRUND
 * Bei vielen Textilien fehlen plötzlich Größen (mal nur 4XL, mal alles außer
 * einer einzigen Größe). Shopify führt für gelöschte Varianten KEIN Protokoll –
 * `Product.events` kennt nur Produkt-/Kanal-Ereignisse, Varianten-Löschungen
 * tauchen dort nicht auf. Es gibt aber zwei unabhängige Spuren, die überleben:
 *
 *   1. Das Taxonomie-Metafeld `shopify.size` (Liste von `shopify--size`-
 *      Metaobjekten). Shopify füllt es beim Kategorisieren des Produkts und
 *      räumt es NICHT auf, wenn später Varianten verschwinden. Beispiel:
 *      „Xiom Shirt Bentley" listet dort XS…4XL, hat heute aber nur noch 2XL.
 *      → verlässlicher Abzug des ursprünglichen Größenlaufs.
 *   2. Bestellpositionen. `lineItem.variantTitle` bleibt erhalten, auch wenn
 *      die Variante später gelöscht wird (`lineItem.variant` ist dann null).
 *      → harter Beweis, dass es die Größe gab, inklusive Datum.
 *
 * Das Skript vergleicht beide Spuren mit dem heutigen Variantenbestand und
 * meldet je Artikel die fehlenden Größen. Rein LESEND – es schreibt nichts.
 *
 * Env:
 *   SHOPIFY_STORE_DOMAIN  z. B. e7ee88-2.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN  Store-Admin-Token (read_products, read_orders)
 *   TEXTIL_TAG            optional, Default: Textil
 *   SCAN_ORDERS           optional "false" → Bestellhistorie überspringen
 *   ORDERS_SINCE          optional ISO-Datum, Default: 2025-01-01
 *   OUT                   optional Pfad für den JSON-Report
 */

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';
const TEXTIL_TAG = (process.env.TEXTIL_TAG || 'Textil').trim();
const SCAN_ORDERS = (process.env.SCAN_ORDERS || 'true').toLowerCase() !== 'false';
const ORDERS_SINCE = (process.env.ORDERS_SINCE || '2025-01-01').trim();
const OUT = process.env.OUT || 'textil-groessen-audit.json';

if (!SHOPIFY_DOMAIN || !ACCESS_TOKEN) {
  console.error('ERROR: SHOPIFY_STORE_DOMAIN und SHOPIFY_ACCESS_TOKEN müssen gesetzt sein.');
  process.exit(1);
}

async function gql(query, variables = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': ACCESS_TOKEN },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429 && attempt < 6) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.errors) {
      const throttled = JSON.stringify(data.errors).includes('THROTTLED');
      if (throttled && attempt < 6) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw new Error(JSON.stringify(data.errors, null, 2));
    }
    // Freiwillig drosseln, wenn der Kostenpuffer knapp wird.
    const cost = data.extensions && data.extensions.cost;
    if (cost && cost.throttleStatus && cost.throttleStatus.currentlyAvailable < 200) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    return data.data;
  }
}

/** Sortierreihenfolge für Konfektionsgrößen; Unbekanntes hinten, alphabetisch. */
const SIZE_ORDER = [
  '4XS', '3XS', '2XS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL', '6XL',
];
function sizeRank(s) {
  const i = SIZE_ORDER.indexOf(s.toUpperCase());
  if (i >= 0) return i;
  const n = Number(s);
  return Number.isFinite(n) ? 1000 + n : 2000;
}
function sortSizes(arr) {
  return [...arr].sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b));
}
/** „XXL" und „2XL" meinen dasselbe – für den Vergleich vereinheitlichen. */
function normSize(s) {
  const t = String(s).trim().toUpperCase();
  return t === 'XXL' ? '2XL' : t === 'XXXL' ? '3XL' : t;
}

/** id → Label aller `shopify--size`-Metaobjekte. */
async function loadSizeMetaobjects() {
  const map = new Map();
  let cursor = null;
  do {
    const d = await gql(
      `query($after:String){ metaobjects(type:"shopify--size", first:100, after:$after){
         pageInfo{ hasNextPage endCursor } nodes{ id displayName } } }`,
      { after: cursor },
    );
    for (const n of d.metaobjects.nodes) map.set(n.id, n.displayName);
    cursor = d.metaobjects.pageInfo.hasNextPage ? d.metaobjects.pageInfo.endCursor : null;
  } while (cursor);
  return map;
}

/** Alle aktiven Textilien mit heutigen Optionen + Taxonomie-Größenmetafeld. */
async function loadTextiles() {
  const out = [];
  let cursor = null;
  do {
    const d = await gql(
      `query($q:String!,$after:String){ products(first:50, query:$q, after:$after){
         pageInfo{ hasNextPage endCursor }
         nodes{ id title handle vendor status createdAt updatedAt
                variantsCount{ count }
                sizeMf: metafield(namespace:"shopify", key:"size"){ value }
                options{ name values } } } }`,
      { q: `tag:${TEXTIL_TAG} AND status:active`, after: cursor },
    );
    out.push(...d.products.nodes);
    cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

/**
 * Bestellhistorie: je Produkt die Größen-Token aus `variantTitle`, mit
 * jüngster Bestellung. `variantTitle` sieht z. B. so aus: „M / Schwarz".
 * Welcher Teil die Größe ist, entscheidet der Abgleich gegen die bekannten
 * Größen-Labels – die Reihenfolge der Optionen ist je Produkt verschieden.
 */
async function scanOrders(knownSizes) {
  const perProduct = new Map(); // productId → Map(size → {order, date, count})
  let cursor = null;
  let orders = 0;
  do {
    const d = await gql(
      `query($q:String!,$after:String){ orders(first:25, query:$q, sortKey:CREATED_AT, after:$after){
         pageInfo{ hasNextPage endCursor }
         nodes{ id name createdAt
                lineItems(first:100){ nodes{ variantTitle product{ id } } } } } }`,
      { q: `created_at:>=${ORDERS_SINCE}`, after: cursor },
    );
    for (const o of d.orders.nodes) {
      orders++;
      for (const li of o.lineItems.nodes) {
        if (!li.product || !li.variantTitle) continue;
        for (const rawPart of String(li.variantTitle).split('/')) {
          const part = normSize(rawPart);
          if (!knownSizes.has(part)) continue;
          if (!perProduct.has(li.product.id)) perProduct.set(li.product.id, new Map());
          const m = perProduct.get(li.product.id);
          const prev = m.get(part);
          if (!prev || o.createdAt > prev.date) {
            m.set(part, { order: o.name, date: o.createdAt, count: (prev ? prev.count : 0) + 1 });
          } else {
            prev.count++;
          }
        }
      }
    }
    cursor = d.orders.pageInfo.hasNextPage ? d.orders.pageInfo.endCursor : null;
    if (orders % 500 === 0) console.log(`   … ${orders} Bestellungen gelesen`);
  } while (cursor);
  console.log(`   ${orders} Bestellungen gelesen (seit ${ORDERS_SINCE}).`);
  return perProduct;
}

function pickSizeOption(options, knownSizes) {
  const byName = options.find((o) => /gr(ö|oe)ße|size/i.test(o.name));
  if (byName) return byName;
  // Fallback: die Option, deren Werte am ehesten Größen sind.
  let best = null, bestHits = 0;
  for (const o of options) {
    const hits = o.values.filter((v) => knownSizes.has(normSize(v))).length;
    if (hits > bestHits) { best = o; bestHits = hits; }
  }
  return bestHits > 0 ? best : null;
}

(async () => {
  console.log('▶ Größen-Metaobjekte laden …');
  const sizeMap = await loadSizeMetaobjects();
  const knownSizes = new Set([...sizeMap.values()].map(normSize));
  console.log(`   ${sizeMap.size} Metaobjekte, ${knownSizes.size} verschiedene Größen-Labels.`);

  console.log(`▶ Aktive Produkte mit Tag "${TEXTIL_TAG}" laden …`);
  const products = await loadTextiles();
  console.log(`   ${products.length} Produkte.`);

  let orderSizes = new Map();
  if (SCAN_ORDERS) {
    console.log('▶ Bestellhistorie scannen (Beweis für gelöschte Größen) …');
    orderSizes = await scanOrders(knownSizes);
  } else {
    console.log('▶ Bestellhistorie übersprungen (SCAN_ORDERS=false).');
  }

  const report = [];
  for (const p of products) {
    const opt = pickSizeOption(p.options, knownSizes);
    const heute = new Set((opt ? opt.values : []).map(normSize));

    const taxo = new Set();
    if (p.sizeMf && p.sizeMf.value) {
      let ids = [];
      try { ids = JSON.parse(p.sizeMf.value); } catch { ids = []; }
      for (const id of ids) {
        const label = sizeMap.get(id);
        if (label) taxo.add(normSize(label));
      }
    }

    const bestellt = orderSizes.get(p.id) || new Map();

    const fehlt = new Map(); // size → Quelle(n)
    for (const s of taxo) if (!heute.has(s)) fehlt.set(s, { taxonomie: true });
    for (const [s, info] of bestellt) {
      if (heute.has(s)) continue;
      const e = fehlt.get(s) || {};
      e.bestellung = { letzte: info.order, am: info.date.slice(0, 10), anzahl: info.count };
      fehlt.set(s, e);
    }
    if (!fehlt.size) continue;

    report.push({
      id: p.id,
      titel: p.title,
      handle: p.handle,
      marke: p.vendor,
      variantenHeute: p.variantsCount.count,
      groessenOption: opt ? opt.name : null,
      heute: sortSizes([...heute]),
      fehlt: sortSizes([...fehlt.keys()]).map((s) => ({ groesse: s, ...fehlt.get(s) })),
      angelegt: p.createdAt,
      zuletztGeaendert: p.updatedAt,
    });
  }

  // Schwerste Fälle zuerst.
  report.sort((a, b) => b.fehlt.length - a.fehlt.length || a.titel.localeCompare(b.titel));

  console.log(`\n════════ ERGEBNIS: ${report.length} von ${products.length} Textilien haben verlorene Größen ════════\n`);
  for (const r of report) {
    const belegt = r.fehlt.filter((f) => f.bestellung);
    console.log(`${r.titel}  [${r.marke}]  (${r.variantenHeute} Varianten heute)`);
    console.log(`   heute:  ${r.heute.join(', ') || '—'}`);
    console.log(`   fehlt:  ${r.fehlt.map((f) => f.groesse).join(', ')}`);
    for (const f of belegt) {
      console.log(`           ↳ ${f.groesse} nachweislich verkauft, zuletzt ${f.bestellung.letzte} am ${f.bestellung.am} (${f.bestellung.anzahl}×)`);
    }
    console.log(`   Produkt zuletzt geändert: ${r.zuletztGeaendert}`);
    console.log('');
  }

  const belegteFaelle = report.filter((r) => r.fehlt.some((f) => f.bestellung));
  console.log('──────── Zusammenfassung ────────');
  console.log(`Textilien gesamt (aktiv, Tag ${TEXTIL_TAG}): ${products.length}`);
  console.log(`Mit verlorenen Größen:                       ${report.length}`);
  console.log(`Davon per Bestellung hart belegt:            ${belegteFaelle.length}`);
  console.log(`Verlorene Größen insgesamt:                  ${report.reduce((a, r) => a + r.fehlt.length, 0)}`);

  const fs = await import('node:fs/promises');
  await fs.writeFile(OUT, JSON.stringify({ erstellt: new Date().toISOString(), report }, null, 2));
  console.log(`\nReport geschrieben: ${OUT}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
