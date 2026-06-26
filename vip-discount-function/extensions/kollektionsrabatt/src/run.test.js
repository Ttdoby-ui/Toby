import { run } from "./run.js";
import { strict as assert } from "assert";
import { describe, it } from "node:test";

const DEFAULT_CONFIG = {
  collectionIds: ["gid://shopify/Collection/123"],
  tiers: [
    { quantity: 2, percentage: 20 },
    { quantity: 5, percentage: 25 },
    { quantity: 10, percentage: 30 },
  ],
  vipTags: ["VIP1", "VIP2", "VIP3"],
  vipTiers: [
    { tag: "VIP1", percentage: 15 },
    { tag: "VIP2", percentage: 25 },
    { tag: "VIP3", percentage: 30 },
  ],
};

const makeInput = ({ config = DEFAULT_CONFIG, lines = [], vipTags = [] } = {}) => ({
  discountNode: {
    metafield: { value: config == null ? null : JSON.stringify(config) },
  },
  cart: {
    buyerIdentity: {
      customer: {
        hasTags: (DEFAULT_CONFIG.vipTags ?? []).map((tag) => ({
          tag,
          hasTag: vipTags.includes(tag),
        })),
      },
    },
    lines,
  },
});

/** n Artikel der Kollektion (je Menge 1). */
function collectionLines(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `gid://shopify/CartLine/coll-${i}`,
    quantity: 1,
    merchandise: {
      __typename: "ProductVariant",
      product: { inAnyCollection: true },
    },
  }));
}

function otherLine(id = "other-1", quantity = 1) {
  return {
    id: `gid://shopify/CartLine/${id}`,
    quantity,
    merchandise: {
      __typename: "ProductVariant",
      product: { inAnyCollection: false },
    },
  };
}

describe("Kollektionsrabatt (Mengenstaffel)", () => {
  it("kein Rabatt ohne Konfiguration", () => {
    const result = run(makeInput({ config: null, lines: collectionLines(5) }));
    assert.equal(result.discounts.length, 0);
  });

  it("kein Rabatt unterhalb der ersten Staffel", () => {
    const result = run(makeInput({ lines: collectionLines(1) }));
    assert.equal(result.discounts.length, 0);
  });

  it("ab 2 Stück → 20 %", () => {
    const result = run(makeInput({ lines: collectionLines(2) }));
    assert.equal(result.discounts.length, 1);
    assert.equal(result.discounts[0].value.percentage.value, "20");
    assert.equal(result.discounts[0].targets.length, 2);
  });

  it("ab 5 Stück → 25 %", () => {
    const result = run(makeInput({ lines: collectionLines(5) }));
    assert.equal(result.discounts[0].value.percentage.value, "25");
  });

  it("ab 10 Stück → 30 %", () => {
    const result = run(makeInput({ lines: collectionLines(10) }));
    assert.equal(result.discounts[0].value.percentage.value, "30");
  });

  it("7 Stück → höchste erfüllte Staffel (25 %), nicht mehr", () => {
    const result = run(makeInput({ lines: collectionLines(7) }));
    assert.equal(result.discounts[0].value.percentage.value, "25");
  });

  it("Mengen über mehrere Zeilen werden summiert", () => {
    const lines = [
      { id: "gid://shopify/CartLine/a", quantity: 3, merchandise: { __typename: "ProductVariant", product: { inAnyCollection: true } } },
      { id: "gid://shopify/CartLine/b", quantity: 2, merchandise: { __typename: "ProductVariant", product: { inAnyCollection: true } } },
    ];
    const result = run(makeInput({ lines }));
    // 3 + 2 = 5 → 25 %
    assert.equal(result.discounts[0].value.percentage.value, "25");
  });

  it("Artikel außerhalb der Kollektion zählen nicht und werden nicht rabattiert", () => {
    const lines = [...collectionLines(2), otherLine("holz")];
    const result = run(makeInput({ lines }));
    assert.equal(result.discounts.length, 1);
    assert.equal(result.discounts[0].targets.length, 2);
    const ids = result.discounts[0].targets.map((t) => t.cartLine.id);
    assert.ok(!ids.includes("gid://shopify/CartLine/holz"));
  });

  it("VIP gewinnt: VIP3 (30 %) schlägt Mengenrabatt 20 % bei 2 Stück", () => {
    const result = run(makeInput({ lines: collectionLines(2), vipTags: ["VIP3"] }));
    assert.equal(result.discounts[0].value.percentage.value, "30");
    assert.ok(result.discounts[0].message.startsWith("VIP"));
  });

  it("Mengenrabatt gewinnt: 25 % bei 5 Stück schlägt VIP1 (15 %)", () => {
    const result = run(makeInput({ lines: collectionLines(5), vipTags: ["VIP1"] }));
    assert.equal(result.discounts[0].value.percentage.value, "25");
    assert.ok(result.discounts[0].message.startsWith("Mengenrabatt"));
  });

  it("Gleichstand: Mengenrabatt-Label, gleicher Prozentsatz", () => {
    // 5 Stück → 25 %, VIP2 → 25 %
    const result = run(makeInput({ lines: collectionLines(5), vipTags: ["VIP2"] }));
    assert.equal(result.discounts[0].value.percentage.value, "25");
    assert.ok(result.discounts[0].message.startsWith("Mengenrabatt"));
  });

  it("ohne vipTiers: reiner Mengenrabatt, VIP-Tags ignoriert", () => {
    const config = {
      collectionIds: DEFAULT_CONFIG.collectionIds,
      tiers: DEFAULT_CONFIG.tiers,
    };
    const result = run(makeInput({ config, lines: collectionLines(2), vipTags: ["VIP3"] }));
    assert.equal(result.discounts[0].value.percentage.value, "20");
  });
});
