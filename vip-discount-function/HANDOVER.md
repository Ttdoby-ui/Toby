# VIP + Aktion Rabatt — Übergabe / Stand

Stand: 21.06.2026 · Branch: `claude/vip-discount-deployment-ugv32f`

## Ziel (Geschäftsregel)

Pro Artikel gewinnt **immer der höchste Rabatt** — **kein Stapeln**:

- **VIP** läuft automatisch über **Kunden-Tags**: `VIP1`=15 %, `VIP2`=25 %,
  `VIP3`=30 % (höchste Stufe gewinnt) auf die **VIP-Kollektion**.
- **Aktion** (BXGY „kaufe X, zahle Y" *oder* Prozent) auf eine Teilmenge
  Beläge (Kollektion **„Aktions-Beläge (BXGY)"**), pro Kampagne konfigurierbar.
- Überschneiden sich beide auf einem Artikel → der höhere Betrag gilt.

## Was gebaut & LIVE ist

Shopify-App **„VIP Beläge Discount"** (Dev Dashboard)
- App-ID: `385858338817` · Client-ID: `9fe6aa2d03cc52e54d29fdba8ee8d823`
- Org: `95089321` (Futurespin) · installiert auf Store `e7ee88-2.myshopify.com`
- Aktive Version: `vip-belage-discount-5+` · `embedded = true`

Extensions (im Repo unter `vip-discount-function/extensions/`):
1. **`bester-rabatt`** — Discount-Function
   (`cart.lines.discounts.generate.run`, api_version `2026-04`).
   - Liest Kunden-Tags (`hasTags`), Kollektions-Zugehörigkeit
     (VIP `664158142812`, Aktion `691790971228`), Zeilenpreis und das
     Discount-Metafeld `function-configuration`.
   - Rechnet pro Zeile `max(VIP-Betrag, Aktions-Betrag)` und gibt einen
     `fixedAmount` aus. BXGY = günstigste (X−Y) Einheiten je Vollgruppe gratis.
2. **`bester-rabatt-settings`** — Admin-UI (`function-settings`), Formular für
   Aktiv/Modus/Parameter, schreibt JSON nach `$app:function-configuration`.

Kampagnen-Config (JSON im Metafeld `function-configuration`):
```json
{ "aktiv": true, "modus": "bxgy",    "kaufe": 4, "zahle": 3 }
{ "aktiv": true, "modus": "prozent", "prozent": 25 }
{ "aktiv": false }            // nur VIP, keine Aktion
```

Bereits angelegt: Kollektion **„Aktions-Beläge (BXGY)"**
`gid://shopify/Collection/691790971228` (manuell, leer — pro Kampagne füllen).

Bestehende VIP-Code-Rabatte (noch AKTIV, beim Go-Live deaktivieren):
- VIP1 `gid://shopify/DiscountCodeNode/2184356004188` (15 %)
- VIP2 `gid://shopify/DiscountCodeNode/2184361115996` (25 %)
- VIP3 `gid://shopify/DiscountCodeNode/2184361738588` (30 %)

## Der verbleibende Blocker

Die App hat **kein Web-Backend** (`application_url = https://example.com`).
Dadurch:
1. Die `function-settings`-Admin-UI **rendert nicht** (sie braucht den
   eingebetteten App-Kontext / App Bridge auf einer echten App-Seite).
2. Beim Installieren ging das **Admin-API-Token an example.com verloren** →
   kein Token, um den Rabatt programmatisch anzulegen.
3. Die MCP/Admin-Verbindung läuft als **andere App** und kann **keinen
   Rabatt mit dieser Function** anlegen (`functionHandle` nicht gefunden).

## Wege zum Abschluss

### A) Minimales App-Backend hosten (empfohlen, vollständig)
1. Minimal-App (z. B. Shopify Remix-Template) auf Vercel/Cloudflare/Fly hosten;
   `application_url` + `auth.redirect_urls` darauf zeigen lassen; neu deployen.
2. App auf dem Store **neu installieren** (Token wird jetzt korrekt gespeichert).
3. Im Admin **Rabatt erstellen → „Bester Rabatt"** → das Settings-Formular
   rendert jetzt inline. Konfigurieren, **Kombinationen AUS**, Berechtigung
   erst auf Test-Kunde, testen, dann für alle freigeben.
4. Alte VIP-Codes (oben) deaktivieren.

### B) Per App-Token (Entwickler, schneller, weniger self-service)
Mit einem gültigen **Offline-Admin-Token der App** (über OAuth des Backends
aus A, oder Token-Exchange):
```graphql
mutation {
  discountAutomaticAppCreate(automaticAppDiscount: {
    title: "Bester Rabatt (VIP + Aktion)",
    functionHandle: "bester-rabatt",
    discountClasses: [PRODUCT],
    combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: false },
    startsAt: "<jetzt>"
  }) { automaticAppDiscount { discountId } userErrors { field message } }
}
```
Kampagne: Metafeld `function-configuration` (Typ json) am Discount setzen.
Danach alte VIP-Codes deaktivieren.

> Hinweis: Der reine *Client-Credentials-Grant* liefert vermutlich **kein**
> store-scoped Admin-Token — dafür wird der OAuth-Flow aus A benötigt.

## Verworfene Wege (dokumentiert)
- Klassische Product-Discount-Function-API → **deprecated** (vor 2026-04 weg).
- **Discounts Allocator** (sauberste „höchster gewinnt"-Lösung) → Shopify
  **Developer-Preview**, über stabile API/Dashboard **nicht aktivierbar**.
- CI/CD-Deploy mit `prtapi_`-Partner-Token → inkompatibel; Deploy läuft nur
  lokal per Browser-Login (`npx @shopify/cli@latest app deploy --client-id …`).
