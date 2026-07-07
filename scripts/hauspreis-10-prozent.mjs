#!/usr/bin/env node
/**
 * Hauspreis: alle aktiven Artikel dauerhaft um 10 % reduzieren, abgerundet auf
 * das nächste x,90, und die bisherige UVP als Vergleichspreis eintragen.
 * Direkt im Artikel (kein Rabatt).
 *
 * Regeln:
 *   - Neuer Preis  = floor_auf_x.90( aktueller Preis × (1 − PCT/100) ).
 *       Bsp. 56,00 → 50,40 → 49,90.
 *   - Vergleichspreis = bisheriger Preis (UVP).
 *   - ÜBERSPRUNGEN:
 *       • Varianten mit bereits gesetztem Vergleichspreis (= schon reduziert).
 *       • Artikel unter MIN_PRICE (Default 10 €) – ,90-Abrundung wird dort unsauber.
 *       • Produkte der Vereinsbedarf-Kollektionen (EXCLUDE_COLLECTION_IDS).
 *       • Geschenkgutscheine.
 *   - Idempotent: ein 2. Lauf rührt bereits umgestellte Varianten nicht an
 *     (sie haben dann einen Vergleichspreis).
 *   - Geänderte Produkte bekommen den Tag HAUSPREIS_TAG ("Hauspreis") für das
 *     blaue Theme-Badge.
 *   - Rollback: schreibt ROLLBACK_FILE (variantId, alterPreis) – auch im Dry-Run.
 *       Zurücksetzen = Preis ← alterPreis, Vergleichspreis ← leer.
 *
 * Env:
 *   SHOPIFY_STORE_DOMAIN   z. B. e7ee88-2.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN   Store-Admin-Token (write_products)
 *   DRY_RUN                "true" → nichts schreiben, nur berechnen/reporten (Default true)
 *   MIN_PRICE              Untergrenze in EUR (Default 10)
 *   DISCOUNT_PCT           Prozent Nachlass (Default 10)
 *   EXCLUDE_COLLECTION_IDS Komma-getrennt (Default Vereinsbedarf + Sale-Vereinsbedarf)
 *   HAUSPREIS_TAG          Default "Hauspreis"
 *   LIMIT                  optional: max. Produkte verarbeiten (Test)
 *   ROLLBACK_FILE          Default "hauspreis-rollback.json"
 */

