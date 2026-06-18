/**
 * VIP Beläge Discount Function
 *
 * Applies VIP percentage discount to all products in the VIP collection,
 * but SKIPS Beläge products when the automatic BXGY discount
 * "Kaufe 4, zahle 3" will also apply (4+ Beläge in cart).
 *
 * Configuration per DiscountCodeApp (stored in metafield):
 *   namespace: "vip-belage-discount"
 *   key:       "percentage"
 *   value:     "15" | "25" | "30"  (number as string)
 */

// BXGY triggers when the cart has ≥ 4 Beläge items (buy 3, get 1 free)
const BXGY_TRIGGER_QTY = 4;

export function run(input) {
  const { cart, discountNode } = input;

  const percentage = parseFloat(discountNode?.metafield?.value ?? "0");
  if (percentage <= 0) {
    return noDiscount();
  }

  // Count total Beläge items in cart
  const belageCount = cart.lines.reduce((total, line) => {
    const inBelage = line.merchandise?.product?.inBelage?.[0]?.isMember === true;
    return inBelage ? total + line.quantity : total;
  }, 0);

  const bxgyActive = belageCount >= BXGY_TRIGGER_QTY;

  // Determine which line items should get the VIP discount
  const targets = cart.lines
    .filter((line) => {
      const inVip = line.merchandise?.product?.inVip?.[0]?.isMember === true;
      if (!inVip) return false;

      // Skip Beläge lines when BXGY is active — they already get "1 free"
      if (bxgyActive) {
        const inBelage = line.merchandise?.product?.inBelage?.[0]?.isMember === true;
        if (inBelage) return false;
      }

      return true;
    })
    .map((line) => ({ cartLine: { id: line.id } }));

  if (targets.length === 0) {
    return noDiscount();
  }

  return {
    discounts: [
      {
        targets,
        value: {
          percentage: { value: String(percentage) },
        },
        message: `VIP ${percentage}%`,
      },
    ],
    discountApplicationStrategy: "FIRST",
  };
}

function noDiscount() {
  return { discounts: [], discountApplicationStrategy: "FIRST" };
}
