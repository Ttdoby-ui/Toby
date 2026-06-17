import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectPaymentMethod } from './payment-methods.mjs';
import { SKR03_DEFAULT } from './skr03-accounts.mjs';
import { buildExtf, bookingRowForOrder, BOOKING_COLUMNS } from './datev-extf.mjs';

// Beispiel-Bestellungen im Shopify-REST-Shape
const orderCreditCard = {
  name: '#8897',
  created_at: '2026-06-17T08:01:25Z',
  total_price: '119.00',
  currency: 'EUR',
  payment_gateway_names: ['shopify_payments'],
  transactions: [
    { kind: 'sale', status: 'success', gateway: 'shopify_payments', amount: '119.00' },
  ],
  tax_lines: [{ rate: 0.19, price: '19.00' }],
};

const orderInvoice = {
  name: '#8898',
  created_at: '2026-06-18T10:00:00Z',
  total_price: '54.00',
  currency: 'EUR',
  payment_gateway_names: ['manual'],
  transactions: [{ kind: 'sale', status: 'success', gateway: 'manual', amount: '54.00' }],
  tax_lines: [{ rate: 0.19, price: '8.62' }],
};

const orderPaypalReduced = {
  name: '#8899',
  created_at: '2026-06-19T12:30:00Z',
  total_price: '10.70',
  currency: 'EUR',
  payment_gateway_names: ['paypal'],
  transactions: [{ kind: 'sale', status: 'success', gateway: 'paypal', amount: '10.70' }],
  tax_lines: [{ rate: 0.07, price: '0.70' }],
};

test('Zahlungsweise wird korrekt erkannt', () => {
  assert.equal(detectPaymentMethod(orderCreditCard).method, 'shopify_payments');
  assert.equal(detectPaymentMethod(orderInvoice).method, 'bank_transfer');
  assert.equal(detectPaymentMethod(orderPaypalReduced).method, 'paypal');
});

test('Buchungszeile: Kreditkarte -> Konto 1361, Erlös 8400, Rechnungsnr. in Belegfeld 1', () => {
  const row = bookingRowForOrder(orderCreditCard, SKR03_DEFAULT).split(';');
  assert.equal(row[0], '119,00'); // Umsatz mit Komma
  assert.equal(row[1], 'S'); // Soll
  assert.equal(row[6], '1361'); // Konto = Shopify-Payments-Verrechnung
  assert.equal(row[7], '8400'); // Gegenkonto = Erlöse 19 %
  assert.equal(row[9], '1706'); // Belegdatum TTMM (17.06.)
  assert.equal(row[10], '"8897"'); // Belegfeld 1 = Rechnungsnummer
});

test('Buchungszeile: Rechnung -> Bankkonto 1200', () => {
  const row = bookingRowForOrder(orderInvoice, SKR03_DEFAULT).split(';');
  assert.equal(row[6], '1200');
  assert.equal(row[7], '8400');
});

test('Buchungszeile: 7%-Umsatz -> Erlöskonto 8300', () => {
  const row = bookingRowForOrder(orderPaypalReduced, SKR03_DEFAULT).split(';');
  assert.equal(row[6], '1362'); // PayPal-Verrechnung
  assert.equal(row[7], '8300'); // Erlöse 7 %
});

test('EXTF-Datei hat gültigen Header + Spaltenzeile + je Bestellung eine Zeile', () => {
  const extf = buildExtf([orderCreditCard, orderInvoice, orderPaypalReduced], {
    beraterNr: 1234567,
    mandantNr: 1001,
    wjBeginn: '2026-01-01',
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
    stapelName: 'Shopify Juni 2026',
    createdAt: new Date('2026-07-01T06:00:00Z'),
  });

  const lines = extf.trimEnd().split('\r\n');
  assert.equal(lines.length, 5); // Header + Spalten + 3 Buchungen

  const header = lines[0].split(';');
  assert.equal(header[0], '"EXTF"');
  assert.equal(header[2], '21'); // Datenkategorie Buchungsstapel
  assert.equal(header[3], '"Buchungsstapel"');
  assert.equal(header[10], '1234567'); // Beraternummer
  assert.equal(header[11], '1001'); // Mandantennummer
  assert.equal(header[13], '4'); // Sachkontenlänge SKR03

  // Spaltenzeile entspricht der definierten Spaltenliste
  assert.equal(lines[1].split(';').length, BOOKING_COLUMNS.length);
});
