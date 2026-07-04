/**
 * Legt den automatischen "POS-Abrundung"-Rabatt an (Order-Discount, nur POS).
 *
 * Muss von der BESITZENDEN App ("VIP Belaege Discount") laufen -> Token per
 * Client-Credentials-Grant mit deren CLIENT_ID/CLIENT_SECRET (wie beim
 * Kollektionsrabatt). Die Function "POS-Abrundung (10 Cent)" muss zuvor per
 * `shopify app deploy` (vom PC) deployt sein.
 *
 * Env (vom GitHub-Workflow gesetzt):
 *   STORE_DOMAIN     z. B. e7ee88-2.myshopify.com
 *   CLIENT_ID        Client-ID der App (Secret)
 *   CLIENT_SECRET    Client-Secret der App (Secret)
 *   TITLE            optional, Default "POS-Abrundung"
 *   FUNCTION_ID      optional (sonst automatisch ueber den Titel gefunden)
 *   STARTS_AT        optional ISO-Zeitpunkt, Default: jetzt
 */

const API_VERSION = "2025-10";

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

/** Findet die Abrundungs-Function anhand des Titels. */
async function findFunctionId(storeDomain, token) {
  const data = await adminGraphql(
    storeDomain,
    token,
    `{ shopifyFunctions(first: 50) { nodes { id title apiType } } }`
  );
  const nodes = data?.shopifyFunctions?.nodes ?? [];
  const chosen = nodes.find((n) => /abrundung/i.test(n.title ?? ""));
  if (!chosen) {
    throw new Error(
      `Abrundungs-Function nicht gefunden. Ist die App deployt/installiert? ` +
        `Verfuegbar: ${nodes.map((n) => `${n.title} (${n.id})`).join(", ")}. ` +
        `Sonst FUNCTION_ID manuell setzen.`
    );
  }
  console.log(`Function gefunden: ${chosen.title} -> ${chosen.id}`);
  return chosen.id;
}

async function createDiscount({ storeDomain, token, title, functionId, startsAt }) {
  const mutation = `
    mutation CreatePosAbrundung($discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $discount) {
        automaticAppDiscount { discountId title status }
        userErrors { field message }
      }
    }`;

  const variables = {
    discount: {
      title,
      functionId,
      // Order-Rabatt (Abzug auf die Zwischensumme).
      discountClasses: ["ORDER"],
      startsAt: startsAt || new Date().toISOString(),
      combinesWith: {
        // true, damit die Abrundung mit ggf. weiteren Rabatten kombiniert.
        orderDiscounts: true,
        productDiscounts: true,
        shippingDiscounts: true,
      },
    },
  };

  const data = await adminGraphql(storeDomain, token, mutation, variables);
  const result = data?.discountAutomaticAppCreate;
  const userErrors = result?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(
      `Rabatt nicht angelegt:\n${userErrors.map((e) => `  - ${e.field}: ${e.message}`).join("\n")}`
    );
  }
  return result.automaticAppDiscount;
}

async function main() {
  const storeDomain = required("STORE_DOMAIN");
  const clientId = required("CLIENT_ID");
  const clientSecret = required("CLIENT_SECRET");
  const title = process.env.TITLE?.trim() || "POS-Abrundung";

  const token = await getAccessToken(storeDomain, clientId, clientSecret);
  console.log("Access-Token erhalten.");

  let functionId = process.env.FUNCTION_ID?.trim();
  if (!functionId) functionId = await findFunctionId(storeDomain, token);

  const discount = await createDiscount({
    storeDomain,
    token,
    title,
    functionId,
    startsAt: process.env.STARTS_AT?.trim(),
  });

  console.log("\nRabatt angelegt:");
  console.log(`  Titel:  ${discount.title}`);
  console.log(`  ID:     ${discount.discountId}`);
  console.log(`  Status: ${discount.status}`);
}

main().catch((err) => {
  console.error(`\nFEHLER: ${err.message}`);
  process.exit(1);
});
