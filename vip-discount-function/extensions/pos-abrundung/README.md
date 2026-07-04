# POS-Abrundung (10 Cent)

Rundet den Warenkorb-Betrag **im Ladengeschaeft (Shopify POS)** auf die naechste
glatte 10-Cent-Stufe **ab** (z. B. 24,97 EUR -> 24,90 EUR). Im **Online-Store**
passiert nichts.

- Ziel/API: `cart.lines.discounts.generate.run`, API-Version `2025-10`.
- POS-Erkennung ueber das Feld **`cart.retailLocation`** (liegt auf Cart, NICHT
  auf der Input-Root! Gegen `shopify app function schema` verifiziert). Ist es
  gesetzt = Checkout im Laden -> Abzug des Cent-Rests ueber der letzten
  10-Cent-Stufe als **Order-Rabatt**. Sonst `NO_DISCOUNT`.
- Stufe fix bei 10 Cent (`STEP_CENTS` in `src/index.js`). Fuer 5 Cent: `5`.

## Deploy

Vom PC (nicht per GitHub-Action, App-Management-Token fehlt):

```
cd vip-discount-function/extensions/pos-abrundung && npm install
cd ../.. && shopify app deploy
```

## Rabatt anlegen (nach dem Deploy)

Entweder im **Shopify-Admin** (Rabatte -> Rabatt erstellen -> App-Funktion
"POS-Abrundung") ODER per Workflow **"POS-Abrundung anlegen"** (nutzt die
App-Client-Credentials) bzw. direkt:

```graphql
mutation {
  discountAutomaticAppCreate(automaticAppDiscount: {
    title: "POS-Abrundung"
    functionId: "<FUNCTION_ID der POS-Abrundung>"
    discountClasses: [ORDER]
    startsAt: "2026-01-01T00:00:00Z"
    combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true }
  }) {
    automaticAppDiscount { discountId title status }
    userErrors { field message }
  }
}
```

## Hinweis

Discount-Functions kennen sich untereinander nicht. Kommt im POS **nach** dieser
Function noch ein Rabatt hinzu (z. B. manueller Kassen-Rabatt), kann der
Endbetrag leicht von der 10-Cent-Stufe abweichen. Fuer den Normalfall (POS ohne
weitere Rabatte) rundet es exakt.
