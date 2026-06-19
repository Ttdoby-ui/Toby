# B2B Kein Gratisversand (Shopify Function)

Blendet alle kostenlosen Versandoptionen für B2B-Kunden (Tags `B2B1`, `B2B2`, `B2B3`) aus.

## Deployment (zusammen mit b2b-preis-rabatt am Computer)

1. Im selben App-Projekt wie `b2b-preis-rabatt`:
   ```bash
   shopify app deploy
   ```
2. Shopify Admin → **Versand und Lieferung → Lieferanpassungen → Anpassung erstellen**
   → **(App) B2B Kein Gratisversand** aktivieren.

## Logik

- Kunde hat Tag `B2B1`, `B2B2` oder `B2B3` → alle Versandoptionen mit Preis 0,00 € werden ausgeblendet.
- Alle anderen Kunden → keine Änderung.
