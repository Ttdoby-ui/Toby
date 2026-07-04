import { run } from "./index.js";
import { strict as assert } from "assert";
import { describe, it } from "node:test";

const DEFAULT_CONFIG = {
  collectionIds: ["gid://shopify/Collection/123"],
  tiers: [
    { quantity: 2, percentage: 15 },
    { quantity: 5, percentage: 20 },
    { quantity: 10, percentage: 25 },
  ],
  vipTags: ["VIP1", "VIP2", "VIP3"],
  vipTiers: [
    { tag: "VIP1", percentage: 15 },
    { tag: "VIP2", percentage: 25 },
    { tag: "VIP3", percentage: 30 },
  ],
};

const makeInput = ({ config = DEFAULT_CONFIG, lines = [], vipTags = [], retailLocation = null } = {}) => ({
  discount: {
    discountClasses: ["PRODUCT"],
    metafield: config == null ? null : { jsonValue: config },
  },
  cart: {
    retailLocation,
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

function candidates(result) {
  return result.operations?.[0]?.productDiscountsAdd?.candidates ?? [];
}
function opsCount(result) {
  return result.operations?.length ?? 0;
}

/** n Artikel der Kollektion (je Menge 1). Optional Angebot, VIP-Fähigkeit, Ausschluss. */
function collectionLines(count, price = 33.9, compareAt = null, forVip = true, noVolume = false) {
  return Array.from({ length: count }, (_, i) => ({
    id: `gid://shopify/CartLine/coll-${i}`,
    quantity: 1,
    cost: {
      amountPerQuantity: { amount: price },
      compareAtAmountPerQuantity: compareAt == null ? null : { amount: compareAt },
    },
    merchandise: {
      __typename: "ProductVariant",
      product: { inAnyCollection: true, isVip: forVip, noVolume: noVolume },
    },
  }));
}

function otherLine(id = "other-1", quantity = 1) {
  return {
    id: `gid://shopify/CartLine/${id}`,
    quantity,
    cost: { amountPerQuantity: { amount: 50 }, compareAtAmountPerQuantity: null },
    merchandise: {
      __typename: "ProductVariant",
      product: { inAnyCollection: false, isVip: false, noVolume: false },
    },
  };
}

describe("Kollektionsrabatt (Mengenstaffel)", () => {
  it("kein Rabatt im POS (cart.retailLocation gesetzt)", () => {
    const result = run(
      makeInput({
        lines: collectionLines(10),
        vipTags: ["VIP3"],
        retailLocation: { id: "gid://shopify/Location/1" },
      })
    );
    assert.equal(opsCount(result), 0);
  });

  it("Rabatt im Online-Store (cart.retailLocation null)", () => {
    const result = run(makeInput({ lines: collectionLines(10) }));
    assert.ok(candidates(result).length > 0);
  });

  it("kein Rabatt ohne Konfiguration", () => {
    const result = run(makeInput({ config: null, lines: collectionLines(5) }));
    assert.equal(opsCount(result), 0);
  });

  it("kein Rabatt unterhalb der ersten Staffel", () => {
    const result = run(makeInput({ lines: collectionLines(1) }));
    assert.equal(opsCount(result), 0);
  });

  it("ab 2 Stück → 15 %", () => {
    const result = run(makeInput({ lines: collectionLines(2) }));
    assert.equal(candidates(result).length, 2);
    assert.equal(candidates(result)[0].value.percentage.value, "15");
  });

  it("ab 5 Stück → 20 %", () => {
    const result = run(makeInput({ lines: collectionLines(5) }));
    assert.equal(candidates(result)[0].value.percentage.value, "20");
  });

  it("ab 10 Stück → 25 %", () => {
    const result = run(makeInput({ lines: collectionLines(10) }));
    assert.equal(candidates(result)[0].value.percentage.value, "25");
  });

  it("7 Stück → höchste erfüllte Staffel (20 %)", () => {
    const result = run(makeInput({ lines: collectionLines(7) }));
    assert.equal(candidates(result)[0].value.percentage.value, "20");
  });

  it("Mengen über mehrere Zeilen werden summiert", () => {
    const mk = (id, qty) => ({
      id: `gid://shopify/CartLine/${id}`,
      quantity: qty,
      cost: { amountPerQuantity: { amount: 33.9 }, compareAtAmountPerQuantity: null },
      merchandise: { __typename: "ProductVariant", product: { inAnyCollection: true, isVip: true, noVolume: false } },
    });
    const result = run(makeInput({ lines: [mk("a", 3), mk("b", 2)] }));
    // 3 + 2 = 5 → 20 %
    assert.equal(candidates(result)[0].value.percentage.value, "20");
  });

  it("Artikel außerhalb der Kollektion zählen nicht und werden nicht rabattiert", () => {
    const lines = [...collectionLines(2), otherLine("holz")];
    const result = run(makeInput({ lines }));
    assert.equal(candidates(result).length, 2);
    const ids = candidates(result).map((c) => c.targets[0].cartLine.id);
    assert.ok(!ids.includes("gid://shopify/CartLine/holz"));
  });

  it("VIP gewinnt: VIP3 (30 %) schlägt Mengenrabatt 15 % bei 2 Stück", () => {
    const result = run(makeInput({ lines: collectionLines(2), vipTags: ["VIP3"] }));
    assert.equal(candidates(result)[0].value.percentage.value, "30");
    assert.ok(candidates(result)[0].message.startsWith("VIP"));
  });

  it("Mengenrabatt gewinnt: 20 % bei 5 Stück schlägt VIP1 (15 %)", () => {
    const result = run(makeInput({ lines: collectionLines(5), vipTags: ["VIP1"] }));
    assert.equal(candidates(result)[0].value.percentage.value, "20");
    assert.ok(candidates(result)[0].message.startsWith("Mengenrabatt"));
  });

  it("VIP zählt nur für for_vip-Produkte: nicht-for_vip-Belag bekommt kein VIP", () => {
    // VIP3 (30 %) würde greifen, aber Produkt ist nicht for_vip → nur Menge 15 %
    const result = run(makeInput({ lines: collectionLines(2, 33.9, null, false), vipTags: ["VIP3"] }));
    assert.equal(candidates(result)[0].value.percentage.value, "15");
    assert.ok(candidates(result)[0].message.startsWith("Mengenrabatt"));
  });

  it("nicht-for_vip-Belag unter Mindestmenge: gar kein Rabatt", () => {
    const result = run(makeInput({ lines: collectionLines(1, 33.9, null, false), vipTags: ["VIP3"] }));
    assert.equal(opsCount(result), 0);
  });

  it("Tag kein_mengenrabatt: kein Mengenrabatt (ohne VIP)", () => {
    // 2 ausgeschlossene Beläge, kein VIP → kein Rabatt
    const result = run(makeInput({ lines: collectionLines(2, 33.9, null, false, true) }));
    assert.equal(opsCount(result), 0);
  });

  it("Tag kein_mengenrabatt aber for_vip + VIP-Kunde: VIP greift weiter", () => {
    // ausgeschlossen vom Mengenrabatt, aber for_vip → VIP3 30 %
    const result = run(makeInput({ lines: collectionLines(1, 33.9, null, true, true), vipTags: ["VIP3"] }));
    assert.equal(candidates(result)[0].value.percentage.value, "30");
    assert.ok(candidates(result)[0].message.startsWith("VIP"));
  });

  it("Ausgeschlossener Belag zählt nicht zur Mengenstaffel", () => {
    const normal = collectionLines(4); // 4 zählende Beläge (kein VIP-Tag im Cart)
    const excluded = collectionLines(1, 33.9, null, false, true).map((l) => ({
      ...l,
      id: "gid://shopify/CartLine/excl",
    }));
    const result = run(makeInput({ lines: [...normal, ...excluded] }));
    const cands = candidates(result);
    // zählende Menge = 4 → 15 % (nicht 5 → 20 %); ausgeschlossener ohne Kandidat
    assert.equal(cands.length, 4);
    assert.equal(cands[0].value.percentage.value, "15");
    const ids = cands.map((c) => c.targets[0].cartLine.id);
    assert.ok(!ids.includes("gid://shopify/CartLine/excl"));
  });

  it("ohne vipTiers: reiner Mengenrabatt, VIP-Tags ignoriert", () => {
    const config = {
      collectionIds: DEFAULT_CONFIG.collectionIds,
      tiers: DEFAULT_CONFIG.tiers,
    };
    const result = run(makeInput({ config, lines: collectionLines(2), vipTags: ["VIP3"] }));
    assert.equal(candidates(result)[0].value.percentage.value, "15");
  });

  it("kein Produktrabatt-Class → keine Operation", () => {
    const input = makeInput({ lines: collectionLines(5) });
    input.discount.discountClasses = ["ORDER"];
    const result = run(input);
    assert.equal(opsCount(result), 0);
  });

  it("Angebot tiefer als Mengenrabatt → KEIN zusätzlicher Rabatt (höchster gewinnt)", () => {
    // 2 Stück, Preis 27,90 (Angebot), UVP 39,90 → 30 % Angebot > 15 % Menge
    const result = run(makeInput({ lines: collectionLines(2, 27.9, 39.9) }));
    assert.equal(opsCount(result), 0);
  });

  it("Mengenrabatt höher als Angebot → nur Differenz bis Zielpreis", () => {
    // 10 Stück (25 %), Preis 35,00, UVP 40,00 → Ziel 30,00, Abzug 5,00/Stk
    const result = run(makeInput({ lines: collectionLines(10, 35.0, 40.0) }));
    assert.equal(candidates(result)[0].value.fixedAmount.amount, "5.00");
    assert.equal(candidates(result)[0].value.fixedAmount.appliesToEachItem, true);
  });

  it("Mischung: Angebotsartikel ohne Zusatz, Normalartikel mit Prozent", () => {
    const sale = collectionLines(1, 27.9, 39.9); // Angebot tiefer → kein Zusatz
    const normal = collectionLines(1, 33.9, null).map((l) => ({
      ...l,
      id: "gid://shopify/CartLine/normal",
    }));
    // zusammen 2 Stück → 15 %
    const result = run(makeInput({ lines: [...sale, ...normal] }));
    const cands = candidates(result);
    assert.equal(cands.length, 1); // nur der Normalartikel
    assert.equal(cands[0].targets[0].cartLine.id, "gid://shopify/CartLine/normal");
    assert.equal(cands[0].value.percentage.value, "15");
  });
});
