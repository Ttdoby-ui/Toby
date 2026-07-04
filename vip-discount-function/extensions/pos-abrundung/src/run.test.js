import { run } from "./index.js";
import { strict as assert } from "assert";
import { describe, it } from "node:test";

const POS = { id: "gid://shopify/Location/1" };

function makeInput({ subtotal, retailLocation = POS, discountClasses = ["ORDER"] } = {}) {
  return {
    retailLocation,
    discount: { discountClasses },
    cart: {
      cost: {
        subtotalAmount: subtotal == null ? null : { amount: String(subtotal) },
      },
    },
  };
}

function amount(result) {
  return result.operations?.[0]?.orderDiscountsAdd?.candidates?.[0]?.value?.fixedAmount?.amount ?? null;
}
function opsCount(result) {
  return result.operations?.length ?? 0;
}

describe("POS-Abrundung (10 Cent)", () => {
  it("rundet 24,97 -> Abzug 0,07 (POS)", () => {
    assert.equal(amount(run(makeInput({ subtotal: 24.97 }))), "0.07");
  });

  it("rundet 24,90 nicht (schon glatt)", () => {
    assert.equal(opsCount(run(makeInput({ subtotal: 24.90 }))), 0);
  });

  it("rundet 100,01 -> Abzug 0,01", () => {
    assert.equal(amount(run(makeInput({ subtotal: 100.01 }))), "0.01");
  });

  it("rundet 24,99 -> Abzug 0,09", () => {
    assert.equal(amount(run(makeInput({ subtotal: 24.99 }))), "0.09");
  });

  it("kein Rabatt im Online-Store (retailLocation null)", () => {
    assert.equal(opsCount(run(makeInput({ subtotal: 24.97, retailLocation: null }))), 0);
  });

  it("kein Rabatt ohne Zwischensumme", () => {
    assert.equal(opsCount(run(makeInput({ subtotal: null }))), 0);
  });

  it("Betraege unter 10 Cent bleiben unangetastet", () => {
    assert.equal(opsCount(run(makeInput({ subtotal: 0.07 }))), 0);
  });

  it("greift nicht bei reinem PRODUCT-Rabatt-Kontext", () => {
    assert.equal(opsCount(run(makeInput({ subtotal: 24.97, discountClasses: ["PRODUCT"] }))), 0);
  });
});
