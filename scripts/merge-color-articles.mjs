#!/usr/bin/env node
/**
 * Farb-Artikel zusammenführen: getrennte Produkte je Farbe → EIN Produkt mit
 * Farbe als 1. Variantenoption (+ Größe als 2., falls vorhanden). Bilder je Farbe
 * werden an das Master-Produkt gehängt und im Alt-Text mit der Farbe versehen,
 * damit der PDP-Galerie-Farbfilter greift. Alte Produkte werden archiviert und
 * per 301-Redirect auf das neue Produkt umgeleitet.
 *
 * Preise/Bestände/Gewichte je Farbe bleiben 1:1 erhalten. Metafelder/Tags/
 * Kollektionen des Masters bleiben erhalten (B2B kommt also vom Master).
 *
 * Master-Wahl je Set: höchster Variantenpreis → dann meiste Varianten → dann
 * kleinste ID. (So kommt B2B vom teureren Farbwert; Wunsch des Users.)
 *
 * SICHER: verarbeitet NUR die fest hinterlegte Allow-Liste SAFE_SETS (139 Sets,
 * ohne die „zu prüfen"-Fälle Schuhe/Schläger und die Joola-Duomat-Dublette).
 * Idempotent: bereits zusammengeführte Sets werden übersprungen. Unsaubere Sets
 * (uneinheitliche Optionen, fehlende Daten, Farbe nicht parsebar) werden
 * ÜBERSPRUNGEN und gemeldet – nie „auf Verdacht" gemerged.
 *
 * IMMER zuerst DRY_RUN=true laufen lassen, den Plan prüfen, dann echt.
 *
 * Env:
 *   SHOPIFY_STORE_DOMAIN  z. B. e7ee88-2.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN  Store-Admin-Token (write_products, write_url_redirects)
 *   DRY_RUN               "true" (Default) → nichts schreiben, nur Plan/Report
 *   BRAND                 optional: nur Sets dieser Marke (z. B. "andro")
 *   LIMIT                 optional: max. Sets verarbeiten (Test)
 *   ROLLBACK_FILE         Default "merge-rollback.json"
 */

import { writeFileSync } from 'node:fs';

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';
const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
const BRAND = (process.env.BRAND || '').trim().toLowerCase();
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const ROLLBACK_FILE = process.env.ROLLBACK_FILE || 'merge-rollback.json';

if (!SHOPIFY_DOMAIN || !ACCESS_TOKEN) {
  console.error('ERROR: SHOPIFY_STORE_DOMAIN und SHOPIFY_ACCESS_TOKEN müssen gesetzt sein.');
  process.exit(1);
}

