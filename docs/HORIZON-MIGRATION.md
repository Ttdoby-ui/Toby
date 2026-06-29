# Horizon-Update / Migration – Plan & Checkliste

> **Status:** ⏳ **Reconciliation in 4.1.1-Kopie ABGESCHLOSSEN – wartet auf Test/Abnahme durch User.**
> Von **2.0.3** auf **4.1.1**. Der User hat die geupdatete Kopie **„Aktualisierte Kopie von Kopie von
> Entwurf-Horizon"** (`gid://shopify/OnlineStoreTheme/200523612508`) angelegt; alle unsere Anpassungen
> wurden dort wieder eingespielt (siehe „Durchgeführt" unten). Nach erfolgreichem Test wird dieses Theme
> das neue **Entwurf-Horizon**.
> **Goldene Regel:** **Niemals** „Aktualisieren" auf dem Arbeits-/Live-Theme klicken – das überschreibt
> unseren Code. Migration immer in einer **frischen Kopie** des neuen Horizon, Stück für Stück.

## ✅ RESET-PLAYBOOK — Was ein Horizon-Update zerschießt (verifiziert 2.0.3 → 4.1.1)

> **Das ist die wichtigste Liste.** Bei JEDEM künftigen Horizon-Update genau diese Dateien prüfen
> und wieder einspielen. **Alle diese Anpassungen liegen vollständig im Repo** (`ttdoby-ui/toby`,
> Branch `claude/shopify-adhesive-service-vkfNR`) — bei Verlust von dort wiederherstellen.
> Vorgehen pro Datei: **alte Version (funktionierendes Entwurf-Horizon) vs. neue Horizon-Version
> vergleichen, unsere Änderung NEU auf die 4.1.1-Basis anwenden** (nicht alt drüberkopieren, sonst
> gehen 4.1.1-Verbesserungen verloren). Themes-IDs via `themes(first:20){nodes{id name role}}`.

### Bleibt beim Update 1:1 erhalten (Kategorie A – nur prüfen)
Alle **Custom-Dateien** (existieren nicht in Standard-Horizon): `assets/filter-panel-*`,
`produkt-vergleich.*`, `schlaeger-finder.*`, `schlaeger-konfig-autoselect.js`, `sale-nav-style.css`;
`sections/filter-panel`, `collection-topseller`, `mobile-category-chips`, `mobile-search-bar`,
`announcement-ticker`, `produkt-vergleich(-cards)`, `produkt-werte`, `konfigurator(-banner)`,
`schlaeger-berater`, `schlaeger-finder`, `fs-vip-status`, `b2b-registration`; `blocks/google-bewertung`,
`hersteller-info`, `produkt-faq`, `produkt-schema`, `produkt-werte`; `snippets/cross-sell`,
`klebe-service`, `schlaeger-konfigurieren-btn`, `fs-mobile-ux`, `fs-vip-cards`, `hersteller-info`,
`produkt-werte`, `schlaeger-finder-data`, `rapid-search-*`. **App-Embeds** (Inbox/Judge.me) in
`settings_data.json` und `sections/header-group.json` (Ticker/Suche/Chips) blieben ebenfalls erhalten.
→ Trotzdem **funktional testen**, da sie neue Horizon-Klassen/Variablen voraussetzen können.

### Wird zurückgesetzt → MUSS wieder eingespielt werden (Kategorie B – der eigentliche Aufwand)
| Datei | Was 4.1.1 macht | Unsere Anpassung (wiederherstellen) |
|---|---|---|
| `snippets/price.liquid` | durch native Volume-Pricing-Version ersetzt | unsere 9846-B-Version (VIP `settings.vip1/2/3_discount`, B2B-Netto `preis_b2b*`+`b2b_vat_rate`, **Belag-Staffelpreise** uvp×85/80/75 %, `.compare-at-price-container`) zurückpushen |
| `blocks/buy-buttons.liquid` | **neue 4.1.1-Basis** (statische Sub-Blöcke quantity/add-to-cart/accelerated-checkout) | 4.1.1-Basis behalten, nur **2 Render-Zeilen** nach `</product-form-component>` einsetzen: `{% render 'schlaeger-konfigurieren-btn' …%}` + `{% render 'cross-sell' …%}` |
| `layout/theme.liquid` | komplett ersetzt (Header-JS neu) | 4.1.1-Basis behalten + unsere 5 Teile einsetzen: im `<head>` nach `content_for_header` → `{% render 'rapid-search-settings' %}` + `<link …sale-nav-style.css>`; vor `</body>` → **B2B-Cart-Skript** (`_b2b` aus Kunden-Tags B2B1/2/3) + `{%- render 'fs-mobile-ux' -%}` + `{%- render 'fs-vip-cards' -%}` |
| `blocks/product-inventory.liquid` | native „X übrig"-Ampel | unsere **Ampel** (Status in_stock/low/out → „Bestand N · Lieferbar 1–3 Werktage" etc., Farben `--color-instock/lowstock/outofstock` MIT Fallbacks grün `#1a7f37`/gelb `#b25e09`/rot `#c0152f`) |
| `config/settings_schema.json` | auf 4.1.1-Schema zurück (color_palette) | Gruppe **„Discount by tags"** ergänzen: `vip1/2/3_discount` (Default 15.05/25.05/30.05) + `b2b_vat_rate` (Default 19) als Editor-Felder |
| `config/settings_data.json` | Farbsystem umgebaut (12 KB→6,7 KB) | mind. `vip1/2/3_discount`=15.0/25.0/30.0 wieder setzen; App-Embeds prüfen (Inbox `…/chat/841fc607…`, Judge.me `…/judgeme_core/61ccd3b1…`). ✅ **Größendifferenz ist KEIN Datenverlust:** 4.x ersetzt das alte `color_schemes` (scheme-1…6 + Custom) durch die kompaktere **`color_palette`** (background/foreground/color1/color3/color4/color7). Marken-Farben sind dort erhalten (weiß/schwarz/`#333333`/`#dfdfdf`/`#f5f5f5`/`#eef1ea`). Die alte Marken-Blau-Schema-4 (`#e1edf5`/`#486A8F`) wird von keiner Section referenziert → kein Eingriff. Markenblau `#486A8F` lebt in unseren Custom-CSS/Liquid weiter, nicht in Schemes. **Altes `color_schemes` NICHT ins 4.x-`settings_data` zurückkopieren** (anderes Schema, wird ignoriert/bricht). Geprüft 2026-06-29 |
| `locales/de.json` + `locales/en.default.json` | durch Standard-Horizon ersetzt (unsere Texte weg) | 4.1.1-Basis behalten + Top-Level-Keys **`konfigurator`** (ganzer Baum) + **`klebe_service`** aus altem Theme einmergen (de = deutsch, en = englisch) |
| `templates/index.json` | Startseite auf Horizon-Default zurück | unsere Startseite zurück (Slideshow, **hero_konfigurator** mit getrennten Desktop-/Mobil-Bildern, section/collection-list/product-list/media-with-content). Section-Typen existieren in 4.1.1; hero/slideshow-Schema änderte sich → optisch nachprüfen. ⚠️ **Hero-Mobil-Bild = neue Setting-IDs!** Im 4.1.1-`hero` heißen die Felder `custom_mobile_media:true` (Schalter MUSS an sein) + `media_type_1_mobile:"image"` + `image_1_mobile:"shopify://…"` — NICHT mehr `mobile_image`/`mobile_media_type` (alt). Stehen die alten Keys drin, wird das Mobil-Bild ignoriert und ist im Editor nicht einstellbar |
| `templates/product.json` | PDP auf Default zurück | unser PDP-Layout zurück: `product-information`→ `_product-details` mit group(text+price), **product-inventory (Ampel)**, divider, variant-picker, **buy-buttons (+statische Sub-Blöcke)**, text, **produkt-werte/produkt-faq/hersteller-info/produkt-schema**; + `produkt-vergleich` + `product-recommendations` |
| `templates/collection.filter.json` | natives `main-collection` eingefügt → unser Filter-Panel verdrängt | nur `collection-topseller` + `filter-panel` + `produkt-vergleich-cards` (KEIN `main-collection`) |
| `templates/collection.katalog.json` | dito | `collection-topseller` + `filter-panel` |
| `templates/page.konfigurator.json` | Settings verloren | `schlaeger-finder` + `konfigurator` (Collection-Handles + Varianten-IDs `klebe_variant_id`/`versiegelung_variant_id` + Preise) + `schlaeger-berater`(disabled) |
| `templates/page.b2b-registrierung.json` | zurückgesetzt | `main-page` (Hero-Text „B2B Händlerbereich" + Intro) + `b2b-registration` |
| `sections/footer-group.json` | von 4.x neu strukturiert (alt 6966 vs neu 3043) | ✅ **Kein Eingriff nötig (geprüft 2026-06-29):** 4.x splittet die alte Einzel-Section `footer` automatisch in `footer-utilities` + `section` (`migrated_footer_content`). Unser Custom-Block **`google-bewertung`** (4.9★/90), das Footer-Menü, alle 5 Social-Links, Copyright + Policy-Liste sind erhalten. Kleinere Größe = kompaktere neue Struktur (Social-Links als URL-Settings statt 5 Einzelblöcke) |

**Wichtige Technik-Lehren (Theme-Push via MCP `themeFilesUpsert`):**
- Nur **UNPUBLISHED**-Themes beschreibbar; Live/MAIN gesperrt.
- **Templates als ORIGINAL/pretty JSON** pushen — minifiziert kam „Inhalt enthält ungültige Zeichen".
- Große Dateien (>~50 KB Base64) sprengen das Output-Limit eines einzelnen Tool-Calls → vorher
  verkleinern (z. B. deaktivierte Sektionen entfernen) oder als kleinere Datei pushen.
- `sale-nav-style.css` jetzt **klassen-unabhängig** (`#header-group a[href*="sale" i]`), damit es auch
  mit der neuen 4.1.1-Header-Markup greift (alte `.menu-list__link`-Selektoren trafen nicht mehr).

**Stand 2026-06-29:** Reconciliation in `200523612508` **vollständig abgeschlossen** (alle obigen Punkte
erledigt; `footer-group.json` und `settings_data.json`/Farbsystem geprüft → kein Eingriff nötig, siehe Tabelle).
Wartet auf Test + Go-Live-Rotation.

## Warum überhaupt updaten?
Neuere Horizon-Versionen bringen Performance- und Feature-Verbesserungen, die teils mit unseren
Eigenbauten überlappen: **Infinite-Scroll für Produkt-Grids** (3.0.1), **Volume-Pricing, Sticky-ATC,
Vergleichs-Slider, CSS-/Perf-Optimierungen** (3.2.0) u. a. Manches könnten wir danach durch native
Funktionen ersetzen und eigenen Code abbauen.

## ⚠️ Wichtig: Repo ist KEIN vollständiges Backup
`ttdoby-ui/toby` enthält nur die in Sessions **angefassten** Dateien. Viele Custom-Dateien existieren
**nur im Theme** (z. B. `schlaeger-finder.*`, `produkt-vergleich.*`, `fs-vip-*`, `b2b-registration`,
`rapid-search-*`). → **Quelle der Wahrheit für die volle Anpassung ist das aktuelle Theme**, nicht Git.
**Erster Schritt jeder Migration: das komplette aktuelle Theme als ZIP exportieren** (Admin → Themes →
… → Theme-Dateien herunterladen) als vollständiges Backup.

---

## Vorgehen (Reihenfolge)

1. **Backup:** Aktuelles Entwurf-Horizon (und Live) als ZIP herunterladen.
2. **Neues Horizon holen:** Im Theme-Store „Horizon" hinzufügen → installiert die **aktuelle Version**
   als neues (unpubliziertes) Theme. *(Das kann nur der User im Admin; per API nicht zuverlässig.)*
3. **Clean-Diff vorbereiten:** Das frische Horizon ist unsere „saubere" Referenz. Damit lässt sich für
   **jede Kern-Datei** feststellen, ob wir sie geändert haben (Datei aus altem Theme vs. neue Horizon-Datei
   vergleichen). So finden wir **alle** editierten Kern-Dateien – nicht nur die bekannten.
4. **Kategorie A (Custom-Dateien) 1:1 übernehmen** – siehe Liste unten.
5. **Kategorie B (editierte Kern-Dateien) abgleichen** – unsere Änderungen auf die **neue** Horizon-Basis
   neu anwenden (nicht die alte Datei drüberkopieren!). Das ist der eigentliche Aufwand.
6. **Kategorie C (Templates/Config/Daten)** neu setzen – Templates, App-Embeds, Metafelder, Custom-Settings.
7. **Gründlich testen** (mobil + Desktop, Liste unten), dann per **Go-Live-Rotation** veröffentlichen.

---

## Kategorie A — Custom-Dateien (können i. d. R. **1:1** übernommen werden)
Existieren nicht im Standard-Horizon → einfach in die neue Kopie kopieren.

**Assets**
- `assets/filter-panel-main.js`, `filter-panel-helpers.js`, `filter-panel.css`, `filter-panel.js`
- `assets/produkt-vergleich.js`, `produkt-vergleich.css`
- `assets/schlaeger-finder.js`, `schlaeger-finder.css`, `schlaeger-konfig-autoselect.js`
- `assets/sale-nav-style.css`

**Sections**
- `sections/filter-panel.liquid`, `collection-topseller.liquid`
- `sections/mobile-category-chips.liquid`, `mobile-search-bar.liquid`, `announcement-ticker.liquid`
- `sections/produkt-vergleich-cards.liquid`, `produkt-vergleich.liquid`, `produkt-werte.liquid`
- `sections/konfigurator.liquid`, `konfigurator-banner.liquid`, `schlaeger-berater.liquid`, `schlaeger-finder.liquid`
- `sections/fs-vip-status.liquid`, `b2b-registration.liquid`

**Blocks**
- `blocks/google-bewertung.liquid`, `hersteller-info.liquid`, `produkt-faq.liquid`, `produkt-schema.liquid`, `produkt-werte.liquid`

**Snippets**
- `snippets/cross-sell.liquid`, `klebe-service.liquid`, `schlaeger-konfigurieren-btn.liquid`
- `snippets/fs-mobile-ux.liquid`, `fs-vip-cards.liquid`, `hersteller-info.liquid`, `produkt-werte.liquid`
- `snippets/schlaeger-finder-data.liquid`
- `snippets/rapid-search-results-skeleton.liquid`, `rapid-search-results-template-v2.liquid`, `rapid-search-settings.liquid`

> ⚠️ Auch „A"-Dateien können neue Horizon-Klassen/Variablen voraussetzen (z. B. `--page-margin`,
> `color-scheme`-Klassen, `price.liquid`-Struktur). Nach dem Kopieren **funktional testen**, nicht nur „läuft".

