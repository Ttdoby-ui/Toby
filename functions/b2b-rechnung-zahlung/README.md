# B2B Rechnung Zahlung (Shopify Function)

Stellt sicher, dass B2B-Kunden (Tags `B2B1`/`B2B2`/`B2B3`) immer auf Rechnung
bestellen können – und dass diese Option für B2C-Kunden ausgeblendet bleibt.

## Voraussetzung: Manuelle Zahlungsart anlegen

1. Shopify Admin → **Einstellungen → Zahlungsanbieter**
2. Ganz unten: **Manuelle Zahlungsmethoden → Methode hinzufügen**
3. Name: `Rechnung`
4. Anweisungen für Kunden (z. B.):
   > Wir stellen Ihnen eine Rechnung aus. Bitte überweisen Sie den Betrag
   > innerhalb von 14 Tagen auf das in der Rechnung angegebene Konto.
5. Speichern.

## Deployment (zusammen mit den anderen Functions am Computer)

```bash
shopify app deploy
```

Danach in Shopify Admin → **Einstellungen → Zahlungsanbieter →
Zahlungsanpassungen → Anpassung erstellen → (App) B2B Rechnung Zahlung** aktivieren.

## Logik

| Kunde        | Rechnung-Option        |
|--------------|------------------------|
| B2B1/2/3     | Sichtbar, ganz oben    |
| Alle anderen | Ausgeblendet           |
