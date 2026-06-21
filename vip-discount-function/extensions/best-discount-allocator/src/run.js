/**
 * Best-discount allocator
 *
 * Enforces "no stacking — the highest discount wins" per cart line.
 *
 * Shopify sends every discount's proposals (VIP, BXGY, B2B, …) to this
 * allocator. For each cart line we look at every proposal that targets it,
 * compute the money amount each proposal would take off that line, and keep
 * only the single highest one. All other proposals on that line are dropped,
 * so a line never receives two discounts at once.
 *
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 *
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  // Unit price per cart line (before discounts).
  const unitPriceByLine = new Map();
  for (const line of input.cart.lines) {
    unitPriceByLine.set(
      line.id,
      parseFloat(line.cost.amountPerQuantity.amount),
    );
  }

  // For each cart line, track the single best proposal seen so far.
  // cartLineId -> { amount, handle, quantity }
  const bestByLine = new Map();

  for (const discount of input.discounts ?? []) {
    for (const proposal of discount.discountProposals) {
      const value = proposal.value;

      // For fixed amounts spread "across" the targeted lines we need the
      // combined subtotal of those lines to split the amount proportionally.
      let proposalTargetSubtotal = 0;
      for (const target of proposal.targets) {
        const unit = unitPriceByLine.get(target.cartLineId) ?? 0;
        proposalTargetSubtotal += unit * target.quantity;
      }

      for (const target of proposal.targets) {
        const unit = unitPriceByLine.get(target.cartLineId) ?? 0;
        const lineSubtotal = unit * target.quantity;

        let amount = 0;
        if (value.__typename === 'Percentage') {
          // Proposal percentages are fractions (10% => 0.1).
          amount = lineSubtotal * parseFloat(value.value);
        } else if (value.__typename === 'FixedAmount') {
          const fixed = parseFloat(value.amount);
          if (value.appliesToEachItem) {
            amount = fixed * target.quantity;
          } else if (proposalTargetSubtotal > 0) {
            amount = fixed * (lineSubtotal / proposalTargetSubtotal);
          }
        }

        // Never discount more than the line is worth.
        if (amount > lineSubtotal) {
          amount = lineSubtotal;
        }
        if (amount <= 0) {
          continue;
        }

        const current = bestByLine.get(target.cartLineId);
        if (!current || amount > current.amount) {
          bestByLine.set(target.cartLineId, {
            amount,
            handle: proposal.handle,
            quantity: target.quantity,
          });
        }
      }
    }
  }

  const lineDiscounts = [];
  for (const [cartLineId, best] of bestByLine) {
    lineDiscounts.push({
      cartLineId,
      quantity: best.quantity,
      allocations: [
        {
          amount: best.amount.toFixed(2),
          discountProposalId: best.handle,
        },
      ],
    });
  }

  return {
    displayableErrors: [],
    lineDiscounts,
  };
}
