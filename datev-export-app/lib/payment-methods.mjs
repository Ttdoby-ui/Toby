/**
 * Erkennt die eindeutige Zahlungsweise einer Shopify-Bestellung.
 *
 * Shopify liefert die Zahlart über die Transaktionen (`order.transactions`) bzw.
 * `order.payment_gateway_names`. Diese Funktion normalisiert die teils technischen
 * Gateway-Namen auf einen festen, internen Schlüssel (PaymentMethod), der dann im
 * Konten-Mapping (siehe skr03-accounts.mjs) einem DATEV-Gegenkonto zugeordnet wird.
 */

/** @typedef {'shopify_payments'|'paypal'|'klarna'|'bank_transfer'|'cash_on_delivery'|'cash'|'gift_card'|'other'} PaymentMethod */

/**
 * Zuordnung von rohen Shopify-Gateway-Namen auf normalisierte Zahlungsweisen.
 * Erweiterbar: weitere Gateways hier ergänzen.
 */
const GATEWAY_MAP = {
  shopify_payments: 'shopify_payments',
  paypal: 'paypal',
  'paypal express checkout': 'paypal',
  braintree: 'paypal',
  klarna: 'klarna',
  'klarna-pay-later': 'klarna',
  'klarna-pay-now': 'klarna',
  'klarna-pay-over-time': 'klarna',
  manual: 'bank_transfer',
  'bank deposit': 'bank_transfer',
  'bank_transfer': 'bank_transfer',
  'banküberweisung': 'bank_transfer',
  vorkasse: 'bank_transfer',
  cash_on_delivery: 'cash_on_delivery',
  nachnahme: 'cash_on_delivery',
  cash: 'cash',
  bar: 'cash',
  gift_card: 'gift_card',
};

/** Menschlich lesbare deutsche Bezeichnung je normalisierter Zahlungsweise. */
export const PAYMENT_LABELS = {
  shopify_payments: 'Shopify Payments (Kreditkarte)',
  paypal: 'PayPal',
  klarna: 'Klarna',
  bank_transfer: 'Rechnung / Vorkasse (Überweisung)',
  cash_on_delivery: 'Nachnahme',
  cash: 'Barzahlung',
  gift_card: 'Geschenkgutschein',
  other: 'Sonstige',
};

/**
 * Normalisiert einen einzelnen Gateway-String.
 * @param {string} gateway
 * @returns {PaymentMethod}
 */
export function normalizeGateway(gateway) {
  if (!gateway) return 'other';
  const key = String(gateway).trim().toLowerCase();
  return GATEWAY_MAP[key] || 'other';
}

/**
 * Ermittelt die maßgebliche Zahlungsweise einer Bestellung.
 *
 * Vorgehen (in dieser Reihenfolge):
 *   1. Erfolgreiche, nicht stornierte Sale/Capture-Transaktionen auswerten
 *   2. Fallback auf order.payment_gateway_names
 *   3. Fallback auf order.gateway
 *
 * @param {object} order  Shopify-Order (REST- oder GraphQL-Shape, siehe Hinweise)
 * @returns {{ method: PaymentMethod, label: string, raw: string }}
 */
export function detectPaymentMethod(order) {
  const transactions = order.transactions || [];

  // 1) Aus den Transaktionen: die erste erfolgreiche Geldeingangs-Transaktion zählt
  const moneyKinds = new Set(['sale', 'capture']);
  for (const t of transactions) {
    const status = (t.status || '').toLowerCase();
    const kind = (t.kind || '').toLowerCase();
    if (status === 'success' && moneyKinds.has(kind) && t.gateway) {
      const method = normalizeGateway(t.gateway);
      return { method, label: PAYMENT_LABELS[method], raw: t.gateway };
    }
  }

  // 2) Fallback: payment_gateway_names (Array)
  const names = order.payment_gateway_names || [];
  if (names.length) {
    const method = normalizeGateway(names[0]);
    return { method, label: PAYMENT_LABELS[method], raw: names[0] };
  }

  // 3) Fallback: order.gateway (einzelner String, ältere API)
  if (order.gateway) {
    const method = normalizeGateway(order.gateway);
    return { method, label: PAYMENT_LABELS[method], raw: order.gateway };
  }

  return { method: 'other', label: PAYMENT_LABELS.other, raw: '' };
}
