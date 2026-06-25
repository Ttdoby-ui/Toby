import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';

/**
 * Bester Rabatt — kundenindividuelle + stufenbasierte VIP-Rabatte.
 *
 * Ersetzt die nativen VIP1/2/3-Rabatte durch EINE Discount-Function.
 * Regel: höchster gewinnt, nie auf ein bestehendes Angebot stapeln.
 *
 * Pro Cart-Zeile:
 *   1. override%  = sonderrabatte[handle]  (Kunden-Metafeld futurespin.sonderrabatte)
 *   2. sonst stufe% aus VIP-Tag (VIP3 > VIP2 > VIP1)
 *   3. base%      = override ?? stufe ?? 0
 *   4. UVP        = max(Preis, compareAt)
 *   5. sale%      = (UVP - Preis) / UVP * 100   (bereits laufendes Angebot)
 *   6. best%      = max(base%, sale%)
 *   7. Zielpreis  = UVP * (1 - best%/100); Rabatt = Preis - Zielpreis, nur wenn > 0.
 *      Ist sale% >= base%, ist der Rabatt 0 -> kein Stapeln auf das Angebot.
 *
 * Die Stufen-% liegen im App-Metafeld `function-configuration` (JSON
 * { "VIP1": 15, "VIP2": 25, "VIP3": 30 }) und sind ohne Redeploy änderbar.
 * Fehlt/leer -> Fallback 15/25/30.
 *
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 *
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */

const DEFAULT_TIERS = {VIP1: 15, VIP2: 25, VIP3: 30};
// Höchste Stufe gewinnt.
const TIER_PRIORITY = ['VIP3', 'VIP2', 'VIP1'];

const EMPTY = {operations: []};

export function cartLinesDiscountsGenerateRun(input) {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return EMPTY;
  }

  const customer = input.cart.buyerIdentity?.customer;

  // --- Stufen-% aus App-Metafeld (Fallback 15/25/30) ---
  const tiers = {...DEFAULT_TIERS};
  const cfg = input.discount.metafield?.jsonValue;
  if (cfg && typeof cfg === 'object') {
    for (const tag of TIER_PRIORITY) {
      const v = Number(cfg[tag]);
      if (Number.isFinite(v) && v >= 0) {
        tiers[tag] = v;
      }
    }
  }

  // --- Stufen-% des Kunden (höchste gehaltene Stufe) ---
  const heldTags = new Set(
    (customer?.hasTags ?? []).filter((t) => t.hasTag).map((t) => t.tag),
  );
  let tierPct = 0;
  for (const tag of TIER_PRIORITY) {
    if (heldTags.has(tag)) {
      tierPct = tiers[tag] ?? 0;
      break;
    }
  }

  // --- Kundenindividuelle Sonderrabatte pro Produkt-Handle ---
  /** @type {Record<string, number>} */
  const overrides = {};
  const rawOverrides = customer?.sonderrabatte?.jsonValue;
  if (rawOverrides && typeof rawOverrides === 'object') {
    for (const [handle, pct] of Object.entries(rawOverrides)) {
      const v = Number(pct);
      if (Number.isFinite(v) && v >= 0) {
        overrides[handle] = v;
      }
    }
  }

  const candidates = [];
  for (const line of input.cart.lines) {
    const variant = line.merchandise;
    if (variant?.__typename !== 'ProductVariant') {
      continue;
    }

    const price = parseFloat(line.cost.amountPerQuantity.amount);
    if (!Number.isFinite(price) || price <= 0) {
      continue;
    }

    const compareAt = parseFloat(line.cost.compareAtAmountPerQuantity?.amount);
    const uvp = Math.max(price, Number.isFinite(compareAt) ? compareAt : 0);

    // base% = override ?? stufe ?? 0  (override gewinnt, wenn gesetzt)
    const handle = variant.product?.handle;
    const override = handle != null ? overrides[handle] : undefined;
    const basePct = override ?? tierPct ?? 0;

    // sale% aus bereits laufendem Angebot (UVP vs. aktueller Preis)
    const salePct = uvp > 0 ? ((uvp - price) / uvp) * 100 : 0;

    const bestPct = Math.max(basePct, salePct);
    if (bestPct <= 0) {
      continue;
    }

    // Zielpreis aus UVP; Rabatt nur, soweit besser als das laufende Angebot.
    const targetUnit = uvp * (1 - bestPct / 100);
    const discountPerUnit = price - targetUnit;
    if (discountPerUnit <= 0) {
      continue; // sale% >= base% -> kein Stapeln
    }

    const amount = (discountPerUnit * line.quantity).toFixed(2);
    if (parseFloat(amount) <= 0) {
      continue; // gegen Rundung auf 0.00 absichern
    }

    const message =
      override !== undefined ? `Sonderpreis ${basePct}%` : `VIP ${basePct}%`;

    candidates.push({
      message,
      targets: [{cartLine: {id: line.id}}],
      value: {
        fixedAmount: {
          // amount gilt als Gesamtabzug für das Target (appliesToEachItem=false)
          amount,
        },
      },
    });
  }

  if (candidates.length === 0) {
    return EMPTY;
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
