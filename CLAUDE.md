# Toby – Shopify Theme Projekt

> **Dieses Dokument ist unser Gedächtnis.** Vor jeder Aufgabe hier reinschauen.
> Neue Erkenntnisse und Irrwege immer hier eintragen, damit Fehler nicht
> wiederholt werden. Abschnitt „Irrwege" = bereits erprobte Sackgassen.

## Rechtliches / Compliance (Stand 2026-07-03, technischer Check – keine Rechtsberatung)

- **Shop-Policies** (Impressum/AGB/Widerruf/Datenschutz/Versand/Kontakt) existieren alle und sind im
  **Footer** verlinkt (`gid://shopify/Menu/233321529692`). Storefront-Pfade: `/policies/legal-notice`,
  `/policies/terms-of-service`, `/policies/refund-policy`, `/policies/privacy-policy`,
  `/policies/shipping-policy`. **AGB-Link im Konfigurator** war fälschlich `/pages/agb` → auf
  `/policies/terms-of-service` korrigiert (2026-07-03).
- ⚠️ **Policies per API NICHT änderbar:** `shopPolicyUpdate` existiert, aber mein MCP-Token hat **keinen**
  `write_legal_policies`-Scope → „Access denied". Policy-Texte müssen im **Admin → Einstellungen →
  Richtlinien/Rechtliches** geändert werden (oder Scope freigeben).
- **Offene Rechts-Punkte (2026-07-03), im Admin zu erledigen:**
  1. **Impressum**: EU-OS-Plattform-Link ist veraltet (Plattform seit 20.07.2025 offline) → entfernen, nur
     §36-VSBG-Satz behalten. **Telefon + E-Mail fehlen** im Impressum (§5 TMG) → ergänzen
     (09195/9230019, online@futurespin.de). **Handelsregister-Nr. fehlt** (HRA der KG + HRB der
     Komplementär-GmbH + Amtsgericht) → ergänzen (Daten liegen nur beim User). Fertiger korrigierter
     Impressum-Text wurde dem User geliefert.
  2. **Widerrufsrecht**: Telefon-Typo **09295 → 09195** korrigieren.
  3. **Retouren-Pauschale 4,50 €** (Versand-/Widerruf-Policy) vs. gesetzlicher Widerruf: beim 14-Tage-Widerruf
     dürfen nur die *unmittelbaren Rücksendekosten* auferlegt werden, keine zusätzliche Bearbeitungspauschale →
     anwaltlich prüfen/klarstellen (die 4,50 € gelten für das freiwillige 30-Tage-Rückgaberecht).
  4. **Grundpreis (PAngV)** – ✅ **weitgehend erledigt (2026-07-03):** Für alle ml/g-Verbrauchsartikel in
     **Pflege & Montage** (Kleber/Reiniger/Spray/Versiegelung) ist der Grundpreis gesetzt (`unitPriceMeasurement`
     + `showUnitPrice:true` via `productVariantsBulkUpdate`; **Konvention: referenceValue 100, Einheit ML bzw. G**
     → „€/100 ml" bzw. „€/100 g", konsistent mit den ~23 zuvor schon gesetzten Produkten → Vergleichbarkeit).
     Füllmenge aus dem Titel geparst (z. B. „andro Free Seal 25g" → 25 G). **3 Produkte konnten NICHT automatisch
     gesetzt werden** (keine Füllmenge im Titel) → **manuell** im Admin nachtragen: „Revolution No. 3 Cleaner",
     „Nittaku Finezip", „Stiga Attach Powerglue". ⚠️ **Anzeige:** Grundpreis erscheint über den nativen
     Preisblock (PDP); auf den **Filter-Panel-Kacheln** (Beläge/Hölzer) wird er nicht gerendert – Pflege-Kollektion
     nutzt aber die native Kachel. Wer >250 ml/g streng per 1 L/1 kg auszeichnen will, kann `referenceUnit` auf
     L/KG umstellen (aktuell bewusst 100er-Konvention der Vorgänger übernommen).
  5. **Cookie-Consent-Banner (TTDSG §25/DSGVO)**: aktives Consent-Banner verifizieren (Judge.me, Inbox,
     Pixel setzen Cookies) – Shopify „Customer Privacy"/Consent-Banner oder App.
- **Bereits behoben (Theme):** PDP zeigt „Inkl. Steuern … Versand …" (`show_tax_info: true` im
  Haupt-Preisblock von `product.json`). **Kollektions-Kacheln (Filter-Panel)** zeigen unter dem B2C-Preis
  **„inkl. MwSt., zzgl. Versand"** – per CSS `.fp-card__price:not(:has(.b2b-net-note))::after` im
  `{% style %}`-Block von `sections/filter-panel.liquid` (nur B2C; B2B behält sein `.b2b-net-note` „zzgl. MwSt.").
  ⚠️ Noch **offen (optional):** native Horizon-Kacheln (Empfehlungen `product.json` `price_gLWgA6`,
  Homepage-`product-list`, Topseller via `price.liquid`) zeigen den Hinweis noch nicht – dort ggf.
  `show_tax_info:true` bzw. Note ergänzen.
- `taxesIncluded: true` (Preise inkl. MwSt.), `taxShipping: false`, Währung EUR. **GPSR**-Herstellerangaben
  laufen über den `hersteller-info`-Block (siehe unten) – befüllt lassen.

## Shopify Theme-Regeln

- 🚨 **Primärer Entwurf = „Entwurf Horizon 4.1.1"** (`gid://shopify/OnlineStoreTheme/200523612508`, UNPUBLISHED) —
  hier IMMER arbeiten. **Zusätzlich** dieselbe Änderung – wenn problemlos möglich – auch in **„Entwurf-Futurespin"**
  (`gid://shopify/OnlineStoreTheme/200580792668`, UNPUBLISHED) spiegeln (User-Wunsch 2026-07-12; bei Problemen
  nachfragen). Entwurf-Futurespin ist eine Kopie mit unseren Anpassungen (Galerie-Filter, Bestand-Swatch etc.).
  (2026-07-08: Theme-Änderungen versehentlich in `200401420636` gemacht → nach 4.1.1 nachgezogen.
  ⚠️ 4.1.1 hat **mehr** als das alte Theme, u. a. **B2B-Netto-Preise im Filter-Panel** (`b2bLevel`/`b2b`/
  `b2bCompare`, `isTextil`) + PAngV-„inkl. MwSt."-Note — beim Reproduzieren NICHT verlieren! Immer die
  **aktuelle** 4.1.1-Datei lesen und nur ergänzen.)
  - ⚠️ Theme-IDs ändern sich (Neu-Anlage/Kopie)! **Vor** jeder Theme-Änderung mit
    `themes(first: 20) { nodes { id name role } }` das aktuelle „Entwurf …"-Theme (höchste Version) holen.
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
  - **B2B-Netto-Preise auf Kacheln (2026-06-29):** `filter-panel.liquid` emittiert `b2bLevel`
    (aus Kunden-Tags B2B1/2/3) + pro Produkt `b2b`/`b2bCompare` (Netto aus `custom.preis_b2b1/2/3`,
    Fallback Brutto→Netto via `settings.b2b_vat_rate`). `filter-panel-main.js` zeigt bei B2B den
    Netto-Preis + „zzgl. MwSt." mit **Vorrang** und blendet VIP/Angebot/Staffel aus (wie `price.liquid`).
  - ⚠️ **Theme-Dateien pushen:** Der Store-Token (`SHOPIFY_ACCESS_TOKEN`) hat **kein** `write_themes`
    (Shopify-Exemption fehlt) → `themeFilesUpsert` per GitHub-Action schlägt fehl. Nur **mein MCP** darf
    Theme-Dateien schreiben. Großes base64 NICHT als einen Riesen-Blob abtippen (Fremdzeichen-Korruption
    → „ungültige Zeichen") → **eine Datei pro Mutation**, base64 in ≤9000er-Chunks lesen und konkatenieren.
    Workflow `push-theme-files.yml` existiert, ist aber mangels `write_themes` aktuell nicht nutzbar.
    - ✅ **Bester Weg für GROSSE Dateien (2026-07-03, verifiziert):** Statt base64 abzutippen die Datei erst
      auf den Branch committen/pushen und dann `themeFilesUpsert` mit **`body: {type: URL, value: <raw-URL>}`**
      aufrufen – Shopify holt den Inhalt selbst. Raw-URL am **Commit-SHA** (nicht Branch-Name, wegen `/` im
      Namen): `https://raw.githubusercontent.com/ttdoby-ui/toby/<SHA>/<pfad>`. Das Repo ist raw-öffentlich
      erreichbar (mit WebFetch vorab testen). Die Mutation gibt `upsertedThemeFiles: []` **ohne** userErrors
      zurück (Fetch läuft async) → Erfolg per Read-back (`theme.files(filenames:[...])`) prüfen. Umgeht die
      base64-Transkriptionsfehler bei >~40 KB komplett.
  - `assets/filter-panel-helpers.js`, `assets/filter-panel.css` – Helfer/Style.
- **Konsequenz:** Kachel-Änderungen müssen **dort** rein, nicht (nur) in `price.liquid`.
  `price.liquid` greift weiter auf der **Produktdetailseite**.
- 🚨 **PFLICHT-REGEL (User, 2026-07-08): Preis-/Badge-/Anzeige-Anpassungen IMMER an BEIDEN Render-Pfaden
  umsetzen** – sonst weichen Kacheln und „normale" Ansicht voneinander ab (passierte beim Hauspreis-Badge:
  PDP „Hauspreis", Kachel „Angebot"). Es gibt **zwei getrennte Render-Wege**, die sich NICHT gegenseitig
  beeinflussen:
  1. **Filter-Panel** (Beläge/Hölzer/Katalog-Kollektionen): `sections/filter-panel.liquid` (JSON-Daten) +
     `assets/filter-panel-main.js` (Kachel-Bau) + die `assets/fs-*.js`-Post-Prozessoren (Badge/NEU/Sale).
  2. **Native Horizon** (PDP, Homepage-`product-list`, Empfehlungen, Topseller `collection-topseller`,
     sonstige Kollektionen): `snippets/price.liquid` (+ ggf. Produkt-Metafelder wie `custom.price_badge_text`).
  → Bei jeder Preis-/Badge-/Prozent-/„inkl. MwSt."-Änderung **beide** Stellen anpassen und testen (Kachel
  **und** Produktseite **und** Homepage/Empfehlungen). Nie nur eine Seite.
