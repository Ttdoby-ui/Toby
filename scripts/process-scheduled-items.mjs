#!/usr/bin/env node
/**
 * Processes time-limited sale prices and collections stored as Shopify metaobjects.
 *
 * scheduled_sale fields (kombiniertes Formular für Preis-Sale + Kollektions-Mitgliedschaft):
 *   - variants (required)           – list of product variant references
 *   - collection (optional)         – if set, parent products are added to/removed from this collection
 *   - discount_type (optional)      – "fixed" or "percentage"; if empty, only collection membership is managed
 *   - sale_price (optional)         – fixed sale price (used when discount_type=fixed)
 *   - discount_percentage (optional)– percentage off, e.g. 20 for 20% (used when discount_type=percentage)
 *   - end_date (required)           – sale ends before this date (YYYY-MM-DD)
 *   - start_date (optional)         – sale is not applied before this date
 *   - note (optional)               – internal label
 *   - badge_emoji (optional)        – emoji / short text shown on the sale badge, e.g. 🔥
 *   - badge_color (optional)        – hex color for the sale badge background, e.g. #E53E3E
 *
 * HAUSPREIS-FEST (2026-07-08): Der Angebotspreis übersteuert den Hauspreis. compareAtPrice wird auf die
 * ECHTE UVP gesetzt (vorhandener Vergleichspreis, sonst der aktuelle Preis) – nicht auf den Hauspreis.
 * Das Badge nutzt die vom Theme (price.liquid) gelesenen Felder custom.price_badge_text/color und enthält
 * den Rabatt in % zur UVP, z. B. "Sale -30%". Beim Ablauf wird EXAKT der Vorzustand wiederhergestellt
 * (inkl. Hauspreis: Preis reduziert, Vergleichspreis = UVP, Badge "Hauspreis").
 *
 * Per-variant Sicherungs-Metafelder (gesetzt beim Start, entfernt beim Ablauf):
 *   custom.pre_sale_price / pre_sale_compare / pre_sale_badge_text / pre_sale_badge_color
 *
 * Lifecycle:
 *   - Not yet started (start_date > today): skip
 *   - Active:
 *       if collection: adds parent products of all variants to the collection (idempotent)
 *       if discount_type: sichert Vorzustand, setzt Preis=Angebot, Vergleichspreis=UVP,
 *                         price_badge_text="<Label> -X%"
 *   - Expired:
 *       if collection: removes parent products from collection
 *       if discount_type: stellt Preis/Vergleichspreis/Badge aus den pre_sale_* Feldern wieder her
 *       then deletes entry
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

async function metafieldsSet(metafields) {
  if (!metafields.length) return;
  const data = await gql(
    `mutation($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { metafields { key } userErrors { field message } }
    }`,
    { metafields }
  );
  const errs = data.metafieldsSet.userErrors;
  if (errs.length) console.warn(`    Warning setting metafields:`, errs);
}

async function metafieldsDelete(ownerId, keys) {
  const metafields = keys.map(key => ({ ownerId, namespace: 'custom', key }));
  const data = await gql(
    `mutation($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) { deletedMetafields { key } userErrors { field message } }
    }`,
    { metafields }
  );
  const errs = data.metafieldsDelete.userErrors;
  if (errs.length) console.warn(`    Warning removing metafields:`, errs);
}

/** Preis-Vorzustand PRO VARIANTE sichern (Preis + Vergleichspreis). */
async function savePreSaleVariant(variantId, price, compareAt) {
  await metafieldsSet([
    { ownerId: variantId, namespace: 'custom', key: 'pre_sale_price',   type: 'single_line_text_field', value: String(price) },
    { ownerId: variantId, namespace: 'custom', key: 'pre_sale_compare', type: 'single_line_text_field', value: compareAt ? String(compareAt) : '' },
  ]);
}

/** Badge-Vorzustand PRO PRODUKT sichern (z. B. "Hauspreis" / #486A8F). */
async function savePreSaleBadge(productId, badgeText, badgeColor) {
  await metafieldsSet([
    { ownerId: productId, namespace: 'custom', key: 'pre_sale_badge_text',  type: 'single_line_text_field', value: badgeText || '' },
    { ownerId: productId, namespace: 'custom', key: 'pre_sale_badge_color', type: 'single_line_text_field', value: badgeColor || '' },
  ]);
}

/**
 * Setzt das Preis-Badge auf PRODUKT-Ebene – genau das liest price.liquid
 * (product_resource.metafields.custom.price_badge_text/color) UND das Filter-
 * Panel-Kachel-Asset. So zeigen PDP und Kacheln dasselbe (z. B. "Sale -30%").
 */
