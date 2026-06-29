#!/usr/bin/env node
/**
 * Markiert alle Produkte der Textilien-Kollektion mit dem Tag `Textil` und
 * nimmt sie aus der VIP-Smart-Kollektion (Regel `TAG NOT_EQUALS Textil`).
 *
 * Hintergrund: Der Textil-Mengenrabatt (Function `kollektionsrabatt`) ist
 * VIP-aware (max(Menge, VIP)). Solange for_vip-Textilien ZUSÄTZLICH in der
 * VIP-Smart-Kollektion liegen, greifen zwei nicht-kombinierbare Produktrabatte
 * auf dieselbe Position – welcher gewinnt, ist nicht garantiert der höhere.
 * Mit dieser Ausnahme steuert die Function die for_vip-Textilien ALLEIN
 * (deterministisch „höchster gewinnt"). Der `for_vip`-Tag bleibt erhalten,
 * damit die VIP-Preisanzeige auf den Kacheln (price.liquid) weiter funktioniert.
 *
 * Idempotent: tagsAdd ist mehrfach ausführbar; die VIP-Regel wird nur ergänzt,
 * wenn sie noch fehlt.
 *
 * Env:
 *   SHOPIFY_STORE_DOMAIN  z. B. e7ee88-2.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN  Store-Admin-Token (write_products, write_publications)
 *   TEXTIL_COLLECTION_ID  optional, Default: gid://shopify/Collection/607791874396
 *   VIP_COLLECTION_ID     optional, Default: gid://shopify/Collection/664158142812
 *   TEXTIL_TAG            optional, Default: Textil
 *   DRY_RUN               optional "true" → nichts schreiben, nur zählen
 */

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';
const TEXTIL_COLLECTION_ID =
  process.env.TEXTIL_COLLECTION_ID || 'gid://shopify/Collection/607791874396';
const VIP_COLLECTION_ID =
  process.env.VIP_COLLECTION_ID || 'gid://shopify/Collection/664158142812';
const TEXTIL_TAG = (process.env.TEXTIL_TAG || 'Textil').trim();
const DRY_RUN = (process.env.DRY_RUN || '').toLowerCase() === 'true';

if (!SHOPIFY_DOMAIN || !ACCESS_TOKEN) {
  console.error('ERROR: SHOPIFY_STORE_DOMAIN und SHOPIFY_ACCESS_TOKEN müssen gesetzt sein.');
  process.exit(1);
}

async function gql(query, variables = {}) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors, null, 2));
  return data.data;
}

/** Alle Produkt-IDs der Kollektion (paginiert). */
async function collectProductIds(collectionId) {
  const ids = [];
  let cursor = null;
  do {
    const data = await gql(
      `query($id: ID!, $after: String) {
        collection(id: $id) {
          products(first: 250, after: $after) {
            nodes { id }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { id: collectionId, after: cursor }
    );
    const conn = data.collection?.products;
    if (!conn) throw new Error(`Kollektion ${collectionId} nicht gefunden.`);
    for (const n of conn.nodes) ids.push(n.id);
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor);
  return ids;
}

/** tagsAdd mit begrenzter Parallelität. */
async function addTagToAll(ids, tag) {
  const CONCURRENCY = 8;
  let done = 0;
  let failed = 0;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const data = await gql(
            `mutation($id: ID!, $tags: [String!]!) {
              tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
            }`,
            { id, tags: [tag] }
          );
          const errs = data.tagsAdd.userErrors;
          if (errs.length) { failed++; console.warn(`  Tag-Fehler ${id}:`, errs); }
        } catch (e) {
          failed++;
          console.warn(`  Tag-Ausnahme ${id}: ${e.message}`);
        }
      })
    );
    done += batch.length;
    console.log(`  ...${done}/${ids.length} getaggt`);
  }
  return { done, failed };
}

/** VIP-Regel um `TAG NOT_EQUALS <tag>` ergänzen (idempotent). */
async function excludeFromVip(vipCollectionId, tag) {
  const data = await gql(
    `query($id: ID!) {
      collection(id: $id) {
        title
        ruleSet { appliedDisjunctively rules { column relation condition } }
      }
    }`,
    { id: vipCollectionId }
  );
  const rs = data.collection?.ruleSet;
  if (!rs) throw new Error('VIP-Kollektion hat keinen ruleSet (keine Smart-Kollektion?).');

  const exists = rs.rules.some(
    (r) => r.column === 'TAG' && r.relation === 'NOT_EQUALS' && r.condition === tag
  );
  if (exists) {
    console.log(`  VIP-Regel "TAG NOT_EQUALS ${tag}" existiert bereits – nichts zu tun.`);
    return;
  }

  const rules = rs.rules.map((r) => ({
    column: r.column,
    relation: r.relation,
    condition: r.condition,
  }));
  rules.push({ column: 'TAG', relation: 'NOT_EQUALS', condition: tag });

  if (DRY_RUN) {
    console.log('  [DRY_RUN] Würde VIP-ruleSet setzen auf:', JSON.stringify(rules));
    return;
  }

  const upd = await gql(
    `mutation($id: ID!, $ruleSet: CollectionRuleSetInput!) {
      collectionUpdate(input: { id: $id, ruleSet: $ruleSet }) {
        collection { id title productsCount { count } }
        userErrors { field message }
      }
    }`,
    { id: vipCollectionId, ruleSet: { appliedDisjunctively: rs.appliedDisjunctively, rules } }
  );
  const errs = upd.collectionUpdate.userErrors;
  if (errs.length) throw new Error(`VIP-Update fehlgeschlagen: ${JSON.stringify(errs)}`);
  console.log(
    `  VIP-Regel ergänzt. Neue Produktanzahl VIP: ${upd.collectionUpdate.collection.productsCount.count}`
  );
}

(async () => {
  console.log(`Textilien-Kollektion: ${TEXTIL_COLLECTION_ID}`);
  console.log(`VIP-Kollektion:       ${VIP_COLLECTION_ID}`);
  console.log(`Tag:                  ${TEXTIL_TAG}${DRY_RUN ? '   (DRY_RUN)' : ''}`);

  const ids = await collectProductIds(TEXTIL_COLLECTION_ID);
  console.log(`\n${ids.length} Textil-Produkte gefunden.`);

  if (!DRY_RUN) {
    console.log(`\nTagge mit "${TEXTIL_TAG}"...`);
    const { done, failed } = await addTagToAll(ids, TEXTIL_TAG);
    console.log(`Tagging fertig: ${done} verarbeitet, ${failed} Fehler.`);
    if (failed > 0) throw new Error(`${failed} Produkte konnten nicht getaggt werden – VIP-Regel NICHT geändert.`);
  } else {
    console.log('[DRY_RUN] Überspringe Tagging.');
  }

  console.log(`\nVIP-Ausschluss setzen...`);
  await excludeFromVip(VIP_COLLECTION_ID, TEXTIL_TAG);

  console.log('\n✅ Fertig.');
})().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
