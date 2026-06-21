import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';

/**
 * VIP Beläge Discount
 *
 * Applies the VIP percentage discount (15 / 25 / 30 %) to every cart line
 * whose product is in the VIP collection — BUT skips Beläge products when
 * the automatic BXGY discount "Beläge: Kaufe 4, zahle 3" also applies
 * (i.e. when the cart contains 4 or more Beläge items). This prevents the
 * VIP discount and the BXGY discount from stacking on the same Beläge items.
 *
 * The percentage is read per-discount from the app-owned metafield
 * `percentage` (VIP1 = 15, VIP2 = 25, VIP3 = 30).
 *
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 *
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */

// BXGY triggers when the cart holds >= 4 Beläge items (buy 3, get 1 free).
const BXGY_TRIGGER_QTY = 4;

export function cartLinesDiscountsGenerateRun(input) {
  // This function only ever produces product discounts.
  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );
  if (!hasProductDiscountClass) {
    return {operations: []};
  }

  const percentage = parseFloat(input.discount?.metafield?.value ?? '0');
  if (!(percentage > 0)) {
    return {operations: []};
  }

  // Count the total quantity of Beläge items in the cart.
  const belageCount = input.cart.lines.reduce((total, line) => {
    const inBelage =
      line.merchandise?.product?.inBelage?.[0]?.isMember === true;
    return inBelage ? total + line.quantity : total;
  }, 0);

  const bxgyActive = belageCount >= BXGY_TRIGGER_QTY;

  // Target every VIP line, but drop Beläge lines while BXGY is active.
  const targets = input.cart.lines
    .filter((line) => {
      const inVip = line.merchandise?.product?.inVip?.[0]?.isMember === true;
      if (!inVip) {
        return false;
      }
      if (bxgyActive) {
        const inBelage =
          line.merchandise?.product?.inBelage?.[0]?.isMember === true;
        if (inBelage) {
          return false;
        }
      }
      return true;
    })
    .map((line) => ({cartLine: {id: line.id}}));

  if (targets.length === 0) {
    return {operations: []};
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              message: `VIP ${percentage}%`,
              targets,
              value: {
                percentage: {
                  value: percentage,
                },
              },
            },
          ],
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
