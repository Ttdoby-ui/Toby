/**
 * Erzeugt einen DATEV-Buchungsstapel im EXTF-Format (Datenkategorie 21).
 *
 * Aufbau der Datei:
 *   Zeile 1: Header (Format-Vorsatz, 31 Felder) – Metadaten zum Stapel
 *   Zeile 2: Spaltenüberschriften der Buchungssätze
 *   Zeile 3+: ein Buchungssatz je Bestellung
 *
 * Format-Konventionen DATEV:
 *   - Trennzeichen: Semikolon
 *   - Textfelder in doppelte Anführungszeichen, interne " werden verdoppelt
 *   - Dezimaltrenner: Komma, keine Tausenderpunkte
 *   - Belegdatum: TTMM (Tag/Monat, Jahr ergibt sich aus dem Datumsbereich/WJ)
 *   - Zieldatei-Encoding: Windows-1252 (ANSI). Diese Funktion liefert einen
 *     JS-String; die Umwandlung nach win-1252 erfolgt beim Schreiben (Route).
 */

import { detectPaymentMethod, PAYMENT_LABELS } from './payment-methods.mjs';
import { SKR03_DEFAULT, paymentAccountFor, revenueAccountFor } from './skr03-accounts.mjs';

/** Zahl → DATEV-Dezimalformat ("1234.5" -> "1234,50"). */
function money(value) {
  const n = typeof value === 'number' ? value : parseFloat(value || '0');
  return n.toFixed(2).replace('.', ',');
}

