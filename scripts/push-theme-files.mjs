// push-theme-files.mjs
// Pusht ausgewaehlte Repo-Dateien byte-genau in ein UNVEROEFFENTLICHTES Shopify-Theme.
// Wird vom Workflow .github/workflows/push-theme-files.yml aufgerufen.
//
// Sicherheit: Schreibt NIEMALS in das aktive/live (MAIN) Theme. Vor dem Upsert
// wird die Theme-Rolle geprueft und bei role === "MAIN" abgebrochen.
//
// Auth (zwei Wege, in dieser Reihenfolge):
//   1) SHOPIFY_ACCESS_TOKEN  – fertiger Admin-API-Token (Scope: write_themes)
//   2) CLIENT_ID + CLIENT_SECRET – Client-Credentials-Grant (Dev Dashboard App)
//
// Pfad-Mapping Repo -> Theme-Asset-Key:
//   - Alles nach einem "theme/"-Segment wird als Asset-Key verwendet,
//     z. B. "theme/sections/fs-trust-bar.liquid" -> "sections/fs-trust-bar.liquid".
//   - Liegt die Datei bereits unter einem Theme-Ordner (sections/, snippets/,
//     assets/, blocks/, templates/, config/, layout/, locales/), wird der Pfad
//     unveraendert uebernommen.
//
// Aufruf (lokal):
//   SHOPIFY_STORE_DOMAIN=e7ee88-2.myshopify.com \
//   SHOPIFY_ACCESS_TOKEN=shpat_... \
//   THEME_ID=200523612508 \
//   FILES="theme/sections/fs-sport-worlds.liquid,theme/sections/fs-trust-bar.liquid" \
//   node scripts/push-theme-files.mjs

import { readFile } from "node:fs/promises";
import path from "node:path";

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || process.env.SHOPIFY_API_KEY;
const CLIENT_SECRET = process.env.CLIENT_SECRET || process.env.SHOPIFY_API_SECRET;
const THEME_ID_RAW = process.env.THEME_ID;
const FILES = process.env.FILES;
const API_VERSION = process.env.API_VERSION || "2025-01";

const THEME_FOLDERS = ["sections", "snippets", "assets", "blocks", "templates", "config", "layout", "locales"];
// Erweiterungen, die als BASE64 hochgeladen werden muessen (Binaerdateien).
const BINARY_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".pdf"];

function fail(msg) {
  console.error("Abbruch:", msg);
  process.exit(1);
}

if (!SHOP) fail("SHOPIFY_STORE_DOMAIN (oder SHOP) fehlt.");
if (!THEME_ID_RAW) fail("THEME_ID fehlt.");
if (!FILES) fail("FILES (komma-separierte Repo-Pfade) fehlt.");
if (!ACCESS_TOKEN && !(CLIENT_ID && CLIENT_SECRET)) {
  fail("Auth fehlt: entweder SHOPIFY_ACCESS_TOKEN ODER CLIENT_ID + CLIENT_SECRET setzen.");
}

const THEME_GID = THEME_ID_RAW.startsWith("gid://")
  ? THEME_ID_RAW
  : `gid://shopify/OnlineStoreTheme/${THEME_ID_RAW.replace(/\D/g, "")}`;

async function getToken() {
  if (ACCESS_TOKEN) return ACCESS_TOKEN;
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error("Kein Token vom Client-Credentials-Grant: " + JSON.stringify(d));
  if (d.scope) console.error("Gewaehrte Scopes:", d.scope);
  return d.access_token;
}

async function gql(token, query, variables) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json();
    if (j.errors && JSON.stringify(j.errors).includes("THROTTLED") && attempt < 6) {
      await new Promise((s) => setTimeout(s, 2000 * (attempt + 1)));
      continue;
    }
    if (j.errors) throw new Error(JSON.stringify(j.errors));
    return j.data;
  }
}

// Repo-Pfad -> Theme-Asset-Key
function toAssetKey(repoPath) {
  const norm = repoPath.split(path.sep).join("/").trim();
  const parts = norm.split("/");
  const themeIdx = parts.lastIndexOf("theme");
  if (themeIdx !== -1 && themeIdx < parts.length - 1) {
    return parts.slice(themeIdx + 1).join("/");
  }
  if (THEME_FOLDERS.includes(parts[0])) {
    return norm;
  }
  throw new Error(
    `Kann Asset-Key fuer "${repoPath}" nicht bestimmen. Datei unter theme/<ordner>/... ablegen ` +
      `oder mit einem Theme-Ordner (${THEME_FOLDERS.join(", ")}) beginnen.`
  );
}

const THEME_Q = `query($id: ID!) { theme(id: $id) { id name role } }`;
const UPSERT_M = `
  mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message code }
    }
  }`;

async function main() {
  const token = await getToken();

  // 1. Theme pruefen – niemals in MAIN (live) schreiben
  const t = await gql(token, THEME_Q, { id: THEME_GID });
  if (!t.theme) fail(`Theme ${THEME_GID} existiert nicht.`);
  console.error(`Ziel-Theme: "${t.theme.name}" (${t.theme.role})`);
  if (t.theme.role === "MAIN") {
    fail("Ziel-Theme ist das LIVE/MAIN-Theme. Schreiben verweigert. Bitte ein UNVEROEFFENTLICHTES Theme waehlen.");
  }

  // 2. Dateien einlesen + Asset-Keys bilden
  const repoPaths = FILES.split(",").map((s) => s.trim()).filter(Boolean);
  const files = [];
  for (const rp of repoPaths) {
    const key = toAssetKey(rp);
    const isBinary = BINARY_EXT.includes(path.extname(rp).toLowerCase());
    if (isBinary) {
      const buf = await readFile(rp);
      files.push({ filename: key, body: { type: "BASE64", value: buf.toString("base64") } });
    } else {
      const content = await readFile(rp, "utf8");
      files.push({ filename: key, body: { type: "TEXT", value: content } });
    }
    console.error(`  ${rp}  ->  ${key}${isBinary ? "  (base64)" : ""}`);
  }

  // 3. Upsert (in Batches zu 20)
  let done = 0;
  for (let i = 0; i < files.length; i += 20) {
    const batch = files.slice(i, i + 20);
    const d = await gql(token, UPSERT_M, { themeId: THEME_GID, files: batch });
    const res = d.themeFilesUpsert;
    const ue = res.userErrors || [];
    if (ue.length) {
      console.error("Fehler:", JSON.stringify(ue, null, 2));
      fail(`themeFilesUpsert meldete ${ue.length} Fehler.`);
    }
    done += res.upsertedThemeFiles.length;
    for (const f of res.upsertedThemeFiles) console.error(`  ok: ${f.filename}`);
  }

  console.error(`\nFertig. ${done}/${files.length} Datei(en) in "${t.theme.name}" aktualisiert.`);
}

main().catch((e) => fail(e.message));
