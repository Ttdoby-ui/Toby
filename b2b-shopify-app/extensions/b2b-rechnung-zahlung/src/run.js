// @ts-check
//
// B2B Rechnung Zahlung – Shopify Function (Payment Customization)
//
// Für B2B-Kunden (B2B1/B2B2/B2B3):
//   - "Rechnung"-Zahlungsart wird an Position 0 (ganz oben) verschoben
// Für alle anderen Kunden:
//   - "Rechnung"-Zahlungsart wird ausgeblendet (nur B2B soll auf Rechnung bestellen)

const RECHNUNG_KEYWORDS = ['rechnung', 'invoice', 'kauf auf rechnung'];

function isRechnung(name) {
  const lower = name.toLowerCase();
  return RECHNUNG_KEYWORDS.some((kw) => lower.includes(kw));
}

export function run(input) {
  const customer = input.cart.buyerIdentity && input.cart.buyerIdentity.customer;
  const isB2B = customer && (customer.b2b1 === true || customer.b2b2 === true || customer.b2b3 === true);

  const operations = [];

  for (const method of input.paymentMethods) {
    if (isRechnung(method.name)) {
      if (isB2B) {
        operations.push({ move: { paymentMethodId: method.id, index: 0 } });
      } else {
        operations.push({ hide: { paymentMethodId: method.id } });
      }
    }
  }

  return { operations };
}
