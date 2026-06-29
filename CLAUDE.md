# Toby – Shopify Theme Projekt

> **Dieses Dokument ist unser Gedächtnis.** Vor jeder Aufgabe hier reinschauen.
> Neue Erkenntnisse und Irrwege immer hier eintragen, damit Fehler nicht
> wiederholt werden. Abschnitt „Irrwege" = bereits erprobte Sackgassen.

## Shopify Theme-Regeln

- **Alle Änderungen zuerst im Entwurf-Horizon Theme** (ID: `gid://shopify/OnlineStoreTheme/200401420636`, UNPUBLISHED)
  - ⚠️ Theme-IDs ändern sich (Neu-Anlage/Kopie)! Bei „Theme existiert nicht" mit
    `themes(first: 20) { nodes { id name role } }` die aktuelle ID holen.
- Erst nach Abnahme durch den User ins Live-Theme ("futurespin live", MAIN) übernehmen
  - ⚠️ Schreibzugriff aufs **MAIN/Live-Theme ist via MCP gesperrt** – nur in Entwurf-Themes
    pushen; der User veröffentlicht. Live-IDs wechseln oft (User legt Kopien an).
- **Go-Live-Ablauf des Users** (so wird live geschaltet): Wenn **Entwurf-Horizon** passt,
  kopiert der User es, **veröffentlicht die Kopie** und nennt sie **„futurespin live"**.
  Das alte „futurespin live" wird zu **„futurespin backup"**, das alte „futurespin backup"
  wird gelöscht. → Ich arbeite IMMER in **Entwurf-Horizon**; live entsteht durch diese Rotation.
  Aktuelle Live-ID daher bei Bedarf via `themes`-Query holen (MAIN-Rolle = aktuell live).
- Niemals direkt ins aktive/live Theme schreiben ohne ausdrückliche Anweisung
- **Horizon-Update-Reset (WICHTIG):** Ein „Theme aktualisieren" überschreibt VIELE unserer Anpassungen
  – Custom-Dateien bleiben, aber zurückgesetzt werden u. a.: `snippets/price.liquid`,
  `blocks/buy-buttons.liquid`, `layout/theme.liquid` (inkl. B2B-Cart-Skript, `sale-nav-style.css`-Link,
  `rapid-search-settings`, `fs-mobile-ux`, `fs-vip-cards`), `blocks/product-inventory.liquid` (Ampel),
  `config/settings_schema.json` + `settings_data.json` (VIP/B2B), `locales/de.json`+`en.default.json`
  (`konfigurator`/`klebe_service`-Texte), `templates/index.json`, `product.json`, `collection.filter.json`,
  `collection.katalog.json`, `page.konfigurator.json`, `page.b2b-registrierung.json`.
  → **Vollständiges Reset-Playbook mit Wiederherstell-Tabelle: `docs/HORIZON-MIGRATION.md`** (zuerst dort
  reinschauen). Alle Anpassungen liegen komplett im Repo und sind von dort wiederherstellbar.
  Reconciliation 2.0.3→4.1.1 in Theme `200523612508` ist erledigt (Stand 2026-06-29).

## Kollektions-Grid: eigenes „Filter-Panel" (WICHTIG)

