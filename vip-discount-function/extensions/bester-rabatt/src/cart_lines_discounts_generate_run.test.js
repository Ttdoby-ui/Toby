import {describe, it, expect} from 'vitest';
import {cartLinesDiscountsGenerateRun} from './cart_lines_discounts_generate_run';
import {DiscountClass} from '../generated/api';

/**
 * Baut einen minimalen RunInput.
 * @param {object} opts
 * @param {string[]} [opts.tags]        Gehaltene VIP-Tags des Kunden
 * @param {object|null} [opts.sonder]   jsonValue des Kunden-Metafelds futurespin.sonderrabatte
 * @param {object|null} [opts.tierCfg]  jsonValue des App-Metafelds (Stufen-%)
 * @param {Array} opts.lines            [{id, handle, price, compareAt?, quantity?}]
 * @param {boolean} [opts.noCustomer]
 * @param {DiscountClass[]} [opts.classes]
 */
function buildInput({
  tags = [],
  sonder = null,
  tierCfg = null,
  lines,
  noCustomer = false,
  classes = [DiscountClass.Product],
}) {
  const customer = noCustomer
    ? null
    : {
        hasTags: ['VIP1', 'VIP2', 'VIP3'].map((tag) => ({
          tag,
          hasTag: tags.includes(tag),
        })),
        sonderrabatte: sonder == null ? null : {jsonValue: sonder},
      };

  return {
    cart: {
      buyerIdentity: {customer},
      lines: lines.map((l) => ({
        id: l.id,
        quantity: l.quantity ?? 1,
        cost: {
          amountPerQuantity: {amount: String(l.price)},
          compareAtAmountPerQuantity:
            l.compareAt == null ? null : {amount: String(l.compareAt)},
        },
        merchandise: {
          __typename: 'ProductVariant',
          id: `gid://shopify/ProductVariant/${l.id}`,
          sku: l.sku ?? 'SKU',
          product: {handle: l.handle},
        },
      })),
    },
    discount: {
      discountClasses: classes,
      metafield: tierCfg == null ? null : {jsonValue: tierCfg},
    },
  };
}

function onlyCandidate(result) {
  expect(result.operations).toHaveLength(1);
  const {candidates} = result.operations[0].productDiscountsAdd;
  expect(candidates).toHaveLength(1);
  return candidates[0];
}

describe('cartLinesDiscountsGenerateRun', () => {
  it('wendet kundenindividuellen Sonderrabatt (Thorsten 35%) an', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        tags: ['VIP3'],
        sonder: {'tibhar-evolution-mx-p': 35},
        lines: [{id: '1', handle: 'tibhar-evolution-mx-p', price: 50}],
      }),
    );
    const c = onlyCandidate(result);
    // 50 -> 35% auf UVP 50 = 32.50 Zielpreis -> 17.50 Abzug
    expect(c.value.fixedAmount.amount).toBe('17.50');
    expect(c.message).toBe('Sonderpreis 35%');
  });

  it('nutzt Stufen-% aus VIP-Tag, wenn kein Override vorliegt', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        tags: ['VIP3'],
        lines: [{id: '1', handle: 'andro-rasanter', price: 40}],
      }),
    );
    const c = onlyCandidate(result);
    expect(c.value.fixedAmount.amount).toBe('12.00'); // 30% von 40
    expect(c.message).toBe('VIP 30%');
  });

  it('höchste Stufe gewinnt (VIP3 über VIP1)', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        tags: ['VIP1', 'VIP3'],
        lines: [{id: '1', handle: 'x', price: 100}],
      }),
    );
    expect(onlyCandidate(result).value.fixedAmount.amount).toBe('30.00');
  });

  it('stapelt NICHT, wenn das Angebot stärker als der VIP-Rabatt ist', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        tags: ['VIP1'], // 15%
        lines: [{id: '1', handle: 'x', price: 80, compareAt: 100}], // 20% Angebot
      }),
    );
    expect(result.operations).toEqual([]);
  });

  it('rabattiert nur die Differenz auf base% vom UVP (kein Stapeln auf schwaches Angebot)', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        tags: ['VIP3'], // 30%
        lines: [{id: '1', handle: 'x', price: 90, compareAt: 100}], // 10% Angebot
      }),
    );
    // Zielpreis = 100 * 0.70 = 70; aktueller Preis 90 -> 20 Abzug (gesamt 30% ab UVP)
    expect(onlyCandidate(result).value.fixedAmount.amount).toBe('20.00');
  });

  it('multipliziert den Abzug mit der Menge', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        tags: ['VIP3'],
        lines: [{id: '1', handle: 'x', price: 40, quantity: 3}],
      }),
    );
    expect(onlyCandidate(result).value.fixedAmount.amount).toBe('36.00'); // 12 * 3
  });

  it('liest Stufen-% aus dem App-Metafeld (überschreibt Fallback)', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        tags: ['VIP3'],
        tierCfg: {VIP1: 10, VIP2: 20, VIP3: 40},
        lines: [{id: '1', handle: 'x', price: 100}],
      }),
    );
    expect(onlyCandidate(result).value.fixedAmount.amount).toBe('40.00');
  });

  it('gibt nichts ab, wenn kein Kunde eingeloggt ist', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        noCustomer: true,
        lines: [{id: '1', handle: 'x', price: 100}],
      }),
    );
    expect(result.operations).toEqual([]);
  });

  it('ignoriert die Function ohne PRODUCT discount class', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        tags: ['VIP3'],
        classes: [],
        lines: [{id: '1', handle: 'x', price: 100}],
      }),
    );
    expect(result.operations).toEqual([]);
  });

  it('Override greift auch nur auf den passenden Handle (andere Zeile via Stufe)', () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        tags: ['VIP3'],
        sonder: {'tibhar-evolution-mx-p': 35},
        lines: [
          {id: '1', handle: 'tibhar-evolution-mx-p', price: 50},
          {id: '2', handle: 'andro-rasanter', price: 40},
        ],
      }),
    );
    const {candidates} = result.operations[0].productDiscountsAdd;
    expect(candidates).toHaveLength(2);
    const byLine = Object.fromEntries(
      candidates.map((c) => [c.targets[0].cartLine.id, c]),
    );
    expect(byLine['1'].value.fixedAmount.amount).toBe('17.50'); // 35% Sonder
    expect(byLine['1'].message).toBe('Sonderpreis 35%');
    expect(byLine['2'].value.fixedAmount.amount).toBe('12.00'); // 30% Stufe
    expect(byLine['2'].message).toBe('VIP 30%');
  });
});
