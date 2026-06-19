// @ts-check
//
// B2B-Preis-Rabatt – Shopify Function (Product Discount)
//
// Drei Preisstufen über Kunden-Tags B2B1 / B2B2 / B2B3. Je Stufe trägt das
// Produkt einen Netto-Preis im passenden Metafeld:
//   B2B1 -> custom.preis_b2b1
//   B2B2 -> custom.preis_b2b2
//   B2B3 -> custom.preis_b2b3
//
// Der Shop rechnet "Preise inkl. MwSt" (taxesIncluded = true). Der Zeilenpreis
// im Input ist daher brutto. Ziel-Brutto = Netto-B2B-Preis × (1 + MwSt). Nach
// dem Rabatt wird die MwSt auf dem reduzierten Brutto neu berechnet, sodass der
// Netto-Anteil exakt dem hinterlegten B2B-Preis entspricht.

const VAT_RATE = 0.19; // MwSt-Satz für Netto -> Brutto Umrechnung

const EMPTY_DISCOUNT = {
  discountApplicationStrategy: "FIRST",
  discounts: [],
};

/**
 * @param {string|null|undefined} raw
 * @returns {number}
 */
function parseNet(raw) {
  if (!raw) return NaN;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.amount != null) {
      return parseFloat(parsed.amount);
    }
    return parseFloat(raw);
  } catch (e) {
    return parseFloat(raw);
  }
}

export function run(input) {
  const customer = input.cart.buyerIdentity && input.cart.buyerIdentity.customer;
  if (!customer) return EMPTY_DISCOUNT;

  // Preisstufe bestimmen (B2B1 hat Vorrang vor B2B2 vor B2B3)
  let tierKey = null;
  if (customer.b2b1 === true) tierKey = "p1";
  else if (customer.b2b2 === true) tierKey = "p2";
  else if (customer.b2b3 === true) tierKey = "p3";
  if (!tierKey) return EMPTY_DISCOUNT;

  const discounts = [];

  for (const line of input.cart.lines) {
    const merchandise = line.merchandise;
    if (!merchandise || merchandise.__typename !== "ProductVariant") continue;
    const product = merchandise.product;
    if (!product) continue;

    const metafield = product[tierKey];
    if (!metafield || !metafield.value) continue;

    const net = parseNet(metafield.value);
    if (!net || net <= 0) continue;

    const targetGrossUnit = net * (1 + VAT_RATE);
    const currentGrossUnit = parseFloat(line.cost.amountPerQuantity.amount);
    if (!(currentGrossUnit > targetGrossUnit)) continue;

    const lineDiscount = (currentGrossUnit - targetGrossUnit) * line.quantity;
    if (lineDiscount <= 0) continue;

    discounts.push({
      message: "B2B-Preis",
      targets: [{ cartLine: { id: line.id } }],
      value: { fixedAmount: { amount: lineDiscount.toFixed(2) } },
    });
  }

  if (discounts.length === 0) return EMPTY_DISCOUNT;

  return {
    discountApplicationStrategy: "FIRST",
    discounts,
  };
}