---

## Kategorie B — Editierte KERN-Dateien (NICHT überschreiben, **abgleichen**)
Das sind Horizon-Dateien, die wir verändert haben. Beim Update kommen **neue** Versionen → unsere
Änderungen müssen **darauf neu angewendet** werden. **Bekannte** B-Dateien:

| Datei | Unsere Änderung | Reconciliation-Risiko |
|---|---|---|
| `snippets/price.liquid` | VIP-Preis, B2B-Netto, **Belag-Staffelpreise** | **Hoch** – Horizon ändert price.liquid oft (Struktur `.compare-at-price-container`, `.visually-hidden`). |
| `blocks/buy-buttons.liquid` | `{% render 'cross-sell' %}` + `{% render 'schlaeger-konfigurieren-btn' %}` | Mittel – nur 2 Render-Zeilen neu einsetzen. |
| `sections/header-group.json` | Ticker/Suchleiste/Chips eingehängt, altes Announcement raus | Mittel – Struktur evtl. anders, neu zusammensetzen. |
| `config/settings_schema.json` | VIP-Settings (`vip1/2/3_discount`), B2B-MwSt., evtl. weitere | Mittel – Settings neu ergänzen. |
| `config/settings_data.json` | App-Embeds (Inbox, Judge.me), Markenfarben | Niedrig – per Skript setzen (siehe CLAUDE.md). |

