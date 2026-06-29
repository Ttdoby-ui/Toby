#!/usr/bin/env node
/**
 * Pusht eine Liste von Repo-Dateien byte-genau in ein (UNVEROEFFENTLICHTES) Theme
 * via themeFilesUpsert. Liest die Dateien direkt vom Datentraeger -> kein manuelles
 * Abtippen/Transkribieren grosser Inhalte.
 *
 * Env:
 *   SHOPIFY_STORE_DOMAIN   z. B. e7ee88-2.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN   Store-Admin-Token (write_themes)
 *   THEME_ID               numerische ID ODER GID des Ziel-Themes (UNPUBLISHED!)
 *   FILES                  Komma-separierte Repo-Pfade (z. B. "assets/x.js,sections/y.liquid")
 */

import { readFileSync } from 'node:fs';

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

if (!DOMAIN || !TOKEN) {
  console.error('ERROR: SHOPIFY_STORE_DOMAIN und SHOPIFY_ACCESS_TOKEN noetig.');
  process.exit(1);
}

function themeGid(raw) {
  const v = (raw || '').trim();
  if (!v) throw new Error('THEME_ID fehlt.');
  if (v.startsWith('gid://')) return v;
  if (/^\d+$/.test(v)) return `gid://shopify/OnlineStoreTheme/${v}`;
  throw new Error(`Ungueltige THEME_ID: ${raw}`);
}

async function gql(query, variables) {
  const res = await fetch(`https://${DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors, null, 2));
  return data.data;
}

const MUTATION = `
  mutation Upsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`;

(async () => {
  const themeId = themeGid(process.env.THEME_ID);
  const paths = (process.env.FILES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!paths.length) throw new Error('FILES (Komma-separierte Pfade) noetig.');

  const files = paths.map((p) => ({
    filename: p,
    body: { type: 'BASE64', value: readFileSync(p).toString('base64') },
  }));

  console.log(`Theme: ${themeId}`);
  console.log(`Dateien: ${paths.join(', ')}`);

  const data = await gql(MUTATION, { themeId, files });
  const r = data.themeFilesUpsert;
  if (r.userErrors && r.userErrors.length) {
    throw new Error(`userErrors:\n${r.userErrors.map((e) => `  - ${e.field}: ${e.message}`).join('\n')}`);
  }
  console.log('\n✅ Upserted:');
  for (const f of r.upsertedThemeFiles) console.log(`  ${f.filename}`);
})().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