- **Sortierung „Neuheiten zuerst" (2026-07-09):** Sortier-Dropdown (`data-fp-sort`) hat die Option
  **`new-desc` „Neuheiten zuerst"** – sortiert nach `published` (Veröffentlichungsdatum) absteigend, neueste
  zuerst. In `filter-panel.liquid` (`<option>`), in `filter-panel-main.js` an ZWEI Stellen ergänzt: Sort-Chain
  in `W()` (`n("published","desc")`) **und** die Modus-Whitelist (`{relevance,new-desc,price-asc,price-desc}`,
  sonst würde die Option je Modus ausgeblendet). `published` gibt `filter-panel.liquid` bereits im JSON aus.
- **Performance: inkrementelles Rendern (Lazy-Grid).** `filter-panel-main.js` hält ALLE
  Produktdaten im Speicher (Filter bleiben exakt), rendert aber nur **24 Kacheln** initial
  (`fpCard`) und lädt beim Scrollen per **IntersectionObserver**-Sentinel batchweise nach
  (`fpMore`/`fpEnsureSentinel`, `W.list`/`W.shown`/`W.sent`). Nach jedem Batch `$jdgm()` für
  die Judge.me-Sterne. Filter/Sort/Reset → `W()` rendert wieder ab Batch 1. (Statt vorher
  alle 400+ Kacheln+Bilder+Badges auf einmal.)
- Diese Theme-Dateien lagen ursprünglich NICHT im Repo – Änderungen daran ins Repo
  spiegeln. (Rapid-Search-App ist installiert, aber auf Kollektionsseiten deaktiviert.)
- 🚨 **250-Produkte-Falle (Liquid `paginate ... by 250` / `products.json?limit=250`, Audit 2026-07-09):**
  Shopify begrenzt **jede** Liquid-`paginate`-Seite auf **max. 250** Produkte, und `products.json?limit=`
  ebenso. Beläge (436) und Hölzer (338) liegen darüber → wer katalogweit rendert und nur Seite 1 nimmt,
  verliert die Marken **D–Z** (Donic/Tibhar/Victas …). **Lösung:** weitere Seiten client-seitig per
  `?page=N` nachladen und mergen (Muster in `filter-panel-main.js`, `fs-new-badge.js`,
  `schlaeger-finder.js`; Cap 20 Seiten = 5000). Betroffene/geprüfte Stellen:
  - ✅ `filter-panel-main.js` – lädt Seiten per IntersectionObserver nach (ok).
  - ✅ `assets/fs-new-badge.js` – lädt Seiten per `?page=N` nach (2026-07-08 gefixt, sonst NEU-Badge nur < 250).
  - ✅ **`snippets/schlaeger-finder-data.liquid` + `assets/schlaeger-finder.js` (2026-07-09 gefixt):** Das
    Daten-Snippet (`#sf-catalog-data`) rendert nur Seite 1 → der Schläger-Finder empfahl nur aus den ersten
    250. Fix: Snippet gibt jetzt `"pages"` (Seitenanzahl, `paginate.pages | at_least`) aus; `schlaeger-finder.js`
    lädt die weiteren Seiten per `?page=N` im Hintergrund nach und mergt in `CATALOG` (dedupe per Handle),
    während der Nutzer noch das 11-Schritt-Quiz beantwortet. Zwei paginate-Blöcke teilen sich denselben
    `?page`-Param – beide liefern ihre Seite N. Repo-Mirror unter `theme-horizon/…`.
  - ⚠️ `sections/schlaeger-berater.liquid` (KI-Chat-Widget) fetcht `products.json?limit=250`, **aber**
    `buildProductList()` macht `arr.slice(0, 60)` → nur 60 Produkte gehen an die Claude-API. Der 250-Cap
    ist durch den engeren 60er-Sample **maskiert** (kein Produktverlust-Symptom wie beim Finder); Erweitern
    wäre eine Kosten-/Design-Entscheidung (größerer Prompt), kein Bugfix. **Nicht** blind „gefixt".
  - ✅ Bewusst klein/gebunden (kein 250-Bug): `collection-topseller` (Metafeld-Liste, `limit: 6`),
    `snippets/cross-sell.liquid` (`break` bei ~6), `snippets/fs-cart-crosssell.liquid` (fester ~6-Handle-Pool),
    `produkt-vergleich.liquid` (nur Einzelprodukt-PDP-Daten).
- **Rundes „NEU"-Badge auf den Kacheln (2026-07-07):** Neues Asset `assets/fs-new-badge.js` legt oben
  rechts aufs Produktbild ein rundes „NEU"-Kreis-Badge (Futurespin-Blau `#486A8F`), wenn das Produkt
  **≤ 60 Tage veröffentlicht** ist (`published_at`). Ohne Eingriff in die minifizierte `filter-panel-main.js`:
  liest die neuen IDs aus `#fp-catalog-data`, injiziert CSS, taggt Kacheln (per `jdgm-preview-badge[data-id]`)
  und beobachtet das Grid per MutationObserver (robust bei Lazy-Load/Filter/Reset). `filter-panel.liquid`
  gibt dafür zusätzlich **`published`** (`published_at`) im JSON aus und lädt das Asset. Repo-Mirror:
  `theme-horizon/{assets/fs-new-badge.js,sections/filter-panel.liquid}`. ⚠️ Theme-Änderung → nur im
  **Entwurf-Horizon**, wird bei der nächsten Rotation live.
  - **Native Kacheln (2026-07-08):** Dasselbe runde „NEU"-Badge liegt jetzt auch auf den **nativen Horizon-
    Kacheln** – in `snippets/product-card-badges.liquid` (Liquid, `product.published_at ≤ 60 Tage`,
    `.fs-new-badge-native`, Blau `#486A8F`, oben rechts). Repo-Mirror `theme-horizon/snippets/product-card-badges.liquid`.
    ⚠️ Native Horizon-Datei → wird bei „Theme aktualisieren" zurückgesetzt, aus dem Mirror wiederherstellen.
  - **PDP-Hauptbild (2026-07-11):** Das runde NEU-Badge liegt jetzt auch auf dem **Produktseiten-Hauptbild** –
    in `snippets/product-media.liquid` (nur `is_main_product_media`, `closest.product.published_at ≤ 60 Tage`,
    `.fs-new-badge-pdp`, Blau `#486A8F`, `.product-media` bekommt `position:relative`). Repo-Mirror
    `theme-horizon/snippets/product-media.liquid`. Damit ist das NEU-Badge an ALLEN Stellen (Filter-Kacheln,
    native Kacheln, PDP-Hauptbild).

## Bestand je Farb-Swatch: „> 15" statt exakter Menge (2026-07-12)

- Der Button-Variant-Picker zeigt unter jedem Swatch den Bestand der Variante. In `snippets/variant-main-picker.liquid`
  (Futurespin-Custom, native Horizon-Datei → **Repo-Mirror** `theme-horizon/snippets/variant-main-picker.liquid`)
  gilt: **Bestand > 15 → „Bestand > 15"** (exakte Menge verborgen), **≤ 15 → „Bestand = N"** (genaue Zahl).
  Logik: `assign fs_stock = product_option_value.variant.inventory_quantity` + `{% if fs_stock > 15 %}&gt; 15{% else %}= {{ fs_stock }}{% endif %}`.
  ⚠️ Native Datei → bei „Theme aktualisieren" zurückgesetzt → aus Mirror wiederherstellen. Nur Entwurf-Horizon → live bei Rotation.

## Varianten-Bilder auf der PDP (nur die der gewählten Variante, 2026-07-11)

