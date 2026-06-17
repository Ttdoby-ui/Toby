/**
 * Standalone DATEV-Export-Script für Shopify Dev Dashboard.
 * Wird vom GitHub Action oder lokal aufgerufen:
 *   node export.mjs 2026-06-01 2026-06-30
 */

import { buildExtf } from './lib/datev-extf.mjs';
import { DATEV_CONFIG } from './config.mjs';
import iconv from 'iconv-lite';
import { writeFileSync } from 'fs';

const SHOP = process.env.SHOPIFY_STORE || 'e7ee88-2.myshopify.com';
const [, , dateFrom, dateTo] = process.argv;

if (!dateFrom || !dateTo) {
  console.error('Verwendung: node export.mjs YYYY-MM-DD YYYY-MM-DD');
  console.error('Beispiel:   node export.mjs 2026-06-01 2026-06-30');
  process.exit(1);
}

async function getToken() {
  const res = await fetch('https://api.shopify.com/auth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json();
  console.log('Token-Response-Felder:', Object.keys(data).join(', '));
  if (data.scope !== undefined) console.log('Scope:', data.scope);
  if (data.token_type !== undefined) console.log('Token-Typ:', data.token_type);
  if (!data.access_token) {
    throw new Error(`Token-Fehler: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function fetchOrders(token) {
  const orders = [];
  let url =
    `https://${SHOP}/admin/api/2025-01/orders.json` +
    `?status=any` +
    `&created_at_min=${dateFrom}T00:00:00Z` +
    `&created_at_max=${dateTo}T23:59:59Z` +
    `&limit=250` +
    `&fields=id,name,order_number,created_at,total_price,currency,payment_gateway_names,transactions,tax_lines`;

  while (url) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) throw new Error(`API-Fehler ${res.status}: ${await res.text()}`);
    const data = await res.json();
    orders.push(...(data.orders || []));

    const link = res.headers.get('Link') || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return orders;
}

console.log(`🔄 Hole Bestellungen vom ${dateFrom} bis ${dateTo}…`);
const token = await getToken();
const orders = await fetchOrders(token);
console.log(`📦 ${orders.length} Bestellung(en) gefunden`);

const stapelName = `Shopify ${dateFrom} bis ${dateTo}`;
const extf = buildExtf(orders, {
  ...DATEV_CONFIG,
  dateFrom,
  dateTo,
  stapelName,
});

const filename = `DATEV_${dateFrom}_${dateTo}.csv`;
writeFileSync(filename, iconv.encode(extf, 'win1252'));
console.log(`✅ Exportiert: ${filename}`);
