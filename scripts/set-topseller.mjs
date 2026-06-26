// set-topseller.mjs
// Berechnet je Collection die Top-N BEST_SELLING-Produkte (Admin-API) und
// schreibt sie ins Collection-Metafeld custom.topseller_products
// (list.product_reference). Die Theme-Section sections/collection-topseller.liquid
// rendert daraus die "Topseller dieser Kategorie"-Leiste serverseitig.
//
// Grund: /products.json?sort_by ignoriert den Sort, daher Vorberechnung.
// Idempotent; einfach periodisch (z. B. woechentlich) erneut laufen lassen.
//
// Aufruf (Git-Bash), im Ordner Desktop/Toby:
//   SHOP=e7ee88-2.myshopify.com CLIENT_ID=... CLIENT_SECRET=... node scripts/set-topseller.mjs
// Die App braucht read_products + write_products.

const SHOP = process.env.SHOP;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const API_VERSION = "2025-01";
const TOP_N = parseInt(process.env.TOP_N || "6", 10);

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error("SHOP, CLIENT_ID und CLIENT_SECRET muessen gesetzt sein.");
  process.exit(1);
}

async function getToken() {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error("Kein Token: " + JSON.stringify(d));
  if (d.scope) console.error("Gewaehrte Scopes:", d.scope);
  return d.access_token;
}

async function gql(token, query, variables) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json();
    if (j.errors && JSON.stringify(j.errors).includes("THROTTLED") && attempt < 8) {
      await new Promise((s) => setTimeout(s, 2000 * (attempt + 1)));
      continue;
    }
    if (j.errors) throw new Error(JSON.stringify(j.errors));
    return j.data;
  }
}

const COLLECTIONS_Q = `
  query($cursor: String, $n: Int!) {
    collections(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        products(first: $n, sortKey: BEST_SELLING) { nodes { id } }
      }
    }
  }`;

const SET_M = `
  mutation($mf: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $mf) {
      metafields { id }
      userErrors { field message }
    }
  }`;

async function main() {
  const token = await getToken();
  console.log("Token OK\n");

  // 1. Alle Collections + ihre Top-N Bestseller laden
  const entries = [];
  let cursor = null;
  do {
    const d = await gql(token, COLLECTIONS_Q, { cursor, n: TOP_N });
    for (const c of d.collections.nodes) {
      const ids = c.products.nodes.map((p) => p.id);
      entries.push({ id: c.id, handle: c.handle, ids });
    }
    cursor = d.collections.pageInfo.hasNextPage ? d.collections.pageInfo.endCursor : null;
    process.stdout.write(`\rCollections geladen: ${entries.length}`);
  } while (cursor);
  console.log("");

  // 2. Metafeld setzen (in Batches zu 25), nur fuer Collections mit Produkten
  const withProducts = entries.filter((e) => e.ids.length > 0);
  const empty = entries.length - withProducts.length;
  let done = 0, errors = 0;
  for (let i = 0; i < withProducts.length; i += 25) {
    const batch = withProducts.slice(i, i + 25).map((e) => ({
      ownerId: e.id,
      namespace: "custom",
      key: "topseller_products",
      type: "list.product_reference",
      value: JSON.stringify(e.ids),
    }));
    const d = await gql(token, SET_M, { mf: batch });
    const ue = d.metafieldsSet.userErrors || [];
    if (ue.length) { errors += ue.length; console.error("\nFehler:", JSON.stringify(ue)); }
    done += d.metafieldsSet.metafields.length;
    process.stdout.write(`\rMetafeld gesetzt: ${done}/${withProducts.length}`);
  }
  console.log(`\n\nFertig. Collections: ${entries.length}, gesetzt: ${done}, ohne Produkte (uebersprungen): ${empty}, Fehler: ${errors}.`);
}

main().catch((e) => { console.error("Abbruch:", e.message); process.exit(1); });
