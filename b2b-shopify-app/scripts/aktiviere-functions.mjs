// Aktiviert die beiden B2B-Funktionen im Shop:
//   1. b2b-preis-rabatt  -> als automatischer App-Rabatt (discountAutomaticAppCreate)
//   2. b2b-kein-gratisversand -> als Versandanpassung (deliveryCustomizationCreate)
//
// Nur Deployen reicht NICHT - eine Function muss als Rabatt bzw.
// Versandanpassung "scharf geschaltet" werden, damit sie im Checkout läuft.
//
// Das Skript ist idempotent: existiert die Aktivierung schon, wird sie
// uebersprungen (kein Duplikat).
//
// Aufruf (Windows CMD), im Ordner b2b-shopify-app:
//   set CLIENT_ID=deine-client-id
//   set CLIENT_SECRET=dein-schluessel
//   node scripts/aktiviere-functions.mjs

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
  console.log("Token erhalten OK\n");

  // 1. Funktionen der App auslesen
  const fnRes = await gql(token, `{
    shopifyFunctions(first: 25) {
      nodes { id title apiType }
    }
  }`);

  if (fnRes.errors) {
    console.error("Fehler beim Lesen der Functions:", JSON.stringify(fnRes.errors));
    return;
  }

  const fns = fnRes.data.shopifyFunctions.nodes || [];
  console.log("Gefundene Functions:");
  for (const f of fns) console.log(`  - ${f.title} [${f.apiType}] id=${f.id}`);
  console.log("");

  const discountFn = fns.find(
    (f) => f.apiType === "product_discounts" || /preis.?rabatt/i.test(f.title)
  );
  const deliveryFn = fns.find(
    (f) => f.apiType === "delivery_customization" || /gratisversand|versand/i.test(f.title)
  );

  // 2. Preis-Rabatt aktivieren
  if (!discountFn) {
    console.log("WARNUNG: Keine product_discounts-Function gefunden (b2b-preis-rabatt).");
  } else {
    const existing = await gql(token, `{
      automaticDiscountNodes(first: 50) {
        nodes {
          automaticDiscount {
            ... on DiscountAutomaticApp {
              title
              appDiscountType { functionId }
            }
          }
        }
      }
    }`);
    const already = (existing.data?.automaticDiscountNodes?.nodes || []).some(
      (n) => n.automaticDiscount?.appDiscountType?.functionId === discountFn.id
    );

    if (already) {
      console.log("Preis-Rabatt: bereits aktiv (uebersprungen).");
    } else {
      const r = await gql(
        token,
        `mutation Create($d: DiscountAutomaticAppInput!) {
          discountAutomaticAppCreate(automaticAppDiscount: $d) {
            automaticAppDiscount { discountId }
            userErrors { field message }
          }
        }`,
        {
          d: {
            title: "B2B Preisstufen",
            functionId: discountFn.id,
            startsAt: new Date().toISOString(),
            combinesWith: {
              orderDiscounts: true,
              productDiscounts: false,
              shippingDiscounts: true,
            },
          },
        }
      );
      const errs = r.data?.discountAutomaticAppCreate?.userErrors || [];
      if (r.errors || errs.length) {
        console.error("Preis-Rabatt FEHLER:", JSON.stringify(r.errors || errs));
      } else {
        console.log(
          "Preis-Rabatt AKTIVIERT:",
          r.data.discountAutomaticAppCreate.automaticAppDiscount.discountId
        );
      }
    }
  }

  // 3. Versandanpassung aktivieren
  if (!deliveryFn) {
    console.log("WARNUNG: Keine delivery_customization-Function gefunden (b2b-kein-gratisversand).");
  } else {
    const existing = await gql(token, `{
      deliveryCustomizations(first: 50) {
        nodes { functionId }
      }
    }`);
    const already = (existing.data?.deliveryCustomizations?.nodes || []).some(
      (n) => n.functionId === deliveryFn.id
    );

    if (already) {
      console.log("Versandanpassung: bereits aktiv (uebersprungen).");
    } else {
      const r = await gql(
        token,
        `mutation Create($c: DeliveryCustomizationInput!) {
          deliveryCustomizationCreate(deliveryCustomization: $c) {
            deliveryCustomization { id }
            userErrors { field message }
          }
        }`,
        {
          c: {
            title: "B2B kein Gratisversand",
            functionId: deliveryFn.id,
            enabled: true,
          },
        }
      );
      const errs = r.data?.deliveryCustomizationCreate?.userErrors || [];
      if (r.errors || errs.length) {
        console.error("Versandanpassung FEHLER:", JSON.stringify(r.errors || errs));
      } else {
        console.log(
          "Versandanpassung AKTIVIERT:",
          r.data.deliveryCustomizationCreate.deliveryCustomization.id
        );
      }
    }
  }

  console.log("\nFertig.");
}

main().catch((e) => {
  console.error("Abbruch:", e.message);
  process.exit(1);
});
