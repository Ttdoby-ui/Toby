#!/usr/bin/env node
/**
 * Registriert die englischen Übersetzungen für die Navigations-/Footer-Menüpunkte
 * (Storefront-Sprache EN). Diese Menü-Übersetzungen gehen gelegentlich verloren
 * (z. B. wenn Menüpunkte neu angelegt/bearbeitet werden) – dieses Skript stellt sie
 * idempotent wieder her.
 *
 * Vorgehen: Holt alle translatableResources(LINK), matcht den DEUTSCHEN Titel gegen
 * die MAP unten und setzt per translationsRegister die EN-Übersetzung (mit dem AKTUELLEN
 * Digest – daher robust gegen Digest-Änderungen). Bereits korrekte EN-Titel werden
 * übersprungen.
 *
 * Env:
 *   SHOPIFY_STORE_DOMAIN   z. B. e7ee88-2.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN   Store-Admin-Token mit write_translations
 *                          (Hinweis: ggf. nicht im Standard-Store-Token enthalten –
 *                           dann über das Assistenten-MCP ausführen.)
 *   DRY_RUN                optional "true" → nur anzeigen
 *
 * Neue Menüpunkte: einfach unten in MAP (deutscher Titel -> englischer Titel) ergänzen.
 */

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';
const DRY_RUN = (process.env.DRY_RUN || '').toLowerCase() === 'true';

if (!DOMAIN || !TOKEN) {
  console.error('ERROR: SHOPIFY_STORE_DOMAIN und SHOPIFY_ACCESS_TOKEN noetig.');
  process.exit(1);
}

// Deutscher Menü-Titel -> Englisch
const MAP = {
  '%SALE%': '%SALE%',
  'ALLE SALE-ARTIKEL': 'ALL SALE ITEMS',
  'SALE-BELÄGE': 'SALE RUBBERS',
  'SALE-HÖLZER': 'SALE BLADES',
  'SALE-SCHLÄGER': 'SALE BATS',
  'SALE-BEKLEIDUNG': 'SALE APPAREL',
  'SALE-SCHUHE': 'SALE SHOES',
  'SALE-BÄLLE': 'SALE BALLS',
  'SALE-TASCHEN & HÜLLEN': 'SALE BAGS & CASES',
  'SALE-PFLEGE & MONTAGE': 'SALE CARE & ASSEMBLY',
  'SALE-VEREINSBEDARF': 'SALE CLUB EQUIPMENT',
  'LEHRGÄNGE': 'COURSES',
  'BELÄGE': 'RUBBERS',
  'Alle Beläge': 'All Rubbers',
  'Noppen Innen': 'Inverted (Pips-In)',
  'Noppen Außen': 'Pips-Out',
  'Anti': 'Anti',
  'HÖLZER': 'BLADES',
  'Alle Hölzer': 'All Blades',
  'Offensiv-Hölzer': 'Offensive Blades',
  'Allround-Hölzer': 'Allround Blades',
  'Defensiv-Hölzer': 'Defensive Blades',
  'KOMPLETTSCHLÄGER': 'COMPLETE BATS',
  'Freizeitschläger': 'Recreational Bats',
  'Wettkampf-Schläger': 'Competition Bats',
  'BÄLLE': 'BALLS',
  'Wettkampfbälle': 'Competition Balls',
  'Trainingsbälle': 'Training Balls',
  'Freizeitbälle': 'Recreational Balls',
  'Ballsammler': 'Ball Collectors',
  'PFLEGE & MONTAGE': 'CARE & ASSEMBLY',
  'Pflege': 'Care',
  'Montage': 'Assembly',
  'TASCHEN & HÜLLEN': 'BAGS & CASES',
  'Taschen': 'Bags',
  'Rucksäcke': 'Backpacks',
  'Schlägerhüllen': 'Bat Covers',
  'Schlägerkoffer': 'Bat Cases',
  'SCHUHE & TEXTILIEN': 'SHOES & APPAREL',
  'Schuhe': 'Shoes',
  'Textilien': 'Apparel',
  'VEREINSBEDARF': 'CLUB EQUIPMENT',
  'Tische': 'Tables',
  'Netze': 'Nets',
  'Umrandungen': 'Surrounds',
  'Zählgeräte': 'Score Counters',
  'Roboter': 'Robots',
  'GUTSCHEINE': 'GIFT CARDS',
  'Profil': 'Profile',
  'Impressum': 'Imprint',
  'AGB': 'Terms & Conditions',
  'Widerrufsrecht': 'Right of Withdrawal',
  'Datenschutzerklärung': 'Privacy Policy',
  'Versand': 'Shipping',
  'Kontakt': 'Contact',
};

async function gql(query, variables = {}) {
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

async function collectLinks() {
  const out = [];
  let after = null;
  do {
    const data = await gql(
      `query($after: String) {
        translatableResources(first: 250, resourceType: LINK, after: $after) {
          nodes {
            resourceId
            translatableContent { key value digest locale }
            translations(locale: "en") { key value }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after }
    );
    const conn = data.translatableResources;
    out.push(...conn.nodes);
    after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after);
  return out;
}

(async () => {
  const links = await collectLinks();
  let set = 0, skip = 0, miss = 0;
  for (const link of links) {
    const title = link.translatableContent.find((c) => c.key === 'title');
    if (!title) continue;
    const en = MAP[title.value];
    if (!en) { miss++; continue; }
    const existing = (link.translations || []).find((t) => t.key === 'title');
    if (existing && existing.value === en) { skip++; continue; }
    if (DRY_RUN) { console.log(`[DRY] ${title.value} -> ${en}`); set++; continue; }
    const data = await gql(
      `mutation($id: ID!, $t: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $t) { userErrors { field message } }
      }`,
      { id: link.resourceId, t: [{ locale: 'en', key: 'title', value: en, translatableContentDigest: title.digest }] }
    );
    const errs = data.translationsRegister.userErrors;
    if (errs.length) { console.warn(`  Fehler ${title.value}:`, errs); }
    else { console.log(`  ${title.value} -> ${en}`); set++; }
  }
  console.log(`\n✅ ${set} gesetzt, ${skip} schon korrekt, ${miss} ohne Mapping (ignoriert).`);
})().catch((err) => { console.error(`\n❌ ${err.message}`); process.exit(1); });
