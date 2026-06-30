#!/usr/bin/env node
/**
 * Baut das gruppierte Desktop-Mega-Menue "main-menu-mega" (Contra-Stil) und
 * kann es per Admin-API auf den Store anwenden (menuUpdate).
 *
 * Jede Top-Kategorie wird 3-stufig gruppiert: 2. Ebene = fette Gruppen-
 * Ueberschrift (Contra-Spalte), 3. Ebene = die einzelnen Kollektions-Links.
 * Das Theme (Entwurf-Horizon) zeigt ueber sections/header-group.json mit
 * header-menu "menu": "main-menu-mega" auf dieses Menue; die Contra-Optik
 * (fette Spalten + vertikale Trennlinien) liefert assets/sale-nav-style.css.
 *
 * Nur EXISTIERENDE Kollektions-Handles verwenden (sonst 404). Neue Kategorien
 * -> hier ergaenzen und Skript erneut laufen lassen (idempotent: menuUpdate
 * ersetzt die komplette Item-Liste).
 *
 * Anwenden (braucht write_navigation):
 *   SHOPIFY_STORE_DOMAIN=e7ee88-2.myshopify.com \
 *   SHOPIFY_ACCESS_TOKEN=... \
 *   MENU_ID=gid://shopify/Menu/336718102876 \
 *   node scripts/build-mega-menu.mjs
 * Ohne Token: gibt nur die Item-Struktur als JSON aus (Dry-Run/Vorschau).
 * Hinweis: Standard-Store-Token hat write_navigation evtl. nicht -> dann ueber
 * den MCP (menuUpdate) anwenden; die hier gebaute `items`-Struktur 1:1 nutzen.
 */

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';
const MENU_ID = process.env.MENU_ID || 'gid://shopify/Menu/336718102876';
const MENU_TITLE = 'Hauptmenü (Mega)';
const MENU_HANDLE = 'main-menu-mega';

// Leaf-Link
const L = (title, handle) => ({ title, type: 'HTTP', url: '/collections/' + handle });
// Gruppen-Header (klickbar + Kinder) = fette Contra-Spalte
const G = (title, handle, items) => ({ title, type: 'HTTP', url: '/collections/' + handle, items });
// Top-Kategorie
const TOP = (title, handle, items) => ({ title, type: 'HTTP', url: '/collections/' + handle, items });

