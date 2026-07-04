/**
 * POS-Abrundung – rundet den Warenkorb-Betrag im Ladengeschaeft (Shopify POS)
 * auf die naechste glatte 10-Cent-Stufe ab.
 *
 * Beispiel: 24,97 EUR -> Abzug 0,07 EUR -> 24,90 EUR.
 *
 * NUR im POS: greift ausschliesslich, wenn `cart.retailLocation` gesetzt ist
 * (Feld liegt auf Cart, NICHT auf der Input-Root; gegen schema.graphql
 * verifiziert). Im Online-Store gibt die Function nichts zurueck.
 *
 * Als ORDER-Rabatt umgesetzt (Abzug auf den Zwischensummen-Betrag). Da die
 * Preise brutto sind (taxesIncluded) und im POS i. d. R. kein Versand anfaellt,
 * entspricht die Zwischensumme dem zu zahlenden Endbetrag -> dieser landet auf
 * glatten 10 Cent.
 *
 * Hinweis: Discount-Functions kennen sich untereinander nicht. Kommen im POS
 * zusaetzliche Rabatte (z. B. ein manueller Kassen-Rabatt) NACH dieser Function
 * hinzu, kann der Endbetrag leicht von der 10-Cent-Stufe abweichen. Fuer den
 * Normalfall (POS ohne weitere Rabatte) rundet es exakt.
 *
 * Ziel/API: cart.lines.discounts.generate.run (neue Discounts-API).
 */

const NO_DISCOUNT = { operations: [] };

// Abrundungs-Stufe in Cent (10 = auf glatte 10 Cent abrunden).
const STEP_CENTS = 10;

export function run(input) {
  // Nur im Ladengeschaeft (POS). Online -> nichts.
  if (!input?.cart?.retailLocation) {
    return NO_DISCOUNT;
  }

  // Nur reagieren, wenn der Rabatt ueberhaupt ein Order-Rabatt sein darf.
  const discountClasses = input?.discount?.discountClasses ?? [];
  if (discountClasses.length > 0 && !discountClasses.includes("ORDER")) {
    return NO_DISCOUNT;
  }

  const subtotal = Number(input?.cart?.cost?.subtotalAmount?.amount);
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return NO_DISCOUNT;
  }

  // In Cent rechnen, um Float-Ungenauigkeiten zu vermeiden.
  const cents = Math.round(subtotal * 100);

  // Betraege unter einer vollen Stufe nicht antasten (sonst wuerde der Warenkorb
  // gratis) und bereits glatte Betraege nicht rabattieren.
  if (cents < STEP_CENTS) {
    return NO_DISCOUNT;
  }
  const remainderCents = cents % STEP_CENTS;
  if (remainderCents <= 0) {
    return NO_DISCOUNT;
  }

  const amount = (remainderCents / 100).toFixed(2);

  return {
    operations: [
      {
        orderDiscountsAdd: {
          candidates: [
            {
              message: "Abrundung",
              targets: [{ orderSubtotal: { excludedCartLineIds: [] } }],
              value: { fixedAmount: { amount } },
            },
          ],
          selectionStrategy: "FIRST",
        },
      },
    ],
  };
}