- Kollektionsseiten rendern die Produktkacheln **NICHT** über die Theme-Kachel/`price.liquid`,
  sondern über ein **selbstgebautes Filtersystem „Filter-Panel (Futurespin)"**:
  - `sections/filter-panel.liquid` – liefert die Produktdaten als JSON
    (`<script id="fp-catalog-data">`: `price`, `compareAt`, `forVip`, `vipPct`,
    `isBelag`, `noVolume`, Tempo/Kontrolle/… ) und das Gerüst (`.fp-wrap`, `.fp-grid`).
  - `assets/filter-panel-main.js` – baut die Kacheln client-seitig (`.fp-card`,
    `.fp-card__price`); repliziert dort selbst VIP-/Angebots-Preise **und** die
    Belag-Staffelpreise (gleiche „höchster gewinnt"-Logik wie `price.liquid`).
  - `assets/filter-panel-helpers.js`, `assets/filter-panel.css` – Helfer/Style.
- **Konsequenz:** Kachel-Änderungen müssen **dort** rein, nicht (nur) in `price.liquid`.
  `price.liquid` greift weiter auf der **Produktdetailseite**.
- **Performance: inkrementelles Rendern (Lazy-Grid).** `filter-panel-main.js` hält ALLE
  Produktdaten im Speicher (Filter bleiben exakt), rendert aber nur **24 Kacheln** initial
  (`fpCard`) und lädt beim Scrollen per **IntersectionObserver**-Sentinel batchweise nach
  (`fpMore`/`fpEnsureSentinel`, `W.list`/`W.shown`/`W.sent`). Nach jedem Batch `$jdgm()` für
  die Judge.me-Sterne. Filter/Sort/Reset → `W()` rendert wieder ab Batch 1. (Statt vorher
  alle 400+ Kacheln+Bilder+Badges auf einmal.)
- Diese Theme-Dateien lagen ursprünglich NICHT im Repo – Änderungen daran ins Repo
  spiegeln. (Rapid-Search-App ist installiert, aber auf Kollektionsseiten deaktiviert.)

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
  - Store-Function-ID (für `discountAutomaticAppCreate`): `019f08c1-5ddb-7799-b6fa-287917c3aaa1`
- **LIVE Mengenrabatt** „Belaege Mengenrabatt": `gid://shopify/DiscountAutomaticNode/2341460803932`,
  auf Beläge, Staffeln **ab 2 → 15 %, ab 5 → 20 %, ab 10 → 25 %** (VIP-Vergleich 15/25/30, höchster gewinnt)

## Shopify Functions (JavaScript) — korrekter Aufbau

So baut/deployt eine JS-Discount-Function sauber (heute verifiziert):

- Entry-Datei MUSS **`src/index.js`** heißen.
- Der Export muss **benannt** sein und zum `export`-Wert im Toml passen:
  bei `export = "run"` also **`export function run(input)`** — NICHT `export default`
  (sonst Build-Fehler „No matching export in src/index.js for import run").
- `@shopify/shopify_function` gehört in **`dependencies`** (nicht devDependencies) und
  muss vor dem Deploy **installiert** sein (`npm install` im Extension-Ordner), sonst
  „Could not find the Shopify Functions JavaScript library".
- `shopify.extension.toml` im **neuen Format**:
  ```toml
  api_version = "2025-10"                      # AKTUELLE Version nötig (alte werden abgelehnt!)
  type = "function"
  [[extensions.targeting]]
  target = "cart.lines.discounts.generate.run" # neue Discounts-API
  input_query = "src/run.graphql"
  export = "run"
  [extensions.build]
  path = "dist/function.wasm"                  # KEIN command → CLI baut JS nativ (esbuild + javy)
  typegen_command = "node --version"           # no-op: verhindert graphql-codegen-Fehler bei reinem JS
  ```
- **Neue Discounts-API** (`cart.lines.discounts.generate.run`):
  - Input: `discount { discountClasses metafield(...) { jsonValue } }`, `cart.lines`, `cart.buyerIdentity.customer.hasTags`.
  - Output: `{ operations: [{ productDiscountsAdd: { candidates: [{ message, targets:[{cartLine:{id}}], value:{percentage:{value}} }], selectionStrategy: "FIRST" } }] }`.
- **javy** wird beim ersten Build von der CLI heruntergeladen (Internet nötig).
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
- Nach dem Deploy muss die App im **Store installiert** werden (Dev Dashboard → App →
  Store auswählen), sonst ist die Function nicht aktiv.

### Rabatt anlegen (verifiziert – greift im Warenkorb)

- `discountAutomaticAppCreate` muss von der **besitzenden App** (hier „VIP Beläge
  Discount") kommen. Fremder Token (z. B. der Assistent-App) → Fehler
  „Funktion … nicht in der aktuellen App". Mein MCP kann ihn daher NICHT anlegen.
- **Store-Admin-Token** via Client-Credentials am **Store-OAuth-Endpunkt**:
  `POST https://<shop>.myshopify.com/admin/oauth/access_token`
  (NICHT `api.shopify.com/auth/access_token` – das ist App-Management, die Admin-API
  gibt damit 401 „Invalid API key or access token").
- Functions der neuen Discounts-API brauchen beim Anlegen `discountClasses: [PRODUCT]`.
- Mit dem App-eigenen Store-Token findet `shopifyFunctions` die **eigene** Function-ID
  (Skript ermittelt sie automatisch über den Titel).
- Metafeld-Namespace **`kollektionsrabatt`** (plain) wird zur Laufzeit gelesen –
  **kein `$app:` nötig** (verifiziert, Rabatt greift).
- Konfig (Staffeln/Prozente) nachträglich ändern: `metafieldsSet` auf die
  `DiscountAutomaticNode` – KEIN Neu-Anlegen. Geht auch über mein MCP.
- Live-Skript: `vip-discount-function/scripts/create-kollektionsrabatt.mjs`.

## Irrwege (NICHT wiederholen)

- ❌ Build-Script `npx @shopify/shopify-function-build` → Paket existiert nicht (npm 404).
- ❌ Toml `type = "product_discounts"` (Shorthand) + eigenes Build-Command → der native
  JS-Build der CLI greift dann NICHT (CLI verlangt ein Build-Command, das es nicht gibt).
- ❌ Entry-Datei `src/run.js` → CLI findet den Entry-Point nicht („must be in src/index.js").
- ❌ `export default function run` → CLI verlangt den **benannten** Export `run`
  („No matching export in src/index.js for import run"). `export function run` nutzen.
- ❌ Kein `typegen_command` bei reinem JS → der native Build ruft `graphql-codegen`
  und scheitert mangels Konfig. `typegen_command = "node --version"` als no-op setzen.
- ❌ Extension ohne `npm install` deployen → „Could not find the Shopify Functions
  JavaScript library". Vorher im Extension-Ordner `npm install` ausführen.
- ❌ Veraltete `api_version` (z. B. `2025-01`) → Release scheitert mit „Your API
  version for Functions Product Discounts is no longer supported". Auf aktuelle
  Version heben (und Legacy-Target `purchase.product-discount.run` ist dort weg →
  `cart.lines.discounts.generate.run` + `operations`-Output nutzen).
- ⚠️ Beim erneuten `git pull` blockiert die CLI-`uid`-Zeile in der Toml den Merge →
  `git stash` davor, dann `git pull` (Stash nicht zurückholen, nur CLI-uids).
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
  - **Umgesetzt (2026-06-28):** Beläge aus den VIP-Rabatten genommen über eine
    **Kollektions-Regel** statt Tag-Entfernung – VIP-Smart-Kollektion
    (`664158142812`) um `TAG NOT_EQUALS Belag` ergänzt (alle Beläge haben Tag
    `Belag`). Vorteil: `for_vip` bleibt → VIP-Preisanzeige auf den Kacheln intakt,
    nur **eine** reversible Änderung. VIP-Kollektion dadurch 1164 → 858.
  - Die Function ist VIP-aware: bei < Mindestmenge bekommt ein VIP-Kunde trotzdem seinen
    VIP-% (`max(0, VIP)`), verliert also nichts.
  - **VIP gilt nur für VIP-fähige Beläge** (Produkt-Tag `for_vip`): die Function prüft
    pro Position `product.hasAnyTag(tags: ["for_vip"])`. Nicht-`for_vip`-Beläge bekommen
    nur den Mengenrabatt – passend zur Kachel-Anzeige (`price.liquid` prüft denselben Tag).
  - **Ausschluss vom Mengenrabatt**: Produkt-Tag `kein_mengenrabatt`. So getaggte Beläge
    zählen nicht zur Staffel-Stückzahl und bekommen keinen Mengenrabatt (VIP bleibt, wenn
    `for_vip`). Function-Query nutzt Aliase `isVip`/`noVolume` (`hasAnyTag`); `price.liquid`
    blendet die Staffel-Boxen für diese Produkte aus.
- Erstellung eines Rabatts: GitHub-Workflow „Kollektionsrabatt anlegen"
  (`.github/workflows/create-kollektionsrabatt.yml`) ODER die Mutation in
  `vip-discount-function/extensions/kollektionsrabatt/README.md`.
- **Funktionen sind nicht Theme-gebunden:** ein angelegter Rabatt ist sofort live, es gibt
  kein Entwurf/Live wie beim Theme. Zum Testen `starts_at` in die Zukunft oder Test-Kollektion.

## Mobile-UX-Verbesserungen (Checkliste)

> Quelle: User-Analyse (Vergleich mit About You, Decathlon, Bergfreunde, Tischtennis-Profi).
> Theme-Änderungen → **Entwurf-Horizon**. Status pflegen, wenn ein Punkt erledigt ist.

- [x] 🔴 **Sticky Add-to-Cart-Leiste** (Produktseite) — ERLEDIGT
- [x] 🔴 **Trust-Badges** unter dem Kaufen-Button — ERLEDIGT
- [~] 🔴 **Bildgrößen mobil / Performance** — GEPRÜFT (2026-06-28): Slideshow (`blocks/_slide.liquid`)
      und Hero (`sections/hero.liquid`) liefern bereits responsives `srcset` (832–3840) + `sizes:100vw`
      und ein dediziertes Mobil-Bild (375–1100). Das `width=3840` ist nur der Fallback-`src`, NICHT der
      geladene. → Hero ist kein echter Killer; reale Engpässe nur per **Messung** (PageSpeed/Lighthouse mobil) finden.
- [x] 🟡 **Bewertungs-App** (Judge.me) + Sterne auf PDP & Kacheln — ERLEDIGT: Judge.me
      vom User installiert (App-Embed + PDP-Widget + native Theme-Badges über Judge.mes
      eigenen Installer). Die **Filter-Panel-Kacheln** laufen NICHT über die Standard-Kachel
      → dort eigenes `jdgm-preview-badge` (mit `data-id` = Produkt-ID) pro Kachel in
      `assets/filter-panel-main.js`; nach jedem Render/Filter wird `jdgm.batchRenderBadges()`
      angestoßen (mit Poll, falls Judge.me noch lädt), sonst bleiben die clientseitig
      gebauten Kacheln ohne Sterne. Markenfarbe für Judge.me-Widgets: `#486A8F`.
- [x] 🟡 **Suchleiste prominenter** — ERLEDIGT: neue Section `sections/mobile-search-bar.liquid`
      (nur < 750px, öffnet die bestehende Predictive-Search-Modal `#search-modal`), via `header-group.json`
      unter dem Header global eingehängt. Entwurf-Theme.
- [x] 🟡 **Navigation vereinfachen** / horizontale Kategorie-Leiste — ERLEDIGT: neue Section
      `sections/mobile-category-chips.liquid` (Typ/Handle bleibt `mobile-category-chips`, nur < 750px,
      horizontal scrollbar, aus wählbarem Menü = Default `main-menu`, oberste Menüpunkte). Aktuelle
      Optik (User-Wunsch): **Textlinks mit senkrechtem Trennstrich** dazwischen, aktive Kategorie
      via `link.active/child_active` in Markenblau `#486A8F` + Unterstreichung (vorher als blaue
      Pills, dann auf Trennstrich-Optik umgestellt). In `header-group.json` als `fs_mobile_chips`
      direkt unter der mobilen Suchleiste eingehängt. Entwurf-Theme.
      - ⚠️ **Overflow-Falle (horizontales Wegscrollen mobil):** Mehrere Quellen können die
        Kollektionsseite breiter als den Bildschirm machen:
        1. **Chips** selbst (`overflow-x:auto`-Flex-Leiste) → `max-width:100vw`
           (+`box-sizing:border-box`) auf `.fs-chips`/`.fs-chips__track`.
        2. **Topseller-Reihe** `sections/collection-topseller.liquid` (Klassen `cots` =
           **CO**llection **T**op**S**eller, NICHT eine Fremd-App!): nutzte mobil ein
           Grid mit **festen px-Spalten** (`repeat(N,140px)`)+`overflow-x:auto` → dehnt iOS
           die Seite. Fix: unter 1200px auf **Flex-Scroller** umbauen
           (`display:flex; .cots__item{flex:0 0 140px}; max-width:100%; overflow-x:auto`).
        - Diagnose: per JS `getBoundingClientRect().right > innerWidth` die Verursacher +
          deren `position` finden (Leiste **immer** anzeigen, sonst unklar ob sie lief).
        - `body{overflow-x:clip}` half NICHT (iOS scrollt `html`; `clip` erst iOS16+).
          `html{overflow-x:hidden}` allein reicht iOS oft auch nicht → `html,body{overflow-x:hidden}`.
        - **Beläge/Hölzer nutzen die Vorlage `collection.filter`** (Sections:
          `collection-topseller`, `filter-panel`, `produkt-vergleich-cards`).
        3. **ECHTE Wurzel (war's am Ende):** In den Topseller-Kacheln rendert `price.liquid`
           ein **absolut positioniertes `span.visually-hidden`** (a11y-Text). In der schmalen
           Kachel hatte es **keinen positionierten Vorfahren** → bezog sich auf den Body,
           **brach aus dem `overflow:auto`-Scroller aus** und dehnte die Seite (877px). Kein
           `overflow`-Trick greift, weil absolute Elemente die overflow-Begrenzung
           nicht-positionierter Vorfahren ignorieren. **Fix:** `.cots__price`
           `position:relative`+`overflow:hidden` (Bezugsrahmen) und `.cots__price
           .visually-hidden` korrekt auf 1px klippen. → **Lehre:** absolut positionierte
           a11y-Spans (visually-hidden) in engen Kacheln immer in einem `position:relative`-
           Container mit `overflow:hidden` kapseln. Diagnose, die das fand: Elemente **am
           Scroll-Rand** (`right ≈ documentElement.scrollWidth`) mit **Eltern-Kette** zeigen
           (nicht die breitesten – die sind oft geklippt und damit unschuldig).
- [x] 🟢 **Mobile Filter in Kollektionen** — ERLEDIGT: eigenes „Filter-Panel" mit Mobil-Toggle
- [x] 🟢 **Chat-Widget** (Beratung) — ERLEDIGT via **Shopify Inbox** (kein WhatsApp gewünscht).
      App-Embed im Entwurf-Theme aktiviert (`config/settings_data.json` → `current.blocks`),
      Chat-Button in Markenblau `#486A8F`, Position bottom-right/lowest.
      - ⚠️ **App-Embeds in `settings_data.json`** (sonst gehen sie bei der Go-Live-Rotation
        Entwurf→Live verloren!). Block-Referenzen (aus Live übernommen):
        - Inbox-Chat: `shopify://apps/inbox/blocks/chat/841fc607-4181-4ad1-842d-e24d7f8bad6b`
        - Judge.me: `shopify://apps/judge-me-reviews/blocks/judgeme_core/61ccd3b1-a9f2-4160-9fe9-4fec8413e5d8`
        - urgency-low-stock-counter: vorhanden, `disabled:true`.
        Diese Datei NICHT von Hand tippen (Farbschemata!) – per Skript bauen + `JSON.parse`
        validieren, dann `themeFilesUpsert`. `themeFilesCopy` kann NICHT cross-theme kopieren.
- [x] **Announcement-Banner** als Ticker mit CTA-Button statt langem Auth-Link — ERLEDIGT:
      neue Section `sections/announcement-ticker.liquid` (rotierende Botschaften, je optional
      CTA-Button, Autoplay/Intervall + Farben, pausiert bei Hover/Fokus, respektiert reduzierte
      Bewegung). In `header-group.json` als `fs_announce_ticker` ganz oben eingehängt; das alte
      `header-announcements`-Banner (langer Login-Link) ersetzt. Default Markenblau `#486A8F`,
      Button weiß.
      - **Datenquelle = Shop-Metafeld `custom.announcement_banner` (JSON)** — Vorrang vor den
        Section-Blöcken (die nur Fallback sind). So pflegbar über den **Content Creator** (separates
        Cowork-Projekt, NICHT in diesem Repo) ODER direkt in Shopify → Einstellungen → Custom Data → Shop.
        Definition-ID `gid://shopify/MetafieldDefinition/444121907548`, storefront-lesbar (PUBLIC_READ).
        JSON-Schema: `{ autoplay:bool, interval:int(Sek.), bg_color, text_color, messages:[{text, cta_label, cta_link}] }`.
        Setzen via `metafieldsSet` (ownerId = Shop-GID `gid://shopify/Shop/78096073052`).
      - **Content-Creator-Anbindung (offen):** Der Content Creator soll genau dieses Metafeld
        lesen/schreiben. Sein Code liegt außerhalb dieser Repo-Scope → Anbindung dort in seiner
        eigenen Cowork-Session umsetzen (gleiches JSON-Schema verwenden).
- [x] **Cross-Sell direkt nach dem Kaufen-Button** (Belag→Holz/Kleber) — ERLEDIGT: neues
      Snippet `snippets/cross-sell.liquid`, eingehängt in `blocks/buy-buttons.liquid` nach dem
      Konfigurator-CTA (`{% render 'cross-sell', product: product, block: block %}`). Kategorie-
      basiert ohne Pflegeaufwand: **Belag → Kleber/Montage + Hölzer**, **Holz → Beläge + Kleber**,
      sonst nichts. Quellen über Block-Settings überschreibbar (Defaults `collections['montage']`/
      `['holzer']`/`['belage']`), Anzahl/Überschrift/An-Aus ebenso (Defaults greifen auch ohne
      Settings). Horizontale „Passend dazu"-Mini-Kacheln (`.fxs*`), Preis via `price.liquid`;
      **Overflow-sicher** gebaut (`.fxs__price` position:relative+overflow:hidden, visually-hidden
      auf 1px geklippt – Topseller-Lehre), Staffelpreise in der Mini-Kachel ausgeblendet.
- [x] **Produktkarten-Grid mobil größer** / Varianten-Dots auf der Kachel — ERLEDIGT:
      im Filter-Panel pro Kachel **Farb-Dots** aus den `farben`-Optionswerten (`fpDots()` in
      `filter-panel-main.js`, mapt Farbnamen via `FPH.colorOf`, max. 5 + „+N", weiß mit Rand),
      plus **mobil größere Kacheln** (Titel 1rem, Preis 1.1rem, engerer Grid-Gap) – CSS im
      `{% style %}`-Block von `sections/filter-panel.liquid`. Entwurf-Theme.

## Git

- Feature-Branch: `claude/shopify-adhesive-service-vkfNR`
- Kein Push auf andere Branches ohne explizite Erlaubnis
- Kein Pull Request ohne ausdrückliche Anfrage
