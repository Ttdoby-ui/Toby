# B2B-Preis-Rabatt (Shopify Function)

Diese Funktion berechnet im Checkout für **B2B-Kunden** den individuellen
**Netto-Preis** je nach Preisstufe. Sie ersetzt den bisherigen pauschalen
15 %-Code.

## Preisstufen

| Kunden-Tag | Produkt-Metafeld (Netto) |
|------------|--------------------------|
| `B2B1`     | `custom.preis_b2b1`      |
| `B2B2`     | `custom.preis_b2b2`      |
| `B2B3`     | `custom.preis_b2b3`      |

## So funktioniert es

- Kunde hat eine Stufe (`B2B1`/`B2B2`/`B2B3`) → für jeden Artikel mit gesetztem
  Stufen-Preis wird im Checkout auf diesen Preis rabattiert
  (Ziel-Brutto = Netto × 1,19).
- Artikel ohne Stufen-Preis → kein B2B-Rabatt (regulärer Preis).
- Kunden ohne Stufen-Tag → kein B2B-Rabatt.
- Bei mehreren Stufen-Tags gilt die Reihenfolge B2B1 → B2B2 → B2B3.

> Voraussetzung (bereits erledigt): Metafeld-Definitionen `custom.preis_b2b1`,
> `custom.preis_b2b2`, `custom.preis_b2b3` (Typ *number_decimal*) und die
> Netto-Anzeige im Theme.

## Deployment (über das Dev Dashboard / Shopify CLI)

Funktionen laufen nicht im Theme, sondern in einer **App**. Ablauf:

1. App im **Dev Dashboard** anlegen (falls noch nicht vorhanden) – siehe
   `CLAUDE.md` (Client-Credentials-Flow, Scopes inkl. `write_discounts`,
   `read_products`).
2. Lokal mit der Shopify CLI verbinden:
   ```bash
   shopify app dev        # oder: shopify app config link
   ```
3. Function-Extension scaffolden (falls Projektstruktur fehlt):
   ```bash
   shopify app generate extension --template product_discount --name b2b-preis-rabatt
   ```
4. Die generierten Dateien durch die hier enthaltenen ersetzen:
   - `shopify.extension.toml`
   - `src/run.graphql`
   - `src/run.js`
   > Falls die CLI eine andere `api_version` oder ein anderes Ergebnis-Format
   > (z. B. `productVariant`- statt `cartLine`-Target) scaffoldet: Format
   > angleichen, die Rechenlogik in `run.js` bleibt unverändert.
5. Deployen:
   ```bash
   shopify app deploy
   ```
6. Im **Shopify Admin → Rabatte → Rabatt erstellen → Automatischer Rabatt →
   (App) B2B Preis Rabatt** aktivieren.

## Wichtige Hinweise

- **MwSt-Satz**: in `src/run.js` über `VAT_RATE` (Standard `0.19`). Für
  abweichende Sätze anpassen oder pro Produkt erweitern.
- **15 %-Code ablösen**: Sobald die Funktion aktiv ist, sollte der pauschale
  Code `B2B-FUTURESPIN` für B2B-Kunden deaktiviert werden, damit sich Rabatte
  nicht überlagern (Kombinierbarkeit der Rabatte prüfen).
- **Test**: Mit dem B2B-Testkunden ein Produkt mit gesetztem `Preis B2B` in den
  Warenkorb legen und im Checkout den Betrag prüfen (Netto × 1,19).
- Der Warenkorb im Theme zeigt nach Aktivierung automatisch den korrekten
  B2B-Zeilenpreis (er rechnet den rabattierten Brutto-Betrag in Netto zurück).
