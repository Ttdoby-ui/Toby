# Go-Live Runbook – Mengenrabatt Beläge (Lösung ①)

Ziel: Gestaffelter Mengenrabatt auf **Beläge**, wobei pro Artikel der
**höhere** Wert aus Mengenstaffel und VIP gewinnt – **ohne Stapeln**.

Prinzip von Lösung ①: Die Mengen-Function steuert die Beläge **allein** und
zahlt den VIP-Rabatt dort selbst aus (`max(Mengenstaffel %, VIP %)`). Damit die
alte VIP-Automatik nicht zusätzlich greift, werden die Beläge aus der
VIP-Kollektion genommen. VIP bleibt für alle anderen Produkte unverändert.

> **Reihenfolge ist wichtig:** Beläge erst **nach** dem Function-Deploy aus der
> VIP-Kollektion nehmen. Sonst gibt es ein Zeitfenster, in dem VIP-Kunden auf
> Belägen gar keinen Rabatt haben.

---

## Wichtige IDs / Fakten

| Was | Wert |
|---|---|
| Beläge-Kollektion (manuell, 433 Produkte) | `gid://shopify/Collection/607791087964` |
| VIP-Kollektion (Smart, Regel `TAG = for_vip`) | `gid://shopify/Collection/664158142812` |
| VIP1 / VIP2 / VIP3 (automatisch) | `2340297605468` / `2340297671004` / `2340297736540` |
| VIP-Prozente | 15 % / 25 % / 30 % (Kunden-Tags `VIP1` / `VIP2` / `VIP3`) |
| Mengenstaffeln | ab 2 → 20 %, ab 5 → 25 %, ab 10 → 30 % |

---

## Ablauf

### 1. Function deployen
`shopify app deploy` (vom Windows-PC). Die Function `kollektionsrabatt`
wird damit veröffentlicht. VIP bleibt als native Automatik-Rabatte bestehen.

### 2. Function-ID holen
```graphql
{ shopifyFunctions(first: 25) { nodes { id title apiType } } }
```
ID von **„Kollektionsrabatt (Mengenstaffel)"** notieren.

### 3. Rabatt anlegen
GitHub → **Actions → „Kollektionsrabatt anlegen" → Run workflow**:
- Titel: `Beläge – Mengenrabatt`
- Kollektion: `607791087964` (Beläge)
- Function-ID: aus Schritt 2
- Staffeln: `2/20`, `5/25`, `10/30`
- VIP berücksichtigen: **an**

(Das Script setzt `combinesWith.productDiscounts = false` → kein Stapeln.)

### 4. Testen (vor der Tag-Umstellung)
Am besten mit `starts_at` in der Zukunft **oder** zuerst auf einer Test-Kollektion.
Erwartete Ergebnisse im Warenkorb:

| Kunde | Beläge | Ergebnis |
|---|---|---|
| VIP1 | 1 | 15 % (VIP) |
| VIP1 | 2 | 20 % (Menge) |
| VIP1 | 5 | 25 % (Menge) |
| VIP3 | 1 | 30 % (VIP) |
| VIP3 | 5 | 30 % (VIP) |
| Nicht-VIP | 1 | kein Rabatt |
| Nicht-VIP | 2 | 20 % |

### 5. Beläge aus der VIP-Kollektion nehmen
Damit die VIP-Automatik die Beläge nicht mehr berührt. Zwei Varianten:

- **A (einfach):** Tag `for_vip` von den 433 Beläge-Produkten entfernen.
  Voraussetzung: `for_vip` wird nur für die VIP-Kollektion genutzt.
- **B (sicherer):** Neuen Tag, z. B. `kein_vip`, an die 433 Beläge-Produkte
  hängen und die VIP-Kollektion um die Regel `TAG ≠ kein_vip` ergänzen.
  Lässt `for_vip` unangetastet.

> Diese Massen-Tag-Änderung kann als eigener GitHub-Workflow automatisiert
> werden (auf Wunsch, läuft dann nur manuell per „Run workflow").

### 6. Endkontrolle
- VIP-Kunde, 1 Belag → 15 % über die **Function** (nicht doppelt).
- Kein Beleg-Artikel zeigt zwei Rabatte.
- VIP auf Nicht-Belag-Produkten unverändert.

---

## Rollback
- Rabatt im Shopify-Admin deaktivieren **und**
- Tag-Änderung rückgängig machen (`for_vip` zurück bzw. `kein_vip` entfernen).
→ Zustand ist wieder wie vorher.
