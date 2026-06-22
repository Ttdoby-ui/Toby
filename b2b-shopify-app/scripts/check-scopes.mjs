// Zeigt die tatsächlich gewährten Access-Scopes der App an.
// Wichtig, um zu prüfen, ob read_customers aktiv ist (nötig, damit
// die Funktionen die B2B-Tags des Kunden lesen können).
//
// Aufruf (Windows CMD), im Ordner b2b-shopify-app:
//   set CLIENT_ID=deine-client-id
//   set CLIENT_SECRET=dein-schluessel
//   node scripts/check-scopes.mjs

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

async function gql(token, query) {
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

async function main() {
  const token = await getToken();
  console.log("Token erhalten ✔\n");

  const res = await gql(token, `{
    currentAppInstallation {
      accessScopes { handle }
    }
  }`);

  if (res.errors) {
    console.error("Fehler:", JSON.stringify(res.errors));
    return;
  }

  const scopes = (res.data.currentAppInstallation.accessScopes || []).map(s => s.handle).sort();
  console.log("Gewährte Access-Scopes der App:");
  for (const s of scopes) console.log("  • " + s);

  console.log("");
  const hasCustomers = scopes.includes("read_customers") || scopes.includes("write_customers");
  if (hasCustomers) {
    console.log("✔ read_customers ist AKTIV – Funktionen können Kunden-Tags lesen.");
  } else {
    console.log("✗ read_customers FEHLT – Funktionen sehen den Kunden als null!");
    console.log("  -> Scope im Dev Dashboard hinzufügen + App neu autorisieren.");
  }
}

main().catch(e => {
  console.error("Abbruch:", e.message);
  process.exit(1);
});
