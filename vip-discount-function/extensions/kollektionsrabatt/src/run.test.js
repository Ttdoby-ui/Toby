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

const makeInput = ({
  config = DEFAULT_CONFIG,
  lines = [],
  vipTags = [],
  vereinTags = [],
  retailLocation = null,
} = {}) => ({
  discount: {
    discountClasses: ["PRODUCT"],
    metafield: config == null ? null : { jsonValue: config },
  },
  cart: {
    retailLocation,
    buyerIdentity: {
      customer: {
        vip: (DEFAULT_CONFIG.vipTags ?? []).map((tag) => ({
          tag,
          hasTag: vipTags.includes(tag),
        })),
        verein: (config?.vereinTags ?? []).map((tag) => ({
          tag,
          hasTag: vereinTags.includes(tag),
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
function collectionLines(count, price = 33.9, compareAt = null, forVip = true, noVolume = false, gruppen = []) {
  return Array.from({ length: count }, (_, i) => ({
    id: `gid://shopify/CartLine/coll-${i}`,
    quantity: 1,
    cost: {
      amountPerQuantity: { amount: price },
      compareAtAmountPerQuantity: compareAt == null ? null : { amount: compareAt },
    },
    merchandise: {
      __typename: "ProductVariant",
      product: {
        inAnyCollection: true,
        isVip: forVip,
        noVolume: noVolume,
        gruppen: gruppen.map((g) => ({ tag: g, hasTag: true })),
      },
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
      product: { inAnyCollection: false, isVip: false, noVolume: false, gruppen: [] },
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

// VIP-only-Config (leere Staffeln) – für Kollektionen ohne Beläge/Textilien
// (z. B. die „VIP"-Smart-Collection). Nur VIP-%, mit UVP-Basis.
describe("VIP-only (tiers: [])", () => {
  const VIP_ONLY = {
    collectionIds: ["gid://shopify/Collection/664158142812"],
    tiers: [],
    vipTags: ["VIP1", "VIP2", "VIP3"],
    vipTiers: [
      { tag: "VIP1", percentage: 15 },
      { tag: "VIP2", percentage: 25 },
      { tag: "VIP3", percentage: 30 },
    ],
  };

  it("Nicht-VIP-Kunde bekommt nichts", () => {
    const result = run(
      makeInput({ config: VIP_ONLY, lines: collectionLines(1, 20.0), vipTags: [] })
    );
    assert.equal(opsCount(result), 0);
  });

  it("VIP2 ohne Angebot: 25 % auf den Preis", () => {
    const result = run(
      makeInput({ config: VIP_ONLY, lines: collectionLines(1, 20.0), vipTags: ["VIP2"] })
    );
    const cands = candidates(result);
    assert.equal(cands.length, 1);
    assert.equal(cands[0].value.percentage.value, "25");
  });

  it("keine Mengenstaffel: 10 Artikel geben trotzdem nur VIP", () => {
    const result = run(
      makeInput({ config: VIP_ONLY, lines: collectionLines(10, 20.0), vipTags: ["VIP1"] })
    );
    for (const c of candidates(result)) {
      assert.equal(c.value.percentage.value, "15"); // VIP1, NICHT Mengenstaffel
    }
  });

  it("Hülle im Sale (27,90 von UVP 39,90), VIP2 25 % → kein Zusatzrabatt", () => {
    const result = run(
      makeInput({ config: VIP_ONLY, lines: collectionLines(1, 27.9, 39.9), vipTags: ["VIP2"] })
    );
    // 39,90×0,75 = 29,925 > 27,90 → Angebot ist tiefer → nichts.
    assert.equal(opsCount(result), 0);
  });

  it("Hülle im Sale, VIP3 30 % → kein Zusatzrabatt (Sale schon ~30 %)", () => {
    const result = run(
      makeInput({ config: VIP_ONLY, lines: collectionLines(1, 27.9, 39.9), vipTags: ["VIP3"] })
    );
    assert.equal(opsCount(result), 0);
  });

  it("leichtes Angebot (35,00 von UVP 39,90), VIP2 → auf UVP-Basis rabattiert", () => {
    const result = run(
      makeInput({ config: VIP_ONLY, lines: collectionLines(1, 35.0, 39.9), vipTags: ["VIP2"] })
    );
    const cands = candidates(result);
    assert.equal(cands.length, 1);
    // Zielpreis 39,90×0,75 = 29,925 → Abzug 35,00−29,925 = 5,075 → 5.08
    assert.equal(cands[0].value.fixedAmount.amount, "5.08");
    assert.equal(cands[0].value.fixedAmount.appliesToEachItem, true);
  });
});

/* ------------------------------------------------------------------ Vereine */

const VEREIN_CONFIG = {
  ...DEFAULT_CONFIG,
  gruppenTags: ["Belag", "Holz", "Textil"],
  vereinTags: ["Verein-A", "Verein-B", "Verein-NurTextil"],
  vereine: [
    // Standard 10 % auf alles, Beläge abweichend 18 %
    { tag: "Verein-A", standard: 10, gruppen: { Belag: 18 } },
    { tag: "Verein-B", standard: 5 },
    // ohne standard: bekommt ausschliesslich Textilien
    { tag: "Verein-NurTextil", gruppen: { Textil: 20 } },
  ],
};

const vereinInput = (opts) => makeInput({ config: VEREIN_CONFIG, ...opts });

describe("Vereinsrabatt", () => {
  it("ohne Vereins-Tag aendert sich nichts", () => {
    const result = run(vereinInput({ lines: collectionLines(1, 33.9, null, true, false, ["Belag"]) }));
    assert.equal(opsCount(result), 0);
  });

  it("Warengruppe Belag: 18 % statt Standard", () => {
    const result = run(vereinInput({
      lines: collectionLines(1, 33.9, null, true, false, ["Belag"]),
      vereinTags: ["Verein-A"],
    }));
    assert.equal(candidates(result)[0].value.percentage.value, "18");
    assert.match(candidates(result)[0].message, /Vereinsrabatt/);
  });

  it("Produkt ohne passende Gruppe: Standardsatz", () => {
    const result = run(vereinInput({
      lines: collectionLines(1, 33.9, null, true, false, ["Holz"]),
      vereinTags: ["Verein-A"],
    }));
    assert.equal(candidates(result)[0].value.percentage.value, "10");
  });

  it("Produkt ganz ohne Gruppen-Tag: ebenfalls Standardsatz", () => {
    const result = run(vereinInput({
      lines: collectionLines(1, 33.9, null, true, false, []),
      vereinTags: ["Verein-A"],
    }));
    assert.equal(candidates(result)[0].value.percentage.value, "10");
  });

  it("ohne standard nur die genannte Gruppe: Belag bekommt nichts", () => {
    const result = run(vereinInput({
      lines: collectionLines(1, 33.9, null, true, false, ["Belag"]),
      vereinTags: ["Verein-NurTextil"],
    }));
    assert.equal(opsCount(result), 0);
  });

  it("ohne standard: Textil bekommt seine 20 %", () => {
    const result = run(vereinInput({
      lines: collectionLines(1, 33.9, null, true, false, ["Textil"]),
      vereinTags: ["Verein-NurTextil"],
    }));
    assert.equal(candidates(result)[0].value.percentage.value, "20");
  });

  it("Verein schlaegt Mengenrabatt: 18 % gegen 15 % bei 2 Stueck", () => {
    const result = run(vereinInput({
      lines: collectionLines(2, 33.9, null, true, false, ["Belag"]),
      vereinTags: ["Verein-A"],
    }));
    assert.equal(candidates(result)[0].value.percentage.value, "18");
    assert.match(candidates(result)[0].message, /Vereinsrabatt/);
  });

  it("Mengenrabatt schlaegt Verein: 20 % gegen 18 % bei 5 Stueck", () => {
    const result = run(vereinInput({
      lines: collectionLines(5, 33.9, null, true, false, ["Belag"]),
      vereinTags: ["Verein-A"],
    }));
    assert.equal(candidates(result)[0].value.percentage.value, "20");
    assert.match(candidates(result)[0].message, /Mengenrabatt/);
  });

  it("kein for_vip-Vorbehalt: greift auch bei nicht-for_vip-Produkten", () => {
    const result = run(vereinInput({
      lines: collectionLines(1, 33.9, null, false, false, ["Belag"]),
      vereinTags: ["Verein-A"],
      vipTags: ["VIP3"],
    }));
    // VIP faellt weg (nicht for_vip), der Verein bleibt
    assert.equal(candidates(result)[0].value.percentage.value, "18");
  });

  it("mehrere Vereine am Kunden: hoechster Satz gewinnt", () => {
    const result = run(vereinInput({
      lines: collectionLines(1, 33.9, null, true, false, ["Belag"]),
      vereinTags: ["Verein-A", "Verein-B"],
    }));
    assert.equal(candidates(result)[0].value.percentage.value, "18");
  });

  it("VIP schlaegt Verein, wenn er hoeher ist", () => {
    const result = run(vereinInput({
      lines: collectionLines(1, 33.9, null, true, false, ["Holz"]),
      vereinTags: ["Verein-A"],
      vipTags: ["VIP3"],
    }));
    assert.equal(candidates(result)[0].value.percentage.value, "30");
    assert.match(candidates(result)[0].message, /VIP/);
  });

  it("Angebot bereits tiefer als der Vereinssatz: kein Zusatzrabatt", () => {
    const result = run(vereinInput({
      lines: collectionLines(1, 27.9, 39.9, true, false, ["Belag"]),
      vereinTags: ["Verein-A"],
    }));
    // Ziel waere 39,90 x 0,82 = 32,72 - das Angebot ist mit 27,90 guenstiger
    assert.equal(opsCount(result), 0);
  });

  it("Angebot hoeher als der Vereinssatz: nur Differenz bis zum Zielpreis", () => {
    const result = run(vereinInput({
      lines: collectionLines(1, 38.0, 39.9, true, false, ["Belag"]),
      vereinTags: ["Verein-A"],
    }));
    // Ziel 39,90 x 0,82 = 32,72 -> Abzug 38,00 - 32,72 = 5,28
    assert.equal(candidates(result)[0].value.fixedAmount.amount, "5.28");
  });

  it("Verein greift nicht im POS", () => {
    const result = run(vereinInput({
      lines: collectionLines(1, 33.9, null, true, false, ["Belag"]),
      vereinTags: ["Verein-A"],
      retailLocation: { id: "gid://shopify/Location/1" },
    }));
    assert.equal(opsCount(result), 0);
  });

  it("Konfiguration ohne vereine: unveraendertes Verhalten", () => {
    const result = run(makeInput({
      lines: collectionLines(2, 33.9, null, true, false, ["Belag"]),
      vereinTags: ["Verein-A"],
    }));
    assert.equal(candidates(result)[0].value.percentage.value, "15");
  });
});
