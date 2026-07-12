#!/usr/bin/env node
/**
 * Kombi-Vorschaubild („Farbübersicht") für zusammengeführte Farb-Produkte.
 *
 * Für jedes Master-Produkt (Farbe = 1. Option, > 1 Farbe) wird aus dem ERSTEN
 * Bild jeder Farbe eine Montage (Raster) gebaut, hochgeladen und als ERSTES
 * Produktbild (featured) gesetzt → erscheint auf den Kachel-/Vorschau-Bildern.
 *
 * Auf der Produktseite (PDP) wird es NICHT gezeigt: Der Alt-Text enthält ALLE
 * Farbnamen, daher blendet der bestehende Galerie-Filter (Alt-Text-Vergleich in
 * product-media-gallery-content.liquid) das Bild bei JEDER gewählten Farbe aus
 * (es enthält immer „andere" Farben). Kein Theme-Eingriff nötig.
 *
 * Idempotent: Produkte, die bereits ein Bild mit „Farbübersicht" im Alt-Text
 * haben, werden übersprungen.
 *
 * Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN (write_products),
 *      DRY_RUN (Default true), LIMIT (optional).
 */

import sharp from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';
const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
// Hintergrund je Quellbild per KI freistellen und auf WEISS setzen → einheitliches Kombi-Bild.
const RMBG = (process.env.RMBG ?? 'true').toLowerCase() !== 'false';
// Vorhandenes Kombi-Bild löschen und neu bauen (statt überspringen).
const REBUILD = (process.env.REBUILD ?? 'false').toLowerCase() === 'true';
// Nur diese numerischen Produkt-IDs (Komma-getrennt) – zum Pilot-Test.
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);

if (!SHOPIFY_DOMAIN || !ACCESS_TOKEN) {
  console.error('ERROR: SHOPIFY_STORE_DOMAIN und SHOPIFY_ACCESS_TOKEN müssen gesetzt sein.');
  process.exit(1);
}

