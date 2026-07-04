/**
 * Kollektionsrabatt – gestaffelter Mengenrabatt pro Kollektion
 *
 * Wendet einen prozentualen Rabatt auf alle Artikel einer Kollektion an,
 * abhängig von der Gesamtmenge dieser Kollektion im Warenkorb (Mengenstaffel).
 * Beispiel: ab 2 Stück 15 %, ab 5 Stück 20 %, ab 10 Stück 25 %.
 *
 * "Höchster Rabatt gewinnt" – kein Stapeln:
 *   - Unter den Staffeln greift automatisch die höchste erfüllte Stufe.
 *   - Gegenüber VIP greift pro Artikel der höhere Wert aus Mengenrabatt vs. VIP %.
 *     VIP zählt dabei nur für VIP-fähige Produkte (Produkt-Tag `for_vip`).
 *   - Beläge mit Tag `kein_mengenrabatt` sind vom Mengenrabatt ausgenommen
 *     (zählen nicht zur Staffel, bekommen keinen Mengenrabatt); VIP bleibt möglich.
 *   - Gegenüber einem **Angebot** (Vergleichspreis/UVP > aktueller Preis) wird
 *     der Nachlass am UVP gemessen: Ist das Angebot bereits tiefer als der
 *     Mengen-/VIP-Rabatt, greift KEIN zusätzlicher Rabatt. Andernfalls wird nur
 *     der Differenzbetrag bis zum Zielpreis (UVP × (1−%)) abgezogen.
 *
 * Ziel/API: cart.lines.discounts.generate.run (neue Discounts-API).
 *
 * Konfiguration über das Metafeld (namespace "kollektionsrabatt", key "config"),
 * JSON-Wert, z. B.:
 * {
 *   "collectionIds": ["gid://shopify/Collection/123456789"],
 *   "tiers": [
 *     { "quantity": 2,  "percentage": 15 },
 *     { "quantity": 5,  "percentage": 20 },
 *     { "quantity": 10, "percentage": 25 }
 *   ],
 *   "vipTags": ["VIP1", "VIP2", "VIP3"],
 *   "vipTiers": [
 *     { "tag": "VIP1", "percentage": 15 },
 *     { "tag": "VIP2", "percentage": 25 },
 *     { "tag": "VIP3", "percentage": 30 }
 *   ]
 * }
 *
 * `vipTags`/`vipTiers` sind optional. Fehlen sie, ist es ein reiner
 * Mengenrabatt ohne VIP-Vergleich.
 */

const NO_DISCOUNT = { operations: [] };

