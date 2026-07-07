# B2B-Versand nur für Händler

Delivery-Customization-Function: blendet im Checkout jede Versandoption mit
**"B2B" im Titel** aus, wenn der Kunde **keinen** B2B-Tag trägt.

- **B2B-Kunden** (Tag `B2B1` / `B2B2` / `B2B3` / `Händler`) sehen **„B2B Versand"** (8,21 €).
- **Gäste & B2C-Kunden** sehen ihn **nicht** (nur Standard 3,90 € / Standardversand 5,90 € / Gratis ab 69 € etc.).
- Das **Tische-Profil** („Tischversand …") bleibt unberührt (kein „B2B" im Titel).

Ziel/API: `purchase.delivery-customization.run`, api_version `2025-10`. Tag-Liste
in `src/run.graphql` (`hasAnyTag`). Tests: `src/run.test.js` (7/7).

## Deploy (vom PC, wie die anderen Functions)

```
cd vip-discount-function/extensions/hide-b2b-versand && npm install
cd ../.. && shopify app deploy
```

Die Extension gehört zur bestehenden App „VIP Beläge Discount" – **kein** neues
App-Anlegen/Installieren nötig. Der Deploy validiert die Input-Query gegen das
Schema (so fiel früher ein falsches Feld auf).

## Aktivieren (nach dem Deploy)

Function ≠ aktiv: Es braucht eine **Zustellungsanpassung**, die sie nutzt.

- **Admin-UI:** Einstellungen → Versand und Zustellung → **Zustellungsanpassungen**
  → „Anpassung hinzufügen" → **„B2B-Versand nur für Händler"** → speichern.
- **Oder per API:** `deliveryCustomizationCreate(deliveryCustomization: {
  functionHandle: "hide-b2b-versand", title: "B2B Versand nur für Händler",
  enabled: true }) { deliveryCustomization { id } userErrors { message } }`

## Tag später ändern?

Nur `src/run.graphql` anpassen (`hasAnyTag`-Liste), `shopify app deploy`.
