import { run } from "./run.js";
import { strict as assert } from "assert";
import { describe, it } from "node:test";

const makeInput = ({ percentage = "25", lines = [], belageCount = 0 }) => ({
  discountNode: {
    metafield: { value: String(percentage) },
  },
  cart: {
    lines: lines.length
      ? lines
      : buildLines(belageCount, [], percentage),
  },
});

function buildLines(belageQty, extraLines = []) {
  const lines = [];
  for (let i = 0; i < belageQty; i++) {
    lines.push({
      id: `gid://shopify/CartLine/belage-${i}`,
      quantity: 1,
      merchandise: {
        product: {
          id: `gid://shopify/Product/belage-${i}`,
          inBelage: [{ isMember: true }],
          inVip: [{ isMember: true }],
        },
      },
    });
  }
  return [...lines, ...extraLines];
}

describe("VIP Beläge Discount Function", () => {
  it("applies VIP discount when no Beläge in cart", () => {
    const line = {
      id: "gid://shopify/CartLine/holz-1",
      quantity: 2,
      merchandise: {
        product: {
          id: "gid://shopify/Product/holz-1",
          inBelage: [{ isMember: false }],
          inVip: [{ isMember: true }],
        },
      },
    };
    const input = makeInput({ percentage: "25", lines: [line] });
    const result = run(input);

    assert.equal(result.discounts.length, 1);
    assert.equal(result.discounts[0].value.percentage.value, "25");
    assert.equal(result.discounts[0].targets.length, 1);
  });

  it("applies VIP discount to Beläge when fewer than 4 in cart", () => {
    const input = makeInput({ percentage: "15", belageCount: 3 });
    const result = run(input);

    assert.equal(result.discounts.length, 1);
    assert.equal(result.discounts[0].targets.length, 3);
  });

  it("skips Beläge VIP discount when 4+ Beläge are in cart (BXGY active)", () => {
    const input = makeInput({ percentage: "25", belageCount: 4 });
    const result = run(input);

    assert.equal(result.discounts.length, 0);
  });

  it("applies VIP to non-Beläge even when BXGY is active", () => {
    const belageLines = Array.from({ length: 4 }, (_, i) => ({
      id: `gid://shopify/CartLine/belage-${i}`,
      quantity: 1,
      merchandise: {
        product: {
          id: `gid://shopify/Product/belage-${i}`,
          inBelage: [{ isMember: true }],
          inVip: [{ isMember: true }],
        },
      },
    }));
    const holzLine = {
      id: "gid://shopify/CartLine/holz-1",
      quantity: 1,
      merchandise: {
        product: {
          id: "gid://shopify/Product/holz-1",
          inBelage: [{ isMember: false }],
          inVip: [{ isMember: true }],
        },
      },
    };

    const result = run(makeInput({ percentage: "30", lines: [...belageLines, holzLine] }));

    assert.equal(result.discounts.length, 1);
    // Only the Holz item should be discounted
    assert.equal(result.discounts[0].targets.length, 1);
    assert.equal(result.discounts[0].targets[0].cartLine.id, "gid://shopify/CartLine/holz-1");
  });

  it("returns no discount when percentage is 0", () => {
    const result = run(makeInput({ percentage: "0", belageCount: 2 }));
    assert.equal(result.discounts.length, 0);
  });

  it("returns no discount when product is not in VIP collection", () => {
    const line = {
      id: "gid://shopify/CartLine/other-1",
      quantity: 1,
      merchandise: {
        product: {
          id: "gid://shopify/Product/other-1",
          inBelage: [{ isMember: false }],
          inVip: [{ isMember: false }],
        },
      },
    };
    const result = run(makeInput({ percentage: "25", lines: [line] }));
    assert.equal(result.discounts.length, 0);
  });
});