export const items = [
  TOP('%SALE%', 'sale-1', [
    G('ÜBERSICHT', 'sale-1', [L('Alle Sale-Artikel', 'sale-1')]),
    G('AUSRÜSTUNG', 'belage-sale', [
      L('Sale-Beläge', 'belage-sale'),
      L('Sale-Hölzer', 'holzer-sale'),
      L('Sale-Schläger', 'sale-schlager'),
      L('Sale-Bälle', 'sale-balle'),
    ]),
    G('TEXTIL & SCHUHE', 'bekleidung-sale', [
      L('Sale-Bekleidung', 'bekleidung-sale'),
      L('Sale-Schuhe', 'sale-schuhe'),
    ]),
    G('ZUBEHÖR', 'sale-pflege-montage', [
      L('Sale-Taschen & Hüllen', 'sale-taschen-hullen'),
      L('Sale-Pflege & Montage', 'sale-pflege-montage'),
      L('Sale-Vereinsbedarf', 'sale-vereinsbedarf'),
    ]),
  ]),

  { title: 'LEHRGÄNGE', type: 'HTTP', url: '/collections/lehrgange' },

  TOP('BELÄGE', 'belage', [
    G('NOPPEN INNEN', 'noppen-innen', [
      L('Alle Noppen Innen', 'noppen-innen'),
      // Noppen-Innen nach Spielsystem (Kollektionen offensiv/allround/defensiv =
      // productType "Noppen Innen - Offensiv/Allround/Defensiv")
      L('Offensiv', 'offensiv'),
      L('Allround', 'allround'),
      L('Defensiv', 'defensiv'),
    ]),
    G('NOPPEN AUSSEN', 'noppen-aussen', [
      L('Alle Noppen Außen', 'noppen-aussen'),
      L('Lange Noppe', 'lange-noppe'),
      L('Halblange Noppe', 'halblange-noppe'),
      L('Kurze Noppe', 'kurze-noppe'),
    ]),
    G('ANTI', 'anti', [L('Anti-Top', 'anti')]),
    G('ÜBERSICHT', 'belage', [L('Alle Beläge', 'belage')]),
  ]),

  TOP('HÖLZER', 'holzer', [
    G('OFFENSIV', 'off', [
      L('Alle Offensiv-Hölzer', 'off'),
      L('Carbonfaser', 'carbonfaser'),
      L('andere Kunstfaser', 'andere-kunstfaser'),
      L('Vollholz 5-schichtig', 'vollholz-5-schichtig'),
      L('Vollholz 7-schichtig', 'vollholz-7-schichtig'),
    ]),
    G('ALLROUND', 'all', [
      L('Alle Allround-Hölzer', 'all'),
      L('Carbonfaser', 'carbonfaser-all'),
      L('andere Kunstfaser', 'andere-kunstfaser-all'),
      L('Vollholz 5-schichtig', 'vollholz-5-schichtig-all'),
      L('Vollholz 7-schichtig', 'vollholz-7-schichtig-all'),
    ]),
    G('DEFENSIV', 'def', [
      L('Alle Defensiv-Hölzer', 'def'),
      L('Carbonfaser', 'carbonfaser-def'),
      L('andere Kunstfaser', 'andere-kunstfaser-def'),
      L('Vollholz 5-schichtig', 'vollholz-5-schichtig-def'),
    ]),
    G('ÜBERSICHT', 'holzer', [L('Alle Hölzer', 'holzer')]),
  ]),

  TOP('KOMPLETTSCHLÄGER', 'komplettschlager', [
    G('WETTKAMPF', 'konfigurierte-schlager', [
      L('Wettkampf-Schläger', 'konfigurierte-schlager'),
      L('Profi-Schläger', 'profi-schlager'),
    ]),
    G('FREIZEIT', 'freizeitschlager', [L('Freizeitschläger', 'freizeitschlager')]),
    G('ÜBERSICHT', 'komplettschlager', [L('Alle Komplettschläger', 'komplettschlager')]),
  ]),

  TOP('BÄLLE', 'balle', [
    G('WETTKAMPFBÄLLE', 'wettkampfballe', [
      L('Alle Wettkampfbälle', 'wettkampfballe'),
      L('große Packungen', 'grosse-packungen-wettkampfballe'),
      L('kleine Packungen', 'kleine-packungen-wettkampfballe'),
    ]),
    G('TRAINING & FREIZEIT', 'trainingsballe', [
      L('Trainingsbälle', 'trainingsballe'),
      L('Freizeitbälle', 'freizeitballe'),
    ]),
    G('ZUBEHÖR', 'ballsammler', [L('Ballsammler', 'ballsammler')]),
    G('ÜBERSICHT', 'balle', [L('Alle Bälle', 'balle')]),
  ]),

  TOP('PFLEGE & MONTAGE', 'pflege-montage', [
    G('PFLEGE', 'pflege', [
      L('Alle Pflege', 'pflege'),
      L('Reiniger', 'reiniger'),
      L('Schwämme', 'schwamme'),
    ]),
    G('MONTAGE', 'montage', [
      L('Alle Montage', 'montage'),
      L('Kleber', 'kleber'),
      L('Versiegelung', 'versiegelung'),
      L('Montagezubehör', 'montagezubehor'),
    ]),
    G('KANTEN', 'kantenbander', [
      L('Kantenbänder', 'kantenbander'),
      L('Kantenschutz', 'kantenschutz'),
    ]),
  ]),

  TOP('TASCHEN & HÜLLEN', 'taschen-hullen', [
    G('TASCHEN', 'taschen', [
      L('Taschen', 'taschen'),
      L('Rucksäcke', 'rucksacke'),
    ]),
    G('HÜLLEN & KOFFER', 'schlagerhullen', [
      L('Schlägerhüllen', 'schlagerhullen'),
      L('Schlägerkoffer', 'schlagerkoffer'),
      L('Doppelkoffer', 'doppelkoffer-futurespin'),
    ]),
    G('ÜBERSICHT', 'taschen-hullen', [L('Alle Taschen & Hüllen', 'taschen-hullen')]),
  ]),

  TOP('SCHUHE & TEXTILIEN', 'bekleidung', [
    G('TEXTILIEN', 'bekleidung', [
      L('Alle Textilien', 'bekleidung'),
      L('T-Shirts', 't-shirts'),
      L('Trikots', 'trikots'),
      L('Shorts', 'shorts'),
      L('Jacken', 'jacken'),
      L('Anzüge', 'anzuge'),
    ]),
    G('SCHUHE', 'schuhe', [
      L('Alle Schuhe', 'schuhe'),
      L('Indoor-Schuhe', 'indoor-schuhe'),
      L('Badelatschen', 'badelatschen'),
    ]),
    G('ACCESSOIRES', 'socken', [
      L('Socken', 'socken'),
      L('Handtücher', 'handtucher'),
    ]),
  ]),

  TOP('VEREINSBEDARF', 'vereinsbedarf', [
    G('TISCHE', 'tische', [
      L('Alle Tische', 'tische'),
      L('Wettkampftische', 'wettkampftische'),
      L('Freizeittische Indoor', 'freizeittische-indoor'),
      L('Freizeittische Outdoor', 'freizeittische-outdoor'),
    ]),
    G('NETZE & UMRANDUNGEN', 'netze', [
      L('Netze', 'netze'),
      L('Wettkampfnetze', 'wettkampfnetze'),
      L('Freizeitnetze', 'freizeitnetze'),
      L('Umrandungen', 'umrandungen'),
    ]),
    G('ZÄHLEN & ROBOTER', 'alle-zahlgerate', [
      L('Zählgeräte', 'alle-zahlgerate'),
      L('Spielstandsanzeige', 'spielstandsanzeige'),
      L('Roboter', 'roboter'),
    ]),
  ]),

  { title: 'GUTSCHEINE', type: 'HTTP', url: '/collections/gutscheine' },
];

async function gql(query, variables = {}) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': ACCESS_TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors, null, 2));
  return data.data;
}

async function main() {
  if (!SHOPIFY_DOMAIN || !ACCESS_TOKEN) {
    console.log('// Kein Token -> Vorschau der Item-Struktur (Dry-Run):');
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  const data = await gql(
    `mutation menuUpdate($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
        menu { id handle title }
        userErrors { field message }
      }
    }`,
    { id: MENU_ID, title: MENU_TITLE, handle: MENU_HANDLE, items }
  );
  const errs = data.menuUpdate.userErrors;
  if (errs && errs.length) throw new Error(JSON.stringify(errs, null, 2));
  console.log('Menue aktualisiert:', JSON.stringify(data.menuUpdate.menu));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
