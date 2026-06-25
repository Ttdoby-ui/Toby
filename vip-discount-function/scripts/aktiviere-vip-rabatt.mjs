// Aktiviert die VIP-/Sonderrabatt-Function "bester-rabatt" im Shop als
// automatischen App-Rabatt (discountAutomaticAppCreate).
//
// Nur Deployen reicht NICHT - die Function muss als Rabatt "scharf
// geschaltet" werden, damit sie im Checkout laeuft.
//
// Das Skript ist idempotent: existiert die Aktivierung schon, wird sie
// uebersprungen (kein Duplikat). Es gibt ausserdem die gewaehrten Scopes
// aus, damit man sieht, ob read_customers (fuer das Kunden-Metafeld
// futurespin.sonderrabatte) bereits genehmigt ist.
//
// Aufruf (Windows CMD), im Ordner vip-discount-function:
//   set CLIENT_ID=9fe6aa2d03cc52e54d29fdba8ee8d823
//   set CLIENT_SECRET=dein-schluessel
//   node scripts/aktiviere-vip-rabatt.mjs
//
// Bash/Git-Bash:
//   CLIENT_ID=... CLIENT_SECRET=... node scripts/aktiviere-vip-rabatt.mjs

const SHOP = "e7ee88-2.myshopify.com";
const API_VERSION = "2026-04";
const FUNCTION_HANDLE = "bester-rabatt";
const DISCOUNT_TITLE = "VIP & Sonderrabatte";

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
  if (data.scope) console.log("Gewaehrte Scopes:", data.scope);
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

  // 1. Functions der App auslesen (eigener App-Token sieht eigene Functions)
  const fnRes = await gql(token, `{
    shopifyFunctions(first: 50) {
      nodes { id title handle apiType }
    }
  }`);

  if (fnRes.errors) {
    console.error("Fehler beim Lesen der Functions:", JSON.stringify(fnRes.errors));
    return;
  }

  const fns = fnRes.data.shopifyFunctions.nodes || [];
  console.log("Gefundene Functions:");
  for (const f of fns) console.log(`  - ${f.title} [${f.apiType}] handle=${f.handle} id=${f.id}`);
  console.log("");

  const fn =
    fns.find((f) => f.handle === FUNCTION_HANDLE) ||
    fns.find((f) => /bester.?rabatt/i.test(f.title));

  if (!fn) {
    console.error(
      `WARNUNG: Function "${FUNCTION_HANDLE}" nicht gefunden. ` +
        "Ist die App auf dem Shop installiert und die Version released?"
    );
    return;
  }

  // 2. Schon aktiv? (idempotent)
  const existing = await gql(token, `{
    automaticDiscountNodes(first: 100) {
      nodes {
        id
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
    (n) => n.automaticDiscount?.appDiscountType?.functionId === fn.id
  );
  if (already) {
    console.log("VIP-Rabatt: bereits aktiv (uebersprungen).");
    return;
  }

  // 3. Anlegen — neue Discounts-API: functionHandle + discountClasses.
  //    combinesWith.productDiscounts=false => stapelt nicht mit anderen
  //    Produktrabatten (passend zur Regel "hoechster gewinnt").
  const r = await gql(
    token,
    `mutation Create($d: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $d) {
        automaticAppDiscount { discountId title status }
        userErrors { field message }
      }
    }`,
    {
      d: {
        title: DISCOUNT_TITLE,
        functionHandle: FUNCTION_HANDLE,
        discountClasses: ["PRODUCT"],
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
    console.error("VIP-Rabatt FEHLER:", JSON.stringify(r.errors || errs));
  } else {
    const d = r.data.discountAutomaticAppCreate.automaticAppDiscount;
    console.log(`VIP-Rabatt AKTIVIERT: ${d.discountId} (${d.status})`);
  }
}

main().catch((e) => {
  console.error("Abbruch:", e.message);
  process.exit(1);
});
