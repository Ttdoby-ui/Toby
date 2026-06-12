#!/usr/bin/env node
/**
 * Processes time-limited sale prices and collections stored as Shopify metaobjects.
 *
 * scheduled_sale:
 *   - Active (end_date >= today): apply sale_price as variant price, original_price as compareAtPrice
 *   - Expired (end_date < today): restore original_price as price, remove compareAtPrice, delete entry
 *
 * scheduled_collection:
 *   - Expired (end_date < today): delete the collection, delete entry
 */

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // e.g. mystore.myshopify.com
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

if (!SHOPIFY_DOMAIN || !ACCESS_TOKEN) {
  console.error('ERROR: Missing required env vars: SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN');
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

function field(fields, key) {
  const f = fields.find(f => f.key === key);
  return f ? f.value : null;
}

const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

async function deleteMetaobject(id) {
  const data = await gql(
    `mutation($id: ID!) {
      metaobjectDelete(id: $id) { deletedId userErrors { field message } }
    }`,
    { id }
  );
  const errs = data.metaobjectDelete.userErrors;
  if (errs.length) console.warn(`    Warning deleting metaobject ${id}:`, errs);
}

async function processScheduledSales() {
  console.log('\n=== Scheduled sale prices ===');

  const { metaobjects } = await gql(`{
    metaobjects(type: "scheduled_sale", first: 250) {
      edges { node { id fields { key value } } }
    }
  }`);

  const entries = metaobjects.edges.map(e => e.node);
  console.log(`Found ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);

  for (const entry of entries) {
    const variantId    = field(entry.fields, 'variant');
    const salePrice    = field(entry.fields, 'sale_price');
    const origPrice    = field(entry.fields, 'original_price');
    const endDate      = field(entry.fields, 'end_date');
    const note         = field(entry.fields, 'note') || entry.id;

    if (!variantId || !salePrice || !origPrice || !endDate) {
      console.warn(`  [SKIP] Incomplete entry ${entry.id} — missing required fields`);
      continue;
    }

    const expired = endDate < today;
    console.log(`  "${note}"  end: ${endDate}  →  ${expired ? 'EXPIRED' : 'active'}`);

    // Fetch variant to get current price and parent product ID
    const vd = await gql(
      `query($id: ID!) { productVariant(id: $id) { id price compareAtPrice product { id } } }`,
      { id: variantId }
    );

    if (!vd.productVariant) {
      console.warn(`    Variant ${variantId} not found — deleting orphaned entry`);
      await deleteMetaobject(entry.id);
      continue;
    }

    const { price: currentPrice, product } = vd.productVariant;
    const productId = product.id;

    if (expired) {
      console.log(`    Restoring price ${origPrice} (was ${currentPrice})`);
      const upd = await gql(
        `mutation($pid: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $pid, variants: $variants) {
            userErrors { field message }
          }
        }`,
        { pid: productId, variants: [{ id: variantId, price: origPrice, compareAtPrice: null }] }
      );
      const errs = upd.productVariantsBulkUpdate.userErrors;
      if (errs.length) { console.error(`    Price restore failed:`, errs); continue; }
      await deleteMetaobject(entry.id);
      console.log(`    Done — price restored, entry deleted`);
    } else {
      const salePriceNum = parseFloat(salePrice);
      const currentNum   = parseFloat(currentPrice);
      if (Math.abs(currentNum - salePriceNum) < 0.005) {
        console.log(`    Sale already applied (${currentPrice}), skipping`);
      } else {
        console.log(`    Applying sale: ${salePrice} (original ${origPrice})`);
        const upd = await gql(
          `mutation($pid: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $pid, variants: $variants) {
              userErrors { field message }
            }
          }`,
          { pid: productId, variants: [{ id: variantId, price: salePrice, compareAtPrice: origPrice }] }
        );
        const errs = upd.productVariantsBulkUpdate.userErrors;
        if (errs.length) { console.error(`    Price update failed:`, errs); continue; }
        console.log(`    Done`);
      }
    }
  }
}

async function processScheduledCollections() {
  console.log('\n=== Scheduled collections ===');

  const { metaobjects } = await gql(`{
    metaobjects(type: "scheduled_collection", first: 250) {
      edges { node { id fields { key value } } }
    }
  }`);

  const entries = metaobjects.edges.map(e => e.node);
  console.log(`Found ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);

  for (const entry of entries) {
    const collectionId = field(entry.fields, 'collection');
    const endDate      = field(entry.fields, 'end_date');
    const note         = field(entry.fields, 'note') || entry.id;

    if (!collectionId || !endDate) {
      console.warn(`  [SKIP] Incomplete entry ${entry.id} — missing required fields`);
      continue;
    }

    const expired = endDate < today;
    console.log(`  "${note}"  end: ${endDate}  →  ${expired ? 'EXPIRED' : 'active'}`);

    if (expired) {
      console.log(`    Deleting collection ${collectionId}`);
      const del = await gql(
        `mutation($input: CollectionDeleteInput!) {
          collectionDelete(input: $input) { deletedCollectionId userErrors { field message } }
        }`,
        { input: { id: collectionId } }
      );
      const errs = del.collectionDelete.userErrors;
      if (errs.length) { console.error(`    Collection delete failed:`, errs); continue; }
      await deleteMetaobject(entry.id);
      console.log(`    Done — collection and entry deleted`);
    } else {
      console.log(`    Not yet expired, nothing to do`);
    }
  }
}

(async () => {
  try {
    console.log(`Running on ${today}`);
    await processScheduledSales();
    await processScheduledCollections();
    console.log('\nAll done.');
  } catch (err) {
    console.error('\nFatal error:', err);
    process.exit(1);
  }
})();
