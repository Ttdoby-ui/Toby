#!/usr/bin/env node
/**
 * Setzt bei allen Artikeln mit Tag "Hauspreis" das blaue Preis-Badge:
 *   custom.price_badge_text  = "Hauspreis"   (single_line_text_field)
 *   custom.price_badge_color = "#486A8F"     (color, Futurespin-Blau)
 *
 * Das Theme (snippets/price.liquid, live UND Entwurf) rendert bei gesetztem
 * price_badge_text dieses Feld ANSTELLE von "Angebot", in price_badge_color.
 * -> "Hauspreis" erscheint sofort live, ohne Theme-Aenderung/Rotation.
 *
 * Idempotent (metafieldsSet ueberschreibt gleiche Werte problemlos).
 * MODE=clear loescht die beiden Metafelder wieder (Rollback der Badge-Anzeige).
 *
 * Env:
 *   SHOPIFY_STORE_DOMAIN  z. B. e7ee88-2.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN  Store-Admin-Token (write_products)
 *   DRY_RUN               "true" -> nur zaehlen (Default true)
 *   MODE                  "set" (Default) | "clear"
 *   TAG                   Default "Hauspreis"
 *   BADGE_TEXT            Default "Hauspreis"
 *   BADGE_COLOR           Default "#486A8F"
 *   LIMIT                 optional, max. Produkte (Test)
 */

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';
const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
const MODE = (process.env.MODE || 'set').toLowerCase();
const TAG = (process.env.TAG || 'Hauspreis').trim();
const BADGE_TEXT = process.env.BADGE_TEXT || 'Hauspreis';
const BADGE_COLOR = process.env.BADGE_COLOR || '#486A8F';
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;

if (!SHOPIFY_DOMAIN || !ACCESS_TOKEN) {
  console.error('ERROR: SHOPIFY_STORE_DOMAIN und SHOPIFY_ACCESS_TOKEN muessen gesetzt sein.');
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
    if (JSON.stringify(data.errors).toUpperCase().includes('THROTTLED') && attempt < 6) {
      await sleep(2000 * (attempt + 1));
      return gql(query, variables, attempt + 1);
    }
    throw new Error(JSON.stringify(data.errors, null, 2));
  }
  return data.data;
}

async function collectHauspreisProductIds() {
  const ids = [];
  let cursor = null;
  do {
    const data = await gql(
      `query($after: String) {
        products(first: 250, after: $after, query: "tag:'${TAG}'") {
          nodes { id }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after: cursor }
    );
    for (const n of data.products.nodes) {
      ids.push(n.id);
      if (ids.length >= LIMIT) return ids;
    }
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);
  return ids;
}

async function setBadge(ids) {
  const metafields = [];
  for (const id of ids) {
    metafields.push({ ownerId: id, namespace: 'custom', key: 'price_badge_text', type: 'single_line_text_field', value: BADGE_TEXT });
    metafields.push({ ownerId: id, namespace: 'custom', key: 'price_badge_color', type: 'color', value: BADGE_COLOR });
  }
  const data = await gql(
    `mutation($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { field message } }
    }`,
    { metafields }
  );
  return data.metafieldsSet.userErrors ?? [];
}

async function clearBadge(ids) {
  const identifiers = [];
  for (const id of ids) {
    identifiers.push({ ownerId: id, namespace: 'custom', key: 'price_badge_text' });
    identifiers.push({ ownerId: id, namespace: 'custom', key: 'price_badge_color' });
  }
  const data = await gql(
    `mutation($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) { deletedMetafields { key } userErrors { field message } }
    }`,
    { metafields: identifiers }
  );
  return data.metafieldsDelete.userErrors ?? [];
}

(async () => {
  console.log('=== Hauspreis-Badge ===');
  console.log(`Modus:  ${MODE.toUpperCase()}${DRY_RUN ? '  (DRY-RUN)' : ''}`);
  console.log(`Tag:    ${TAG}`);
  if (MODE === 'set') console.log(`Badge:  "${BADGE_TEXT}"  Farbe ${BADGE_COLOR}`);

  const ids = await collectHauspreisProductIds();
  console.log(`\n${ids.length} Produkte mit Tag "${TAG}".`);

  if (DRY_RUN) {
    console.log('[DRY-RUN] Es wird nichts geschrieben.');
    return;
  }

  const BATCH = 12; // 12 Produkte = 24 Metafelder pro Aufruf (< 25er Limit)
  let done = 0;
  let failed = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const errs = MODE === 'clear' ? await clearBadge(batch) : await setBadge(batch);
    if (errs.length) { failed++; console.warn('  userErrors:', JSON.stringify(errs)); }
    done += batch.length;
    if (done % 120 < BATCH) console.log(`  ...${done}/${ids.length}`);
  }
  console.log(`\n✅ Fertig: ${done} Produkte, ${failed} fehlerhafte Batches.`);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
