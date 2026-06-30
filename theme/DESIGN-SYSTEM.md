# Futurespin Design System (auf Shopify Horizon)

> Ziel: kein Einzel-Theme, sondern ein **skalierbares Design System** – das
> „Operating System" der Marke Futurespin. Wiederverwendbare, vollständig im
> Customizer konfigurierbare Komponenten, die in 5 Jahren noch modern wirken
> und alle künftigen Geschäftsbereiche (Padel, Pickleball, Courts, Academy …)
> aufnehmen können.

Basis: **Horizon** (Online Store 2.0). Wir bauen **additiv** mit eigenen
`fs-`-Sections – Horizon-Kern-Dateien bleiben unangetastet (updatefähig).

## Designprinzipien (Reihenfolge der Entscheidungen)

1. Shopify-Standard vor Custom Code (z. B. Bestseller/Neuheiten = Horizon
   `product-list` / `collection-list`, nicht nachbauen)
2. Horizon-Architektur respektieren
3. Performance First (CWV), 4. Mobile First, 5. Accessibility First
6. Design System statt Einzelanpassungen · 7. Wiederverwendbare Komponenten
8. Zukunftssicher · 9. Wenig JavaScript · 10. Keine unnötigen Apps

## Design-Tokens (einheitliche Sprache aller Komponenten)

- **Akzentfarbe**: Futurespin-Blau – pro Section als `accent_color` einstellbar
  (Default `#0a4fa0`; auf exakten Markenwert setzen). Genutzt für CTAs, Links,
  Icons, aktive Zustände, Badges.
- **Flächen**: `light` (Weiß) · `grey` (Hellgrau `#f5f5f5`) · `anthracite`
  (`#14181c`). Wählbar je Section.
- **Schrift**: Outfit (Body) / Archivo (Headlines) – aus Theme-Settings.
- **Radius**: Karten 16px, Buttons/Chips 999px (pill).
- **Container**: `var(--page-width)` / `var(--page-margin)` mit Fallback –
  theme-portabel, kein Snippet-Zwang.
- **Motion**: dezente Hover-/Zoom-Effekte, immer mit
  `@media (prefers-reduced-motion: reduce)` deaktivierbar.
- **A11y**: semantische Headings, `:focus-visible`-Outlines, `aria-label` auf
  vollflächig klickbaren Karten, ausreichende Kontraste.
- **Performance**: `image_tag` mit `widths`/`sizes` (responsive srcset),
  `loading="lazy"` (Hero-LCP `eager`+`fetchpriority`), Inline-SVG statt
  Icon-Library, kein zusätzliches JS.

## Komponenten (Stand)

| Komponente | Datei | Einsatz |
|---|---|---|
| **Brand Hero** | `sections/fs-brand-hero.liquid` | Homepage-Hero & Sportwelten-Hero (Bild/Video, 2 CTAs) |
| **Sportwelten** | `sections/fs-sport-worlds.liquid` | Sportarten-Kacheln (Tischtennis/Padel/Pickleball, erweiterbar) |
| **Courts buchen** | `sections/fs-courts-booking.liquid` | Playtomic-Buchung je Standort (URLs konfigurierbar) |
| **Standorte** | `sections/fs-locations.liquid` | Store Locator + Schema.org `SportingGoodsStore` (Local SEO) |
| **Card Grid** | `sections/fs-card-grid.liquid` | Beratung, Guides, Community, Events, Academy, Kategorien |
| **Trust-Leiste** | `sections/fs-trust-bar.liquid` | USP-/Trust-Signale (Inline-SVG-Icons) |

> **Eine** generische `Card Grid`-Komponente deckt viele Inhaltsarten ab
> (Beratung/Community/Events/Academy/Guides) – statt vieler Spezial-Sections
> („keine doppelten Komponenten").

## Empfohlene Homepage-Reihenfolge (verkauft die Marke, nicht nur Produkte)

Brand Hero → Sportwelten → Courts buchen → Standorte → **Bestseller**
(Horizon product-list) → **Neuheiten** (Horizon collection-list) → Beratung
(Card Grid) → **Marken** (Horizon collection-list / Logo-Grid) → Community
(Card Grid) → Events (Card Grid) → Trust-Leiste → **Newsletter**
(Horizon email-signup).

Sektionen werden im Theme-Customizer platziert/befüllt – `templates/index.json`
wird bewusst **nicht** per Code überschrieben (Shopify-Standard, kollisionsfrei).

## Deployment

Repo = Source of Truth (`theme/sections/*`). Deploy nur in **unveröffentlichte**
Themes. Zwei Wege:

1. **Admin-API `themeFilesUpsert`** (genutzt für Entwurf-Futurespin
   `200580792668`) – holt die Dateien byte-genau via Roh-GitHub-URL (Repo ist
   öffentlich), kein manuelles Kopieren.
2. **GitHub-Workflow „Theme-Dateien pushen"** (`push-theme-files.yml`) –
   benötigt einen `SHOPIFY_ACCESS_TOKEN` **mit `write_themes`-Scope** (der
   aktuelle Token hat diesen Scope noch nicht → Workflow schlägt sonst mit
   `read_themes`-Fehler fehl).

## Roadmap (nächste Bausteine, gleiches Muster)

- [ ] Multi-Sport-Navigation (Mega-Menü: Tischtennis/Padel/Pickleball/Courts/
      Standorte/Marken/Beratung/Sale)
- [ ] Sportwelten-Landingpage-Template (Hero → Story → Kategorien → Bestseller →
      Beratung → Marken → Community → FAQ → CTA)
- [ ] Standort-Landingpage-Template (Maps, Team, Galerie, Events, FAQ, Courts)
- [ ] CTA-Banner-Komponente, Logo-/Marken-Grid
- [ ] Produktseite: Sticky Buy Box, USP-Icons, Store-Availability/Click&Collect
- [ ] Collection: Sticky Filter, Mobile Drawer, Quick Add, Hover-Bilder
- [ ] Schema.org Breadcrumbs/FAQ, interne Verlinkung
