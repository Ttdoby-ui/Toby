# Horizon-Update / Migration – Plan & Checkliste

> **Status:** ⏳ **Reconciliation in 4.1.1-Kopie ABGESCHLOSSEN – wartet auf Test/Abnahme durch User.**
> Von **2.0.3** auf **4.1.1**. Der User hat die geupdatete Kopie **„Aktualisierte Kopie von Kopie von
> Entwurf-Horizon"** (`gid://shopify/OnlineStoreTheme/200523612508`) angelegt; alle unsere Anpassungen
> wurden dort wieder eingespielt (siehe „Durchgeführt" unten). Nach erfolgreichem Test wird dieses Theme
> das neue **Entwurf-Horizon**.
> **Goldene Regel:** **Niemals** „Aktualisieren" auf dem Arbeits-/Live-Theme klicken – das überschreibt
> unseren Code. Migration immer in einer **frischen Kopie** des neuen Horizon, Stück für Stück.

## Durchgeführt (Reconciliation 2.0.3 → 4.1.1, Theme `200523612508`)

Beim Horizon-Update blieben alle **Custom-Dateien (Kategorie A) 1:1 erhalten** (verifiziert: gleiche
Dateigröße wie im Repo – `filter-panel-main.js` 13080 inkl. Lazy-Grid `fpEnsureSentinel`/`fpMore`,
`filter-panel.liquid` 11863, `cross-sell.liquid` 6582, `collection-topseller.liquid` 5786 inkl.
`visually-hidden`-Overflow-Fix, alle in Markenblau `#486A8F`, **kein** altes `#1d3686` mehr). Ebenso
erhalten: `header-group.json` (Ticker/Suche/Chips), App-Embeds (Inbox/Judge.me) in `settings_data.json`.

**Überschriebene Kern-Dateien (Kategorie B) neu abgeglichen:**
- `snippets/price.liquid` – unsere Version (9846 B, VIP/B2B/Belag-Staffel) **gepusht** (Horizons native
  Volume-Pricing-Version überschrieben).
- `blocks/buy-buttons.liquid` – Horizons **neue 4.1.1-Basis** behalten und nur unsere **2 Render-Zeilen**
  (`schlaeger-konfigurieren-btn` + `cross-sell`) nach `</product-form-component>` wieder eingesetzt
  (20911 B). Diese 4.1.1-Version liegt jetzt auch im Repo.
- `config/settings_data.json` – VIP-Werte (`vip1/2/3_discount` = 15/25/30) wieder ergänzt
  (color_palette-Struktur + App-Embeds erhalten).
- `config/settings_schema.json` – Gruppe **„Discount by tags"** wieder ergänzt: VIP1/2/3-Rabatt
  als Editor-Felder + neu **B2B-MwSt. (`b2b_vat_rate`, Default 19)**. So sind die Prozente/der
  MwSt.-Satz wieder im Theme-Editor pflegbar (nicht nur im Code). Datei liegt jetzt auch im Repo
  (eingerückt; im Theme als kompaktes JSON, inhaltsgleich).

**Offen / vom User:** 4.1.1-Theme durchtesten (Checkliste unten), dann per Go-Live-Rotation als neues
Entwurf-Horizon übernehmen.

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