import { writeFileSync } from 'node:fs';

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';
const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
const MIN_PRICE = Number(process.env.MIN_PRICE ?? '10');
const DISCOUNT_PCT = Number(process.env.DISCOUNT_PCT ?? '10');
const HAUSPREIS_TAG = (process.env.HAUSPREIS_TAG || 'Hauspreis').trim();
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const ROLLBACK_FILE = process.env.ROLLBACK_FILE || 'hauspreis-rollback.json';
const EXCLUDE_COLLECTION_IDS = (
  process.env.EXCLUDE_COLLECTION_IDS ||
  'gid://shopify/Collection/664017830236,gid://shopify/Collection/691374326108'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!SHOPIFY_DOMAIN || !ACCESS_TOKEN) {
  console.error('ERROR: SHOPIFY_STORE_DOMAIN und SHOPIFY_ACCESS_TOKEN müssen gesetzt sein.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables = {}, attempt = 0) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': ACCESS_TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) {
    if (attempt >= 6) throw new Error('Zu oft gethrottelt (429).');
    await sleep(2000 * (attempt + 1));
    return gql(query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors) {
    const throttled = JSON.stringify(data.errors).toUpperCase().includes('THROTTLED');
    if (throttled && attempt < 6) {
      await sleep(2000 * (attempt + 1));
      return gql(query, variables, attempt + 1);
    }
    throw new Error(JSON.stringify(data.errors, null, 2));
  }
  return data.data;
}

/** Größtes n,90 ≤ value. */
function floorTo90(value) {
  const n = Math.floor(value - 0.9 + 1e-9);
  return n + 0.9;
}

/** Alle Produkt-IDs einer Kollektion (paginiert). */
async function collectionProductIds(collectionId) {
  const ids = new Set();
  let cursor = null;
  do {
    const data = await gql(
      `query($id: ID!, $after: String) {
        collection(id: $id) {
          products(first: 250, after: $after) { nodes { id } pageInfo { hasNextPage endCursor } }
        }
      }`,
      { id: collectionId, after: cursor }
    );
    const conn = data.collection?.products;
    if (!conn) {
      console.warn(`  ⚠️ Kollektion ${collectionId} nicht gefunden – übersprungen.`);
      break;
    }
    for (const n of conn.nodes) ids.add(n.id);
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor);
  return ids;
}

async function updateVariants(productId, variants) {
  const data = await gql(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }`,
    { productId, variants }
  );
  return data.productVariantsBulkUpdate.userErrors ?? [];
}

async function addTag(productId, tag) {
  const data = await gql(
    `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`,
    { id: productId, tags: [tag] }
  );
  return data.tagsAdd.userErrors ?? [];
}

(async () => {
  console.log('=== Hauspreis-Umstellung ===');
  console.log(`Modus:            ${DRY_RUN ? 'DRY-RUN (keine Änderungen)' : 'ECHT-LAUF (schreibt!)'}`);
  console.log(`Nachlass:         ${DISCOUNT_PCT} %  →  Abrunden auf x,90`);
  console.log(`Mindestpreis:     ab ${MIN_PRICE.toFixed(2)} €`);
  console.log(`Ausgeschlossen:   ${EXCLUDE_COLLECTION_IDS.length} Kollektion(en)`);
  console.log(`Tag:              ${HAUSPREIS_TAG}`);
  if (LIMIT !== Infinity) console.log(`Limit:            ${LIMIT} Produkte`);

  // 1) Ausgeschlossene Produkt-IDs sammeln.
  const excluded = new Set();
  for (const cid of EXCLUDE_COLLECTION_IDS) {
    const ids = await collectionProductIds(cid);
    ids.forEach((id) => excluded.add(id));
  }
  console.log(`\nAusgeschlossene Produkte (Vereinsbedarf): ${excluded.size}`);

  // 2) Alle aktiven Produkte durchgehen.
  const factor = 1 - DISCOUNT_PCT / 100;
  const stats = {
    productsScanned: 0,
    productsChanged: 0,
    variantsChanged: 0,
    skippedExcluded: 0,
    skippedGiftcard: 0,
    skippedReduced: 0,
    skippedUnderMin: 0,
    skippedNoChange: 0,
    errors: 0,
  };
  const rollback = []; // { variantId, oldPrice }
  const samples = [];
  let cursor = null;

  outer: do {
    const data = await gql(
      `query($after: String) {
        products(first: 50, after: $after, query: "status:active") {
          nodes {
            id title isGiftCard
            variants(first: 100) { nodes { id price compareAtPrice } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after: cursor }
    );
    const conn = data.products;
    for (const p of conn.nodes) {
      if (stats.productsScanned >= LIMIT) break outer;
      stats.productsScanned++;

      if (excluded.has(p.id)) { stats.skippedExcluded++; continue; }
      if (p.isGiftCard) { stats.skippedGiftcard++; continue; }

      const variantUpdates = [];
      for (const v of p.variants.nodes) {
        const price = Number(v.price);
        if (v.compareAtPrice != null && Number(v.compareAtPrice) > 0) { stats.skippedReduced++; continue; }
        if (!Number.isFinite(price) || price <= 0) { stats.skippedNoChange++; continue; }
        if (price < MIN_PRICE) { stats.skippedUnderMin++; continue; }

        const newPrice = floorTo90(price * factor);
        if (!(newPrice > 0) || newPrice >= price) { stats.skippedNoChange++; continue; }

        variantUpdates.push({ id: v.id, price: newPrice.toFixed(2), compareAtPrice: price.toFixed(2) });
        rollback.push({ variantId: v.id, oldPrice: price.toFixed(2) });
        if (samples.length < 20) {
          samples.push(`${p.title}: ${price.toFixed(2)} → ${newPrice.toFixed(2)} (UVP ${price.toFixed(2)})`);
        }
      }

      if (variantUpdates.length === 0) continue;
      stats.productsChanged++;
      stats.variantsChanged += variantUpdates.length;

      if (!DRY_RUN) {
        const errs = await updateVariants(p.id, variantUpdates);
        if (errs.length) { stats.errors++; console.warn(`  ⚠️ ${p.title}:`, JSON.stringify(errs)); continue; }
        const tagErrs = await addTag(p.id, HAUSPREIS_TAG);
        if (tagErrs.length) console.warn(`  ⚠️ Tag ${p.title}:`, JSON.stringify(tagErrs));
      }
    }
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    if (stats.productsScanned % 500 < 50) console.log(`  ...${stats.productsScanned} Produkte gescannt`);
  } while (cursor);

  // 3) Rollback-Datei schreiben (auch im Dry-Run – zeigt, was geändert würde).
  writeFileSync(ROLLBACK_FILE, JSON.stringify(rollback, null, 2));

  console.log('\n=== Ergebnis ===');
  console.log(`Produkte gescannt:        ${stats.productsScanned}`);
  console.log(`Produkte geändert:        ${stats.productsChanged}`);
  console.log(`Varianten geändert:       ${stats.variantsChanged}`);
  console.log(`— übersprungen (Vereinsbedarf):  ${stats.skippedExcluded}`);
  console.log(`— übersprungen (Gutschein):      ${stats.skippedGiftcard}`);
  console.log(`— Varianten schon reduziert:     ${stats.skippedReduced}`);
  console.log(`— Varianten unter ${MIN_PRICE} €:        ${stats.skippedUnderMin}`);
  console.log(`— Varianten ohne Änderung:       ${stats.skippedNoChange}`);
  console.log(`Fehler:                   ${stats.errors}`);
  console.log(`Rollback-Datei:           ${ROLLBACK_FILE} (${rollback.length} Einträge)`);
  console.log('\nStichproben:');
  samples.forEach((s) => console.log(`  ${s}`));

  if (DRY_RUN) console.log('\nℹ️ DRY-RUN: Es wurde NICHTS geändert. Für den echten Lauf DRY_RUN=false.');
  else console.log('\n✅ Echt-Lauf fertig.');

  if (stats.errors > 0) process.exit(1);
})().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
