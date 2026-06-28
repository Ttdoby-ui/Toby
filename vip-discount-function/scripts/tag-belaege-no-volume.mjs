/**
 * Vergibt den Tag `kein_mengenrabatt` an alle Produkte der Beläge-Kollektion,
 * die KEINEN `for_vip`-Tag haben. Idempotent: bereits getaggte und `for_vip`-
 * Produkte werden übersprungen.
 *
 * Store-Admin-Token via Client-Credentials am Store-OAuth-Endpunkt (wie beim
 * Rabatt-Skript). Erwartete Environment-Variablen:
 *   STORE_DOMAIN    z. B. "e7ee88-2.myshopify.com"
 *   CLIENT_ID       Client-ID der App
 *   CLIENT_SECRET   Client-Secret der App
 *   COLLECTION_ID   optional, Default = Beläge (607791087964)
 *   EXCLUDE_TAG     optional, Default = "kein_mengenrabatt"
 *   DRY_RUN         "true" = nur anzeigen, nichts schreiben
 */

const API_VERSION = "2025-10";
const DEFAULT_COLLECTION = "607791087964";

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Pflichtwert fehlt: ${name}`);
  return v.trim();
}

function toCollectionGid(raw) {
  const v = (raw || DEFAULT_COLLECTION).trim();
  if (v.startsWith("gid://")) return v;
  if (/^\d+$/.test(v)) return `gid://shopify/Collection/${v}`;
  throw new Error(`Ungültige Kollektions-ID: ${raw}`);
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
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Admin-API-Fehler (${res.status}): ${text}`);
  const body = JSON.parse(text);
  if (body.errors) throw new Error(`GraphQL-Fehler: ${JSON.stringify(body.errors)}`);
  return body.data;
}

async function fetchCollectionProducts(storeDomain, token, collectionId) {
  const query = `
    query Products($id: ID!, $cursor: String) {
      collection(id: $id) {
        products(first: 250, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id title tags }
        }
      }
    }`;
  const products = [];
  let cursor = null;
  for (;;) {
    const data = await adminGraphql(storeDomain, token, query, { id: collectionId, cursor });
    const conn = data?.collection?.products;
    if (!conn) throw new Error("Kollektion nicht gefunden.");
    products.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return products;
}

async function addTag(storeDomain, token, id, tag) {
  const mutation = `
    mutation AddTag($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }`;
  const data = await adminGraphql(storeDomain, token, mutation, { id, tags: [tag] });
  const errs = data?.tagsAdd?.userErrors ?? [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join("; "));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const storeDomain = required("STORE_DOMAIN");
  const clientId = required("CLIENT_ID");
  const clientSecret = required("CLIENT_SECRET");
  const collectionId = toCollectionGid(process.env.COLLECTION_ID);
  const excludeTag = (process.env.EXCLUDE_TAG || "kein_mengenrabatt").trim();
  const dryRun = (process.env.DRY_RUN || "").toLowerCase() === "true";

  const token = await getAccessToken(storeDomain, clientId, clientSecret);
  console.log("Access-Token erhalten.");

  const products = await fetchCollectionProducts(storeDomain, token, collectionId);
  console.log(`Produkte in der Kollektion: ${products.length}`);

  const targets = products.filter(
    (p) => !p.tags.includes("for_vip") && !p.tags.includes(excludeTag)
  );
  const alreadyVip = products.filter((p) => p.tags.includes("for_vip")).length;
  const alreadyTagged = products.filter((p) => p.tags.includes(excludeTag)).length;

  console.log(`  davon mit for_vip (übersprungen):        ${alreadyVip}`);
  console.log(`  davon bereits "${excludeTag}":            ${alreadyTagged}`);
  console.log(`  zu taggen (ohne for_vip):                ${targets.length}`);

  if (dryRun) {
    console.log("\nDRY_RUN – es wird NICHTS geschrieben. Beispiele:");
    targets.slice(0, 15).forEach((p) => console.log(`  - ${p.title}`));
    if (targets.length > 15) console.log(`  … und ${targets.length - 15} weitere`);
    return;
  }

  let done = 0;
  for (const p of targets) {
    await addTag(storeDomain, token, p.id, excludeTag);
    done++;
    if (done % 25 === 0) console.log(`  … ${done}/${targets.length}`);
    await sleep(200);
  }
  console.log(`\n✅ Fertig: ${done} Produkte mit "${excludeTag}" getaggt.`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
