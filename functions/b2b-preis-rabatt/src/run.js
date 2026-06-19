// @ts-check
//
// B2B-Preis-Rabatt – Shopify Function (Product Discount)
//
// Logik: Für Kunden mit Tag "b2b" wird jeder Artikel, der ein Metafeld
// custom.preis_b2b (Netto-Preis) trägt, im Checkout so rabattiert, dass der
// gezahlte Betrag dem B2B-Preis entspricht.
//
// Der Shop rechnet "Preise inkl. MwSt" (taxesIncluded = true). Der Zeilenpreis
// im Funktions-Input ist daher brutto. Ziel-Brutto = Netto-B2B-Preis × (1 + MwSt).
// Nach dem Rabatt wird die MwSt auf dem reduzierten Brutto neu berechnet, sodass
// der Netto-Anteil exakt dem hinterlegten B2B-Preis entspricht.

const VAT_RATE = 0.19; // MwSt-Satz für Netto -> Brutto Umrechnung

const EMPTY_DISCOUNT = {
  discountApplicationStrategy: "FIRST",
  discounts: [],
};

/**
 * @param {{cart: {buyerIdentity: {customer: {hasAnyTag: boolean}|null}|null, lines: Array<any>}}} input
 */
export function run(input) {
  const customer = input.cart.buyerIdentity && input.cart.buyerIdentity.customer;
  if (!customer || customer.hasAnyTag !== true) {
    return EMPTY_DISCOUNT;
  }

  const discounts = [];

  for (const line of input.cart.lines) {
    const merchandise = line.merchandise;
    if (!merchandise || merchandise.__typename !== "ProductVariant") continue;
    const metafield = merchandise.product && merchandise.product.metafield;
    if (!metafield || !metafield.value) continue;

    // Metafeld vom Typ "money" liefert JSON {"amount":"34.90","currency_code":"EUR"}
    let net = NaN;
    try {
      net = parseFloat(JSON.parse(metafield.value).amount);
    } catch (e) {
      net = parseFloat(metafield.value);
    }
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
