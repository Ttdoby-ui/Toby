// Setzt preis_b2b3 für ALLE Produkte, die noch KEINEN B2B3-Preis haben.
//   Netto_B2B3 = round(UVP / 1.19, 2)
// Bereits gesetzte B2B3-Preise bleiben unangetastet.
//
// Voraussetzung: Die App braucht die Berechtigung 'write_products'.
//
// Aufruf (Windows CMD), im Ordner b2b-shopify-app:
//   set CLIENT_ID=deine-client-id
//   set CLIENT_SECRET=dein-schluessel
//   node scripts/setze-b2b3-rest.mjs

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

// Netto = round(UVP / 1.19, 2)
const berechneNetto = (uvp) => Math.round(uvp / 1.19 * 100) / 100;

async function holeAlleProdukte(token) {
  const produkte = [];
  let cursor = null;
  let page = 1;
  do {
    const res = await gql(token, `
      query($cursor: String) {
        products(first: 50, after: $cursor) {
          nodes {
            id
            variants(first: 1) { nodes { price } }
            preis_b2b3: metafield(namespace: "custom", key: "preis_b2b3") { value }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { cursor });
    if (res.errors) throw new Error("Ladefehler: " + JSON.stringify(res.errors));
    const data = res.data.products;
    produkte.push(...data.nodes);
    cursor = data.pageInfo.hasNextPage ? data.pageInfo.endCursor : null;
    if (page % 5 === 0) console.log(`  ... ${produkte.length} Produkte geladen`);
    page++;
  } while (cursor);
  return produkte;
}

async function setzeMetafelder(token, metafields) {
  const res = await gql(token, `
    mutation($m: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $m) {
        metafields { id }
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

  console.log("Lade alle Produkte...");
  const alle = await holeAlleProdukte(token);
  console.log(`Gesamt: ${alle.length} Produkte\n`);

  const offen = alle
    .filter(p => !p.preis_b2b3 || p.preis_b2b3.value == null || p.preis_b2b3.value === "")
    .map(p => {
      const uvp = parseFloat(p.variants.nodes[0]?.price ?? "0");
      return { id: p.id, uvp, netto: berechneNetto(uvp) };
    })
    .filter(p => p.uvp > 0);

  const schonGesetzt = alle.length - offen.length;
  console.log(`Bereits gesetzt (übersprungen): ${schonGesetzt}`);
  console.log(`Neu zu setzen (UVP ÷ 1,19):     ${offen.length}\n`);

  if (offen.length === 0) {
    console.log("Nichts zu tun – alle Produkte haben bereits einen B2B3-Preis.");
    return;
  }

  const inputs = offen.map(p => ({
    ownerId: p.id,
    namespace: "custom",
    key: "preis_b2b3",
    value: p.netto.toString(),
    type: "number_decimal",
  }));

  console.log("Setze Metafelder...");
  let gesetzt = 0;
  for (let i = 0; i < inputs.length; i += 25) {
    gesetzt += await setzeMetafelder(token, inputs.slice(i, i + 25));
    if ((Math.floor(i / 25) + 1) % 5 === 0) console.log(`  ... ${gesetzt} gesetzt`);
  }

  console.log(`\n✔ Fertig! ${gesetzt} Produkte mit B2B3-Netto-Preis (UVP ÷ 1,19) versehen.`);
}

main().catch(e => {
  console.error("Abbruch:", e.message);
  process.exit(1);
});
