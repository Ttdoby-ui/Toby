#!/usr/bin/env node
/**
 * Processes time-limited sale prices and collections stored as Shopify metaobjects.
 *
 * scheduled_sale fields:
 *   - variant (required)       – product variant reference
 *   - sale_price (required)    – price during the sale
 *   - original_price (required)– UVP / compare-at price displayed
 *   - end_date (required)      – sale ends before this date (YYYY-MM-DD)
 *   - start_date (optional)    – sale is not applied before this date
 *   - note (optional)          – internal label
 *   - pre_sale_price (set by script) – actual price before sale, restored on expiry
 *   - badge_emoji (optional)   – emoji / short text shown on the sale badge, e.g. 🔥
 *   - badge_color (optional)   – hex color for the sale badge background, e.g. #E53E3E
 *
 * Lifecycle:
 *   - Not yet started (start_date > today): skip
 *   - Active (start_date <= today AND end_date >= today):
 *       saves pre_sale_price once, applies sale_price + compareAtPrice,
 *       writes variant metafields custom.sale_badge_emoji / custom.sale_badge_color
 *   - Expired (end_date < today):
 *       restores pre_sale_price (or original_price as fallback),
 *       removes compareAtPrice, removes badge metafields, deletes entry
 *
 * scheduled_sale_member fields:
 *   - product (required)    – product reference
 *   - collection (required) – collection reference (e.g. Beläge-Sale)
 *   - end_date (required)   – product is removed from collection after this date
 *   - start_date (optional) – product is added to collection from this date
 *   - note (optional)       – internal label
 *
 * Lifecycle:
 *   - Pending (start_date > today): skip
 *   - Active: ensures product is in collection (idempotent)
 *   - Expired (end_date < today): removes product from collection, deletes entry
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

async function setBadgeMetafields(variantId, emoji, color) {
  const metafields = [];
  if (emoji) {
    metafields.push({
      ownerId: variantId,
      namespace: 'custom',
      key: 'sale_badge_emoji',
      type: 'single_line_text_field',
      value: emoji,
    });
  }
  if (color) {
    metafields.push({
      ownerId: variantId,
      namespace: 'custom',
      key: 'sale_badge_color',
      type: 'color',
      value: color,
    });
  }
  if (!metafields.length) return;

  const data = await gql(
    `mutation($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key }
        userErrors { field message }
      }
    }`,
    { metafields }
  );
  const errs = data.metafieldsSet.userErrors;
  if (errs.length) console.warn(`    Warning setting badge metafields:`, errs);
  else console.log(`    Badge metafields set (emoji: ${emoji || '—'}, color: ${color || '—'})`);
}

async function removeBadgeMetafields(variantId) {
  const metafields = [
    { ownerId: variantId, namespace: 'custom', key: 'sale_badge_emoji' },
    { ownerId: variantId, namespace: 'custom', key: 'sale_badge_color' },
  ];
  const data = await gql(
    `mutation($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        deletedMetafields { key }
        userErrors { field message }
      }
    }`,
    { metafields }
  );
  const errs = data.metafieldsDelete.userErrors;
  if (errs.length) console.warn(`    Warning removing badge metafields:`, errs);
  else console.log(`    Badge metafields removed`);
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
    const startDate    = field(entry.fields, 'start_date');
    const note         = field(entry.fields, 'note') || entry.id;
    const preSalePrice = field(entry.fields, 'pre_sale_price');
    const badgeEmoji   = field(entry.fields, 'badge_emoji');
    const badgeColor   = field(entry.fields, 'badge_color');

    if (!variantId || !salePrice || !origPrice || !endDate) {
      console.warn(`  [SKIP] Incomplete entry ${entry.id} — missing required fields`);
      continue;
    }

    const expired    = endDate < today;
    const notStarted = startDate && startDate > today;

    if (notStarted) {
      console.log(`  "${note}"  start: ${startDate}  →  PENDING (not yet started)`);
      continue;
    }

    console.log(`  "${note}"  ${startDate ? `start: ${startDate}  ` : ''}end: ${endDate}  →  ${expired ? 'EXPIRED' : 'active'}`);

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
      const restorePrice = preSalePrice || origPrice;
      console.log(`    Restoring price ${restorePrice} (was ${currentPrice}${preSalePrice ? '' : ', pre_sale_price not set — using original_price as fallback'})`);
      const upd = await gql(
        `mutation($pid: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $pid, variants: $variants) {
            userErrors { field message }
          }
        }`,
        { pid: productId, variants: [{ id: variantId, price: restorePrice, compareAtPrice: null }] }
      );
      const errs = upd.productVariantsBulkUpdate.userErrors;
      if (errs.length) { console.error(`    Price restore failed:`, errs); continue; }
      await removeBadgeMetafields(variantId);
      await deleteMetaobject(entry.id);
      console.log(`    Done — price restored, entry deleted`);
    } else {
      const salePriceNum = parseFloat(salePrice);
      const currentNum   = parseFloat(currentPrice);
      if (Math.abs(currentNum - salePriceNum) < 0.005) {
        console.log(`    Sale already applied (${currentPrice}), skipping`);
      } else {
        // Save current price as pre_sale_price before applying sale (only on first application)
        if (!preSalePrice) {
          const save = await gql(
            `mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) {
              metaobjectUpdate(id: $id, metaobject: $metaobject) {
                metaobject { id }
                userErrors { field message }
              }
            }`,
            { id: entry.id, metaobject: { fields: [{ key: 'pre_sale_price', value: currentPrice }] } }
          );
          const errs2 = save.metaobjectUpdate.userErrors;
          if (errs2.length) console.warn(`    Warning saving pre_sale_price:`, errs2);
          else console.log(`    Saved pre-sale price ${currentPrice}`);
        }
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
        await setBadgeMetafields(variantId, badgeEmoji, badgeColor);
        console.log(`    Done`);
      }
    }
  }
}

async function processScheduledSaleMembers() {
  console.log('\n=== Scheduled sale collection members ===');

  const { metaobjects } = await gql(`{
    metaobjects(type: "scheduled_sale_member", first: 250) {
      edges { node { id fields { key value } } }
    }
  }`);

  const entries = metaobjects.edges.map(e => e.node);
  console.log(`Found ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);

  for (const entry of entries) {
    const productId    = field(entry.fields, 'product');
    const collectionId = field(entry.fields, 'collection');
    const endDate      = field(entry.fields, 'end_date');
    const startDate    = field(entry.fields, 'start_date');
    const note         = field(entry.fields, 'note') || entry.id;

    if (!productId || !collectionId || !endDate) {
      console.warn(`  [SKIP] Incomplete entry ${entry.id} — missing required fields`);
      continue;
    }

    const expired    = endDate < today;
    const notStarted = startDate && startDate > today;

    if (notStarted) {
      console.log(`  "${note}"  start: ${startDate}  →  PENDING (not yet started)`);
      continue;
    }

    console.log(`  "${note}"  ${startDate ? `start: ${startDate}  ` : ''}end: ${endDate}  →  ${expired ? 'EXPIRED' : 'active'}`);

    if (expired) {
      const rm = await gql(
        `mutation($id: ID!, $productIds: [ID!]!) {
          collectionRemoveProducts(id: $id, productIds: $productIds) {
            userErrors { field message }
          }
        }`,
        { id: collectionId, productIds: [productId] }
      );
      const errs = rm.collectionRemoveProducts.userErrors;
      if (errs.length) { console.error(`    Remove failed:`, errs); continue; }
      await deleteMetaobject(entry.id);
      console.log(`    Done — product removed from collection, entry deleted`);
    } else {
      // Ensure product is in the collection (idempotent — Shopify ignores duplicates)
      const add = await gql(
        `mutation($id: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $id, productIds: $productIds) {
            userErrors { field message }
          }
        }`,
        { id: collectionId, productIds: [productId] }
      );
      const errs = add.collectionAddProducts.userErrors;
      if (errs.length) console.warn(`    Warning adding product to collection:`, errs);
      else console.log(`    Product confirmed in collection`);
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
    await processScheduledSaleMembers();
    await processScheduledCollections();
    console.log('\nAll done.');
  } catch (err) {
    console.error('\nFatal error:', err);
    process.exit(1);
  }
})();