/** Textfeld DATEV-konform quoten. */
function quote(text) {
  return '"' + String(text ?? '').replace(/"/g, '""') + '"';
}

/** ISO-Datum (YYYY-MM-DD...) -> "TTMM". */
function belegdatum(iso) {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}${mm}`;
}

/** ISO-Datum -> "YYYYMMDD" (für Header-Felder). */
function ymd(iso) {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

/** Zeitstempel "YYYYMMDDHHMMSSmmm" für das Header-Feld "erzeugt am". */
function timestamp(date = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return (
    date.getUTCFullYear() +
    p(date.getUTCMonth() + 1) +
    p(date.getUTCDate()) +
    p(date.getUTCHours()) +
    p(date.getUTCMinutes()) +
    p(date.getUTCSeconds()) +
    p(date.getUTCMilliseconds(), 3)
  );
}

/**
 * Spaltenüberschriften der Buchungssätze (Auszug der gebräuchlichsten Felder
 * des Buchungsstapel-Formats v13; nicht belegte Spalten bleiben in den Zeilen leer).
 */
const BOOKING_COLUMNS = [
  'Umsatz (ohne Soll/Haben-Kz)',
  'Soll/Haben-Kennzeichen',
  'WKZ Umsatz',
  'Kurs',
  'Basis-Umsatz',
  'WKZ Basis-Umsatz',
  'Konto',
  'Gegenkonto (ohne BU-Schlüssel)',
  'BU-Schlüssel',
  'Belegdatum',
  'Belegfeld 1',
  'Belegfeld 2',
  'Skonto',
  'Buchungstext',
];

/**
 * Baut die 31-Felder-Headerzeile (Format-Vorsatz).
 * @param {object} cfg
 */
function buildHeader(cfg) {
  const fields = new Array(31).fill('');
  fields[0] = quote('EXTF'); // Kennzeichen
  fields[1] = '700'; // Versionsnummer
  fields[2] = '21'; // Datenkategorie: Buchungsstapel
  fields[3] = quote('Buchungsstapel'); // Formatname
  fields[4] = '13'; // Formatversion
  fields[5] = timestamp(cfg.createdAt); // erzeugt am
  fields[6] = ''; // importiert
  fields[7] = quote('SH'); // Herkunft (frei, 2 Zeichen) – "SH" = Shopify
  fields[8] = quote(cfg.exportedBy || 'Shopify DATEV Export'); // exportiert von
  fields[9] = ''; // importiert von
  fields[10] = String(cfg.beraterNr || ''); // Berater
  fields[11] = String(cfg.mandantNr || ''); // Mandant
  fields[12] = ymd(cfg.wjBeginn); // WJ-Beginn (YYYYMMDD)
  fields[13] = String(cfg.accountLength || 4); // Sachkontenlänge
  fields[14] = ymd(cfg.dateFrom); // Datum von
  fields[15] = ymd(cfg.dateTo); // Datum bis
  fields[16] = quote(cfg.stapelName || 'Shopify Umsätze'); // Bezeichnung
  fields[17] = ''; // Diktatkürzel
  fields[18] = '1'; // Buchungstyp: 1 = Finanzbuchführung
  fields[19] = '0'; // Rechnungslegungszweck
  fields[20] = '0'; // Festschreibung: 0 = nein (Steuerberater schreibt fest)
  fields[21] = quote(cfg.currency || 'EUR'); // WKZ
  return fields.join(';');
}

/**
 * Erzeugt eine Buchungssatz-Zeile aus einer Shopify-Bestellung.
 * @param {object} order
 * @param {import('./skr03-accounts.mjs').AccountMapping} mapping
 */
export function bookingRowForOrder(order, mapping) {
  const { method, label } = detectPaymentMethod(order);

  const total = parseFloat(order.total_price || '0');
  const taxRate = deriveTaxRate(order);

  const konto = paymentAccountFor(mapping, method); // Soll: Geldeingang
  const gegenkonto = revenueAccountFor(mapping, taxRate); // Haben: Erlös

  // Rechnungsnummer: bevorzugt eine echte Rechnungsnummer aus einem Metafeld,
  // sonst der Bestellname (z. B. "#8897" -> "8897").
  const invoiceNo = (order.invoice_number || (order.name || '').replace(/^#/, '')).slice(0, 36);

  const row = new Array(BOOKING_COLUMNS.length).fill('');
  row[0] = money(total); // Umsatz
  row[1] = 'S'; // Soll (Geldeingang auf Verrechnungskonto)
  row[2] = quote(order.currency || 'EUR'); // WKZ Umsatz
  row[6] = konto; // Konto
  row[7] = gegenkonto; // Gegenkonto
  row[9] = belegdatum(order.created_at); // Belegdatum TTMM
  row[10] = quote(invoiceNo); // Belegfeld 1 = Rechnungsnummer
  row[11] = quote((order.name || '').replace(/^#/, '')); // Belegfeld 2 = Bestellnr.
  row[13] = quote(`${label} ${order.name || ''}`.trim().slice(0, 60)); // Buchungstext
  return row.join(';');
}

/**
 * Leitet einen (vereinfachten) USt-Satz aus der Bestellung ab.
 * Nimmt den höchsten in den tax_lines vorkommenden Satz; ohne tax_lines -> 19 %.
 * @param {object} order
 * @returns {number} Steuersatz in Prozent
 */
function deriveTaxRate(order) {
  const lines = order.tax_lines || [];
  let max = 0;
  for (const t of lines) {
    const rate = typeof t.rate === 'number' ? t.rate * 100 : parseFloat(t.rate || '0') * 100;
    if (rate > max) max = rate;
  }
  if (!lines.length) return 19;
  return Math.round(max);
}

/**
 * Erzeugt den kompletten EXTF-Buchungsstapel als String.
 *
 * @param {object[]} orders  Shopify-Bestellungen
 * @param {object} options
 * @param {string|number} options.beraterNr   DATEV-Beraternummer
 * @param {string|number} options.mandantNr   DATEV-Mandantennummer
 * @param {string} options.wjBeginn           Wirtschaftsjahresbeginn (ISO-Datum)
 * @param {string} options.dateFrom           Stapel-Zeitraum von (ISO)
 * @param {string} options.dateTo             Stapel-Zeitraum bis (ISO)
 * @param {string} [options.stapelName]       Bezeichnung des Stapels
 * @param {string} [options.exportedBy]
 * @param {string} [options.currency='EUR']
 * @param {Date}   [options.createdAt]
 * @param {import('./skr03-accounts.mjs').AccountMapping} [options.mapping=SKR03_DEFAULT]
 * @returns {string}  EXTF-Inhalt (mit CRLF-Zeilenenden)
 */
export function buildExtf(orders, options) {
  const mapping = options.mapping || SKR03_DEFAULT;
  const cfg = {
    createdAt: options.createdAt || new Date(),
    exportedBy: options.exportedBy,
    beraterNr: options.beraterNr,
    mandantNr: options.mandantNr,
    wjBeginn: options.wjBeginn,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    stapelName: options.stapelName,
    currency: options.currency || 'EUR',
    accountLength: mapping.accountLength,
  };

  const lines = [];
  lines.push(buildHeader(cfg));
  lines.push(BOOKING_COLUMNS.map(quote).join(';'));
  for (const order of orders) {
    lines.push(bookingRowForOrder(order, mapping));
  }
  return lines.join('\r\n') + '\r\n';
}

export { BOOKING_COLUMNS };
