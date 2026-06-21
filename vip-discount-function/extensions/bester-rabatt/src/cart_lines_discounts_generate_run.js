import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';

/**
 * Bester Rabatt — VIP + Aktion, höchster gewinnt (kein Stapeln)
 *
 * Per cart line we compute two possible discounts and apply only the higher
 * one (as a fixed money amount), so a line never receives two discounts:
 *
 *   1. VIP: percentage based on the customer's tag (VIP3=30 > VIP2=25 >
 *      VIP1=15), applied to products in the VIP collection.
 *   2. Aktion (campaign): applied to products in the "Aktions-Beläge"
 *      collection. The campaign is configured per discount via the settings
 *      UI extension, stored in the app metafield `function-configuration`:
 *        { "aktiv": true, "modus": "bxgy",    "kaufe": 4, "zahle": 3 }
 *        { "aktiv": true, "modus": "prozent", "prozent": 25 }
 *        { "aktiv": false }
 *      BXGY ("kaufe X, zahle Y") frees the cheapest (X-Y) units of every full
 *      group of X participating units. Below X units there is no campaign
 *      discount.
 *
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 *
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */

const VIP_BY_TAG = {VIP3: 30, VIP2: 25, VIP1: 15};

export function cartLinesDiscountsGenerateRun(input) {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return {operations: []};
  }

  // --- VIP percentage from customer tags (highest tier wins) ---
  const heldTags = new Set(
    (input.cart.buyerIdentity?.customer?.hasTags ?? [])
      .filter((t) => t.hasTag)
      .map((t) => t.tag),
  );
  let vipPct = 0;
  for (const [tag, pct] of Object.entries(VIP_BY_TAG)) {
    if (heldTags.has(tag)) {
      vipPct = pct;
      break;
    }
  }

  // --- Campaign configuration (per-discount JSON metafield) ---
  let campaign = {aktiv: false};
  const rawCampaign = input.discount.metafield?.value;
  if (rawCampaign) {
    try {
      campaign = JSON.parse(rawCampaign);
    } catch (e) {
      campaign = {aktiv: false};
    }
  }

  // --- Per-line facts ---
  const lineInfo = input.cart.lines.map((line) => {
    const product = line.merchandise?.product;
    return {
      line,
      inVip: product?.inVip?.[0]?.isMember === true,
      inAktion: product?.inAktion?.[0]?.isMember === true,
      unit: parseFloat(line.cost.amountPerQuantity.amount),
    };
  });

  // --- Campaign (Aktion) discount amount per line ---
  const aktionAmount = new Map();
  if (campaign.aktiv) {
    if (campaign.modus === 'prozent') {
      const pct = parseFloat(campaign.prozent) || 0;
      if (pct > 0) {
        for (const li of lineInfo) {
          if (li.inAktion) {
            aktionAmount.set(li.line.id, li.unit * li.line.quantity * (pct / 100));
          }
        }
      }
    } else if (campaign.modus === 'bxgy') {
      const buy = parseInt(campaign.kaufe, 10) || 0;
      const pay = parseInt(campaign.zahle, 10) || 0;
      const freePerGroup = buy - pay;
      if (buy > 0 && freePerGroup > 0) {
        // Flatten participating units (one entry per unit, with its price).
        const units = [];
        for (const li of lineInfo) {
          if (li.inAktion) {
            for (let i = 0; i < li.line.quantity; i++) {
              units.push({lineId: li.line.id, price: li.unit});
            }
          }
        }
        const freeCount = Math.floor(units.length / buy) * freePerGroup;
        if (freeCount > 0) {
          // The cheapest units become free.
          units.sort((a, b) => a.price - b.price);
          for (let i = 0; i < freeCount; i++) {
            const u = units[i];
            aktionAmount.set(u.lineId, (aktionAmount.get(u.lineId) || 0) + u.price);
          }
        }
      }
    }
  }

  // --- Per line: keep the higher of VIP vs Aktion ---
  const candidates = [];
  for (const li of lineInfo) {
    const lineSubtotal = li.unit * li.line.quantity;
    const vipAmount = li.inVip && vipPct > 0 ? lineSubtotal * (vipPct / 100) : 0;
    const actAmount = aktionAmount.get(li.line.id) || 0;
    const best = Math.max(vipAmount, actAmount);
    if (best <= 0) {
      continue;
    }
    candidates.push({
      message: vipAmount >= actAmount ? `VIP ${vipPct}%` : 'Aktion',
      targets: [{cartLine: {id: li.line.id}}],
      value: {
        fixedAmount: {
          amount: best.toFixed(2),
        },
      },
    });
  }

  if (candidates.length === 0) {
    return {operations: []};
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
