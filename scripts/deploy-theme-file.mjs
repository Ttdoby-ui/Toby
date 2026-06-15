/**
 * One-off script: uploads templates/index.json to the live Shopify theme.
 * Triggered by GitHub Actions via workflow_dispatch.
 * Safe to delete after the upload completes.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const THEME_ID = 'gid://shopify/OnlineStoreTheme/184788123996';
const FILENAME = 'templates/index.json';

const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN } = process.env;

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.error('Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN');
  process.exit(1);
}

const content = readFileSync(join(__dirname, '..', FILENAME), 'utf8');

const mutation = `
  mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }
`;

const variables = {
  themeId: THEME_ID,
  files: [{ filename: FILENAME, body: { type: 'TEXT', value: content } }]
};

const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/graphql.json`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
  },
  body: JSON.stringify({ query: mutation, variables })
});

const json = await res.json();
const result = json?.data?.themeFilesUpsert;

if (!result) {
  console.error('Unexpected response:', JSON.stringify(json, null, 2));
  process.exit(1);
}

if (result.userErrors?.length) {
  console.error('User errors:', JSON.stringify(result.userErrors, null, 2));
  process.exit(1);
}

console.log('Uploaded successfully:', result.upsertedThemeFiles);
