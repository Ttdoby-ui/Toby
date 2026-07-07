/**
 * B2B-Versand nur für Händler – Delivery Customization Function
 *
 * Blendet im Checkout alle Versandoptionen mit "B2B" im Titel aus, WENN der
 * Kunde keinen B2B-Tag trägt. B2B-Kunden (Tag B2B1/B2B2/B2B3/Händler) sehen
 * die Option "B2B Versand" (8,21 €) normal; Gäste und B2C-Kunden nicht.
 *
 * Hintergrund: Shopifys native Versandbedingungen können nur Gewicht/Preis,
 * keine Kundengruppen. Diese Function schließt die Lücke.
 *
 * Ziel/API: purchase.delivery-customization.run.
 * Eine Function kann Versandoptionen nur ausblenden/umbenennen/sortieren,
 * keine Preise ändern.
 */

const NO_CHANGES = { operations: [] };

export function run(input) {
  // hasAnyTag ist true, sobald einer der B2B-Tags gesetzt ist (siehe run.graphql).
  const istB2B = input?.cart?.buyerIdentity?.customer?.hasAnyTag === true;
  if (istB2B) {
    // Händler → nichts ausblenden, B2B-Versand bleibt sichtbar.
    return NO_CHANGES;
  }

  // Checkouts können mehrere deliveryGroups haben (Split-Versand) → über alle iterieren.
  const operations = [];
  for (const group of input?.cart?.deliveryGroups ?? []) {
    for (const option of group?.deliveryOptions ?? []) {
      if (
        typeof option?.title === "string" &&
        option.title.toLowerCase().includes("b2b")
      ) {
        operations.push({ hide: { deliveryOptionHandle: option.handle } });
      }
    }
  }

  return { operations };
}
