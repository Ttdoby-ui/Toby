# Kollektionsrabatt (Mengenstaffel)

Gestaffelter Mengenrabatt pro Kollektion als Shopify Discount Function.
Beispiel: **ab 2 Stück 20 %, ab 5 Stück 25 %, ab 10 Stück 30 %**.

- **Höchste Staffel gewinnt** automatisch (z. B. 7 Stück → 25 %).
- **Höchster Rabatt gewinnt gegenüber VIP**: pro Artikel greift der höhere
  Wert aus Mengenrabatt vs. VIP-Prozentsatz – kein Stapeln.
- Kollektion und alle Staffeln sind frei konfigurierbar über **ein Metafeld** –
  kein erneutes Deployen für neue Werte nötig.

---

## 1. Function deployen

Die Function liegt in derselben App wie die VIP-Function und wird mit
`shopify app deploy` mitveröffentlicht (Deployment-Setup siehe übergeordnetes
`vip-discount-function`). Nach dem Deploy hat die Function eine **Function-ID**,
die für Schritt 2 gebraucht wird:

```graphql
{
  shopifyFunctions(first: 25) {
    nodes { id title apiType }
  }
}
```

Die `id` der Function mit Titel *„Kollektionsrabatt (Mengenstaffel)"* notieren.

---

## 2. Rabatt anlegen — das „Formular"

Pro Kollektionsrabatt wird ein automatischer Rabatt angelegt und mit dem
Konfigurations-Metafeld bestückt. **Nur die markierten Werte anpassen:**

```graphql
mutation {
  discountAutomaticAppCreate(
    automaticAppDiscount: {
      title: "Beläge – Mengenrabatt"                    # ← Anzeigename
      functionId: "FUNCTION_ID_AUS_SCHRITT_1"           # ← Function-ID
      startsAt: "2026-06-26T00:00:00Z"
      combinesWith: {
        orderDiscounts: true
        productDiscounts: false                          # nicht mit anderen %-Rabatten stapeln
        shippingDiscounts: true
      }
      metafields: [
        {
          namespace: "kollektionsrabatt"
          key: "config"
          type: "json"
          value: "{\"collectionIds\":[\"gid://shopify/Collection/123456789\"],\"tiers\":[{\"quantity\":2,\"percentage\":20},{\"quantity\":5,\"percentage\":25},{\"quantity\":10,\"percentage\":30}],\"vipTags\":[\"VIP1\",\"VIP2\",\"VIP3\"],\"vipTiers\":[{\"tag\":\"VIP1\",\"percentage\":15},{\"tag\":\"VIP2\",\"percentage\":25},{\"tag\":\"VIP3\",\"percentage\":30}]}"
        }
      ]
    }
  ) {
    automaticAppDiscount { discountId title }
    userErrors { field message }
  }
}
```

### Konfiguration (Metafeld-JSON, lesbar formatiert)

```json
{
  "collectionIds": ["gid://shopify/Collection/123456789"],
  "tiers": [
    { "quantity": 2,  "percentage": 20 },
    { "quantity": 5,  "percentage": 25 },
    { "quantity": 10, "percentage": 30 }
  ],
  "vipTags":  ["VIP1", "VIP2", "VIP3"],
  "vipTiers": [
    { "tag": "VIP1", "percentage": 15 },
    { "tag": "VIP2", "percentage": 25 },
    { "tag": "VIP3", "percentage": 30 }
  ]
}
```

| Feld            | Bedeutung                                                                 |
|-----------------|---------------------------------------------------------------------------|
| `collectionIds` | Auf welche Kollektion(en) der Rabatt gilt (eine oder mehrere GIDs).        |
| `tiers`         | Mengenstaffeln: ab `quantity` Stück gibt es `percentage` %.                |
| `vipTags`       | *(optional)* Kunden-Tags, die für den VIP-Vergleich geprüft werden.       |
| `vipTiers`      | *(optional)* VIP-Tag → Prozentsatz. Pro Artikel gewinnt der höhere Wert.  |

> Ohne `vipTags`/`vipTiers` ist es ein **reiner Mengenrabatt** ohne VIP-Vergleich.

---

## 3. Weitere Kollektionen

Für jede weitere Kollektion einfach Schritt 2 mit anderer `collectionId`,
anderem `title` und eigenen Staffeln wiederholen. Dieselbe Function bedient
beliebig viele Kollektionsrabatte.

## Werte später ändern

Staffeln oder Prozente anpassen = nur das Metafeld des bestehenden Rabatts
aktualisieren (`metafieldsSet` auf der `discountId`). Kein neues Deployment.

## Tests

```bash
npm test
```

Deckt ab: Staffelgrenzen (2/5/10), höchste erfüllte Staffel, Mengensummierung
über mehrere Zeilen, Ausschluss kollektionsfremder Artikel sowie das
„höchster gewinnt"-Verhalten gegenüber VIP.