const gid = (n) => `gid://shopify/Product/${n}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kanonische Größen-Reihenfolge; Unbekanntes wird in Erst-Reihenfolge angehängt. */
const SIZE_ORDER = [
  'XXS', '3XS', '2XS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL', '6XL',
  '116', '128', '140', '152', '164', '176',
];

// ---------------------------------------------------------------------------
// Allow-Liste: 139 sichere Sets (Marke + numerische Produkt-IDs je Farbe).
// ---------------------------------------------------------------------------
const SAFE_SETS = [
  // ---- andro (25) ----
  ['andro', [15636464173404, 15636463714652]],
  ['andro', [15153550164316, 15153555669340, 15153552949596]],
  ['andro', [15165142139228, 15165143875932]],
  ['andro', [15131676148060, 15131672936796, 15165145874780, 15131662221660]],
  ['andro', [15611560067420, 15611559969116]],
  ['andro', [15150207992156, 15150198620508]],
  ['andro', [15180633243996, 15180638060892, 15180613779804]],
  ['andro', [15153532797276, 15153531224412, 15153528602972]],
  ['andro', [15119905128796, 15119911813468, 15119891595612]],
  ['andro', [15532742672732, 15532747817308]],
  ['andro', [14999779148124, 14999784456540, 15119928164700]],
  ['andro', [14999742447964, 14999764828508, 14999774593372]],
  ['andro', [15532251349340, 15532252299612]],
  ['andro', [15119026585948, 15119037432156, 15119044084060]],
  ['andro', [15131005714780, 15131018527068]],
  ['andro', [15119949037916, 15119937765724]],
  ['andro', [15131113193820, 15131119485276, 15131596161372]],
  ['andro', [15532719767900, 15532716032348, 15532723470684]],
  ['andro', [15532702663004, 15532695978332, 15532706201948]],
  ['andro', [15119988588892, 15119977349468, 15119982461276, 15558821740892, 15119970730332, 15119960113500]],
  ['andro', [15158876340572, 15158872506716]],
  ['andro', [15515543929180, 15515539833180, 15515536916828]],
  ['andro', [15150184792412, 15150188233052, 15150189576540, 15150189674844, 15532738675036, 15150184268124, 15150192296284, 15150195016028, 15532734480732, 14905680298332]],
  ['andro', [15164665233756, 15164666118492]],
  ['andro', [15164668477788, 15164669886812]],
  // ---- Donic (32) ----
  ['Donic', [15203470442844, 15203470541148]],
  ['Donic', [15203469820252, 15203470279004]],
  ['Donic', [15153490526556, 15153491280220, 15153488920924]],
  ['Donic', [15566001307996, 15566001242460]],
  ['Donic', [15566001144156, 15566001111388]],
  ['Donic', [15153494786396, 15153496097116, 15153492197724]],
  ['Donic', [15150989279580, 15150989541724]],
  ['Donic', [15131690172764, 15131692958044, 15131684831580]],
  ['Donic', [15150386446684, 15150386872668]],
  ['Donic', [15150256161116, 15150256849244]],
  ['Donic', [15150385693020, 15150385955164]],
  ['Donic', [15150255571292, 15150255964508]],
  ['Donic', [15630973272412, 15630973174108]],
  ['Donic', [15164385952092, 15164388409692]],
  ['Donic', [15151222587740, 15197973053788]],
  ['Donic', [15164634661212, 15164632924508, 15164632334684, 15164630958428]],
  ['Donic', [15118986215772, 15118982840668, 15118978384220]],
  ['Donic', [15153501831516, 15153498947932]],
  ['Donic', [15558833766748, 15558836650332, 15558835077468]],
  ['Donic', [15558842057052, 15558838714716]],
  ['Donic', [15558847201628, 15558845563228, 15558843564380]],
  ['Donic', [15558831472988, 15558830588252, 15558827573596]],
  ['Donic', [15562736959836, 15562740531548]],
  ['Donic', [15562732372316, 15562729226588]],
  ['Donic', [15558849167708, 15558855065948, 15558856802652]],
  ['Donic', [15558872531292, 15558874005852, 15558875218268]],
  ['Donic', [15150387855708, 15150388019548]],
  ['Donic', [15150547239260, 15150548156764]],
  ['Donic', [15562756227420, 15562765238620]],
  ['Donic', [15164671459676, 15164672049500]],
  ['Donic', [15202464006492, 15202465317212]],
  ['Donic', [15202467709276, 15202469871964]],
  // ---- Joola (8) ----
  ['Joola', [15630381515100, 15630380335452, 15630381318492]],
  ['Joola', [15166069014876, 15166066917724]],
  ['Joola', [15187271319900, 15187273154908, 15187302121820]],
  ['Joola', [15626535403868, 15626541498716, 15626558472540]],
  ['Joola', [15187287179612, 15187283411292]],
  ['Joola', [15187306742108, 15187307037020]],
  ['Joola', [15202044805468, 15202050310492]],
  ['Joola', [15202458141020, 15202457682268, 15202457092444]],
  // ---- Tibhar (28) ----
  ['Tibhar', [15203466707292, 15203466510684, 15203463692636]],
  ['Tibhar', [15203469099356, 15203468935516, 15203468673372]],
  ['Tibhar', [15566029357404, 15566029521244, 15566029717852, 15566029848924]],
  ['Tibhar', [15566030766428, 15566030930268, 15566031126876, 15566031225180]],
  ['Tibhar', [15178901127516, 15210558947676, 15178899587420]],
  ['Tibhar', [15566029029724, 15566028964188, 15566029128028]],
  ['Tibhar', [15165112287580, 15165111468380]],
  ['Tibhar', [15521611219292, 15521612562780, 15521620263260]],
  ['Tibhar', [15521627996508, 15521628225884, 15521631240540]],
  ['Tibhar', [15203460415836, 15203461136732, 15203460809052, 15203459563868, 15203452420444]],
  ['Tibhar', [15203433808220, 15203437576540, 15203442098524]],
  ['Tibhar', [15203432366428, 15203427025244, 15203426009436]],
  ['Tibhar', [15150233485660, 15150234206556, 15150234403164]],
  ['Tibhar', [15165111173468, 15165110944092]],
  ['Tibhar', [15566030143836, 15566030307676, 15566030340444, 15566030569820]],
  ['Tibhar', [15165132570972, 15165138075996, 15165136306524]],
  ['Tibhar', [15571176259932, 15571181699420]],
  ['Tibhar', [15521636680028, 15521639465308, 15521641922908]],
  ['Tibhar', [15521646575964, 15521648935260]],
  ['Tibhar', [15131706032476, 15131723333980]],
  ['Tibhar', [15521656471900, 15521657028956]],
  ['Tibhar', [15521649918300, 15521652638044]],
  ['Tibhar', [15163423261020, 15165831676252]],
  ['Tibhar', [15150553399644, 15150551728476]],
  ['Tibhar', [15521625669980, 15521627570524]],
  ['Tibhar', [15202471215452, 15202474525020]],
  ['Tibhar', [15202481635676, 15202487271772]],
  ['Tibhar', [15202475114844, 15202475704668, 15202476786012]],
  // ---- Victas (15) ----
  ['Victas', [15166042145116, 15166040801628]],
  ['Victas', [15180426936668, 15180430606684]],
  ['Victas', [15150994751836, 15150995145052]],
  ['Victas', [15150253310300, 15150253146460]],
  ['Victas', [15150251802972, 15150252884316]],
  ['Victas', [15032818106716, 15032817353052]],
  ['Victas', [15032815354204, 15032812896604]],
  ['Victas', [15630973403484, 15630973632860]],
  ['Victas', [15166047912284, 15166045258076]],
  ['Victas', [15137926578524, 15137910915420, 15137939423580]],
  ['Victas', [15147771199836, 15147779031388, 15147787682140, 15147791417692]],
  ['Victas', [15566028800348, 15566028865884, 15566026735964]],
  ['Victas', [15566023590236, 15566022082908, 15566020837724, 15566017757532]],
  ['Victas', [15566010646876, 15566015365468, 15566007337308]],
  ['Victas', [15137990607196, 15137979498844]],
  // ---- Xiom (1) ----
  ['Xiom', [15150161330524, 15150160118108]],
  // ---- futurespin (8) ----
  ['futurespin', [15180704186716, 15180697928028]],
  ['futurespin', [15164638822748, 15188633616732, 15188628930908]],
  ['futurespin', [15164642427228, 15164644360540]],
  ['futurespin', [15454802084188, 15460347052380]],
  ['futurespin', [15157849424220, 15157849882972, 15157846147420, 15484397388124]],
  ['futurespin', [15163534049628, 15163535917404]],
  ['futurespin', [15484221030748, 15157851947356, 15157850472796, 15157851259228]],
  ['futurespin', [15158896525660, 15158885122396]],
  // ---- Mizuno (21) ----
  ['Mizuno', [15164483633500, 15164481339740]],
  ['Mizuno', [15164471804252, 15164469444956, 15164463743324, 15164475408732]],
  ['Mizuno', [15473067524444, 15480524767580]],
  ['Mizuno', [15157688369500, 15157691646300]],
  ['Mizuno', [15456492585308, 15456489505116, 15456485081436]],
  ['Mizuno', [15456429605212, 15456520700252, 15456417972572, 15456517914972]],
  ['Mizuno', [15268861903196, 15268866818396]],
  ['Mizuno', [15456476627292, 15456079708508]],
  ['Mizuno', [15456326254940, 15456307904860, 15456294535516, 15456534724956]],
  ['Mizuno', [15365702680924, 15365703074140]],
  ['Mizuno', [15208151974236, 15494370722140, 15494375113052, 15456134431068, 15456242237788, 15456111591772, 15456189874524, 15208161640796, 15455983239516, 15208157053276, 15208153186652]],
  ['Mizuno', [15456440287580, 15456447431004]],
  ['Mizuno', [15164418261340, 15164421833052, 15164411445596]],
  ['Mizuno', [15485214785884, 15485208658268]],
  ['Mizuno', [15164448964956, 15164443820380]],
  ['Mizuno', [15158869721436, 15375447032156, 15375451455836, 15158870638940]],
  ['Mizuno', [15375458238812, 15375457190236]],
  ['Mizuno', [15476705362268, 15476698546524]],
  ['Mizuno', [15164429795676, 15164424913244, 15164433203548]],
  ['Mizuno', [15208144175452, 15208147845468]],
  ['Mizuno', [15164537438556, 15164513780060, 15164542189916, 15164506112348]],
  // ---- Nexy (1) ----
  ['Nexy', [15484174664028, 14937860637020]],
];

async function gql(query, variables = {}, attempt = 0) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': ACCESS_TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) {
    if (attempt >= 6) throw new Error('Zu oft gethrottelt (429).');
    await sleep(2000 * (attempt + 1));
    return gql(query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors) {
    const throttled = JSON.stringify(data.errors).toUpperCase().includes('THROTTLED');
    if (throttled && attempt < 6) {
      await sleep(2000 * (attempt + 1));
      return gql(query, variables, attempt + 1);
    }
    throw new Error(JSON.stringify(data.errors, null, 2));
  }
  return data.data;
}

const PRODUCT_Q = `
query($id: ID!) {
  product(id: $id) {
    id title handle status productType tags
    options { name position optionValues { name } }
    variants(first: 100) {
      nodes {
        id title price compareAtPrice taxable
        selectedOptions { name value }
        inventoryItem {
          tracked
          measurement { weight { value unit } }
          inventoryLevels(first: 10) { nodes { location { id } quantities(names: ["available"]) { quantity } } }
        }
      }
    }
    media(first: 50) { nodes { ... on MediaImage { id alt image { url } } } }
  }
}`;

async function fetchProduct(id) {
  const d = await gql(PRODUCT_Q, { id: gid(id) });
  return d.product;
}

function words(s) {
  return s.trim().replace(/\s+/g, ' ').split(' ');
}

/** Farbe je Produkt aus dem Titel ableiten: gemeinsame Wort-Präfix- und
 *  -Suffix-Teile über alle Set-Titel entfernen; der Rest ist die Farbe. */
function deriveColors(titles) {
  const w = titles.map(words);
  const minLen = Math.min(...w.map((a) => a.length));
  let pre = 0;
  while (pre < minLen && w.every((a) => a[pre].toLowerCase() === w[0][pre].toLowerCase())) pre++;
  let suf = 0;
  while (
    suf < minLen - pre &&
    w.every((a) => a[a.length - 1 - suf].toLowerCase() === w[0][w[0].length - 1 - suf].toLowerCase())
  )
    suf++;
  const base = [...w[0].slice(0, pre), ...(suf ? w[0].slice(w[0].length - suf) : [])].join(' ').replace(/\s+/g, ' ').trim();
  const colors = w.map((a) => a.slice(pre, a.length - suf).join(' ').trim());
  return { base, colors };
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/["'„"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Größen-Option eines Produkts finden (alles außer Farbe/Title/Color). */
function sizeOptionOf(p) {
  return (p.options || []).find(
    (o) => !/^(farbe|color|colour|title|default title)$/i.test(o.name)
  );
}

function sizeValueOf(variant, sizeName) {
  if (!sizeName) return null;
  const so = variant.selectedOptions.find((o) => o.name === sizeName);
  return so ? so.value : null;
}

function orderSizes(sizes) {
  const known = [];
  const unknown = [];
  for (const s of sizes) {
    const i = SIZE_ORDER.findIndex((k) => k.toLowerCase() === s.toLowerCase());
    if (i >= 0) known.push([i, s]);
    else unknown.push(s);
  }
  known.sort((a, b) => a[0] - b[0]);
  return [...known.map((k) => k[1]), ...unknown];
}

async function mutate(query, variables) {
  if (DRY_RUN) return { __dry: true };
  return gql(query, variables);
}

async function processSet(brand, ids, rollback) {
  const products = [];
  for (const id of ids) {
    const p = await fetchProduct(id);
    if (!p) return skip(brand, ids, `Produkt ${id} nicht gefunden`);
    products.push(p);
  }

  // Idempotenz / Sicherheit
  const statuses = products.map((p) => p.status);
  const archived = statuses.filter((s) => s === 'ARCHIVED').length;
  if (archived > 0 && archived < products.length) {
    return skip(brand, ids, `Teilweise archiviert (${archived}/${products.length}) – evtl. schon (halb) gemerged`);
  }
  if (archived === products.length) {
    return skip(brand, ids, 'Alle archiviert – nichts zu tun');
  }

  const { base, colors } = deriveColors(products.map((p) => p.title));
  if (colors.some((c) => !c) || new Set(colors.map((c) => c.toLowerCase())).size !== colors.length) {
    return skip(brand, ids, `Farben nicht eindeutig parsebar: [${colors.join(' | ')}]`);
  }

  // Optionsstruktur prüfen: max. 1 Größen-Option je Produkt, konsistent.
  const sizeNames = new Set();
  for (const p of products) {
    const realOpts = (p.options || []).filter((o) => !/^(farbe|color|colour)$/i.test(o.name));
    const nonTitle = realOpts.filter((o) => !/^(title|default title)$/i.test(o.name));
    if (nonTitle.length > 1) return skip(brand, ids, `${p.title}: >1 Nicht-Farb-Option (zu komplex)`);
    const so = sizeOptionOf(p);
    if (so) sizeNames.add(so.name);
  }
  if (sizeNames.size > 1) return skip(brand, ids, `Uneinheitliche Größen-Optionen: [${[...sizeNames].join(', ')}]`);
  const sizeName = sizeNames.size === 1 ? [...sizeNames][0] : null;

  // Wenn es eine Größen-Option gibt, MUSS sie bei jedem Produkt vorhanden sein
  // (sonst entstünden Varianten ohne Größenwert → ungültiges productSet).
  if (sizeName) {
    const missing = products.find((p) => !(p.options || []).some((o) => o.name === sizeName));
    if (missing) return skip(brand, ids, `${missing.title}: ohne Option "${sizeName}" (gemischt größenlos/größe)`);
  }

  // Master wählen: höchster Variantenpreis → meiste Varianten → kleinste ID.
  const withMeta = products.map((p, i) => ({
    p,
    color: colors[i],
    maxPrice: Math.max(...p.variants.nodes.map((v) => Number(v.price) || 0)),
    nVar: p.variants.nodes.length,
    numId: Number(p.id.split('/').pop()),
  }));
  withMeta.sort((a, b) => b.maxPrice - a.maxPrice || b.nVar - a.nVar || a.numId - b.numId);
  const master = withMeta[0];
  const others = withMeta.slice(1);

  // Größen-Union
  let sizeValues = null;
  if (sizeName) {
    const seen = [];
    for (const { p } of withMeta)
      for (const v of p.variants.nodes) {
        const sv = sizeValueOf(v, sizeName);
        if (sv && !seen.includes(sv)) seen.push(sv);
      }
    sizeValues = orderSizes(seen);
  }

  const totalVariants = withMeta.reduce((a, m) => a + m.p.variants.nodes.length, 0);
  const newHandle = slugify(base);

  console.log(
    `\n▶ [${brand}] ${base}\n   Farben: ${colors.join(', ')}\n   Master: ${master.p.title} (${master.color}, ${master.p.variants.nodes.length} Var, max ${master.maxPrice} €)\n   Größe: ${sizeName || '—'}${sizeValues ? ' [' + sizeValues.join(',') + ']' : ''}\n   Varianten gesamt: ${totalVariants}  →  Handle: ${newHandle}`
  );

  if (DRY_RUN) {
    rollback.plan.push({ brand, base, master: master.p.id, colors, sizeName, totalVariants, newHandle });
    return { status: 'PLANNED' };
  }

  // --- Bilder komplett über productSet (nur write_products, kein write_files):
  //  Master-Medien behalten (id) + Alt = Master-Farbe; andere Farben per
  //  originalSource neu anlegen + Alt = Farbe. Jede Variante bekommt das
  //  ERSTE Bild ihrer Farbe als featured (für den Alt-Text-Filter). ---
  const colorFile = {}; // Farbe -> {id} | {originalSource}
  const files = [];
  let addedImgCount = 0;
  master.p.media.nodes.forEach((m, idx) => {
    files.push({ id: m.id, alt: `${base} ${master.color}` });
    if (idx === 0) colorFile[master.color] = { id: m.id };
  });
  for (const o of others) {
    const imgs = o.p.media.nodes.filter((m) => m.image && m.image.url);
    imgs.forEach((m, idx) => {
      files.push({ originalSource: m.image.url, alt: `${base} ${o.color}` });
      addedImgCount++;
      if (idx === 0) colorFile[o.color] = { originalSource: m.image.url };
    });
  }

  // --- Varianten bauen ---
  const variants = [];
  for (const m of withMeta) {
    const isMaster = m === master;
    for (const v of m.p.variants.nodes) {
      const optionValues = [{ optionName: 'Farbe', name: m.color }];
      if (sizeName) {
        const sv = sizeValueOf(v, sizeName);
        if (sv) optionValues.push({ optionName: sizeName, name: sv });
      }
      const invQ = (v.inventoryItem?.inventoryLevels?.nodes || [])
        .map((n) => ({ locationId: n.location.id, name: 'available', quantity: n.quantities?.[0]?.quantity ?? 0 }));
      const variant = {
        optionValues,
        price: v.price,
        taxable: v.taxable,
        inventoryItem: {
          tracked: v.inventoryItem?.tracked ?? true,
          ...(v.inventoryItem?.measurement?.weight
            ? { measurement: { weight: { value: v.inventoryItem.measurement.weight.value, unit: v.inventoryItem.measurement.weight.unit } } }
            : {}),
        },
      };
      if (v.compareAtPrice) variant.compareAtPrice = v.compareAtPrice;
      if (invQ.length) variant.inventoryQuantities = invQ;
      if (colorFile[m.color]) variant.file = colorFile[m.color];
      if (isMaster) variant.id = v.id; // Master-Varianten erhalten (Bestand/History)
      variants.push(variant);
    }
  }

  const productOptions = [{ name: 'Farbe', position: 1, values: colors.map((c) => ({ name: c })) }];
  if (sizeName) productOptions.push({ name: sizeName, position: 2, values: sizeValues.map((s) => ({ name: s })) });

  const input = {
    id: master.p.id,
    title: base,
    handle: newHandle,
    redirectNewHandle: true,
    productType: master.p.productType,
    tags: master.p.tags,
    status: 'ACTIVE',
    productOptions,
    variants,
  };
  if (files.length) input.files = files;

  // Taxonomie-Bindung lösen: Kategorie entfernen + die Farb-/Größen-Metafelder
  // (shopify.color-pattern / shopify.size) löschen. Sonst bindet Shopify die neue
  // "Farbe"/"Größe"-Option an die Taxonomie und lehnt Freitext-Farben wie
  // "navy/lime", "schwarz/gelb", "türkis" ab (INVALID_METAFIELD_VALUE_FOR_LINKED_OPTION).
  await gql(
    `mutation($id:ID!){productUpdate(product:{id:$id,category:null}){userErrors{message}}}`,
    { id: master.p.id }
  );
  await gql(
    `mutation($m:[MetafieldIdentifierInput!]!){metafieldsDelete(metafields:$m){userErrors{message}}}`,
    { m: [
      { ownerId: master.p.id, namespace: 'shopify', key: 'color-pattern' },
      { ownerId: master.p.id, namespace: 'shopify', key: 'size' },
    ] }
  );

  const PS = `mutation($input:ProductSetInput!){productSet(input:$input,synchronous:true){product{id handle variants(first:1){nodes{id}}} userErrors{field message code}}}`;
  let setRes = await gql(PS, { input });
  let errs = setRes.productSet.userErrors || [];
  // Gezielte Retries: Handle-Kollision → Suffix; nicht-anpassbares Inventar → ohne Mengen.
  for (let attempt = 0; attempt < 2 && errs.length; attempt++) {
    const msg = JSON.stringify(errs);
    if (msg.includes('HANDLE_NOT_UNIQUE')) {
      input.handle = `${newHandle}-1`;
    } else if (/inventory item is not allowed to be adjusted/i.test(msg)) {
      for (const v of input.variants) delete v.inventoryQuantities;
    } else break;
    setRes = await gql(PS, { input });
    errs = setRes.productSet.userErrors || [];
  }
  if (errs.length) {
    console.log(`   ✗ productSet userErrors: ${JSON.stringify(errs)}`);
    return { status: 'ERROR', errs };
  }
  const actualHandle = setRes.productSet.product.handle;

  // --- Alte Farb-Produkte archivieren + Redirects (Fehler nicht fatal) ---
  const redirects = [];
  const redirectFails = [];
  for (const o of others) {
    try {
      await gql(
        `mutation($p:ProductUpdateInput!){productUpdate(product:$p){userErrors{message}}}`,
        { p: { id: o.p.id, status: 'ARCHIVED' } }
      );
    } catch (e) {
      console.log(`   ⚠️ Archivieren fehlgeschlagen (${o.p.handle}): ${e.message}`);
    }
    try {
      const rr = await gql(
        `mutation($u:UrlRedirectInput!){urlRedirectCreate(urlRedirect:$u){urlRedirect{id} userErrors{message}}}`,
        { u: { path: `/products/${o.p.handle}`, target: `/products/${actualHandle}` } }
      );
      const rid = rr.urlRedirectCreate?.urlRedirect?.id;
      if (rid) redirects.push(rid);
      else redirectFails.push(o.p.handle);
    } catch (e) {
      redirectFails.push(o.p.handle);
      console.log(`   ⚠️ Redirect fehlgeschlagen (${o.p.handle}): ${e.message.slice(0, 120)}`);
    }
  }

  console.log(`   ✓ Zusammengeführt → /products/${actualHandle}  (${others.length} archiviert, ${redirects.length} Redirects${redirectFails.length ? `, ${redirectFails.length} Redirect-Fehler` : ''}, ${addedImgCount} Bilder ergänzt)`);
  rollback.done.push({
    brand, base, masterId: master.p.id,
    oldMaster: { title: master.p.title, handle: master.p.handle },
    newHandle: actualHandle,
    archived: others.map((o) => ({ id: o.p.id, handle: o.p.handle })),
    redirects, redirectFails,
  });
  return { status: 'MERGED' };
}

function skip(brand, ids, reason) {
  console.log(`\n⧗ [${brand}] ÜBERSPRUNGEN (${ids.join(',')}): ${reason}`);
  return { status: 'SKIP', reason };
}

async function main() {
  console.log(`=== Farb-Artikel zusammenführen === DRY_RUN=${DRY_RUN}${BRAND ? ` BRAND=${BRAND}` : ''}${LIMIT !== Infinity ? ` LIMIT=${LIMIT}` : ''}`);
  const sets = SAFE_SETS.filter(([b]) => !BRAND || b.toLowerCase() === BRAND).slice(0, LIMIT);
  console.log(`${sets.length} Sets in Bearbeitung.\n`);

  const rollback = { generatedAt: new Date().toISOString(), dryRun: DRY_RUN, done: [], plan: [] };
  const counts = { MERGED: 0, PLANNED: 0, SKIP: 0, ERROR: 0 };
  for (const [brand, ids] of sets) {
    try {
      const r = await processSet(brand, ids, rollback);
      counts[r.status] = (counts[r.status] || 0) + 1;
    } catch (e) {
      counts.ERROR++;
      console.log(`\n✗ [${brand}] FEHLER (${ids.join(',')}): ${e.message}`);
    }
    await sleep(400);
  }

  writeFileSync(ROLLBACK_FILE, JSON.stringify(rollback, null, 2));
  console.log(`\n=== Fertig ===`);
  console.log(`  Zusammengeführt: ${counts.MERGED}   Geplant (dry): ${counts.PLANNED}   Übersprungen: ${counts.SKIP}   Fehler: ${counts.ERROR}`);
  console.log(`  ${DRY_RUN ? 'Plan' : 'Rollback'}-Datei: ${ROLLBACK_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
