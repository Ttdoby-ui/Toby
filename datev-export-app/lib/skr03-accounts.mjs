/**
 * Standard-Kontenzuordnung für DATEV SKR03.
 *
 * WICHTIG: Diese Werte sind sinnvolle Voreinstellungen, aber kontenrahmen- und
 * mandantenspezifisch. Sie MÜSSEN mit dem Steuerberater abgestimmt und in den
 * App-Einstellungen pro Shop überschreibbar sein. Die Logik (datev-extf.mjs)
 * liest die Konten ausschließlich aus einem `AccountMapping`-Objekt – diese
 * Datei liefert nur den Default.
 *
 * Buchungslogik je Verkauf (vereinfachtes Webshop-Modell):
 *   Soll  (Konto)      = Geld-/Verrechnungskonto der Zahlungsweise (Geldeingang)
 *   Haben (Gegenkonto) = Erlöskonto (Automatikkonto inkl. USt)
 *   Belegfeld 1        = Rechnungsnummer  → Zuordnung zur Rechnung
 */

/**
 * @typedef {object} AccountMapping
 * @property {Object<string,string>} paymentAccounts  Zahlungsweise → Geld-/Verrechnungskonto
 * @property {string} revenue19  Erlöskonto 19 % USt (Automatikkonto)
 * @property {string} revenue7   Erlöskonto  7 % USt (Automatikkonto)
 * @property {string} revenue0   Erlöskonto steuerfrei / 0 %
 * @property {number} accountLength  Sachkontonummernlänge (SKR03 üblich: 4)
 */

/** @type {AccountMapping} */
export const SKR03_DEFAULT = {
  // Geld-/Verrechnungskonten je Zahlungsweise.
  // 1200 Bank, 1000 Kasse, 1360 Geldtransit – die 136x sind frei wählbare
  // Verrechnungskonten für die jeweiligen Payment-Provider.
  paymentAccounts: {
    shopify_payments: '1361', // Shopify-Payments-Verrechnungskonto
    paypal: '1362', // PayPal-Verrechnungskonto
    klarna: '1363', // Klarna-Verrechnungskonto
    bank_transfer: '1200', // Bank
    cash_on_delivery: '1360', // Geldtransit (Nachnahme unterwegs)
    cash: '1000', // Kasse
    gift_card: '1590', // Verrechnungskonto Gutscheine
    other: '1360', // Geldtransit als Auffangkonto
  },
  revenue19: '8400', // Erlöse 19 % USt (Automatik)
  revenue7: '8300', // Erlöse 7 % USt (Automatik)
  revenue0: '8120', // Steuerfreie Umsätze (z. B. innergem. Lieferung)
  accountLength: 4,
};

/**
 * Liefert das Geld-/Verrechnungskonto für eine Zahlungsweise.
 * @param {AccountMapping} mapping
 * @param {string} paymentMethod
 * @returns {string}
 */
export function paymentAccountFor(mapping, paymentMethod) {
  return mapping.paymentAccounts[paymentMethod] || mapping.paymentAccounts.other;
}

/**
 * Wählt das Erlöskonto anhand des USt-Satzes.
 * @param {AccountMapping} mapping
 * @param {number} taxRate  Steuersatz in Prozent (z. B. 19, 7, 0)
 * @returns {string}
 */
export function revenueAccountFor(mapping, taxRate) {
  if (taxRate >= 18) return mapping.revenue19;
  if (taxRate >= 5) return mapping.revenue7;
  return mapping.revenue0;
}
