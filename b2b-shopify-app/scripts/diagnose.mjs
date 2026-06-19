// Diagnose: Findet den korrekten Token-Endpunkt und liest die echten Function-IDs.
//
// Aufruf (Windows CMD), im Ordner b2b-shopify-app:
//   set CLIENT_ID=deine-client-id
//   set CLIENT_SECRET=dein-schluessel
//   node scripts/diagnose.mjs

const SHOP = "e7ee88-2.myshopify.com";
const API_VERSION = "2026-04";

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("FEHLER: Bitte CLIENT_ID und CLIENT_SECRET setzen.");
  process.exit(1);
}

async function tryTokenEndpoint(url, label) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    console.log(`\n[${label}] HTTP ${res.status}`);
    if (data.access_token) {
      console.log("  -> access_token erhalten (Länge " + data.access_token.length + ")");
      return data.access_token;
    } else {
      console.log("  -> kein Token: " + JSON.stringify(data).slice(0, 300));
      return null;
    }
  } catch (e) {
    console.log(`\n[${label}] Netzwerkfehler: ${e.message}`);
    return null;
  }
}

async function adminGraphQL(token, query) {
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

async function main() {
  console.log("=== TOKEN-ENDPUNKTE TESTEN ===");

  // Variante A: Shop-Admin-OAuth (korrekter Client-Credentials-Endpunkt)
  let token = await tryTokenEndpoint(
    `https://${SHOP}/admin/oauth/access_token`,
    "A: Shop /admin/oauth/access_token"
  );

  // Variante B: api.shopify.com (bisher genutzt)
  if (!token) {
    token = await tryTokenEndpoint(
      "https://api.shopify.com/auth/access_token",
      "B: api.shopify.com/auth/access_token"
    );
  }

  if (!token) {
    console.log("\nKein funktionierender Token gefunden. Stoppe.");
    return;
  }

  console.log("\n=== ADMIN-API TESTEN (shopifyFunctions) ===");
  const fns = await adminGraphQL(token, `{
    shopifyFunctions(first: 30) {
      nodes { id title apiType }
    }
  }`);

  if (fns.errors) {
    console.log("Fehler: " + JSON.stringify(fns.errors).slice(0, 400));
  } else {
    const nodes = fns.data?.shopifyFunctions?.nodes ?? [];
    if (nodes.length === 0) {
      console.log("Keine Funktionen sichtbar (Token gehört evtl. zu anderer App).");
    } else {
      console.log("Gefundene Funktionen:");
      nodes.forEach((n) => console.log(`  - ${n.title} | apiType=${n.apiType} | id=${n.id}`));
    }
  }

  console.log("\n=== VORHANDENE ANPASSUNGEN ===");
  const state = await adminGraphQL(token, `{
    deliveryCustomizations(first: 20) { nodes { id title enabled } }
    paymentCustomizations(first: 20) { nodes { id title enabled } }
  }`);
  if (state.errors) {
    console.log("Fehler: " + JSON.stringify(state.errors).slice(0, 400));
  } else {
    console.log("Delivery: " + JSON.stringify(state.data?.deliveryCustomizations?.nodes ?? []));
    console.log("Payment:  " + JSON.stringify(state.data?.paymentCustomizations?.nodes ?? []));
  }

  console.log("\nFertig. Schick mir die komplette Ausgabe.");
}

main().catch((e) => {
  console.error("Abbruch:", e.message);
  process.exit(1);
});
