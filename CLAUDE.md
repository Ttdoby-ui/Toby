# Toby – Shopify Theme Projekt

> **Dieses Dokument ist unser Gedächtnis.** Vor jeder Aufgabe hier reinschauen.
> Neue Erkenntnisse und Irrwege immer hier eintragen, damit Fehler nicht
> wiederholt werden. Abschnitt „Irrwege" = bereits erprobte Sackgassen.

## Shopify Theme-Regeln

- **Alle Änderungen zuerst im Entwurf-Horizon Theme** (ID: `gid://shopify/OnlineStoreTheme/199959052636`, UNPUBLISHED)
- Erst nach Abnahme durch den User ins Live-Theme ("Updated copy of Horizon", ID: `gid://shopify/OnlineStoreTheme/184788123996`, MAIN) übernehmen
- Niemals direkt ins aktive/live Theme schreiben ohne ausdrückliche Anweisung

## Shopify App-Entwicklung (Dev Dashboard)

- Apps werden ausschließlich über das **Dev Dashboard** (`dev.shopify.com/dashboard`) erstellt — nicht mehr direkt im Shopify Admin
- **Kein statischer Access Token** — Shopify nutzt den **Client Credentials Grant** (Token läuft nach 24h ab)
- Token-Endpunkt: `POST https://api.shopify.com/auth/access_token` mit JSON-Body:
  ```json
  { "client_id": "...", "client_secret": "...", "grant_type": "client_credentials" }
  ```
- Secrets in GitHub Actions: `SHOPIFY_API_KEY` (Client-ID) + `SHOPIFY_API_SECRET` (Schlüssel) — **kein** `SHOPIFY_ACCESS_TOKEN`
- Scopes im Dev Dashboard unter **Konfiguration → Admin-API-Bereiche** setzen, dann App auf Store installieren
- Das "Schlüssel"-Feld im Dev Dashboard ist der **Client Secret** (nicht direkt als Access Token verwendbar)

## Store-Fakten (verifiziert 2026-06-27)

- Store: **Futurespin**
  - myshopify-Domain (für Admin-API!): `e7ee88-2.myshopify.com`
  - Öffentliche Domain (NICHT für API): `futurespin.de`
- Wichtige Kollektionen:
  - **Beläge** (manuell, 433 Produkte): `gid://shopify/Collection/607791087964`
  - **VIP** (Smart-Kollektion, Regel `TAG = for_vip`, 1164 Produkte): `gid://shopify/Collection/664158142812`
- **VIP-Rabatte laufen als AUTOMATISCHE Basic-Rabatte** (die alten Codes sind EXPIRED):
  - VIP1 15 % → `2340297605468`, VIP2 25 % → `2340297671004`, VIP3 30 % → `2340297736540`
  - jeweils auf die VIP-Kollektion, Kundensegmente nach Tags `VIP1`/`VIP2`/`VIP3`
- BXGY „Beläge: Kaufe 4, zahle 3" (`2337981858140`) ist aktuell **EXPIRED**
- App „VIP Beläge Discount" (enthält die Discount-Function): client_id `9fe6aa2d03cc52e54d29fdba8ee8d823`

## Shopify Functions (JavaScript) — korrekter Aufbau

So baut/deployt eine JS-Discount-Function sauber (heute verifiziert):

- Entry-Datei MUSS **`src/index.js`** heißen und **`export default function(input)`** sein
  (die `@shopify/shopify_function`-Runtime ruft den *default*-Export auf).
- `@shopify/shopify_function` gehört in **`dependencies`** (nicht devDependencies).
- `shopify.extension.toml` im **neuen Format**:
  ```toml
  type = "function"
  [[extensions.targeting]]
  target = "purchase.product-discount.run"   # Produktrabatt (Legacy-Return: {discounts, discountApplicationStrategy})
  input_query = "src/run.graphql"
  export = "run"
  [extensions.build]
  path = "dist/function.wasm"                 # KEIN command → CLI baut JS nativ (esbuild + javy)
  ```
