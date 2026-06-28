/**
 * Legt einen automatischen Kollektionsrabatt (Mengenstaffel) an.
 *
 * Holt zuerst per Client-Credentials-Grant einen Access-Token und ruft dann
 * `discountAutomaticAppCreate` auf der Admin-API auf. Die gesamte Konfiguration
 * (Kollektion + Staffeln + optional VIP) wird als JSON-Metafeld mitgegeben.
 *
 * Erwartete Environment-Variablen (vom GitHub-Workflow gesetzt):
 *   STORE_DOMAIN     z. B. "e7ee88-2.myshopify.com"
 *   CLIENT_ID        Client-ID der App (Secret)
 *   CLIENT_SECRET    Client-Secret der App (Secret)
 *   TITLE            Anzeigename des Rabatts
 *   COLLECTION_ID    Kollektion (GID oder numerische ID)
 *   FUNCTION_ID      ID der deployten Function
 *   TIER1_QTY/PCT .. TIER3_QTY/PCT   Staffeln (leere werden übersprungen)
 *   VIP_HIGHEST_WINS "true" | "false"
 *   STARTS_AT        optional ISO-Zeitpunkt, Default: jetzt
 */

const API_VERSION = "2025-10";

// Bekannte VIP-Staffeln des Stores (Tag → Prozent).
const VIP_TAGS = ["VIP1", "VIP2", "VIP3"];
const VIP_TIERS = [
  { tag: "VIP1", percentage: 15 },
  { tag: "VIP2", percentage: 25 },
  { tag: "VIP3", percentage: 30 },
];

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Pflichtwert fehlt: ${name}`);
  }
  return value.trim();
}

function toCollectionGid(raw) {
  const value = raw.trim();
  if (value.startsWith("gid://")) return value;
  if (/^\d+$/.test(value)) return `gid://shopify/Collection/${value}`;
  throw new Error(`Ungültige Kollektions-ID: ${raw}`);
}

function buildTiers() {
  const tiers = [];
  for (let i = 1; i <= 3; i++) {
    const qty = process.env[`TIER${i}_QTY`]?.trim();
    const pct = process.env[`TIER${i}_PCT`]?.trim();
    if (!qty && !pct) continue; // Staffel ausgelassen
    const quantity = Number(qty);
    const percentage = Number(pct);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Staffel ${i}: ungültige Menge "${qty}"`);
    }
    if (!Number.isFinite(percentage) || percentage <= 0) {
      throw new Error(`Staffel ${i}: ungültiger Prozentsatz "${pct}"`);
    }
    tiers.push({ quantity, percentage });
  }
  if (tiers.length === 0) {
    throw new Error("Mindestens eine Staffel (Menge + Prozent) angeben.");
  }
  return tiers.sort((a, b) => a.quantity - b.quantity);
}

function buildConfig() {
  const config = {
    collectionIds: [toCollectionGid(required("COLLECTION_ID"))],
    tiers: buildTiers(),
  };
  if ((process.env.VIP_HIGHEST_WINS ?? "true").toLowerCase() === "true") {
    config.vipTags = VIP_TAGS;
    config.vipTiers = VIP_TIERS;
  }
  return config;
}

async function getAccessToken(storeDomain, clientId, clientSecret) {
  // Store-Admin-Token via Client-Credentials-Grant am OAuth-Endpunkt DES STORES
  // (nicht api.shopify.com – das liefert nur einen App-Management-Token, den die
  // Admin-API mit 401 ablehnt).
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
  if (!res.ok) {
    throw new Error(`Token-Anfrage fehlgeschlagen (${res.status}): ${text}`);
  }
  let token;
  try {
    token = JSON.parse(text).access_token;
  } catch {
    throw new Error(`Token-Antwort nicht lesbar: ${text}`);
  }
  if (!token) throw new Error(`Kein access_token in der Antwort: ${text}`);
  return token;
}

async function adminGraphql(storeDomain, token, query, variables) {
  const res = await fetch(
    `https://${storeDomain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Admin-API-Fehler (${res.status}): ${text}`);
  }
  const body = JSON.parse(text);
  if (body.errors) {
    throw new Error(`GraphQL-Fehler: ${JSON.stringify(body.errors, null, 2)}`);
  }
  return body.data;
}

