# VIP + Aktion Rabatt — Übergabe / Stand

Stand: 21.06.2026 · Branch: `claude/vip-discount-deployment-ugv32f`

## ✅ LIVE seit 21.06.2026 — Native VIP-Lösung (ohne App/Backend)

VIP läuft jetzt **automatisch über Kunden-Tags** als native Shopify-Rabatte
(kein Code mehr nötig). Umgesetzt direkt über die Admin-API:

| Rabatt | % | Segment (Tag) | Status | ID |
|--------|---|---------------|--------|----|
| VIP1 | 15 | VIP1 | ACTIVE | `gid://shopify/DiscountAutomaticNode/2340297605468` |
| VIP2 | 25 | VIP2 | ACTIVE | `gid://shopify/DiscountAutomaticNode/2340297671004` |
| VIP3 | 30 | VIP3 | ACTIVE | `gid://shopify/DiscountAutomaticNode/2340297736540` |

- Alle auf VIP-Kollektion `664158142812`, **Kombinationen AUS**.
- Alte VIP-**Code**-Rabatte (2184356004188 / 2184361115996 / 2184361738588)
  → **deaktiviert** (EXPIRED). Reversibel via `discountCodeActivate`.
- **Doppelrabatt mit BXGY verhindert:** „Kombinationen aus" → Shopify wendet
  nur **einen** automatischen Rabatt an (den besseren).
- **Grenze:** Kein feines „pro Artikel höchster gewinnt" bei gemischtem
  Warenkorb. Dafür die fertige Function unten (braucht App-Backend).

Pflege: VIP-Prozente/Segmente unter **Rabatte** im Admin oder per
`discountAutomaticBasicUpdate`.

---


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

## ✅ Theme-Fix: Warenkorb-Durchstreichpreis (21.06.2026)

**Problem:** Im Warenkorb zeigte der durchgestrichene Preis (~€26.21) denselben
Wert wie der Aktionspreis (~€26.22) statt die echte UVP (€34.95).

**Ursache:** `snippets/cart-products.liquid` berechnete in der
`item.original_price != item.final_price`-Verzweigung den Vergleichspreis
als `item.original_price × (100 − VIP%) / 100` — also den VIP-Rabatt
**nochmals** auf den bereits vom automatischen Rabatt reduzierten Preis.

**Fix (Entwurf-Horizon Theme, noch nicht live):**
Der `<s class="compare-at-price">`-Block in dieser Verzweigung wurde vereinfacht:
```liquid
<s class="compare-at-price">
  {% if item.variant.compare_at_price > item.original_price %}
    {{ item.variant.compare_at_price | money }}
  {% else %}
    {{ item.original_price | money }}
  {% endif %}
</s>
```
→ Zeigt jetzt entweder die echte `compare_at_price` (UVP, falls gesetzt)
  oder `item.original_price` (Listenpreis vor dem automatischen Rabatt).

**Status:** Nur im **Entwurf-Theme** (`gid://shopify/OnlineStoreTheme/199959052636`).
Nach Abnahme manuell ins **Live-Theme** (`gid://shopify/OnlineStoreTheme/184788123996`)
übertragen (dieselbe Änderung in `snippets/cart-products.liquid`).

---

## Verworfene Wege (dokumentiert)
- Klassische Product-Discount-Function-API → **deprecated** (vor 2026-04 weg).
- **Discounts Allocator** (sauberste „höchster gewinnt"-Lösung) → Shopify
  **Developer-Preview**, über stabile API/Dashboard **nicht aktivierbar**.
- CI/CD-Deploy mit `prtapi_`-Partner-Token → inkompatibel; Deploy läuft nur
  lokal per Browser-Login (`npx @shopify/cli@latest app deploy --client-id …`).
