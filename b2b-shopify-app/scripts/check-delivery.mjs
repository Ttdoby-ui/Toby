// Zeigt alle Delivery Customizations und ihren Status an.
//
// Aufruf (Windows CMD), im Ordner b2b-shopify-app:
//   set CLIENT_ID=deine-client-id
//   set CLIENT_SECRET=dein-schluessel
//   node scripts/check-delivery.mjs

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

async function main() {
  const token = await getToken();
  console.log("Token erhalten ✔\n");

  // Alle Delivery Customizations
  const res = await gql(token, `{
    deliveryCustomizations(first: 20) {
      nodes { id title enabled functionId }
    }
  }`);

  if (res.errors) {
    console.error("Fehler:", JSON.stringify(res.errors));
    return;
  }

  const list = res.data.deliveryCustomizations.nodes;
  console.log(`Delivery Customizations (${list.length} gesamt):`);
  if (list.length === 0) {
    console.log("  (keine vorhanden)");
  } else {
    for (const c of list) {
      console.log(`  ${c.enabled ? "✔ aktiv" : "✗ inaktiv"}  "${c.title}"  id=${c.id}  fn=${c.functionId}`);
    }
  }

  // Automatische Rabatte
  console.log("\nAutomatische Rabatte:");
  const rab = await gql(token, `{
    discountNodes(first: 20, query: "status:active") {
      nodes {
        id
        discount {
          ... on DiscountAutomaticApp {
            title
            status
          }
          ... on DiscountAutomaticBasic {
            title
            status
          }
        }
      }
    }
  }`);

  if (rab.errors) {
    console.log("  Fehler beim Laden:", JSON.stringify(rab.errors));
  } else {
    const nodes = rab.data.discountNodes.nodes;
    if (nodes.length === 0) {
      console.log("  (keine aktiven Rabatte)");
    } else {
      for (const n of nodes) {
        const d = n.discount;
        if (d?.title) console.log(`  ✔ "${d.title}" (${d.status})`);
      }
    }
  }

  // Functions
  console.log("\nShopify Functions:");
  const fn = await gql(token, `{ shopifyFunctions(first: 20) { nodes { id title apiType } } }`);
  if (fn.errors) {
    console.log("  Fehler:", JSON.stringify(fn.errors));
  } else {
    for (const f of fn.data.shopifyFunctions.nodes) {
      console.log(`  [${f.apiType}] "${f.title}"  id=${f.id}`);
    }
  }
}

main().catch(e => {
  console.error("Abbruch:", e.message);
  process.exit(1);
});
