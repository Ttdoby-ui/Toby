import { run } from "./index.js";
import { strict as assert } from "assert";
import { describe, it } from "node:test";

// hasAnyTag entspricht "Kunde trägt einen B2B-Tag".
function makeInput({ customer = null, options } = {}) {
  const deliveryOptions =
    options ??
    [
      { handle: "post-dhl", title: "Post & DHL Shipping" },
      { handle: "b2b", title: "B2B Versand" },
      { handle: "standard", title: "Standard" },
      { handle: "standardversand", title: "Standardversand" },
    ];
  return {
    cart: {
      buyerIdentity: { customer },
      deliveryGroups: [{ deliveryOptions }],
    },
  };
}

function hiddenHandles(result) {
  return (result.operations ?? []).map((op) => op.hide?.deliveryOptionHandle);
}

describe("B2B-Versand nur für Händler", () => {
  it("Gast (kein customer) → B2B Versand wird ausgeblendet", () => {
    const result = run(makeInput({ customer: null }));
    assert.deepEqual(hiddenHandles(result), ["b2b"]);
  });

  it("B2C-Kunde (kein B2B-Tag → hasAnyTag false) → B2B ausgeblendet", () => {
    const result = run(makeInput({ customer: { hasAnyTag: false } }));
    assert.deepEqual(hiddenHandles(result), ["b2b"]);
  });

  it("B2B-Kunde (hasAnyTag true) → nichts ausgeblendet", () => {
    const result = run(makeInput({ customer: { hasAnyTag: true } }));
    assert.equal(result.operations.length, 0);
  });

  it("Standardoptionen bleiben immer sichtbar (nur B2B wird angefasst)", () => {
    const result = run(makeInput({ customer: null }));
    const hidden = hiddenHandles(result);
    assert.ok(!hidden.includes("post-dhl"));
    assert.ok(!hidden.includes("standard"));
    assert.ok(!hidden.includes("standardversand"));
  });

  it("Titel-Match ist case-insensitive", () => {
    const result = run(
      makeInput({
        customer: null,
        options: [
          { handle: "a", title: "b2b versand" },
          { handle: "b", title: "Standard" },
        ],
      })
    );
    assert.deepEqual(hiddenHandles(result), ["a"]);
  });

  it("mehrere deliveryGroups (Split-Versand) werden alle geprüft", () => {
    const input = {
      cart: {
        buyerIdentity: { customer: null },
        deliveryGroups: [
          { deliveryOptions: [{ handle: "b2b-1", title: "B2B Versand" }] },
          { deliveryOptions: [{ handle: "std-2", title: "Standard" }, { handle: "b2b-2", title: "B2B Express" }] },
        ],
      },
    };
    assert.deepEqual(hiddenHandles(run(input)), ["b2b-1", "b2b-2"]);
  });

  it("keine Versandoptionen → keine Operationen", () => {
    const result = run({ cart: { buyerIdentity: { customer: null }, deliveryGroups: [] } });
    assert.equal(result.operations.length, 0);
  });
});