/** Findet die Function-ID anhand des Titels (Fallback: erster Produktrabatt). */
async function findFunctionId(storeDomain, token) {
  const data = await adminGraphql(
    storeDomain,
    token,
    `{ shopifyFunctions(first: 50) { nodes { id title apiType } } }`
  );
  const nodes = data?.shopifyFunctions?.nodes ?? [];
  if (nodes.length === 0) {
    throw new Error(
      "Keine Functions gefunden. Ist die App auf dem Store installiert? " +
        "Sonst FUNCTION_ID manuell setzen."
    );
  }
  const byTitle = nodes.find((n) => /kollektionsrabatt/i.test(n.title ?? ""));
  const byType = nodes.find((n) => /product_discount/i.test(n.apiType ?? ""));
  const chosen = byTitle ?? byType;
  if (!chosen) {
    throw new Error(
      `Function nicht eindeutig. Verfügbar: ${nodes
        .map((n) => `${n.title} (${n.id})`)
        .join(", ")}. FUNCTION_ID manuell setzen.`
    );
  }
  console.log(`Function gefunden: ${chosen.title} → ${chosen.id}`);
  return chosen.id;
}

async function createDiscount({ storeDomain, token, title, functionId, config, startsAt }) {
  const mutation = `
    mutation CreateKollektionsrabatt($discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $discount) {
        automaticAppDiscount { discountId title status }
        userErrors { field message }
      }
    }`;

  const variables = {
    discount: {
      title,
      functionId,
      // Functions der neuen Discounts-API verlangen die Discount-Klasse.
      discountClasses: ["PRODUCT"],
      startsAt: startsAt || new Date().toISOString(),
      combinesWith: {
        orderDiscounts: true,
        productDiscounts: false,
        shippingDiscounts: true,
      },
      metafields: [
        {
          namespace: "kollektionsrabatt",
          key: "config",
          type: "json",
          value: JSON.stringify(config),
        },
      ],
    },
  };

  const res = await fetch(
    `https://${storeDomain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: mutation, variables }),
    }
  );

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Admin-API-Fehler (${res.status}): ${text}`);
  }

  const body = JSON.parse(text);
  if (body.errors) {
    throw new Error(`GraphQL-Fehler: ${JSON.stringify(body.errors, null, 2)}`);
  }

  const result = body.data?.discountAutomaticAppCreate;
  const userErrors = result?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(`Rabatt nicht angelegt:\n${userErrors.map((e) => `  - ${e.field}: ${e.message}`).join("\n")}`);
  }
  return result.automaticAppDiscount;
}

async function main() {
  const storeDomain = required("STORE_DOMAIN");
  const clientId = required("CLIENT_ID");
  const clientSecret = required("CLIENT_SECRET");
  const title = required("TITLE");
  const config = buildConfig();

  console.log("Konfiguration:");
  console.log(JSON.stringify(config, null, 2));

  const token = await getAccessToken(storeDomain, clientId, clientSecret);
  console.log("Access-Token erhalten.");

  // Function-ID: aus Eingabe oder automatisch ermitteln.
  let functionId = process.env.FUNCTION_ID?.trim();
  if (!functionId) {
    functionId = await findFunctionId(storeDomain, token);
  }

  const discount = await createDiscount({
    storeDomain,
    token,
    title,
    functionId,
    config,
    startsAt: process.env.STARTS_AT?.trim(),
  });

  console.log("\n✅ Rabatt angelegt:");
  console.log(`  Titel:  ${discount.title}`);
  console.log(`  ID:     ${discount.discountId}`);
  console.log(`  Status: ${discount.status}`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