export function run(input) {
  // POS/stationaerer Verkauf: Diese Function (Belaege- & Textilien-Mengenrabatt
  // inkl. der fuer diese Kollektionen gebuendelten VIP-Logik) greift NUR im
  // Online-Store. Ist `cart.retailLocation` gesetzt (Feld liegt auf Cart,
  // NICHT auf der Input-Root!), findet der Checkout im Ladengeschaeft
  // (Shopify POS) statt -> kein Rabatt.
  if (input?.cart?.retailLocation) {
    return NO_DISCOUNT;
  }

  const config = input?.discount?.metafield?.jsonValue;
  if (!config || !Array.isArray(config.tiers)) {
    return NO_DISCOUNT;
  }

  // Nur reagieren, wenn der Rabatt überhaupt ein Produktrabatt ist.
  const discountClasses = input?.discount?.discountClasses ?? [];
  if (discountClasses.length > 0 && !discountClasses.includes("PRODUCT")) {
    return NO_DISCOUNT;
  }

  const tiers = normalizeTiers(config.tiers);
  const cart = input?.cart ?? { lines: [] };

  // Nur Artikel der konfigurierten Kollektion(en) zählen und rabattieren.
  const collectionLines = cart.lines.filter(
    (line) => line.merchandise?.product?.inAnyCollection === true
  );
  if (collectionLines.length === 0) {
    return NO_DISCOUNT;
  }

  // Vom Mengenrabatt ausgeschlossene Beläge (Tag `kein_mengenrabatt`) zählen NICHT
  // zur Staffel-Stückzahl und bekommen keinen Mengenrabatt (VIP bleibt unberührt).
  const volumeQuantity = collectionLines.reduce(
    (sum, line) =>
      line.merchandise?.product?.noVolume === true
        ? sum
        : sum + (line.quantity ?? 0),
    0
  );

  const volumePercent = highestVolumePercent(tiers, volumeQuantity);
  const customerVipPercent = highestVipPercent(cart, config.vipTiers);

  const candidates = [];
  for (const line of collectionLines) {
    const current = Number(line.cost?.amountPerQuantity?.amount);
    if (!Number.isFinite(current) || current <= 0) {
      continue;
    }

    const product = line.merchandise?.product ?? {};

    // Mengenrabatt nur, wenn der Belag nicht ausgeschlossen ist.
    const lineVolumePercent = product.noVolume === true ? 0 : volumePercent;
    // VIP nur für VIP-fähige Produkte (Tag `for_vip`).
    const lineVipPercent = product.isVip === true ? customerVipPercent : 0;

    // Höchster Prozentsatz – kein Stapeln.
    const percent = Math.max(lineVolumePercent, lineVipPercent);
    if (percent <= 0) {
      continue;
    }

    const vipWins = lineVipPercent > lineVolumePercent;
    const message = vipWins ? `VIP ${percent}%` : `Mengenrabatt ${percent}%`;

    const compareAt = Number(line.cost?.compareAtAmountPerQuantity?.amount);
    const hasMarkdown = Number.isFinite(compareAt) && compareAt > current;

    if (!hasMarkdown) {
      // Kein Angebot → einfacher Prozent-Rabatt auf den Preis.
      candidates.push({
        message,
        targets: [{ cartLine: { id: line.id } }],
        value: { percentage: { value: String(percent) } },
      });
      continue;
    }

    // Angebot vorhanden: Nachlass am UVP messen, höchster gewinnt.
    const target = compareAt * (1 - percent / 100);
    if (target < current - 0.005) {
      const deductPerItem = current - target;
      candidates.push({
        message,
        targets: [{ cartLine: { id: line.id } }],
        value: {
          fixedAmount: {
            amount: deductPerItem.toFixed(2),
            appliesToEachItem: true,
          },
        },
      });
    }
    // sonst: Angebot ist bereits tiefer → kein zusätzlicher Rabatt.
  }

  if (candidates.length === 0) {
    return NO_DISCOUNT;
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: "ALL",
        },
      },
    ],
  };
}

/** Staffeln säubern und absteigend nach Menge sortieren. */
function normalizeTiers(tiers) {
  return tiers
    .map((tier) => ({
      quantity: Number(tier.quantity),
      percentage: Number(tier.percentage),
    }))
    .filter(
      (tier) =>
        Number.isFinite(tier.quantity) &&
        Number.isFinite(tier.percentage) &&
        tier.quantity > 0 &&
        tier.percentage > 0
    )
    .sort((a, b) => b.quantity - a.quantity);
}

/** Höchste Staffel, deren Mindestmenge erreicht ist. */
function highestVolumePercent(tiers, quantity) {
  for (const tier of tiers) {
    if (quantity >= tier.quantity) {
      return tier.percentage;
    }
  }
  return 0;
}

/** Höchster VIP-Prozentsatz anhand der Kunden-Tags. */
function highestVipPercent(cart, vipTiers) {
  if (!Array.isArray(vipTiers) || vipTiers.length === 0) {
    return 0;
  }

  const tags = cart.buyerIdentity?.customer?.hasTags ?? [];
  const activeTags = new Set(
    tags.filter((entry) => entry.hasTag).map((entry) => entry.tag)
  );

  let best = 0;
  for (const vipTier of vipTiers) {
    if (activeTags.has(vipTier.tag)) {
      const percentage = Number(vipTier.percentage);
      if (Number.isFinite(percentage) && percentage > best) {
        best = percentage;
      }
    }
  }
  return best;
}
