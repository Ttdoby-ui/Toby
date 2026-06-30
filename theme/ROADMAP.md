# Futurespin Relaunch – Phasen-Roadmap

Arbeitsweise: **phasenweise**, nicht in einem Schritt. Jede Phase ist klein,
testbar und rückgängig machbar.

- Entwickelt wird ausschließlich auf **Entwurf-Futurespin** (`200580792668`,
  Horizon, UNPUBLISHED). Live (`200523088220`) bleibt unberührt.
- Alle Theme-Dateien byte-genau im Repo unter `theme/` (Source of Truth),
  Deploy via Admin-API `themeFilesUpsert`.
- **Definition of Done je Phase** (QA-Gate, bevor die nächste Phase startet):
  Theme prüfen · Mobile · Desktop · Lighthouse/CWV · Accessibility · SEO →
  erst dann Abnahme durch den User, dann weiter.

Legende: ✅ fertig · 🟡 teilweise · ⬜ offen

---

## Phase 1 – Informationsarchitektur & Navigation 🟡
**Ziel:** skalierbare, mehrsportfähige Struktur & Navigation.
- ✅ Multi-Sport-Hauptmenü `futurespin-hauptnav` (8 Top-Punkte + echte
  Unterkategorien); Entwurf-Header + Mobile-Chips darauf gezeigt; Live-Menü
  unberührt. (`theme/navigation/futurespin-hauptnav.md`)
- ✅ Landingpage-Ziele angelegt: `tischtennis`, `courts`, `standorte`,
  `marken`, `beratung`.
- ⬜ Footer-Navigation auf Multi-Sport ausrichten.
- ⬜ Breadcrumbs-Konzept (greift in Phase 6 / Produkt- & Collection-Seiten).
- ⬜ URL-/Collection-Struktur für Padel/Pickleball final festziehen.

## Phase 2 – Designsystem (Farben, Typografie, Komponenten) 🟡
**Ziel:** wiederverwendbare, customizer-konfigurierbare Bausteine + Tokens.
- ✅ Design-Tokens definiert (`theme/DESIGN-SYSTEM.md`): Akzent=Futurespin-Blau
  (Setting), Flächen Weiß/Grau/Anthrazit, Outfit/Archivo, Radius/Spacing/Motion.
- ✅ Komponenten v1: Brand Hero, Sportwelten, Courts buchen, Standorte
  (Store Locator), Card Grid, Trust-Leiste – alle deployt.
- ✅ Marken-Blau verbindlich gesetzt: `#486A8F` (aus Announcement-Bar/Chat) als Default in allen Sections.
- 🟡 Weitere Komponenten: ✅ CTA-Banner, ✅ Marken-/Logo-Grid; offen: Comparison-Table,
  FAQ-Block (Horizon hat bereits `produkt-faq` – wiederverwenden), USP-Strip.
- ⬜ Optional: zentrales Tokens-Snippet statt Pro-Section-Defaults.

## Phase 3 – Homepage & Sportwelten 🟡
**Ziel:** Startseite verkauft die Marke; je Sportart eine Erlebniswelt.
- ✅ Homepage neu zusammengestellt (templates/index.json, dunkel/markenorientiert):
      Hero → Courts → Sportwelten → Standorte → Trust → Newsletter (lt. Zielbild).
- ⬜ Original-Reihenfolge optional: Hero → Sportwelten → Courts →
  Standorte → Bestseller → Neuheiten → Beratung → Marken → Community → Trust →
  Newsletter); Bestseller/Neuheiten/Marken über Horizon-Standard-Sections.
- ⬜ Sportwelten-Landingpage-Template (`tischtennis`/`padel`/`pickleball`):
  Hero → Story → Kategorien → Bestseller → Beratung → Marken → Community → FAQ → CTA.
- ⬜ Referenz-Befüllung der `tischtennis`-Seite.

## Phase 4 – Collections & Produktseiten ⬜
**Ziel:** Conversion & Usability.
- 🟡 Vorhanden (Horizon-Custom): Filter (Tempo/Kontrolle/Effekt), Schläger-Finder,
  Produkt-Vergleich, Produkt-FAQ/-Schema/-Werte, Google-Bewertung.
- ⬜ Collection: Sticky Filter, Mobile Drawer, Quick Add, Hover-Bilder, Wishlist
  vorbereiten, saubere Produktkarten.
- ⬜ Produkt: Sticky Buy Box, USP-Icons, technische Daten, Cross-Selling/Bundles,
  Store-Availability, Click & Collect.

## Phase 5 – Standorte, Playtomic & Omnichannel ⬜
**Ziel:** Stores + Courts als ein Markenerlebnis.
- ✅ Bausteine: `fs-locations` (Store Locator + Schema), `fs-courts-booking`
  (Playtomic, alle Links konfigurierbar).
- ⬜ Standort-Landingpage-Template (Hero, Öffnungszeiten, Maps, Team, Galerie,
  Events, FAQ, Courts, Click & Collect).
- ⬜ Standort-Daten über **Metafields/Metaobjects** statt Section-Settings
  (mehrere Standorte sauber pflegbar).
- ⬜ Click & Collect / POS-Verfügbarkeit auf Produktseiten.

## Phase 6 – SEO, Performance & Feinschliff ⬜
**Ziel:** technische Exzellenz.
- 🟡 Schema.org begonnen (LocalBusiness in `fs-locations`).
- ⬜ Breadcrumbs, FAQ-Schema, Produkt-Schema prüfen, interne Verlinkung.
- ⬜ Core Web Vitals: LCP-Bilder, Lazy-Loading, responsive Images, JS-Diät.
- ⬜ Accessibility-Audit (Fokus, Kontraste, Semantik), Lighthouse je Template.

---

## Empfohlene Reihenfolge ab jetzt
Phase 1 abschließen (Footer-Nav) → **Phase 2** abrunden (Marken-Blau + CTA-Banner
+ Marken-Grid) → **Phase 3** (Homepage + Sportwelten-Template). Phasen 4–6 danach.

Jede Phase: bauen → in den Entwurf deployen → QA-Gate (s. o.) → Abnahme → nächste.
