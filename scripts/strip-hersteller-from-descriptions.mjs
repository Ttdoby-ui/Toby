#!/usr/bin/env node
/**
 * Entfernt den redundanten Hersteller-/Kontaktblock aus den Produkt-
 * Beschreibungen (descriptionHtml). Die GPSR-Pflichtangaben werden bereits
 * separat ueber den Theme-Block "Hersteller-Info" (Metafeld custom.hersteller
 * -> Metaobjekt) angezeigt, der Text in der Beschreibung ist also doppelt.
 *
 * Anker: das erste Element, dessen Text mit "Hersteller:" beginnt. Es wird
 * (inkl. der direkt folgenden Geschwister = Adresse/E-Mail/Telefon) entfernt,
 * danach werden leere Wrapper aufgeraeumt. DOM-basiert -> bleibt valide.
 *
 * Idempotent: laeuft mehrfach; Produkte ohne Hersteller-Block bleiben unberuehrt.
 *
 * Env:
 *   SHOPIFY_STORE_DOMAIN  z. B. e7ee88-2.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN  Store-Admin-Token (read_products, write_products)
 *   DRY_RUN               "true" => nichts schreiben, nur zaehlen + Beispiele
 *   LIMIT                 optional, max. Anzahl zu aendernder Produkte (Test)
 *   QUERY                 optional, Shopify-Produktfilter (Default: alle)
 */

import { parse } from 'node-html-parser';

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';
const DRY_RUN = (process.env.DRY_RUN || '').toLowerCase() === 'true';
const LIMIT = process.env.LIMIT && parseInt(process.env.LIMIT, 10) > 0
  ? parseInt(process.env.LIMIT, 10)
  : Infinity;
const QUERY = process.env.QUERY || '';

const HERSTELLER_RE = /^\s*Hersteller\s*:/i;

/**
 * Entfernt den Hersteller-Block aus einem descriptionHtml.
 * @returns {string|null} neues HTML oder null (keine Aenderung)
 */
export function stripHersteller(html) {
  if (!html || !/Hersteller\s*:/i.test(html)) return null;
  const root = parse(html, { comment: true });

  // 1) erstes Element finden, dessen (normalisierter) Text mit "Hersteller:" beginnt
  let target = null;
  for (const el of root.querySelectorAll('*')) {
    const t = (el.text || '').replace(/\s+/g, ' ').trim();
    if (HERSTELLER_RE.test(t)) { target = el; break; }
  }
  if (!target) return null;

  // 2) zum obersten Block-Element hochklettern, dessen Text noch mit
  //    "Hersteller:" beginnt (faengt <p><span>Hersteller:...</span></p> ab)
  let node = target;
  while (
    node.parentNode &&
    node.parentNode !== root &&
    HERSTELLER_RE.test((node.parentNode.text || '').replace(/\s+/g, ' ').trim())
  ) {
    node = node.parentNode;
  }

  // 3) node + alle nachfolgenden Geschwister entfernen (Adresse/E-Mail/Telefon)
  const parent = node.parentNode;
  if (!parent) return null;
  const sibs = parent.childNodes;
  const startIdx = sibs.indexOf(node);
  if (startIdx < 0) return null;
  for (let i = sibs.length - 1; i >= startIdx; i--) sibs[i].remove();

  // 4) leer gewordene Wrapper nach oben aufraeumen (importierte div-Verschachtelung)
  let p = parent;
  while (p && p !== root) {
    const txt = (p.text || '').replace(/\s+/g, '').trim();
    const media = p.querySelector && p.querySelector('img,video,iframe,svg');
    if (txt === '' && !media) {
      const up = p.parentNode;
      p.remove();
      p = up;
    } else break;
  }

  return root.toString().trim();
}

// ------- ab hier nur fuer den echten Lauf (mit Shopify-Verbindung) -------

async function gql(query, variables = {}) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': ACCESS_TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors, null, 2));
  return data.data;
}

async function* allProducts() {
  let cursor = null;
  do {
    const data = await gql(
      `query($after: String, $q: String) {
        products(first: 100, after: $after, query: $q) {
          nodes { id title descriptionHtml }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after: cursor, q: QUERY || null }
    );
    for (const n of data.products.nodes) yield n;
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);
}

async function updateDescription(id, descriptionHtml) {
  const data = await gql(
    `mutation($input: ProductInput!) {
      productUpdate(input: $input) { product { id } userErrors { field message } }
    }`,
    { input: { id, descriptionHtml } }
  );
  const errs = data.productUpdate.userErrors;
  if (errs && errs.length) throw new Error(JSON.stringify(errs));
}

async function main() {
  if (!SHOPIFY_DOMAIN || !ACCESS_TOKEN) {
    console.error('ERROR: SHOPIFY_STORE_DOMAIN und SHOPIFY_ACCESS_TOKEN muessen gesetzt sein.');
    process.exit(1);
  }
  console.log(`Modus: ${DRY_RUN ? 'DRY_RUN (nichts wird geschrieben)' : 'LIVE (Produkte werden aktualisiert)'}`);
  let scanned = 0, changed = 0, samples = 0;
  for await (const p of allProducts()) {
    scanned++;
    const next = stripHersteller(p.descriptionHtml);
    if (next == null || next === (p.descriptionHtml || '').trim()) continue;
    changed++;
    if (samples < 5) {
      samples++;
      console.log(`\n--- ${p.title} (${p.id}) ---`);
      console.log('ENTFERNT (Ende vorher):', (p.descriptionHtml || '').slice(-220).replace(/\s+/g, ' '));
      console.log('NEU (Ende nachher):    ', next.slice(-220).replace(/\s+/g, ' '));
    }
    if (!DRY_RUN) {
      await updateDescription(p.id, next);
      await new Promise((r) => setTimeout(r, 120)); // throttle
    }
    if (changed >= LIMIT) { console.log(`\nLIMIT ${LIMIT} erreicht – Stop.`); break; }
  }
  console.log(`\nFertig. Gescannt: ${scanned}, mit Hersteller-Block (geaendert${DRY_RUN ? ' werden wuerden' : ''}): ${changed}.`);
}

// Nur ausfuehren, wenn direkt gestartet (nicht beim Import im Test)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