const MARKER = 'Farbübersicht';
const CELL = 600; // px je Farbfeld
const gid = (n) => `gid://shopify/Product/${n}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MASTERS = [15636463714652, 15153550164316, 15165142139228, 15131662221660, 15611559969116, 15150198620508, 15180613779804, 15153528602972, 15119891595612, 14999779148124, 14999742447964, 15532251349340, 15119026585948, 15131005714780, 15119937765724, 15131113193820, 15532716032348, 15532695978332, 15558821740892, 15158872506716, 15515536916828, 14905680298332, 15164665233756, 15164668477788, 15203470442844, 15203469820252, 15153488920924, 15566001242460, 15566001111388, 15153492197724, 15150989279580, 15131684831580, 15150386446684, 15150256161116, 15150385693020, 15150255571292, 15630973174108, 15164385952092, 15151222587740, 15164630958428, 15118978384220, 15153498947932, 15558833766748, 15558838714716, 15558843564380, 15558827573596, 15562736959836, 15562729226588, 15558849167708, 15558872531292, 15150387855708, 15150547239260, 15562756227420, 15164671459676, 15202464006492, 15202467709276, 15630380335452, 15166066917724, 15187271319900, 15626535403868, 15187287179612, 15187306742108, 15202044805468, 15202457092444, 15203463692636, 15203468673372, 15566029357404, 15566030766428, 15178899587420, 15566028964188, 15165111468380, 15521611219292, 15521627996508, 15203452420444, 15203433808220, 15203426009436, 15150233485660, 15165110944092, 15566030143836, 15165132570972, 15571176259932, 15521636680028, 15521646575964, 15131706032476, 15521656471900, 15521649918300, 15163423261020, 15150551728476, 15521625669980, 15202471215452, 15202481635676, 15202476786012, 15166040801628, 15180426936668, 15150994751836, 15150253146460, 15150251802972, 15032817353052, 15032812896604, 15630973403484, 15166045258076, 15137910915420, 15147771199836, 15566026735964, 15566017757532, 15566007337308, 15137979498844, 15150160118108, 15180697928028, 15164638822748, 15164642427228, 15454802084188, 15484397388124, 15163534049628, 15484221030748, 15158885122396, 15164481339740, 15164463743324, 15473067524444, 15157691646300, 15456485081436, 15456417972572, 15268861903196, 15456079708508, 15456294535516, 15365702680924, 15494370722140, 15456440287580, 15164411445596, 15485208658268, 15164443820380, 15158870638940, 15375457190236, 15476698546524, 15164424913244, 15208144175452, 15164506112348, 14937860637020];

async function gql(query, variables = {}, attempt = 0) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': ACCESS_TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) {
    if (attempt >= 6) throw new Error('429');
    await sleep(2000 * (attempt + 1));
    return gql(query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors) {
    if (JSON.stringify(data.errors).toUpperCase().includes('THROTTLED') && attempt < 6) {
      await sleep(2000 * (attempt + 1));
      return gql(query, variables, attempt + 1);
    }
    throw new Error(JSON.stringify(data.errors));
  }
  return data.data;
}

const PRODUCT_Q = `
query($id: ID!) {
  product(id: $id) {
    id title
    options(first: 3) { name position optionValues { name } }
    media(first: 50) { nodes { ... on MediaImage { id alt } } }
    variants(first: 100) {
      nodes { selectedOptions { name value } media(first: 1) { nodes { ... on MediaImage { image { url } } } } }
    }
  }
}`;

/** Ein Bild je Farbe (erstes), in Options-Reihenfolge. */
function colorImages(p) {
  const opt1 = p.options.find((o) => o.position === 1) || p.options[0];
  const order = opt1.optionValues.map((v) => v.name);
  const byColor = {};
  for (const v of p.variants.nodes) {
    const color = (v.selectedOptions.find((o) => o.name === opt1.name) || {}).value;
    const url = v.media?.nodes?.[0]?.image?.url;
    if (color && url && !byColor[color]) byColor[color] = url;
  }
  return { colors: order, images: order.map((c) => byColor[c]).filter(Boolean), optName: opt1.name };
}

async function buildMontage(urls) {
  const n = urls.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cells = [];
  for (let i = 0; i < n; i++) {
    const u = urls[i] + (urls[i].includes('?') ? '&' : '?') + `width=${CELL}`;
    const res = await fetch(u);
    if (!res.ok) throw new Error(`Bild-Fetch ${res.status}`);
    let buf = Buffer.from(await res.arrayBuffer());
    if (RMBG) {
      try {
        const blob = await removeBackground(buf, { output: { format: 'image/png' } });
        buf = Buffer.from(await blob.arrayBuffer());
      } catch (e) {
        console.log(`   ⚠️ Freistellen fehlgeschlagen (Bild ${i + 1}), nutze Original: ${String(e.message).slice(0, 80)}`);
      }
    }
    const cell = await sharp(buf)
      .flatten({ background: { r: 255, g: 255, b: 255 } }) // transparente/alpha-Flächen → weiß
      .resize(CELL, CELL, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toBuffer();
    cells.push({ input: cell, left: (i % cols) * CELL, top: Math.floor(i / cols) * CELL });
  }
  return sharp({
    create: { width: cols * CELL, height: rows * CELL, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(cells)
    .jpeg({ quality: 82 })
    .toBuffer();
}

async function upload(buf, filename) {
  const d = await gql(
    `mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}`,
    { input: [{ filename, mimeType: 'image/jpeg', httpMethod: 'POST', resource: 'IMAGE' }] }
  );
  const t = d.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of t.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([buf], { type: 'image/jpeg' }), filename);
  const up = await fetch(t.url, { method: 'POST', body: form });
  if (!up.ok) throw new Error(`Upload ${up.status}: ${await up.text()}`);
  return t.resourceUrl;
}

async function processOne(id) {
  const { product } = await gql(PRODUCT_Q, { id: gid(id) });
  if (!product) return console.log(`⧗ ${id} nicht gefunden`), 'SKIP';
  const existing = product.media.nodes.filter((m) => (m.alt || '').includes(MARKER));
  if (existing.length && !REBUILD) return console.log(`⧗ ${product.title} – hat schon Kombi-Bild`), 'SKIP';
  if (existing.length && REBUILD && !DRY_RUN) {
    await gql(
      `mutation($id:ID!,$mediaIds:[ID!]!){productDeleteMedia(productId:$id,mediaIds:$mediaIds){deletedMediaIds mediaUserErrors{message}}}`,
      { id: product.id, mediaIds: existing.map((m) => m.id) }
    );
    console.log(`   ↻ altes Kombi-Bild gelöscht (${existing.length})`);
  }

  const { colors, images, optName } = colorImages(product);
  if (optName !== 'Farbe' || images.length < 2)
    return console.log(`⧗ ${product.title} – keine Farb-Option/<2 Bilder`), 'SKIP';

  console.log(`▶ ${product.title} – ${images.length} Farben: ${colors.join(', ')}`);
  if (DRY_RUN) return 'PLANNED';

  const buf = await buildMontage(images);
  const filename = `farbuebersicht-${id}.jpg`;
  const src = await upload(buf, filename);
  const alt = `${product.title} ${MARKER} ${colors.join(' ')}`;
  const cr = await gql(
    `mutation($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){media{... on MediaImage{id}} mediaUserErrors{message}}}`,
    { productId: product.id, media: [{ originalSource: src, alt, mediaContentType: 'IMAGE' }] }
  );
  const errs = cr.productCreateMedia.mediaUserErrors;
  if (errs && errs.length) return console.log(`   ✗ ${JSON.stringify(errs)}`), 'ERROR';
  const mid = cr.productCreateMedia.media[0].id;
  await sleep(800);
  await gql(
    `mutation($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){mediaUserErrors{message}}}`,
    { id: product.id, moves: [{ id: mid, newPosition: '0' }] }
  );
  console.log(`   ✓ Kombi-Bild gesetzt (${images.length} Farben)`);
  return 'DONE';
}

async function main() {
  console.log(`=== Kombi-Vorschaubilder === DRY_RUN=${DRY_RUN} RMBG=${RMBG} REBUILD=${REBUILD}${ONLY.length ? ` ONLY=${ONLY.length}` : ''}${LIMIT !== Infinity ? ` LIMIT=${LIMIT}` : ''}`);
  const ids = (ONLY.length ? MASTERS.filter((i) => ONLY.includes(i)) : MASTERS).slice(0, LIMIT);
  const c = { DONE: 0, PLANNED: 0, SKIP: 0, ERROR: 0 };
  for (const id of ids) {
    try {
      c[await processOne(id)]++;
    } catch (e) {
      c.ERROR++;
      console.log(`✗ ${id}: ${e.message.slice(0, 160)}`);
    }
    await sleep(400);
  }
  console.log(`\n=== Fertig === Erstellt: ${c.DONE}  Geplant: ${c.PLANNED}  Übersprungen: ${c.SKIP}  Fehler: ${c.ERROR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
