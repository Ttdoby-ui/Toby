// Setzt preis_b2b1 für ALLE Artikel der Marken andro und DHS nach der Formel:
//   Netto_B2B1 = round(UVP / 2 * 0.95, 2)
// → B2B1-Kunde zahlt diesen Netto-Preis; brutto = Netto × 1,19.
//
// Aufruf (Windows CMD), im Ordner b2b-shopify-app:
//   set CLIENT_ID=deine-client-id
//   set CLIENT_SECRET=dein-schluessel
//   node scripts/setze-b2b1-andro-belaege.mjs

const SHOP = "e7ee88-2.myshopify.com";
const API_VERSION = "2026-04";
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const MARKEN = ["andro", "DHS"];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("FEHLER: Bitte CLIENT_ID und CLIENT_SECRET setzen.");
  process.exit(1);
}

async function getToken() {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Kein Token: " + JSON.stringify(data));
  return data.access_token;
}

async function gql(token, query, variables) {
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

// Formel: Netto = round(UVP / 2 * 0.95, 2)
function berechneNettoB2B1(uvp) {
  return Math.round(uvp / 2 * 0.95 * 100) / 100;
}

async function holeProdukteFuerMarke(token, vendor) {
  const produkte = [];
  let cursor = null;
  let page = 1;

  do {
    const res = await gql(token, `
      query($cursor: String, $q: String) {
        products(first: 50, query: $q, after: $cursor) {
          nodes {
            id
            title
            productType
            variants(first: 1) { nodes { price } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { cursor, q: `vendor:${vendor}` });

    if (res.errors) throw new Error(`Fehler beim Laden (${vendor}): ` + JSON.stringify(res.errors));
    const data = res.data.products;
    produkte.push(...data.nodes);
    cursor = data.pageInfo.hasNextPage ? data.pageInfo.endCursor : null;
    console.log(`  ${vendor} Seite ${page}: ${data.nodes.length} Produkte`);
    page++;
  } while (cursor);

  return produkte;
}

async function setzeMetafelder(token, metafields) {
  const res = await gql(token, `
    mutation($m: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $m) {
        metafields { key value }
        userErrors { field message }
      }
    }
  `, { m: metafields });

  if (res.errors) throw new Error("Mutation-Fehler: " + JSON.stringify(res.errors));
  const errors = res.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) throw new Error("userErrors: " + errors.map(e => e.message).join("; "));
  return res.data.metafieldsSet.metafields.length;
}

async function main() {
  const token = await getToken();
  console.log("Token erhalten ✔\n");

  // Alle Produkte der Marken laden
  const alleProdukte = [];
  for (const marke of MARKEN) {
    console.log(`Lade ${marke}...`);
    const produkte = await holeProdukteFuerMarke(token, marke);
    console.log(`  → ${produkte.length} Produkte gesamt\n`);
    alleProdukte.push(...produkte.map(p => ({ ...p, vendor: marke })));
  }

  // Preise berechnen (alle Artikel, kein Filter nach Typ)
  const mitPreis = alleProdukte
    .map(p => {
      const uvp = parseFloat(p.variants.nodes[0]?.price ?? "0");
      const netto = berechneNettoB2B1(uvp);
      return { id: p.id, title: p.title, vendor: p.vendor, productType: p.productType, uvp, netto };
    })
    .filter(p => p.uvp > 0);

  console.log(`Artikel mit B2B1-Preis (${mitPreis.length} Stück):`);
  mitPreis.forEach(p =>
    console.log(`  [${p.vendor}] ${p.title.padEnd(50)} UVP ${p.uvp.toFixed(2).padStart(7)}€  →  Netto ${p.netto.toFixed(2).padStart(6)}€  (Brutto ${(p.netto * 1.19).toFixed(2).padStart(6)}€)`)
  );

  if (mitPreis.length === 0) {
    console.log("Keine Produkte gefunden – Abbruch.");
    return;
  }

  console.log("\nSetze Metafelder...");

  const inputs = mitPreis.map(p => ({
    ownerId: p.id,
    namespace: "custom",
    key: "preis_b2b1",
    value: p.netto.toString(),
    type: "number_decimal",
  }));

  // In 25er-Batches senden
  let gesetzt = 0;
  for (let i = 0; i < inputs.length; i += 25) {
    const batch = inputs.slice(i, i + 25);
    const count = await setzeMetafelder(token, batch);
    gesetzt += count;
    console.log(`  Batch ${Math.floor(i / 25) + 1}: ${count} Metafelder gesetzt`);
  }

  console.log(`\n✔ Fertig! ${gesetzt} Artikel mit B2B1-Netto-Preisen versehen.`);
  console.log("  Formel: Netto = UVP ÷ 2 × 0,95 | Brutto = Netto × 1,19");
}

main().catch(e => {
  console.error("Abbruch:", e.message);
  process.exit(1);
});
