// Aktiviert die B2B-Funktionen korrekt:
//   1) Automatischer Rabatt  -> B2B Preise (product_discounts)
//   2) Versandanpassung       -> B2B Kein Gratisversand (delivery_customization)
// Die Zahlungsanpassung (Rechnung) wird NICHT angelegt -> Blockify übernimmt das.
//
// Holt den Token vom korrekten Endpunkt (Shop /admin/oauth/access_token)
// und liest die echten Function-IDs selbst aus (keine Tippfehler).
//
// Aufruf (Windows CMD), im Ordner b2b-shopify-app:
//   set CLIENT_ID=deine-client-id
//   set CLIENT_SECRET=dein-schluessel
//   node scripts/aktiviere-b2b.mjs

const SHOP = "e7ee88-2.myshopify.com";
const API_VERSION = "2026-04";

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("FEHLER: Bitte CLIENT_ID und CLIENT_SECRET als Umgebungsvariablen setzen.");
  process.exit(1);
}

async function getToken() {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
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

// Meldet ECHTE Fehler: sowohl GraphQL-Top-Level-Fehler als auch userErrors.
function report(label, full, mutationKey) {
  if (full.errors) {
    console.log(`✗ ${label}: GraphQL-Fehler: ` + JSON.stringify(full.errors).slice(0, 400));
    return;
  }
  const payload = full.data?.[mutationKey];
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) {
    console.log(`✗ ${label}: ` + userErrors.map((e) => `${(e.field || []).join(".")}: ${e.message}`).join("; "));
  } else {
    console.log(`✔ ${label} angelegt`);
  }
}

async function main() {
  const token = await getToken();
  console.log("Token erhalten ✔\n");

  // Echte Function-IDs auslesen und nach apiType zuordnen
  const fnRes = await gql(token, `{
    shopifyFunctions(first: 50) { nodes { id title apiType } }
  }`);
  if (fnRes.errors) {
    throw new Error("Funktionen nicht lesbar: " + JSON.stringify(fnRes.errors));
  }
  const fns = fnRes.data.shopifyFunctions.nodes;
  const byType = (t) => fns.find((f) => f.apiType === t)?.id;

  const rabattId = byType("product_discounts");
  const versandId = byType("delivery_customization");

  console.log("Function-IDs:");
  console.log("  Rabatt (product_discounts):       " + rabattId);
  console.log("  Versand (delivery_customization): " + versandId);
  console.log("");

  if (!rabattId || !versandId) {
    throw new Error("Eine benötigte Function-ID fehlt. Abbruch.");
  }

  // 1) Automatischer Rabatt -> B2B Preise
  const rabatt = await gql(
    token,
    `mutation($d: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $d) {
        automaticAppDiscount { discountId title status }
        userErrors { field message }
      }
    }`,
    {
      d: {
        title: "B2B Preise",
        functionId: rabattId,
        startsAt: new Date().toISOString(),
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
      },
    }
  );
  report("Rabatt (B2B Preise)", rabatt, "discountAutomaticAppCreate");

  // 2) Versandanpassung -> B2B Kein Gratisversand
  const versand = await gql(
    token,
    `mutation($d: DeliveryCustomizationInput!) {
      deliveryCustomizationCreate(deliveryCustomization: $d) {
        deliveryCustomization { id title enabled }
        userErrors { field message }
      }
    }`,
    {
      d: {
        title: "B2B Kein Gratisversand",
        functionId: versandId,
        enabled: true,
      },
    }
  );
  report("Versand (B2B Kein Gratisversand)", versand, "deliveryCustomizationCreate");

  console.log("\nFertig! (Rechnung-Zahlung wurde bewusst NICHT angelegt -> Blockify.)");
}

main().catch((e) => {
  console.error("Abbruch:", e.message);
  process.exit(1);
});