> **Es gibt vermutlich weitere B-Dateien** (z. B. an `header.liquid`, `footer-group.json`, `product-information.liquid`,
> `main-collection.liquid`, `collection.json`, Locales). **Deshalb Schritt 3 (Clean-Diff) zwingend:**
> jede Kern-Datei alt-vs-neu vergleichen, um ALLE Änderungen zu finden.

---

## Kategorie C — Templates, Config & Daten (neu setzen)

**Custom-/angepasste Templates** (verweisen auf unsere Sections – müssen nach dem Kopieren der Sections passen):
- `templates/collection.filter.json` (Topseller + Filter-Panel + Produktvergleich) ← Beläge/Hölzer
- `templates/collection.katalog.json`, `collection.sale.json`, `collection.sale-kategorie.json`
- `templates/page.konfigurator.json`, `page.b2b-registrierung.json`, `page.rapid-search-results-page.liquid`
- `templates/index.json` (Startseite – angepasst)
- ggf. `templates/collection.json`, `product.json`

**App-Embeds** (in `settings_data.json` → `current.blocks`, sonst bei Rotation verloren):
- Inbox-Chat: `shopify://apps/inbox/blocks/chat/841fc607-4181-4ad1-842d-e24d7f8bad6b`
- Judge.me: `shopify://apps/judge-me-reviews/blocks/judgeme_core/61ccd3b1-a9f2-4160-9fe9-4fec8413e5d8`