- **Ziel (User):** Bei einem Artikel mit Farb-Varianten sollen die Bilder einer Farbe **nur** erscheinen,
  wenn diese Variante ausgewählt ist (wie im Referenz-Shop contra.de).
- **Shopify-Limit:** Ein Produkt-Variante ist pro Variante nur **EIN** Bild zuordenbar (`image.variants` /
  `variant.featured_media` = genau 1). `productVariantAppendMedia` lehnt ein zweites Bild ab
  („Variante hat bereits angehängte Medien"). Daher lässt sich „5 blaue + 4 grüne Bilder je Farbe" **nicht**
  über die Varianten-Bild-Zuordnung lösen.
- **Lösung = Alt-Text-Filter** in `snippets/product-media-gallery-content.liquid`: Setting
  **„Hide unselected variant media"** (`hide_variants`) ist im Media-Block von `templates/product.json` **an**.
  Bei `hide_variants` filtert die Galerie die Medien über den **Alt-Text**: ein Bild wird nur **ausgeblendet**,
  wenn sein Alt-Text den **Optionswert einer ANDEREN Variante** enthält (`fs_opt_values` =
  `options_with_values[0].values`, Abgleich gegen `variant.option1`). Bilder mit passendem Alt-Text + neutrale
  Bilder (ohne Farbbezug) bleiben. So erscheinen ALLE Bilder EINER Farbe, aber nur bei deren Auswahl. Greift über
  die Section-Neurenderung bei Variantenwechsel (`media-gallery.js` tauscht `<media-gallery>` aus). Repo-Mirror
  `theme-horizon/snippets/product-media-gallery-content.liquid` (native Datei → bei „Theme aktualisieren"
  zurücksetzen → aus Mirror wiederherstellen).
- 🚨 **VORAUSSETZUNG (Daten):** Die Bilder müssen im **Alt-Text die Farbe** tragen, exakt wie der Options-/
  Variantenwert (z. B. Alt „… Blau/Schwarz" bzw. „… Grün/Schwarz", Optionswerte „Blau/Schwarz"/„Grün/Schwarz").
  Marken-Importe (andro etc.) liefern das meist mit. Fehlt der Farbbezug im Alt-Text, gilt das Bild als neutral
  → wird bei jeder Farbe gezeigt (keine Filterung, aber kein Fehler). Farbe muss die **erste** Produktoption sein.
- **Katalogweit alt-getextet (2026-07-12):** Gesamter aktiver Katalog gescannt; die einzigen echten
  „ein Produkt / mehrere Farben / mehrere Bilder"-Fälle sind wenige Textil-/Ball-/Zubehör-Artikel. Bei diesen
  15 wurden die Bild-Alt-Texte per `fileUpdate` auf „<Titel> <Optionswert>" gesetzt (Farbe je Bild **zuverlässig**
  aus Varianten-Zuordnung/Artikelnummer-Präfix bzw. Farb-Wort im Dateinamen abgeleitet, nicht geraten): futurespin
  T-Shirt Promo, Tibhar T-Shirt Smash, Joola Polo/Competition/Short Maco/Short Essential 25, Joola Tischtennisplatte
  3000 SC Pro, Tibhar Ball SYNTT NG (72/3), Joola Magic ABS 72, andro Handtuch NUZN S/M, Tibhar Netz Smash, Joola
  Anzugjacke/-hose Team 25. Taiva-Tasche + -Doppelhülle hatten schon korrekte Alt-Texte (andro-Import).
  Beläge (Rot/Schwarz = Gummifarbe, 1 generisches Bild) und Getrennt-je-Farbe-Produkte brauchen nichts.
  **Nicht automatisch lösbar:** `futurespin Schlägerhülle Logo` (Anthrazit/Blau) – Bilder keiner Variante zugeordnet
  und ohne Farbe im Dateinamen → Alt-Text müsste manuell gesetzt werden (welches Bild Anthrazit vs. Blau ist).

## Farb-Artikel zusammenführen (getrennte Farb-Produkte → 1 Produkt mit Farb-Variante)

- **Hintergrund (User):** Früher wurden Farben als **separate Artikel** angelegt (schlechte Filterbarkeit).
  Ziel: pro „Set" **ein** Produkt mit **Farbe = 1. Variantenoption** (Pflicht, sonst greift der Alt-Text-
  Bildfilter nicht, siehe oben – `option1` muss die Farbe sein) und Größe als 2. Option; Bilder je Farbe mit
  Farbe im Alt-Text → Galerie-Filter zeigt beim Farbklick nur die Bilder dieser Farbe.
- **Pilot fertig (2026-07-12): „futurespin Shirt Performance"** – aus rot/schwarz/blau **ein** Produkt
  `gid://shopify/Product/15157844574556` (Handle `futurespin-shirt-performance`), 23 Varianten (Schwarz 9,
  Rot 5, Blau 9). **Preise unverändert** (Rot 24,90 €, Schwarz/Blau 34,90 €, Vergleichspreis 49,90 €), **B2B-
  Metafelder = Schwarz/Blau-Werte** (Master war Schwarz → `custom.preis_b2b1/2/3` = 17,45/17,60/29,33 bleiben
  erhalten). Alte rot/blau-Produkte **archiviert** (`15157841559900`, `15157844738396`), alle drei alten Handles
  **301-Redirect** auf den neuen (schwarz-Redirect automatisch via `redirectNewHandle:true`, rot/blau per
  `urlRedirectCreate`).
- **Verfahren (reproduzierbar, rein Shopify-Daten – sofort live in ALLEN Themes):**
  1. **Bilder der Nicht-Master-Farben** an den Master hängen: `productCreateMedia`/`productSet files` mit
     `originalSource` (CDN-URL des alten Produktbilds), **Alt-Text = „<Titel> <Farbe>"** (die Farbe MUSS im
     Alt-Text stehen, exakt wie der Optionswert). Master-eigenes Bild nur per `fileUpdate` den Alt-Text setzen.
     → deterministisch: erst Media anlegen (IDs holen), dann in `productSet` **per `id`** referenzieren (kein
     Dupe-Risiko durch wiederholte `originalSource` über viele Varianten).
  2. **`productSet`** auf den Master (declarativ!): `productOptions` [Farbe pos1 (alle Farben), Größe pos2 (Union
     aller Größen)], `variants` = **alle** Kombinationen die es real gibt (Master-Varianten mit ihrer `id`
     behalten → Bestand/History bleiben; neue Farben ohne id → werden angelegt), jede Variante mit
     `optionValues`, `price`, `compareAtPrice`, `taxable`, `inventoryItem{tracked,measurement{weight}}`,
     `inventoryQuantities[{locationId, name:"available", quantity}]` und **`file:{id: <Farbbild>}`** (Bildzuordnung
     → `variant.featured_media`, ohne die der Filter NICHT greift, weil `selected_or_first_available_variant.featured_media`
     nil wäre → else-Zweig zeigt ALLE Bilder). `files` listet alle 3 Bild-IDs. **Metafields/Collections weglassen
     → bleiben erhalten.** `handle` neu + `redirectNewHandle:true`. `synchronous:true` (≤ ~250 Varianten ok).
  3. **Alte Farb-Produkte** `status:ARCHIVED` (nicht löschen → reversibel) + `urlRedirectCreate` je Alt-Handle
     → `/products/<neuer-handle>`.
  - ⚠️ **Shopify-Limit 1 Bild/Variante** (siehe oben): mehrere Bilder je Farbe gehen NUR über den Alt-Text-
    Filter, nicht über Varianten-Bild-Zuordnung. Ein Farbbild kann aber von mehreren Varianten (Größen) derselben
    Farbe als featured genutzt werden.