- Konfigurierbares Metafeld → `[extensions.input.variables]` mit `namespace`/`key`.
  Die JSON-Felder des Metafelds werden zu Query-Variablen (z. B. `$collectionIds`,
  `$vipTags`) für `inAnyCollection(ids: $collectionIds)` / `hasTags(tags: $vipTags)`.
- Lokal testen: `node --test src/run.test.js`. Build prüfen: `shopify app function build`
  (Achtung: dieses Kommando macht zusätzlich `typegen` und braucht dafür eine
  Schema-/Codegen-Konfig — der **Deploy** selbst macht KEIN typegen).

### Deployment-Weg (funktioniert)

- **`shopify app deploy` vom Rechner** (Windows-PC, CLI 4.x) mit **Browser-OAuth**.
- Repo liegt auf dem PC unter `C:\Users\info\toby`. Vorgehen:
  `git checkout claude/shopify-adhesive-service-vkfNR` → ggf. `git stash` für fremde
  lokale Änderungen (z. B. `b2b-shopify-app`) → `git pull` → `cd vip-discount-function`
  → `npm install -g @shopify/cli@latest` → `shopify app deploy`.
- Beim Deploy bestätigt man mit dem App-Namen (`VIP Beläge Discount`).
  **Vor dem Bestätigen** den Diff prüfen: „removed extensions" können Live-Daten löschen.

## Irrwege (NICHT wiederholen)

- ❌ Build-Script `npx @shopify/shopify-function-build` → Paket existiert nicht (npm 404).
- ❌ Toml `type = "product_discounts"` (Shorthand) + eigenes Build-Command → der native
  JS-Build der CLI greift dann NICHT (CLI verlangt ein Build-Command, das es nicht gibt).
- ❌ Entry-Datei `src/run.js` → CLI findet den Entry-Point nicht („must be in src/index.js").
- ❌ `application_url`/`redirect_urls` mit Platzhalter `https://{{ HOST }}` → CLI-Validierung
  „Invalid URL". Gültige URL eintragen (z. B. `https://futurespin.de`).
- ❌ Deploy über GitHub Actions mit `prtapi_`-Partner-Token → „custom token invalid"
  (Partner-Token taugt nicht für die App-Management-API). Deploy daher vom PC.
- ❌ Admin-API gegen `futurespin.de` ansprechen → immer die `*.myshopify.com`-Domain nutzen.

## Rabatt-Architektur (Mengenrabatt + VIP)

- Ziel „**höchster Rabatt gewinnt**" (kein Stapeln) ist nur deterministisch, wenn **EINE**
  Stelle eine Kollektion steuert. Shopify: bei `combinesWith.productDiscounts = false`
  gilt nur 1 Produktrabatt pro Position — *welcher* ist aber nicht garantiert der höhere.
- **Gewählte Lösung ① (Beläge):** Die Function `kollektionsrabatt` steuert Beläge **allein**
  und rechnet pro Artikel `max(Mengenstaffel %, VIP %)`. VIP bleibt für alle anderen
  Produkte als native Automatik-Rabatte bestehen.
  - Beim **Go-Live**: `for_vip`-Tag von den Beläge-Produkten entfernen (Beläge raus aus
    VIP-Kollektion), **erst NACH** dem Function-Deploy. Details: `vip-discount-function/GO-LIVE-belaege-mengenrabatt.md`.
  - Die Function ist VIP-aware: bei < Mindestmenge bekommt ein VIP-Kunde trotzdem seinen
    VIP-% (`max(0, VIP)`), verliert also nichts.
- Erstellung eines Rabatts: GitHub-Workflow „Kollektionsrabatt anlegen"
  (`.github/workflows/create-kollektionsrabatt.yml`) ODER die Mutation in
  `vip-discount-function/extensions/kollektionsrabatt/README.md`.
- **Funktionen sind nicht Theme-gebunden:** ein angelegter Rabatt ist sofort live, es gibt
  kein Entwurf/Live wie beim Theme. Zum Testen `starts_at` in die Zukunft oder Test-Kollektion.

## Git

- Feature-Branch: `claude/shopify-adhesive-service-vkfNR`
- Kein Push auf andere Branches ohne explizite Erlaubnis
- Kein Pull Request ohne ausdrückliche Anfrage
