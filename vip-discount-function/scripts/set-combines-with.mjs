/**
 * Setzt `combinesWith.productDiscounts = true` auf den beiden Function-basierten
 * Mengenrabatten (Belaege / Textilien), damit sie mit anderen automatischen
 * Produktrabatten (v. a. den nativen VIP-Rabatten) im selben Warenkorb
 * KOMBINIEREN. Ohne das wendet Shopify pro Bestellung nur EINEN automatischen
 * Produktrabatt an -> liegen Belag (Function) und z. B. Ball (VIP) zusammen im
 * Warenkorb, verliert ein Artikel seinen Rabatt.
 *
 * Muss von der BESITZENDEN App ("VIP Belaege Discount") laufen -> Token per
 * Client-Credentials-Grant mit deren CLIENT_ID/CLIENT_SECRET (wie beim Anlegen).
 *
 * Env:
 *   STORE_DOMAIN    z. B. e7ee88-2.myshopify.com
 *   CLIENT_ID       Client-ID der App (Secret)
 *   CLIENT_SECRET   Client-Secret der App (Secret)
 *   DISCOUNT_IDS    optional, kommagetrennte DiscountAutomaticNode-GIDs
 *                   (Default: Belaege + Textilien Mengenrabatt)
 */

const API_VERSION = "2025-10";

const DEFAULT_IDS = [
  "gid://shopify/DiscountAutomaticNode/2341460803932", // Belaege Mengenrabatt
  "gid://shopify/DiscountAutomaticNode/2341602459996", // Textilien - Mengenrabatt
];

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Pflichtwert fehlt: ${name}`);
  return value.trim();
}

async function getAccessToken(storeDomain, clientId, clientSecret) {
  const res = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token-Anfrage fehlgeschlagen (${res.status}): ${text}`);
  const token = JSON.parse(text).access_token;
  if (!token) throw new Error(`Kein access_token in der Antwort: ${text}`);
  return token;
}

async function adminGraphql(storeDomain, token, query, variables) {
  const res = await fetch(
    `https://${storeDomain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Admin-API-Fehler (${res.status}): ${text}`);
  const body = JSON.parse(text);
  if (body.errors) throw new Error(`GraphQL-Fehler: ${JSON.stringify(body.errors, null, 2)}`);
  return body.data;
}

const MUTATION = `
  mutation SetCombines($id: ID!) {
    discountAutomaticAppUpdate(
      id: $id
      automaticAppDiscount: {
        combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true }
      }
    ) {
      userErrors { field message }
      automaticAppDiscount {
        title
        combinesWith { orderDiscounts productDiscounts shippingDiscounts }
      }
    }
  }
`;

async function main() {
  const storeDomain = required("STORE_DOMAIN");
  const clientId = required("CLIENT_ID");
  const clientSecret = required("CLIENT_SECRET");
  const ids = (process.env.DISCOUNT_IDS?.trim()
    ? process.env.DISCOUNT_IDS.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_IDS);

  const token = await getAccessToken(storeDomain, clientId, clientSecret);

  let failed = 0;
  for (const id of ids) {
    const data = await adminGraphql(storeDomain, token, MUTATION, { id });
    const r = data.discountAutomaticAppUpdate;
    if (r.userErrors?.length) {
      failed++;
      console.error(`FEHLER bei ${id}: ${JSON.stringify(r.userErrors)}`);
    } else {
      console.log(
        `OK: "${r.automaticAppDiscount.title}" -> combinesWith =`,
        JSON.stringify(r.automaticAppDiscount.combinesWith)
      );
    }
  }
  if (failed) process.exit(1);
  console.log("Fertig. Alle Rabatte auf produktkombinierbar gesetzt.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
