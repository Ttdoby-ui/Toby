// Entfernt die "B2B Rechnung Zahlung" Payment Customization,
// da Blockify diese Logik bereits übernimmt.
//
// Aufruf (Windows CMD), im Ordner b2b-shopify-app:
//   set CLIENT_ID=deine-client-id
//   set CLIENT_SECRET=dein-schluessel
//   node scripts/deaktiviere-rechnung-zahlung.mjs

const SHOP = "e7ee88-2.myshopify.com";
const API_VERSION = "2026-04";

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("FEHLER: Bitte CLIENT_ID und CLIENT_SECRET als Umgebungsvariablen setzen.");
  process.exit(1);
}

async function getToken() {
  const res = await fetch("https://api.shopify.com/auth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
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

  // Alle Payment Customizations auflisten
  const list = await gql(token, `{
    paymentCustomizations(first: 20) {
      nodes { id title enabled }
    }
  }`);

  const customizations = list.data?.paymentCustomizations?.nodes ?? [];
  console.log("Gefundene Payment Customizations:");
  customizations.forEach((c) => console.log(`  - ${c.title} (${c.id}) enabled=${c.enabled}`));

  const target = customizations.find((c) => c.title === "B2B Rechnung Zahlung");
  if (!target) {
    console.log("\n'B2B Rechnung Zahlung' nicht gefunden — möglicherweise bereits entfernt.");
    return;
  }

  // Löschen
  const del = await gql(token, `
    mutation($id: ID!) {
      paymentCustomizationDelete(id: $id) {
        deletedId
        userErrors { field message }
      }
    }
  `, { id: target.id });

  const errors = del.data?.paymentCustomizationDelete?.userErrors ?? [];
  if (errors.length > 0) {
    console.log("✗ Fehler:", errors.map((e) => e.message).join("; "));
  } else {
    console.log(`\n✔ '${target.title}' erfolgreich gelöscht.`);
    console.log("  Blockify übernimmt die B2B-Rechnung-Logik.");
  }
}

main().catch((e) => {
  console.error("Abbruch:", e.message);
  process.exit(1);
});
