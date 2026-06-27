/**
 * Kollektionsrabatt – gestaffelter Mengenrabatt pro Kollektion
 *
 * Wendet einen prozentualen Rabatt auf alle Artikel einer Kollektion an,
 * abhängig von der Gesamtmenge dieser Kollektion im Warenkorb (Mengenstaffel).
 * Beispiel: ab 2 Stück 20 %, ab 5 Stück 25 %, ab 10 Stück 30 %.
 *
 * "Höchster Rabatt gewinnt":
 *   - Unter den Staffeln greift automatisch die höchste erfüllte Stufe.
 *   - Gegenüber VIP greift pro Artikel der höhere Wert aus
 *     Mengenrabatt vs. VIP-Prozentsatz (kein Stapeln).
 *
 * Konfiguration über das Metafeld (namespace "kollektionsrabatt", key "config"),
 * JSON-Wert, z. B.:
 * {
 *   "collectionIds": ["gid://shopify/Collection/123456789"],
 *   "tiers": [
 *     { "quantity": 2,  "percentage": 20 },
 *     { "quantity": 5,  "percentage": 25 },
 *     { "quantity": 10, "percentage": 30 }
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

export default function run(input) {
  const { cart, discountNode } = input;

  const config = parseConfig(discountNode?.metafield?.value);
  if (!config) {
    return noDiscount();
  }

  const tiers = normalizeTiers(config.tiers);

  // Nur Artikel der konfigurierten Kollektion(en) zählen und rabattieren.
  const collectionLines = cart.lines.filter(
    (line) => line.merchandise?.product?.inAnyCollection === true
  );
  if (collectionLines.length === 0) {
    return noDiscount();
  }

  const totalQuantity = collectionLines.reduce(
    (sum, line) => sum + (line.quantity ?? 0),
    0
  );

  const volumePercent = highestVolumePercent(tiers, totalQuantity);
  const vipPercent = highestVipPercent(cart, config.vipTiers);

  // Höchster Rabatt gewinnt – kein Stapeln.
  const percent = Math.max(volumePercent, vipPercent);
  if (percent <= 0) {
    return noDiscount();
  }

  const vipWins = vipPercent > volumePercent;

  return {
    discounts: [
      {
        targets: collectionLines.map((line) => ({ cartLine: { id: line.id } })),
        value: {
          percentage: { value: String(percent) },
        },
        message: vipWins ? `VIP ${percent}%` : `Mengenrabatt ${percent}%`,
      },
    ],
    discountApplicationStrategy: "FIRST",
  };
}

function parseConfig(raw) {
  if (!raw) return null;
  try {
    const config = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!config || !Array.isArray(config.tiers)) return null;
    return config;
  } catch {
    return null;
  }
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

function noDiscount() {
  return { discounts: [], discountApplicationStrategy: "FIRST" };
}