- **Massen-Merge erledigt (2026-07-12): 137 von 139 „sicheren" Sets zusammengeführt, 0 Datenfehler.**
  Katalog-Sweep fand 148 Kandidaten-Sets (Artefakt/Übersicht); die 139 „sicheren" (ohne Schuhe/Schläger-
  „prüfen"-Fälle + Joola-Duomat-Dublette) wurden per **Skript `scripts/merge-color-articles.mjs` + Workflow
  „Farb-Artikel zusammenführen"** (auf `main`, checkt Feature-Branch aus) gemergt. Farbe je Set aus dem Titel
  geparst (gemeinsame Wort-Präfixe/-Suffixe entfernt → Farbe = Mitte, robust auch bei „Kantenband **blau** 30cm"),
  Master = höchster Variantenpreis (→ B2B vom teureren Farbwert). Preise/Bestände/Gewichte je Farbe 1:1 erhalten,
  Metafelder/Tags/Kollektionen des Masters erhalten. **233 archivierte Farb-Handles** per 301-Redirect auf den
  neuen Artikel (Master-Handles via `redirectNewHandle` automatisch). Idempotent + Rollback-Artefakt.
  - **Nicht gemergt (2, bewusst):** `andro Shirt Avos` (hat > 1 Nicht-Farb-Option → zu komplex, manuell) und
    `Joola Tisch Duomat Pro` (Daten-Dublette „blau" ×2 → erst aufräumen).
  - 🚨 **Falle Taxonomie-gebundene Optionen (WICHTIG):** Bei **Bekleidung** trägt der Master ein
    **`shopify.color-pattern`/`shopify.size`-Metafeld**; legt man dann eine Option „Farbe"/„Größe" an, bindet
    Shopify sie an die Taxonomie und lehnt **Freitext-Farben** wie „navy/lime", „schwarz/gelb", „türkis",
    „chili rot" ab (`INVALID_METAFIELD_VALUE_FOR_LINKED_OPTION`). `category:null` allein reicht NICHT →
    **vor dem `productSet` diese Metafelder per `metafieldsDelete` (ownerId+namespace `shopify`+key) löschen**
    (+ category:null). Zubehör/Tische (ohne Farb-Metafeld) sind nicht betroffen.
  - 🚨 **Store-Token-Scopes:** Der Workflow-Token (`SHOPIFY_ACCESS_TOKEN`) hat **kein `write_files`** (→ `fileUpdate`
    scheitert; Bild-Alt-Texte deshalb über `productSet.files{id,alt}` bzw. `originalSource,alt` setzen) und **kein
    `write_online_store_navigation`** (→ `urlRedirectCreate` scheitert; Redirects per **MCP** nachtragen, mein
    MCP-Token hat den Scope). `redirectNewHandle` (Master-Handle) läuft dagegen über `write_products` und greift.
  - **Weitere Merges (Nachschub):** neue Farb-Extra-Artikel → in `SAFE_SETS` (Skript) als ID-Gruppe ergänzen,
    Workflow erneut (erst `dry_run=true`). ⚠️ **Nicht mergen** wo der Suffix Größe/Menge/Härte/Edition ist
    (Umrandung-Maße, Ball-Stückzahl, „Baumwolle" vs. nicht, Senso V1/V2, Turbo). Preise je Farbe können abweichen.
- **Theme: gewählte Farbe im H1-Titel (2026-07-12):** `snippets/product-media-gallery-content.liquid` (Repo-
  Mirror) enthält am Ende ein self-contained Script (rendert 1× pro PDP): hängt „ – <Farbe>" an den `<h1>`, wenn
  die **erste** Produktoption „Farbe" heißt und > 1 Farbe hat. Liest die gewählte Varianten-ID aus dem
  `/cart/add`-Formular, mappt sie (Liquid-`MAP` id→`option1`) auf die Farbe, hält es beim Variantenwechsel
  synchron (change/input/variant-events + MutationObserver auf der Section, Loop-Schutz via Text-Vergleich,
  Init-Guard `window.__fsColorHeadingInit`). Der Titel-Textblock ist native Horizon (`text`-Block in
  `product.json`: `<h1>{{ closest.product.title }}</h1>`) und wird bei Variantenwechsel NICHT re-gerendert →
  daher JS statt Liquid. ⚠️ Nur Entwurf-Horizon → live bei Rotation; Galerie-Snippet wird bei „Theme
  aktualisieren" zurückgesetzt → aus Mirror wiederherstellen.
- **Kombi-Vorschaubild „Farbübersicht" erledigt (2026-07-12):** Für alle 138 zusammengeführten Produkte ein
  Montage-Bild (Raster aus dem ersten Bild jeder Farbe) gebaut und als **erstes/Featured-Bild** gesetzt → es
  erscheint **nur auf Kachel/Vorschau**. Auf der **PDP** wird es **ausgeblendet**, weil sein **Alt-Text ALLE
  Farbnamen enthält** („<Titel> Farbübersicht <farbe1> <farbe2> …") → der bestehende Galerie-Alt-Text-Filter
  blendet es bei JEDER gewählten Farbe aus (enthält immer „andere" Farben). **Kein Theme-Eingriff** nötig; greift
  überall dort, wo der Filter aktiv ist (Entwurf-Horizon → live bei Rotation). Tool: `scripts/build-color-montages.mjs`
  + Workflow **„Kombi-Vorschaubilder bauen"** (auf `main`; `sharp`-Montage, `stagedUploadsCreate` + `productCreateMedia`
  + `productReorderMedia` an Position 0; idempotent: überspringt Produkte mit „Farbübersicht" im Alt-Text). Neue
  Merges → Workflow erneut (nur `LIMIT`/`dry_run`-Optionen). Rollback: Bild mit „Farbübersicht"-Alt im Admin löschen.
  - **Weißer Hintergrund erledigt (2026-07-12):** Alle 138 Kombi-Bilder neu gebaut mit **weißem Hintergrund** –
    jedes Quellbild per **`rembg` (Python, `u2netp`)** freigestellt und auf Weiß gesetzt, Leinwand **quadratisch**
    (füllt die Kachel, kein Theme-Letterbox-Rand). Tool = **`scripts/build-color-montages.py`** + Workflow
    „Kombi-Vorschaubilder bauen" (setup-python + `pip install rembg[cpu] pillow requests`, `RMBG`/`REBUILD`/`ONLY`/
    `LIMIT`-Inputs, Modell 1× via `new_session`). 🚨 **Merke:** Der Node-Freisteller **`@imgly/background-removal-node`
    stürzt in GitHub-Actions nativ ab** (`free(): invalid size` / core dump) → deshalb **Python/rembg** (stabil).
    Fallen: (a) Secret `SHOPIFY_ACCESS_TOKEN` hat ein `\n` am Ende → in Python `.strip()` (requests lehnt `\n` im
    Header ab); (b) `REBUILD=true` löscht das alte Bild ZUERST → bei Abbruch bleibt ein Produkt kurz ohne Kombi-Bild.
    Das alte `scripts/build-color-montages.mjs` (Node) ist überholt – Python-Variante nutzen.
- **Filter-Panel-Kachelpreis nicht mehr am Kartenende (2026-07-08):** `.fp-card__price` hatte in
  `filter-panel.css` `margin-top:auto` → bei Kacheln ohne Staffelbox (z. B. Angebot günstiger als alle
  Mengenstaffeln, „andro Hexer Duro") klebte der Preis unten mit großer Lücke. Fix: im `{% style %}`-Block
  von `filter-panel.liquid` `.fp-card__price{margin-top:.15em}` (überschreibt die CSS) → Preis sitzt direkt
  unter den Farb-Dots, konsistent über alle Kacheln.

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
  - **VIP** (Smart-Kollektion, Regel `for_vip AND NOT mws_apo_generated AND NOT Belag AND NOT Textil`,
    aktuell 562 Produkte): `gid://shopify/Collection/664158142812` (Beläge + Textilien ausgeschlossen,
    da deren VIP-Logik die Function steuert; `for_vip`-Tag bleibt für Preisanzeige)
- **VIP-Rabatte laufen seit 2026-07-07 über die `kollektionsrabatt`-Function (UVP-Basis), NICHT mehr nativ:**
  - Neu: **„VIP-Rabatt (UVP-Basis)"** `gid://shopify/DiscountAutomaticNode/2352883794268` (ACTIVE) – dieselbe
    Function wie der Mengenrabatt, aber **VIP-only** (Config `tiers: []`, `VIP_ONLY=true`), auf die VIP-Collection
    `664158142812`. Grund: nur die Function kann den VIP-% auf die **UVP (`compareAtAmountPerQuantity`)** rechnen
    und deckelt auf den Angebotspreis → **kein Doppelrabatt** auf Sale-Artikel (Bug: VIP stapelte auf reduzierte
    Preise). Anlage: Workflow **„VIP-Kollektionsrabatt anlegen (UVP-Basis)"** (`VIP_ONLY=true`, auf `main`).
  - ⚠️ **Nebeneffekt (bewusst so, 2026-07-07):** Die Function ist **POS-ausgeschlossen** (`cart.retailLocation`)
    → VIP gilt für diese Artikel **nur online, nicht im Laden** (die alten nativen VIP-Rabatte galten in allen
    Kanälen). So gewollt, konsistent zum Mengenrabatt.
  - Die 3 nativen VIP-Rabatte sind seither **EXPIRED/deaktiviert** (nicht löschen, für Rollback):
    VIP1 15 % → `2340297605468`, VIP2 25 % → `2340297671004`, VIP3 30 % → `2340297736540` (jeweils auf die
    VIP-Kollektion, Kundensegmente nach Tags `VIP1`/`VIP2`/`VIP3`). Rollback = diese reaktivieren + neuen
    Function-Rabatt deaktivieren.
- BXGY „Beläge: Kaufe 4, zahle 3" (`2337981858140`) ist aktuell **EXPIRED**
- App „VIP Beläge Discount" (enthält die Discount-Function): client_id `9fe6aa2d03cc52e54d29fdba8ee8d823`
  - Store-Function-ID (für `discountAutomaticAppCreate`): `019f08c1-5ddb-7799-b6fa-287917c3aaa1`
- **LIVE Mengenrabatt** „Belaege Mengenrabatt": `gid://shopify/DiscountAutomaticNode/2341460803932`,
  auf Beläge, Staffeln **ab 2 → 15 %, ab 5 → 20 %, ab 10 → 25 %** (VIP-Vergleich 15/25/30, höchster gewinnt)
- **LIVE Mengenrabatt** „Textilien – Mengenrabatt": `gid://shopify/DiscountAutomaticNode/2341602459996`,
  auf **Textilien** (`gid://shopify/Collection/607791874396`, Handle `bekleidung`, 388 Produkte),
  Staffeln **ab 6 → 20 %, ab 20 → 25 %, ab 30 → 30 %** (VIP-aware: max(Menge, VIP) 15/25/30). Angelegt
  2026-06-29 über den Workflow „Kollektionsrabatt anlegen" (gleiche `kollektionsrabatt`-Function).
  - ✅ **Determiniertheit umgesetzt (2026-06-29):** Alle Textilien sind mit Tag **`Textil`** markiert und die
    **VIP-Smart-Kollektion** (`664158142812`) um **`TAG NOT_EQUALS Textil`** ergänzt → 296 for_vip-Textilien
    aus den nativen VIP-Rabatten genommen (VIP-Produktzahl 858 → 562). Die VIP-aware Function steuert die
    for_vip-Textilien jetzt allein (auch bei Menge 1: `max(0, VIP)` liefert den VIP-Satz, Kachelpreis =
    Warenkorbpreis). `for_vip`-Tag bleibt → VIP-Preisanzeige (price.liquid) intakt. Skript/Workflow:
    `scripts/tag-textilien-vip-exclude.mjs` + `.github/workflows/tag-textilien-vip-exclude.yml` (idempotent,
    `dry_run`-Option). **Neue Textilien** brauchen künftig denselben `Textil`-Tag (sonst Doppelrabatt) –
    Workflow erneut laufen lassen.
- **Hinweis:** Workflow „Kollektionsrabatt anlegen" liegt jetzt auch auf `main` (vorher nur Feature-Branch),
  damit er per `workflow_dispatch` auslösbar ist. Künftige Staffelrabatte → Actions → „Kollektionsrabatt anlegen".

## Desktop-Mega-Menü (Contra-Stil, gruppiert)

- Das **Desktop**-Header-Menü nutzt ein eigenes, **3-stufig gruppiertes** Menü
  **`main-menu-mega`** (`gid://shopify/Menu/336718102876`) im Contra-Look: jede Top-Kategorie
  hat 2.-Ebene-**Gruppen** (fette, uppercase Spalten-Überschriften wie OFFENSIV/ALLROUND/DEFENSIV),
  deren 3.-Ebene-Kinder die einzelnen Kollektions-Links sind. Horizon rendert 2.-Ebene-Items **mit
  Kindern** als `.mega-menu__link--parent` (= Spalten-Header), die Leaf-Kinder stapeln darunter →
  ergibt automatisch die mehrspaltige Contra-Optik.
- **Verdrahtung:** `sections/header-group.json` → `header-menu` `"menu": "main-menu-mega"`
  (die **Mobil-Chips** `fs_mobile_chips` bleiben bewusst auf `main-menu`). Das Live/`main-menu`
  bleibt unangetastet.
- **Optik** liefert `assets/sale-nav-style.css` (Block „Mega-Menü Contra-Stil"): fette/uppercase
  Gruppen-Header mit Marken-Hairline `rgba(72,106,143,0.35)`, vertikale Trennlinien zwischen den
  Spalten (`.mega-menu__list > .mega-menu__column + .mega-menu__column`), Hover `#486a8f`. Greift nur
  bei gruppierten Menüs; flache Menüs (LEHRGÄNGE/GUTSCHEINE ohne Kinder) bleiben einfache Links.
- **Reproduzierbar/erweiterbar:** `scripts/build-mega-menu.mjs` baut die komplette Item-Struktur und
  kann sie per `menuUpdate` anwenden (braucht `write_navigation` → sonst über MCP `menuUpdate` mit der
  `items`-Struktur). **Nur existierende Kollektions-Handles** verwenden (sonst 404 – vor dem Anlegen
  gegen die `collections`-Liste prüfen). Neue Kategorie/Gruppe → im Skript ergänzen, erneut laufen
  lassen (idempotent, ersetzt die ganze Item-Liste). ⚠️ Menüs gehen bei Neuanlage gelegentlich verloren
  → dann Skript erneut anwenden. EN-Übersetzungen der neuen Links ggf. via
  `scripts/register-menu-en-translations.mjs` (MAP ergänzen) nachziehen.

## Storefront-Übersetzungen (EN)

- **Menü-Übersetzungen (Navigation/Footer) ins Englische** liegen als Shopify-`translationsRegister`
  auf den **`LINK`**-Ressourcen (key `title`, locale `en`) – NICHT im Theme. Sie gehen gelegentlich
  verloren (z. B. bei Menü-Neuanlage). **Wiederherstellen:** `scripts/register-menu-en-translations.mjs`
  (idempotent, matcht deutschen Titel → EN aus der MAP, holt aktuelle Digests selbst). Neue Menüpunkte
  einfach in die MAP ergänzen. Braucht `write_translations` – läuft über mein MCP; der Standard-Store-Token
  hat den Scope evtl. nicht. Vollständig angewandt 2026-06-29 (55 Links).
- Textil-Mengenrabatt-Staffeln werden auf PDP (`price.liquid`) **und** Kacheln (`filter-panel`) angezeigt:
  Tag `Textil` + B2B/noVolume blenden aus; Staffeln ab 6/20/30 → 20/25/30 % (synchron zur Function halten).

## Produktbeschreibungen & Hersteller-Angaben (GPSR)

- **GPSR-Pflichtangaben (Hersteller/Adresse/Kontakt)** kommen NICHT aus der Beschreibung, sondern aus dem
  Theme-Block **`hersteller-info`** (`blocks/hersteller-info.liquid` → Snippet `hersteller-info`), Quelle
  Metafeld **`custom.hersteller` → Metaobjekt „Hersteller"** (pro Marke einmal pflegen). Der oben auf der PDP
  sichtbare „Marken-Logo + Tel."-Block ist genau dieser GPSR-Block → **behalten**, nicht entfernen.
- **Hersteller-Text in der `descriptionHtml` war doppelt** (Importe der Hersteller) und wurde 2026-06-30 aus
  **1366 Produkten** entfernt. Tool: `scripts/strip-hersteller-from-descriptions.mjs` + Workflow
  „Hersteller-Block aus Beschreibungen entfernen" (`.github/workflows/strip-hersteller.yml`, auf `main`,
  `workflow_dispatch` mit `dry_run`/`limit`; checkt den Feature-Branch aus). DOM-basiert (node-html-parser):
  Anker „Hersteller:", entfernt das oberste Block-Element samt Folgegeschwistern + räumt leere Wrapper auf,
  idempotent. Store-Token (`SHOPIFY_ACCESS_TOKEN`) hat `write_products`. **Neue Produkte mit eingebettetem
  Hersteller-Text** → Workflow erneut laufen lassen (erst `dry_run=true`). ⚠️ Das ändert **Produktdaten**
  (sofort live in ALLEN Themes, nicht per Theme-Rotation rückgängig).
- **Beschreibungs-Style „sportlich edel"** ist reine Darstellung per CSS in `assets/sale-nav-style.css`
  (global im Header geladen), gescopt auf die PDP-Sektion **`produktbeschreibung_full`**
  (`[id*="produktbeschreibung_full"]`): klare Body-Schrift (Outfit, NICHT Akzent/Headline), Fließtext normal
  (nur Überschriften fett 700), einheitliche Überschriften mit dezenter Marken-Hairline `#486A8F`,
  Chevron-Listenpunkte, `h5/h6` klein/dezent. Die Beschreibung rendert über die eigene full-width Section
  `produktbeschreibung_full` (in `templates/product.json`, Textblock `{{ closest.product.description }}`),
  NICHT mehr in der rechten Spalte. (Diese CSS-Datei ist inzwischen Sammelstelle für Header-/Drawer-/
  Beschreibungs-CSS – auch das Mobil-Drawer-Styling: Trennlinien + Chevron statt „+", %SALE% rot.)

## Schlägerkonfigurator (`sections/konfigurator.liquid`)

- 6-Schritt-Konfigurator (Holz → Vorhand → Rückhand → Kantenband → Versiegelung → Zusammenfassung), rein
  client-seitig. `addToCart()` legt alle Bausteine in **einem** `/cart/add.js`-Batch an; Klebeservice wird
  **immer** automatisch mitgelegt (Variant-ID Section-Setting, Default `57810488852828`).
- ⚠️ **Packzettel-Notiz vs. Warenkorb (Bug #9260, gefixt 2026-07-03):** Früher schrieb `setOrderNote()` die
  Notiz + „Schlägerbau"-Attribute aus der **Bildschirm-Auswahl** (`S.*`) als **Warenkorb-Notiz/Attribute** –
  entkoppelt von den echten Zeilen. Da Warenkorb-Notiz/Attribute ein Bearbeiten/Leeren des Warenkorbs
  überleben, konnte der Packzettel 2 Beläge behaupten, obwohl nur 1 bestellt wurde (die 2 Zeilen kamen ohne
  Line-Item-Properties über die Produktseiten rein, nicht über den Konfigurator).
  - **Fix:** Jede Konfigurator-Zeile trägt jetzt Marker-Properties: sichtbar `Schläger-Baustein`/`Service`
    (Bestellposition ist selbst-beschreibend) + versteckt `_kfg`/`_rolle` (Filter). Die volle Konfiguration
    hängt zusätzlich als verstecktes `_Schlägerkonfiguration` an der **Holz-Zeile**. Notiz/Attribute werden in
    `writeConfigNote(addRes.items)` aus den **tatsächlich hinzugefügten** Zeilen (Antwort von `/cart/add.js`)
    gebaut – nie mehr aus `S.*`. Ohne Konfigurator-Zeile im Warenkorb bleibt die Notiz unangetastet.
  - **Merke:** Bestellpositionen (Line Items) sind die Wahrheit, die Warenkorb-Notiz ist es nicht. Bei
    „Notiz sagt X, Bestellung enthält Y" die Line-Item-`customAttributes` prüfen.

## Hauspreis (dauerhafte −10 % im Artikel, 2026-07-07)

- **Was:** Alle aktiven Artikel dauerhaft im Artikel reduziert: **Preis = UVP × 0,9, abgerundet auf x,90**,
  **Vergleichspreis = alte UVP**, Produkt-**Tag `Hauspreis`**. Kein Rabatt/Function – echte Produktdaten
  (sofort live in ALLEN Themes, nicht per Theme-Rotation rückgängig).
- **Ausgenommen:** Kollektionen **Vereinsbedarf** (`664017830236`) + Sale-Vereinsbedarf (`691374326108`),
  **schon reduzierte** Varianten (Vergleichspreis gesetzt), Artikel **unter 10 €**, Geschenkgutscheine.
- **Ergebnis Lauf 2026-07-07:** 1.062 Produkte / 5.169 Varianten geändert, 0 Fehler.
- **Blaues „Hauspreis"-Feld:** KEINE Theme-Änderung nötig – `snippets/price.liquid` (live + Entwurf) rendert
  bei gesetztem Metafeld **`custom.price_badge_text`** dieses Feld **statt „Angebot"**, in Farbe
  **`custom.price_badge_color`**. Gesetzt: Text „Hauspreis", Farbe `#486A8F` (Futurespin-Blau) auf alle
  `tag:Hauspreis`. → sofort live, keine Rotation.
- **Belag-/Textil-Staffeln bei aktivem VIP ausblenden (2026-07-11):** Auf der Kachel **und** PDP wurden bei
  eingeloggtem VIP die Mengenrabatt-Staffeln (2er/5er/10er bzw. 6/20/30 Stk.) weiter mit ihrem UVP-Staffelpreis
  gezeigt – auch wenn der VIP-Preis **niedriger** war als 2er/5er (verwirrend: „2er-Paket 48,40 €" über dem
  VIP-Preis 42,71 €). **Fix:** Staffel nur noch zeigen, wenn ihr Preis den **effektiven** Preis unterbietet.
  Referenz `belag_ref`/`textil_ref` = bei `price_badge == 'vip'` der **VIP-Preis** (`uvp × (100−vip%)/100 + 1 Cent`;
  das +1 Cent lässt die **10er-Staffel = VIP-Preis** sichtbar), sonst der aktuelle Preis. Beide Render-Pfade:
  `snippets/price.liquid` (PDP, Belag + Textil, `< belag_ref`/`< textil_ref`) und `assets/filter-panel-main.js`
  (Kacheln, Tier-IIFE: `vipOn=e.forVip&&c>0&&c>p`, `thr=vipOn?ref+.005:ref-.005`). Ergebnis: VIP2 (25 %) →
  nur 10er; VIP3 (30 %) → keine Staffel; VIP1 (15 %) → alle (buy-more lohnt).
  ⚠️ **Merke Theme-Upsert-Falle:** Einzeiliges `comment … endcomment` in einem `{% liquid %}`-Block ist
  **ungültig** (→ „comment tag was never closed"), im Liquid-Block **`#`-Inline-Kommentar** nutzen. Und:
  `themeFilesUpsert` per **`body:{type:URL}`** verschluckt Validierungsfehler **still** (userErrors leer, Datei
  wird einfach nicht übernommen) → bei „Upsert greift nicht" per **`body:{type:BASE64}`** (synchron) den echten
  Fehler sichtbar machen.
- **Kein Doppel-Badge VIP + Hauspreis (2026-07-09):** Bei eingeloggtem VIP war der VIP-Preis besser als der
  Hauspreis, es standen aber BEIDE Badges („Hauspreis" **und** „VIP") vor dem Preis. Ursache: `price.liquid`
  rendert das custom Badge, sobald `custom.price_badge_text` gesetzt ist – auch wenn schon `price_badge == 'vip'`.
  **Fix (native Pfad):** custom/„Angebot"-Badge nur noch `{%- unless price_badge == 'vip' -%}` → bei aktivem VIP
  steht **nur „VIP"**. Das Badge trägt jetzt Klasse **`fs-price-badge`**; `snippets/fs-vip-cards.liquid` (client-
  seitiger VIP-Rechner für gecachte Seiten) entfernt es beim Anwenden des VIP-Preises, damit auch dort kein
  Doppel-Badge bleibt. **Filter-Panel-Pfad war schon korrekt** (VIP-Zweig in `filter-panel-main.js` gibt gar
  kein Sale-Badge aus). Repo-Mirror `theme-horizon/snippets/{price.liquid,fs-vip-cards.liquid}`. Nur Entwurf-
  Horizon → live bei Rotation; `price.liquid` wird bei „Theme aktualisieren" zurückgesetzt → aus Mirror wiederherstellen.
- **Tools (idempotent, Store-Token `write_products`):**
  - Preise: `scripts/hauspreis-10-prozent.mjs` + Workflow **„Hauspreis 10% umstellen"** (`DRY_RUN` Default true,
    `MIN_PRICE`, `DISCOUNT_PCT`, `LIMIT`; Rollback-Artefakt `hauspreis-rollback` mit variantId+altem Preis).
  - Badge: `scripts/hauspreis-badge-metafields.mjs` + Workflow **„Hauspreis-Badge setzen"** (`MODE=set|clear`).
  - **Neue Artikel** künftig: erst „Hauspreis 10% umstellen" (dry-run→echt), dann „Hauspreis-Badge setzen".
- **Rollback:** Preise via Artefakt zurücksetzen (Preis←alterPreis, Vergleichspreis←leer), Tag `Hauspreis`
  entfernen, Badge via `MODE=clear`.
- **Wechselwirkung VIP/Mengenrabatt (passt):** Vergleichspreis=UVP → die `kollektionsrabatt`-Function rechnet
  VIP/Mengenrabatt weiter auf UVP-Basis; der Hauspreis (−10 %) ist die Basis für Nicht-VIP.
- **Zeitbegrenztes Angebot schlägt Hauspreis (2026-07-08):** Der `scheduled_sale`-Job
  (`scripts/process-scheduled-items.mjs`, Cron 01:00 UTC vom `main`) übersteuert jetzt den Hauspreis:
  compareAt = **echte UVP** (vorhandener Vergleichspreis, sonst Preis), Badge über `price_badge_text/color`
  mit **Rabatt in %** zur UVP (z. B. „Sale -30%") → PDP zeigt es ohne Theme-Änderung. Vorzustand in
  `pre_sale_*`-Metafeldern gesichert → beim Ablauf exakte Wiederherstellung inkl. Hauspreis. ⚠️ Alt: setzte
  `sale_badge_*` (vom Theme NICHT gelesen) + compareAt=Hauspreis (falsche UVP) — behoben.
- **Kachel-Badge = echtes Produkt-Badge (2026-07-08):** Die Filter-Panel-Kacheln (`filter-panel-main.js`)
  schrieben hart **„Angebot"** für jeden reduzierten Artikel und lasen `price_badge_text` NICHT → Hauspreis-
  Artikel zeigten auf Kacheln „Angebot" statt „Hauspreis" (PDP war korrekt). Fix ohne Eingriff in die
  minifizierte Logik: `filter-panel.liquid` emittiert `badgeText`/`badgeColor` (Produkt-Metafelder
  `custom.price_badge_text/color`), Asset `assets/fs-sale-percent.js` ersetzt den `.fp-card__sale-badge`-Text
  + Farbe durch das echte Badge („Hauspreis" blau bzw. „Sale -30%" inkl. Rabatt-%). Das `-X%` steckt bei
  Angeboten im Badge-Text (Job setzt `price_badge_text` auf **Produkt-Ebene**, PDP + Asset lesen es dort).
  Nur Entwurf-Horizon → live bei Rotation.

## Versand: „B2B Versand" nur für Händler (Delivery Customization Function)

- **Problem:** Die Versandmethode **„B2B Versand"** (8,21 €, Allgemeines Profil, Zone Deutschland) hatte keine
  Bedingung und wurde ALLEN Kunden im Checkout gezeigt. Native Versandbedingungen können nur Gewicht/Preis,
  keine Kundengruppen.
- **Lösung (2026-07-07):** Delivery-Customization-Function **`hide-b2b-versand`** in der bestehenden App
  „VIP Beläge Discount" (`vip-discount-function/extensions/hide-b2b-versand/`, Target
  `purchase.delivery-customization.run`). Blendet jede Versandoption mit **„B2B" im Titel** aus, wenn der Kunde
  **keinen** B2B-Tag trägt. **B2B-Tags (live verifiziert): `B2B1`/`B2B2`/`B2B3`/`Händler`** (`hasAnyTag` in
  `src/run.graphql`). Gäste = B2C. Tische-Profil unberührt (kein „B2B" im Titel). Tests 7/7.
- **Aktivierung:** Function ≠ aktiv → braucht eine **Zustellungsanpassung**. Admin → Versand und Zustellung →
  Zustellungsanpassungen → „Anpassung hinzufügen" → „B2B-Versand nur für Händler". Oder per
  `deliveryCustomizationCreate(functionHandle: "hide-b2b-versand", enabled: true)`.
- **Deploy:** `npm install` im Extension-Ordner → `shopify app deploy` vom PC (gehört zur bestehenden App,
  kein neues App-Anlegen nötig). Tag-Liste ändern → nur `src/run.graphql` anpassen + neu deployen.

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

- ⚠️ **App-Rabatte im Admin NICHT anklickbar (2026-07-04, mehrfach passiert – MERKEN):** Klickt man im
  Shopify-Admin einen Function-Rabatt dieser App an (oder will über „Rabatt erstellen → App-Funktion"
  einen neuen anlegen), springt der Browser **sofort zur Homepage futurespin.de** – KEINE Einstellmaske.
  Grund: Die App „VIP Beläge Discount" hat **keine Admin-UI-Extension**; Shopify leitet auf ihre
  `application_url` (= futurespin.de) um. **Anlegen/Ändern dieser Rabatte geht daher NUR per API**
  (Workflows mit App-Client-Credentials: „Kollektionsrabatt anlegen", „POS-Abrundung anlegen",
  „Rabatte kombinierbar machen"; Staffel-Konfig via `metafieldsSet`). Nie über den Admin-Editor versuchen.
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
- ✅ **UVP-Basis für VIP auf Angebots-Artikeln (2026-07-07):** Die Function misst den Nachlass bei einem
  Angebot (Vergleichspreis/UVP > aktueller Preis) an der **UVP**: Zielpreis `UVP × (1−%)`, abgezogen wird
  nur die Differenz bis dahin; ist das Angebot schon tiefer, greift **kein** Zusatzrabatt (kein Doppelrabatt).
  Diese Logik steckt in `index.js` (`compareAtAmountPerQuantity`, `hasMarkdown`) und gilt für Mengenrabatt
  **und** VIP. Deshalb wurde auch der **generelle VIP-Rabatt** (VIP-Collection, nicht Beläge/Textilien) von
  nativ auf die Function umgestellt (VIP-only, `VIP_ONLY=true` → `tiers: []`; siehe Store-Fakten oben).
- **Gewählte Lösung ① (Beläge):** Die Function `kollektionsrabatt` steuert Beläge **allein**
  und rechnet pro Artikel `max(Mengenstaffel %, VIP %)`. Seit 2026-07-07 läuft auch der **restliche VIP**
  (VIP-Collection) über dieselbe Function (VIP-only) – native VIP-Rabatte sind deaktiviert.
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
- ✅ **POS-Ausschluss über `cart.retailLocation` (2026-07-04, nach Irrweg gelöst):** Function-Rabatte
  gelten automatisch in **allen** Kanälen (Online **und** POS), es gibt keinen Kanal-Schalter am Rabatt.
  POS-Erkennung geht aber in der Function: Das Feld **`retailLocation: Location`** liegt auf dem Typ
  **`Cart`** – also `cart { retailLocation { id } }` in der Input-Query. ❌ **Irrweg:** auf der
  **Input-Root** platziert (wie Changelog/GitHub-Discussion nahelegen) → Deploy scheitert mit „Field
  'retailLocation' doesn't exist on type 'Input'" und blockiert den **gesamten** App-Deploy (alle
  Extensions!). Verifiziert per **`shopify app function schema`** (erzeugt `schema.graphql` im
  Extension-Ordner; `Select-String -Pattern "retail"`): `Cart.retailLocation` existiert in api_version
  `2025-10`, Input-Root hat es NICHT. **Merke:** Neue Function-Felder IMMER erst gegen `schema.graphql`
  prüfen, nie blind aus Changelog/Foren übernehmen. Umgesetzt: `kollektionsrabatt` gibt bei gesetztem
  `cart.retailLocation` `NO_DISCOUNT` zurück (Mengenrabatt Beläge/Textilien inkl. gebündelter VIP-Logik
  nur noch online; im Laden i. d. R. gewollt). **Deploy vom PC nötig**, sonst greift es nicht.
- **POS-Abrundung auf 10 Cent (2026-07-04):** Zweite Function `pos-abrundung`
  (`extensions/pos-abrundung/`, Order-Discount) rundet **nur im POS** (`cart.retailLocation` gesetzt) den
  Warenkorb-Betrag auf die nächste glatte 10-Cent-Stufe **ab** (24,97 € → 24,90 €). Online: nichts.
  Stufe fix 10 Cent (`STEP_CENTS` in `src/index.js`). Basis ist die **Brutto-Zwischensumme** (Preise inkl.
  MwSt, POS i. d. R. ohne Versand) → Endbetrag landet glatt. ⚠️ Function kennt die **Zahlart nicht** →
  rundet **alle** POS-Zahlarten (Bar + Karte); „nur Bar" geht mit einer Rabatt-Function nicht. Kommt im POS
  **nach** dieser Function noch ein Rabatt (manueller Kassenrabatt), kann der Endbetrag leicht abweichen.
  **Ablauf:** `npm install` im Extension-Ordner → `shopify app deploy` vom PC → Rabatt anlegen (Admin oder
  Workflow „POS-Abrundung anlegen" / `scripts/create-pos-abrundung.mjs`, `discountClasses: [ORDER]`). Tests
  in `src/run.test.js` (8/8). Der `create-pos-abrundung`-Workflow liegt (wie die anderen Rabatt-Workflows)
  auch auf `main`, damit er per `workflow_dispatch` auslösbar ist; er checkt den Feature-Branch aus.
  ✅ **LIVE seit 2026-07-04:** Rabatt „POS-Abrundung" `gid://shopify/DiscountAutomaticNode/2351948497244`
  (ACTIVE), Function-ID `019f2f08-f99b-734d-a491-c74f16fe2706`. Deploy + kollektionsrabatt-POS-Guard sind
  damit ebenfalls live (Function war im Store auffindbar).
- ⚠️ **Kombinierbarkeit `combinesWith.productDiscounts` (WICHTIG, 2026-07-03):** Shopify wendet pro
  Bestellung nur EINEN automatischen Produktrabatt an, WENN die Rabatte nicht als „kombinierbar mit
  Produktrabatten" markiert sind. Symptom: Belag (Function-Rabatt) **und** z. B. Ball (nativer VIP)
  zusammen im Warenkorb → ein Artikel verliert seinen Rabatt. **Fix:** bei ALLEN beteiligten
  Automatik-Rabatten `combinesWith.productDiscounts = true` setzen. Das ist **kein** Stapeln auf
  demselben Produkt (Beläge/Textilien sind ja aus der VIP-Kollektion ausgeschlossen → jeder Artikel
  hat nur einen Rabatt); es erlaubt nur, dass **verschiedene** Artikel im selben Warenkorb ihren
  jeweiligen Rabatt behalten.
  - **VIP1/2/3** (`DiscountAutomaticBasic`, IDs `2340297605468/671004/736540`) → per MCP
    `discountAutomaticBasicUpdate` gesetzt (erledigt).
  - **Belaege + Textilien Mengenrabatt** (`DiscountAutomaticApp`, `2341460803932`/`2341602459996`) →
    lassen sich **nur von der besitzenden App** ändern (`discountAutomaticAppUpdate` mit fremdem Token →
    „Rabatt existiert nicht"). Wege: (a) in Shopify-Admin je Rabatt unter **Kombinationen →
    Produktrabatte** aktivieren, ODER (b) Workflow „Rabatte kombinierbar machen"
    (`.github/workflows/set-combines-with.yml` + `vip-discount-function/scripts/set-combines-with.mjs`,
    App-Client-Credentials wie beim Anlegen). **Neue Function-Rabatte** künftig direkt mit
    `combinesWith.productDiscounts=true` anlegen (siehe `create-kollektionsrabatt.mjs`).

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
      - ⚠️ **Judge.me PDP-Widget geht bei Horizon-Updates/Rotation VERLOREN (2026-07-04 verifiziert):**
        Der App-Embed `judgeme_core` bleibt in `settings_data.json` aktiv (Script lädt), ABER die
        Judge.me-**Blöcke in `templates/product.json`** (Sterne-Preview-Badge + Review-Widget) werden
        beim product.json-Reset gelöscht → auf der PDP erscheint **nichts** (kein Anker zum Rendern).
        **Wiederherstellen (2026-07-04 verifiziert, rendert korrekt):** die beiden App-Blöcke direkt in
        `templates/product.json` in `sections.main.blocks` (+ `block_order`) eintragen — exakte Typen:
        - Sterne unter Titel/Preis: `shopify://apps/judge-me-reviews/blocks/preview_badge/61ccd3b1-a9f2-4160-9fe9-4fec8413e5d8`
        - Review-Widget (Liste + „Bewertung schreiben"): `shopify://apps/judge-me-reviews/blocks/review_widget/61ccd3b1-a9f2-4160-9fe9-4fec8413e5d8`
        Platzierung im Repo: `judgeme_preview_badge` nach `group_icgrde`, `judgeme_review_widget` als letzter
        Block. Alternativ Theme-Editor → Produktvorlage → „Block hinzufügen → Apps → Judge.me". **Nach jedem
        Horizon-Update erneut eintragen** (product.json wird zurückgesetzt). Steht bereits im Entwurf-Theme
        4.1.1; kommt beim nächsten Veröffentlichen live.
      - ℹ️ **Aktuell (Stand 2026-07-04) keine Bewertungen vorhanden:** weder `reviews.*`- noch `judgeme.*`-
        Metafelder an den Produkten gesetzt → selbst mit platziertem Widget nur „Noch keine Bewertungen",
        Kachel-Sterne bleiben leer. Reviews via Judge.me-Anfrage-Mails sammeln oder importieren.
- [x] 🟡 **Suchleiste prominenter** — ERLEDIGT: Section `sections/mobile-search-bar.liquid` (Typ/Handle bleibt
      `mobile-search-bar`), via `header-group.json` unter dem Header global eingehängt.
      - **Mobil (< 750px):** Button unter dem Header, öffnet die Predictive-Search-Modal (`#search-modal`) — wie gehabt.
      - **Desktop (>= 750px):** **echtes Inline-Eingabefeld** über das Snippet `snippets/fs-inline-search.liquid`
        (eigene `<predictive-search-component>`-Instanz, gleiche Markup wie `snippets/search-modal.liquid`, ohne Dialog).
        Man tippt direkt ins Feld → Live-Vorschläge (Section-Rendering über `data-section-id="predictive-search"`).
        Läuft **ohne** Dialog (`this.closest('dialog-component')` = `null` → `if(dialog)` übersprungen); mehrere
        Instanzen erlaubt (Refs instanz-scoped, `customElements.define` guarded). **Eindeutige IDs**
        (`fs-inline-search-input`/`-results`), sonst Doppel-ID-Konflikt mit der Modal.
      - **Platzierung „über der Kategorienleiste":** Das Snippet enthält ein kurzes **Inline-Skript**, das das
        `.fs-dsearch`-Element per `document.currentScript` findet und **in den Header verschiebt — zwischen
        `.header__row--top` (Logo) und `.header__row--bottom` (Kategorien)**. Läuft während des Parsens (vor dem
        Paint) → kein Flackern, idempotent. **Kein Eingriff in `header.liquid`** (die Kategorien sind dort die
        `bottom`-Row; `header.liquid` ist NICHT im Repo und würde bei Horizon-Updates zurückgesetzt → daher die
        JS-Relocation statt Header-Edit). Header-Lupe (`.search-action`) wird auf Desktop ausgeblendet.
      - **Dropdown-Sichtbarkeit:** `.predictive-search-form__content-wrapper` ist per Default `display:none`,
        nur bei `:focus-within` **und** `:has([data-search-results])` sichtbar → kein leerer Kasten. **Fallback:**
        `<form action="{{ routes.search_url }}" method="get">` → Enter macht eine normale Suche. Entwurf-Theme.
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
           - ⚠️ **Desktop war zu groß (2026-07-12):** Desktop nutzte `grid-template-columns:repeat(var(--cots-cols),1fr)`
             mit `--cots-cols = cots_items.size` → bei wenigen Produkten riesige Kacheln. Fix: **überall** fixer
             Flex-Streifen `.cots__grid{display:flex;overflow-x:auto;max-width:100%}` + `.cots__item{flex:0 0 150px}`
             (mobil 140px) → **immer gleich groß, klein & dezent, unabhängig von der Produktzahl**. Native Datei →
             Repo-Mirror `theme-horizon/sections/collection-topseller.liquid`, in BEIDE Entwürfe deployt.
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
        - **Aktuelle Botschaften (2026-07-03):** VIP-Anmelden, Fachhandel/Versand, Konfigurator und neu
          **„Ab 69 € versandkostenfrei shoppen!"** (ohne CTA). ⚠️ **Konfigurator-CTA (2026-07-09 korrigiert):**
          zeigte auf `/collections/konfigurierte-schlager` (Komplettschläger) statt auf den Konfigurator →
          auf **`/pages/schlaeger-konfigurator`** gesetzt (im Metafeld **und** im Fallback-Block `msg_config`
          in `header-group.json`). Der 69‑€‑Hinweis wurde aus der Homepage
          (Pull-Quote `section_Nr8Nwb` in `templates/index.json`) entfernt und in den Ticker verschoben;
          Fallback-Block `msg_versand` liegt zusätzlich in `header-group.json`.
        - ⚠️ **CTA-Links relativ halten** (`/account/login`, `/collections/...`) — NICHT eine komplette,
          manuell zusammengebaute Kundenkonto-OAuth-URL (`shopify.com/authentication/.../login?...redirect_uri=...`)
          eintragen: deren `nonce`/`state` laufen ab → „Ungültige redirect_uri". Der VIP-„Anmelden"-Button
          zeigt daher auf `/account/login` (Shopify baut den OAuth-Flow selbst). 2026-07-01 gefixt (im
          Metafeld **und** im Fallback-Block `msg_vip` in `header-group.json`).

## Rabattbestimmungen-Seite

- **Seite „Rabattbestimmungen"** (`/pages/rabattbestimmungen`, `gid://shopify/Page/712188756316`, veröffentlicht)
  fasst VIP-Rabatt, Mengenrabatte (Beläge 2/5/10 → 15/20/25 %, Textilien 6/20/30 → 20/25/30 %),
  „höchster Rabatt gewinnt" (keine Stapelung), Sale-/Gutschein-Ausschluss und B2B-Verweis kundenseitig zusammen.
  - ⚠️ **Öffentlich nur VIP 15 % zeigen (2026-07-03):** Auf User-Wunsch werden VIP 2 (25 %) und VIP 3 (30 %)
    kundenseitig NICHT mehr gelistet (weder hier noch in der Homepage-Grafik `rabatt-stufen`, die schon vorher
    nur Stufe 1 zeigte). Stattdessen ein **Sammelbesteller-Hinweis** (h3): Sammelbesteller/Vereine erhalten auf
    Anfrage bessere Konditionen per **E-Mail an online@futurespin.de**. Die Staffeln 25/30 % existieren technisch
    weiter (native VIP-Rabatte), werden nur nicht mehr beworben.
  Enthält einen „Jetzt kostenlos registrieren"-Button (`/account/login`). Im **Footer-Menü** verlinkt
  (`gid://shopify/Menu/233321529692`, neuer PAGE-Punkt; die 5 SHOP_POLICY-Links brauchen beim `menuUpdate` ihre
  `resourceId`, sonst „shop_policy nicht gefunden"). Seiteninhalt via `pageCreate`/`pageUpdate` (HTML, KEIN Liquid
  – Pages rendern kein Liquid, daher Links hart als Pfade).
  - 🎨 **Grafisch aufbereitet (2026-07-03):** Seiten-Body ist jetzt gestyltes HTML mit **inline `<style>`** +
    Inline-SVG-Icons (Markenblau `#486A8F`, VIP-Gold `#C19A3E`, alles gescopt unter `.rbx`): runder VIP-15‑%-Badge,
    gestreifte Staffel-Balken (wie die Homepage-Grafik `rabatt-stufen`), hervorgehobene Sammelbesteller-Callout-Box
    (Mail-Icon → `online@futurespin.de`), Versandkostenfrei-Pill (69 €), Check-Listen für Kombinierbarkeit,
    gestrichelte B2B-Box. Quelle liegt reproduzierbar im Repo: **`docs/pages/rabattbestimmungen.html`**
    (bei Änderung dort editieren, Body per `pageUpdate` setzen). ⚠️ Attribute im HTML mit **einfachen Quotes**
    halten (kein `"`) → problemlos als JSON-String übergebbar; Shopify normalisiert sie beim Speichern zu `"`.
    Inline-SVG `viewBox` wird beim Speichern lowercased (`viewbox`), der Browser-HTML-Parser korrigiert das aber
    für Foreign-Content automatisch zurück → Icons skalieren korrekt.
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