async function setPriceBadge(productId, text, color) {
  const mf = [{ ownerId: productId, namespace: 'custom', key: 'price_badge_text', type: 'single_line_text_field', value: text }];
  if (color) mf.push({ ownerId: productId, namespace: 'custom', key: 'price_badge_color', type: 'color', value: color });
  await metafieldsSet(mf);
}

/** Produkt-Badge auf den gesicherten Vorzustand zurück (oder löschen). */
async function restorePriceBadge(productId, text, color) {
  if (text) await setPriceBadge(productId, text, color);
  else await metafieldsDelete(productId, ['price_badge_text', 'price_badge_color']);
}

async function processScheduledSales() {
  console.log('\n=== Scheduled sales (price + collection) ===');

  const { metaobjects } = await gql(`{
    metaobjects(type: "scheduled_sale", first: 250) {
      edges { node { id fields { key value } } }
    }
  }`);

  const entries = metaobjects.edges.map(e => e.node);
  console.log(`Found ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);

  for (const entry of entries) {
    const variantIds   = JSON.parse(field(entry.fields, 'variants') || '[]');
    const collectionId = field(entry.fields, 'collection');
    const discountType = field(entry.fields, 'discount_type');
    const salePrice    = field(entry.fields, 'sale_price');
    const discountPct  = field(entry.fields, 'discount_percentage');
    const endDate      = field(entry.fields, 'end_date');
    const startDate    = field(entry.fields, 'start_date');
    const note         = field(entry.fields, 'note') || entry.id;
    const badgeEmoji   = field(entry.fields, 'badge_emoji');
    const badgeColor   = field(entry.fields, 'badge_color');

    if (!variantIds.length || !endDate) {
      console.warn(`  [SKIP] Incomplete entry ${entry.id} — missing required fields`);
      continue;
    }
    if (!collectionId && !discountType) {
      console.warn(`  [SKIP] "${note}" — neither collection nor discount_type set, nothing to do`);
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

    const ops = [
      collectionId && 'Kollektion',
      discountType && (discountType === 'fixed' ? `Festpreis ${salePrice}` : `${discountPct}% Rabatt`),
    ].filter(Boolean).join(' + ');
    console.log(`  "${note}"  ${startDate ? `start: ${startDate}  ` : ''}end: ${endDate}  [${ops}]  →  ${expired ? 'EXPIRED' : 'active'}`);

    // Fetch all variants once (product IDs needed for collection, prices for discount)
    const variantData = [];
    for (const variantId of variantIds) {
      const vd = await gql(
        `query($id: ID!) {
          productVariant(id: $id) {
            id price compareAtPrice
            product {
              id
              curBadgeText:  metafield(namespace: "custom", key: "price_badge_text") { value }
              curBadgeColor: metafield(namespace: "custom", key: "price_badge_color") { value }
              preBadgeText:  metafield(namespace: "custom", key: "pre_sale_badge_text") { value }
              preBadgeColor: metafield(namespace: "custom", key: "pre_sale_badge_color") { value }
            }
            preSaleMeta:    metafield(namespace: "custom", key: "pre_sale_price") { value }
            preCompareMeta: metafield(namespace: "custom", key: "pre_sale_compare") { value }
          }
        }`,
        { id: variantId }
      );
      if (!vd.productVariant) {
        console.warn(`    [${variantId.split('/').pop()}] Not found — skipping`);
        continue;
      }
      variantData.push(vd.productVariant);
    }

    if (!variantData.length) continue;
    let allOk = true;

    // ── Collection membership ──────────────────────────────────────────────
    if (collectionId) {
      // Derive unique product IDs from selected variants
      const productIds = [...new Set(variantData.map(v => v.product.id))];
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
        if (errs.length) { console.error(`    Collection remove failed:`, errs); allOk = false; }
        else console.log(`    ${productIds.length} Produkt(e) aus Kollektion entfernt`);
      } else {
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
        else console.log(`    ${productIds.length} Produkt(e) in Kollektion bestätigt`);
      }
    }

    // ── Price discount (Hauspreis-fest, Badge auf Produkt-Ebene) ───────────
    if (discountType) {
      const badgeDone = new Set(); // Badge nur EINMAL pro Produkt (nicht pro Variante)
      for (const variant of variantData) {
        const { id: variantId, price: currentPrice, compareAtPrice, product, preSaleMeta, preCompareMeta } = variant;
        const productId = product.id;
        const shortId   = variantId.split('/').pop();

        if (expired) {
          // Preis/Vergleichspreis pro Variante zurück – inkl. Hauspreis (Preis reduziert, Vergleichspreis = UVP).
          const restorePrice   = preSaleMeta?.value || currentPrice;
          const restoreCompare = preCompareMeta?.value ? preCompareMeta.value : null;
          console.log(`    [${shortId}] Wiederherstellen: Preis ${restorePrice}${restoreCompare ? `, Vergleichspreis ${restoreCompare}` : ''}${!preSaleMeta ? ' (Fallback — pre_sale_price fehlte)' : ''}`);
          const upd = await gql(
            `mutation($pid: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkUpdate(productId: $pid, variants: $variants) { userErrors { field message } }
            }`,
            { pid: productId, variants: [{ id: variantId, price: restorePrice, compareAtPrice: restoreCompare }] }
          );
          const errs = upd.productVariantsBulkUpdate.userErrors;
          if (errs.length) { console.error(`    [${shortId}] Restore fehlgeschlagen:`, errs); allOk = false; continue; }
          await metafieldsDelete(variantId, ['pre_sale_price', 'pre_sale_compare']);
          // Produkt-Badge einmal pro Produkt auf den Vorzustand zurück (z. B. "Hauspreis").
          if (!badgeDone.has(productId)) {
            badgeDone.add(productId);
            await restorePriceBadge(productId, product.preBadgeText?.value, product.preBadgeColor?.value);
            await metafieldsDelete(productId, ['pre_sale_badge_text', 'pre_sale_badge_color', 'sale_badge_emoji', 'sale_badge_color']);
          }
        } else {
          if (preSaleMeta) {
            console.log(`    [${shortId}] Sale bereits aktiv (${currentPrice}), übersprungen`);
            continue;
          }
          const currentPriceNum = parseFloat(currentPrice);
          const compareNum      = parseFloat(compareAtPrice);
          // UVP = vorhandener Vergleichspreis (z. B. Hauspreis-UVP), sonst der aktuelle Preis.
          const uvp = (Number.isFinite(compareNum) && compareNum > currentPriceNum) ? compareNum : currentPriceNum;
          const newSalePrice = discountType === 'fixed'
            ? parseFloat(salePrice).toFixed(2)
            : (uvp * (1 - parseFloat(discountPct) / 100)).toFixed(2);
          const salePriceNum = parseFloat(newSalePrice);
          if (!(salePriceNum > 0) || salePriceNum >= uvp) {
            console.warn(`    [${shortId}] Angebotspreis ${newSalePrice} nicht < UVP ${uvp} — übersprungen`);
            continue;
          }

          await savePreSaleVariant(variantId, currentPrice, compareAtPrice);
          const upd = await gql(
            `mutation($pid: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkUpdate(productId: $pid, variants: $variants) { userErrors { field message } }
            }`,
            { pid: productId, variants: [{ id: variantId, price: newSalePrice, compareAtPrice: uvp.toFixed(2) }] }
          );
          const errs = upd.productVariantsBulkUpdate.userErrors;
          if (errs.length) { console.error(`    [${shortId}] Preisupdate fehlgeschlagen:`, errs); allOk = false; continue; }
          console.log(`    [${shortId}] ${currentPrice} → ${newSalePrice} (UVP ${uvp.toFixed(2)})`);

          // Produkt-Badge einmal pro Produkt: Label + Rabatt-% zur UVP (z. B. "Sale -30%").
          // Genau das lesen price.liquid (PDP) UND das Kachel-Asset (fs-sale-percent.js).
          if (!badgeDone.has(productId)) {
            badgeDone.add(productId);
            await savePreSaleBadge(productId, product.curBadgeText?.value, product.curBadgeColor?.value);
            const pct = Math.round((uvp - salePriceNum) / uvp * 100);
            const label = (badgeEmoji ? badgeEmoji + ' ' : '') + '-' + pct + '%';
            await setPriceBadge(productId, label, badgeColor);
            console.log(`    [${productId.split('/').pop()}] Produkt-Badge "${label}"`);
          }
        }
      }
    }

    if (expired && allOk) {
      await deleteMetaobject(entry.id);
      console.log(`    Eintrag gelöscht`);
    }
  }
}

async function processScheduledSaleMembers() {
  // DEPRECATED: Neue Einträge bitte als "scheduled_sale" mit gesetztem "collection"-Feld anlegen.
  // Diese Funktion verarbeitet nur noch bestehende scheduled_sale_member-Einträge.
  console.log('\n=== Scheduled sale members (deprecated, Bestandseinträge) ===');

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