**Metafelder/Daten** (gehören dem Store, NICHT dem Theme → bleiben automatisch):
- `custom.announcement_banner` (Ticker), `custom.topseller_products` (Topseller je Kollektion),
  `custom.tempo/kontrolle/effet/...` (Produkt-Filterwerte). Nichts zu tun, aber die Section-Logik muss sie weiter lesen.

---

## Nach der Migration: Eigenen Code ggf. abbauen (optional)
Prüfen, ob native Horizon-Funktionen unsere Eigenbauten ersetzen können:
- **Infinite-Scroll** (nativ ab 3.0.1) ↔ unser Lazy-Grid im Filter-Panel
- **Volume-Pricing** (nativ ab 3.2.0) ↔ unsere Belag-Staffelpreise
- **Sticky-ATC** (nativ) ↔ unsere Sticky-Add-to-Cart-Lösung
- **Vergleichs-Slider** (nativ) ↔ unser Produktvergleich
> Nur ersetzen, wenn die native Variante unsere Anforderungen wirklich abdeckt – sonst behalten.

---

## Test-Checkliste vor Go-Live
- [ ] Kollektionen (Beläge/Hölzer): Filter-Panel lädt, filtert exakt, Lazy-Grid scrollt, kein Horizontal-Scroll
- [ ] Topseller-Reihe + Produktvergleich funktionieren
- [ ] Produktseite: VIP-/B2B-/Angebots-/Staffelpreise korrekt (`price.liquid`!)
- [ ] Kaufen-Button + Konfigurator-CTA + Cross-Sell
- [ ] Mengenrabatt im Warenkorb greift weiter (Discount-Function ist Theme-unabhängig)
- [ ] Header: Suchleiste, Kategorie-Chips, Announcement-Ticker
- [ ] Judge.me-Sterne (PDP + Filter-Panel-Kacheln), Inbox-Chat-Button
- [ ] B2B-Registrierung, Schläger-Finder/-Berater, Konfigurator-Seite
- [ ] Markenfarbe `#486A8F` überall, Locales (de) vollständig
- [ ] Lighthouse mobil vorher/nachher vergleichen

## Was der User tun muss
1. Aktuelles Theme **als ZIP exportieren** (Backup).
2. **„Horizon" im Theme-Store hinzufügen** (neueste Version) und mir Bescheid geben.
→ Danach übernehme ich Kategorie A, gleiche B ab, setze C und teste mit dir durch.
