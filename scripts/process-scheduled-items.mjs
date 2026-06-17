#!/usr/bin/env node
/**
 * Processes time-limited sale prices and collections stored as Shopify metaobjects.
 *
 * scheduled_sale fields:
 *   - variants (required)          – list of product variant references
 *   - discount_type (required)     – "fixed" or "percentage"
 *   - sale_price (optional)        – fixed sale price (used when discount_type=fixed)
 *   - discount_percentage (optional)– percentage off, e.g. 20 for 20% (used when discount_type=percentage)
 *   - end_date (required)          – sale ends before this date (YYYY-MM-DD)
 *   - start_date (optional)        – sale is not applied before this date
 *   - note (optional)              – internal label
 *   - badge_emoji (optional)       – emoji / short text shown on the sale badge, e.g. 🔥
 *   - badge_color (optional)       – hex color for the sale badge background, e.g. #E53E3E
 *
 * Per-variant metafield (set by script, removed on expiry):
 *   custom.pre_sale_price          – original price stored on the variant itself
 *
 * Lifecycle:
 *   - Not yet started (start_date > today): skip
 *   - Active (start_date <= today AND end_date >= today):
 *       per variant: saves custom.pre_sale_price once, applies computed sale price
 *       + compareAtPrice (original price), writes badge metafields
 *   - Expired (end_date < today):
 *       per variant: restores custom.pre_sale_price, removes compareAtPrice,
 *       removes badge + pre_sale_price metafields, then deletes entry
 *
 * scheduled_sale_member fields:
 *   - product (required)    – list of product references (mehrere Produkte möglich)
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

async function removeSaleMetafields(variantId) {
  const metafields = [
    { ownerId: variantId, namespace: 'custom', key: 'sale_badge_emoji' },
    { ownerId: variantId, namespace: 'custom', key: 'sale_badge_color' },
    { ownerId: variantId, namespace: 'custom', key: 'pre_sale_price' },
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
  if (errs.length) console.warn(`    Warning removing sale metafields:`, errs);
  else console.log(`    Sale metafields removed`);
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
    const variantIds    = JSON.parse(field(entry.fields, 'variants') || '[]');
    const discountType  = field(entry.fields, 'discount_type');
    const salePrice     = field(entry.fields, 'sale_price');
    const discountPct   = field(entry.fields, 'discount_percentage');
    const endDate       = field(entry.fields, 'end_date');
    const startDate     = field(entry.fields, 'start_date');
    const note          = field(entry.fields, 'note') || entry.id;
    const badgeEmoji    = field(entry.fields, 'badge_emoji');
    const badgeColor    = field(entry.fields, 'badge_color');

    if (!variantIds.length || !discountType || !endDate) {
      console.warn(`  [SKIP] Incomplete entry ${entry.id} — missing required fields`);
      continue;
    }
    if (discountType === 'fixed' && !salePrice) {
      console.warn(`  [SKIP] "${note}" — discount_type=fixed but no sale_price set`);
      continue;
    }
    if (discountType === 'percentage' && !discountPct) {
      console.warn(`  [SKIP] "${note}" — discount_type=percentage but no discount_percentage set`);
      continue;
    }

    const expired    = endDate < today;
    const notStarted = startDate && startDate > today;

    if (notStarted) {
      console.log(`  "${note}"  start: ${startDate}  →  PENDING (not yet started)`);
      continue;
    }

    const discountLabel = discountType === 'fixed' ? `fixed ${salePrice}` : `${discountPct}% off`;
    console.log(`  "${note}"  ${startDate ? `start: ${startDate}  ` : ''}end: ${endDate}  [${discountLabel}]  →  ${expired ? 'EXPIRED' : 'active'}`);

    let allOk = true;

    for (const variantId of variantIds) {
      // Fetch variant: current price, compareAtPrice, product ID, stored pre_sale_price metafield
      const vd = await gql(
        `query($id: ID!) {
          productVariant(id: $id) {
            id price compareAtPrice
            product { id }
            preSaleMeta: metafield(namespace: "custom", key: "pre_sale_price") { value }
          }
        }`,
        { id: variantId }
      );

      if (!vd.productVariant) {
        console.warn(`    [${variantId.split('/').pop()}] Variant not found — skipping`);
        continue;
      }

      const { price: currentPrice, compareAtPrice, product, preSaleMeta } = vd.productVariant;
      const productId = product.id;
      const shortId = variantId.split('/').pop();

      if (expired) {
        const restorePrice = preSaleMeta?.value || currentPrice;
        console.log(`    [${shortId}] Restoring ${restorePrice}${!preSaleMeta ? ' (pre_sale_price missing — using current price as fallback)' : ''}`);
        const upd = await gql(
          `mutation($pid: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $pid, variants: $variants) {
              userErrors { field message }
            }
          }`,
          { pid: productId, variants: [{ id: variantId, price: restorePrice, compareAtPrice: null }] }
        );
        const errs = upd.productVariantsBulkUpdate.userErrors;
        if (errs.length) { console.error(`    [${shortId}] Price restore failed:`, errs); allOk = false; continue; }
        await removeSaleMetafields(variantId);
      } else {
        // Skip if sale is already applied (pre_sale_price metafield exists → sale active)
        if (preSaleMeta) {
          console.log(`    [${shortId}] Sale already active (${currentPrice}), skipping`);
          continue;
        }

        // Calculate new sale price
        const currentPriceNum = parseFloat(currentPrice);
        const newSalePrice = discountType === 'fixed'
          ? parseFloat(salePrice).toFixed(2)
          : (currentPriceNum * (1 - parseFloat(discountPct) / 100)).toFixed(2);

        // Store original price as variant metafield before applying sale
        const saveMeta = await gql(
          `mutation($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              userErrors { field message }
            }
          }`,
          { metafields: [{ ownerId: variantId, namespace: 'custom', key: 'pre_sale_price', type: 'single_line_text_field', value: currentPrice }] }
        );
        const metaErrs = saveMeta.metafieldsSet.userErrors;
        if (metaErrs.length) { console.warn(`    [${shortId}] Warning saving pre_sale_price:`, metaErrs); }

        // Apply sale price (compareAtPrice = original price for strikethrough display)
        const upd = await gql(
          `mutation($pid: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $pid, variants: $variants) {
              userErrors { field message }
            }
          }`,
          { pid: productId, variants: [{ id: variantId, price: newSalePrice, compareAtPrice: currentPrice }] }
        );
        const errs = upd.productVariantsBulkUpdate.userErrors;
        if (errs.length) { console.error(`    [${shortId}] Price update failed:`, errs); allOk = false; continue; }
        await setBadgeMetafields(variantId, badgeEmoji, badgeColor);
        console.log(`    [${shortId}] ${currentPrice} → ${newSalePrice} (compareAt: ${currentPrice})`);
      }
    }

    if (expired && allOk) {
      await deleteMetaobject(entry.id);
      console.log(`    Entry deleted`);
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
    const productIds   = JSON.parse(field(entry.fields, 'product') || '[]');
    const collectionId = field(entry.fields, 'collection');
    const endDate      = field(entry.fields, 'end_date');
    const startDate    = field(entry.fields, 'start_date');
    const note         = field(entry.fields, 'note') || entry.id;

    if (!productIds.length || !collectionId || !endDate) {
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

    console.log(`    Products: ${productIds.length}`);

    if (expired) {
      const rm = await gql(
        `mutation($id: ID!, $productIds: [ID!]!) {
          collectionRemoveProducts(id: $id, productIds: $productIds) {
            userErrors { field message }
          }
        }`,
        { id: collectionId, productIds }
      );
      const errs = rm.collectionRemoveProducts.userErrors;
      if (errs.length) { console.error(`    Remove failed:`, errs); continue; }
      await deleteMetaobject(entry.id);
      console.log(`    Done — ${productIds.length} product(s) removed from collection, entry deleted`);
    } else {
      // Ensure all products are in the collection (idempotent — Shopify ignores duplicates)
      const add = await gql(
        `mutation($id: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $id, productIds: $productIds) {
            userErrors { field message }
          }
        }`,
        { id: collectionId, productIds }
      );
      const errs = add.collectionAddProducts.userErrors;
      if (errs.length) console.warn(`    Warning adding products to collection:`, errs);
      else console.log(`    ${productIds.length} product(s) confirmed in collection`);
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
