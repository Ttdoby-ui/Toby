// Setzt preis_b2b1 für alle Andro-Beläge nach der Formel:
//   Netto_B2B1 = round((UVP / 2 * 0.95) / 1.19, 2)
// → B2B1-Kunde zahlt (UVP/2)*0,95 brutto inkl. 19% MwSt.
//
// Aufruf (Windows CMD), im Ordner b2b-shopify-app:
//   set CLIENT_ID=deine-client-id
//   set CLIENT_SECRET=dein-schluessel
//   node scripts/setze-b2b1-andro-belaege.mjs

const SHOP = "e7ee88-2.myshopify.com";
const API_VERSION = "2026-04";
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

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

// Gibt zurück ob der productType ein Belag (Gummi) ist
function isBelag(productType) {
  const t = productType.toLowerCase();
  return t.includes("nopp") || t.includes("anti");
}

// Formel: Netto = round((UVP/2 * 0.95) / 1.19, 2)
function berechneNettoB2B1(uvp) {
  return Math.round((uvp / 2 * 0.95) / 1.19 * 100) / 100;
}

async function holeAlleAndroProdukte(token) {
  const produkte = [];
  let cursor = null;
  let page = 1;

  do {
    const res = await gql(token, `
      query($cursor: String) {
        products(first: 50, query: "vendor:andro", after: $cursor) {
          nodes {
            id
            title
            productType
            variants(first: 1) { nodes { price } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { cursor });

    if (res.errors) throw new Error("Fehler beim Laden: " + JSON.stringify(res.errors));
    const data = res.data.products;
    produkte.push(...data.nodes);
    cursor = data.pageInfo.hasNextPage ? data.pageInfo.endCursor : null;
    console.log(`Seite ${page}: ${data.nodes.length} Produkte geladen`);
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
  if (errors.length > 0) {
    throw new Error("userErrors: " + errors.map(e => e.message).join("; "));
  }
  return res.data.metafieldsSet.metafields.length;
}

async function main() {
  const token = await getToken();
  console.log("Token erhalten ✔\n");

  // Alle Andro-Produkte holen
  const alleProdukte = await holeAlleAndroProdukte(token);
  console.log(`\nGesamt: ${alleProdukte.length} Andro-Produkte\n`);

  // Nur Beläge filtern und Preise berechnen
  const belaege = alleProdukte
    .filter(p => isBelag(p.productType))
    .map(p => {
      const uvp = parseFloat(p.variants.nodes[0]?.price ?? "0");
      const netto = berechneNettoB2B1(uvp);
      return { id: p.id, title: p.title, uvp, netto };
    });

  console.log(`Gefundene Beläge (${belaege.length} Stück):`);
  belaege.forEach(b =>
    console.log(`  ${b.title.padEnd(45)} UVP ${b.uvp.toFixed(2).padStart(6)}€  →  B2B1 Netto ${b.netto.toFixed(2).padStart(6)}€  (Brutto ca. ${(b.netto * 1.19).toFixed(2)}€)`)
  );

  if (belaege.length === 0) {
    console.log("Keine Beläge gefunden – Abbruch.");
    return;
  }

  console.log("\nSetze Metafelder...");

  // Metafield-Inputs für metafieldsSet
  const inputs = belaege.map(b => ({
    ownerId: b.id,
    namespace: "custom",
    key: "preis_b2b1",
    value: b.netto.toString(),
    type: "number_decimal",
  }));

  // In 25er-Batches senden
  let gesetzt = 0;
  for (let i = 0; i < inputs.length; i += 25) {
    const batch = inputs.slice(i, i + 25);
    const count = await setzeMetafelder(token, batch);
    gesetzt += count;
    console.log(`  Batch ${Math.floor(i/25)+1}: ${count} Metafelder gesetzt`);
  }

  console.log(`\n✔ Fertig! ${gesetzt} Beläge mit B2B1-Netto-Preisen versehen.`);
  console.log("  Der B2B1-Kunde zahlt jetzt (UVP ÷ 2 × 0,95) als Brutto-Preis.");
}

main().catch(e => {
  console.error("Abbruch:", e.message);
  process.exit(1);
});
