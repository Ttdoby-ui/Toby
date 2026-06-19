// Aktiviert die drei B2B-Funktionen (Rabatt, Versand, Zahlung) per Admin API.
// Meldet sich als Futurespin-B2B-App an (Client Credentials Grant) und legt an:
//   1) Automatischer Rabatt  -> B2B Preise
//   2) Versandanpassung       -> B2B Kein Gratisversand
//   3) Zahlungsanpassung      -> B2B Rechnung Zahlung
//
// Aufruf (Windows CMD), im Ordner b2b-shopify-app:
//   set CLIENT_ID=deine-client-id
//   set CLIENT_SECRET=dein-schluessel
//   node scripts/aktiviere-b2b.mjs

const SHOP = "e7ee88-2.myshopify.com";
const API_VERSION = "2026-04";

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const FUNCTIONS = {
  rabatt: "fc0df1b4-5e41-f214-d1e4-48e6120983ff5ab589f6",
  versand: "ebb9ddca-645f-418f-6825-620be0fcc33b98c9ca2f",
  zahlung: "fdd67d40-94ad-70f0-9ce8-66afe983c8199264199f",
};

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
  if (!data.access_token) {
    throw new Error("Kein Token erhalten: " + JSON.stringify(data));
  }
  return data.access_token;
}

async function adminGraphQL(token, query, variables) {
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

function report(label, payload) {
  const errors = payload?.userErrors ?? [];
  if (errors.length > 0) {
    console.log(`✗ ${label}: ` + errors.map((e) => e.message).join("; "));
  } else {
    console.log(`✔ ${label} angelegt`);
  }
}

async function main() {
  const token = await getToken();
  console.log("Token erhalten ✔\n");

  // 1) Automatischer Rabatt
  const rabatt = await adminGraphQL(
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
        functionId: FUNCTIONS.rabatt,
        startsAt: "2026-06-19T00:00:00Z",
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
      },
    }
  );
  report("Rabatt (B2B Preise)", rabatt.data?.discountAutomaticAppCreate ?? rabatt);

  // 2) Versandanpassung
  const versand = await adminGraphQL(
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
        functionId: FUNCTIONS.versand,
        enabled: true,
      },
    }
  );
  report("Versand (B2B Kein Gratisversand)", versand.data?.deliveryCustomizationCreate ?? versand);

  // 3) Zahlungsanpassung
  const zahlung = await adminGraphQL(
    token,
    `mutation($d: PaymentCustomizationInput!) {
      paymentCustomizationCreate(paymentCustomization: $d) {
        paymentCustomization { id title enabled }
        userErrors { field message }
      }
    }`,
    {
      d: {
        title: "B2B Rechnung Zahlung",
        functionId: FUNCTIONS.zahlung,
        enabled: true,
      },
    }
  );
  report("Zahlung (B2B Rechnung Zahlung)", zahlung.data?.paymentCustomizationCreate ?? zahlung);

  console.log("\nFertig! Prüfe die Aktivierungen im Shopify Admin.");
}

main().catch((e) => {
  console.error("Abbruch:", e.message);
  process.exit(1);
});
