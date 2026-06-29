# Futurespin – Theme-Komponenten

Versionierte, update-sichere Theme-Bausteine für das **Horizon**-Theme von
Futurespin. Ziel: die Marke vom klassischen Tischtennis-Fachhändler zur
modernen Omnichannel-Racket-Sports-Plattform weiterentwickeln –
*„The Home of Racket Sports."*

## Warum dieser Ordner existiert

Die eigentlichen Theme-Dateien liegen in Shopify (Horizon). Bisher wurde
Custom-Code direkt im Theme gepflegt und war **nicht versioniert**. Dieser
Ordner spiegelt neue/angepasste Theme-Dateien im Repo, damit sie reviewbar,
nachvollziehbar und per CI deploybar sind.

## Struktur

```
theme/
  sections/   # eigenständige, konfigurierbare Shopify-Sections (fs-*)
  snippets/   # (bei Bedarf) geteilte Snippets
  assets/     # (bei Bedarf) CSS/JS
```

Der Asset-Key in Shopify entspricht dem Pfad **nach** `theme/`, z. B.
`theme/sections/fs-trust-bar.liquid` → `sections/fs-trust-bar.liquid`.

## Architektur-Prinzipien

- **Sections Everywhere / update-sicher**: Jede neue Funktion ist eine
  eigenständige Section mit `{% schema %}` und `presets`. Sie taucht damit im
  Theme-Customizer unter „Section hinzufügen" auf und überschreibt keine
  Horizon-Kern-Dateien. Theme-Updates bleiben dadurch unproblematisch.
- **Voll konfigurierbar**: Texte, Bilder, Farben, Spalten, Links – alles über
  den Customizer pflegbar. **Keine hartkodierten Inhalte oder URLs** (gilt
  besonders für die Playtomic-Court-Links).
- **Theme-portabel**: Die Sections nutzen das Standard-OS-2.0-Muster
  (Section + `{% schema %}`-Blocks), eigenes scoped CSS und **keine
  theme-spezifischen Snippets**. Sie laufen damit sowohl auf **Horizon** als
  auch auf dem geplanten **Enterprise**-Theme. Details: `ENTERPRISE-MIGRATION.md`.
- **Haus-Konventionen** (an bestehende `fs-*`-Blöcke angelehnt):
  - Klassen-Prefix `fs-…`
  - Scoped `<style>` direkt in der Section (keine globalen CSS-Konflikte)
  - Abstände inline aus den Section-Einstellungen (`padding-block-start/-end`)
  - `{{ block.shopify_attributes }}` für Theme-Editor-Support
- **Markenfarbe**: Das Horizon-Palette ist monochrom (Schwarz/Weiß/Grau). Die
  **Futurespin-Akzentfarbe (Blau)** ist je Section als `accent_color`
  einstellbar (Default `#0a4fa0`). **Bitte auf die exakte Markenfarbe setzen.**
- **Performance & A11y**: native `loading="lazy"`, responsive `srcset`/`sizes`,
  Inline-SVG statt Icon-Bibliotheken, `prefers-reduced-motion`, sichtbare
  `:focus-visible`-Outlines, semantische Headings.

## Sections in diesem Stand

| Section | Datei | Zweck (Master-Prompt) |
|---|---|---|
| **Sportwelten** | `sections/fs-sport-worlds.liquid` | Homepage #2 – große Kacheln Tischtennis/Padel/Pickleball, je Sportart ein Block, beliebig erweiterbar |
| **Courts buchen** | `sections/fs-courts-booking.liquid` | Homepage #3 – Playtomic-Buchung je Standort, alle Buchungs-URLs konfigurierbar, Multi-Standort |
| **Trust-Leiste** | `sections/fs-trust-bar.liquid` | Homepage #10 – Beratung, eigene Stores/Courts, Versand, Click & Collect, sichere Zahlung |

Alle drei sind als „Bald verfügbar"-fähig bzw. modular angelegt, damit Padel
und Pickleball schrittweise scharf geschaltet werden können.

## Deployment (nur in UNVERÖFFENTLICHTE Themes)

Über den Workflow **„Theme-Dateien pushen"**
(`.github/workflows/push-theme-files.yml`, manuell via *workflow_dispatch*):

- `theme_id`: numerische ID oder GID eines **unveröffentlichten** Themes
  (siehe `CLAUDE.md` für die aktuellen IDs)
- `files`: komma-separierte Repo-Pfade, z. B.
  `theme/sections/fs-sport-worlds.liquid,theme/sections/fs-courts-booking.liquid,theme/sections/fs-trust-bar.liquid`

Das Skript `scripts/push-theme-files.mjs`:
- prüft die Theme-Rolle und **verweigert Schreibzugriffe auf das MAIN/Live-Theme**,
- akzeptiert `SHOPIFY_ACCESS_TOKEN` **oder** `CLIENT_ID`/`CLIENT_SECRET`
  (Client-Credentials-Grant, siehe `CLAUDE.md`),
- nutzt die Admin-API-Mutation `themeFilesUpsert`.

Lokal:

```bash
SHOPIFY_STORE_DOMAIN=e7ee88-2.myshopify.com \
SHOPIFY_ACCESS_TOKEN=shpat_xxx \
THEME_ID=200523612508 \
FILES="theme/sections/fs-sport-worlds.liquid,theme/sections/fs-courts-booking.liquid,theme/sections/fs-trust-bar.liquid" \
node scripts/push-theme-files.mjs
```

Nach dem Push erscheinen die Sections im Theme-Customizer des Entwurfs-Themes
und können auf der Startseite platziert und befüllt werden.

## Roadmap (Master-Prompt → Status)

Bereits im Theme vorhanden (vorherige Arbeit): Schläger-Finder, Produkt-Vergleich,
Produkt-FAQ/-Schema/-Werte, Google-Bewertung, Hersteller-Info, erweiterte
Collection-Filter (Tempo/Kontrolle/Effekt), Hero-Rotator, B2B/VIP-Logik.

Dieser Stand ergänzt die **Multi-Sport-Markenidentität** (Sportwelten, Courts,
Trust). Nächste sinnvolle Schritte:

- [ ] Navigation auf Multi-Sport umstellen (Tischtennis / Padel / Pickleball /
      Courts buchen / Standorte / Marken / Beratung / Sale)
- [ ] Landingpage-Vorlage je Sportart (Hero, Kategorien, Bestseller, Guides, CTA)
- [ ] Standort-Section + Standort-Landingpage (Adresse, Öffnungszeiten, Maps,
      Team, Galerie, Events, FAQ, Local-SEO/Schema.org `LocalBusiness`)
- [ ] Marken-Logo-Grid-Section
- [ ] Community-Section (Turniere, Events, Academy, Vereinsservice)
- [ ] „Auch in unseren Stores verfügbar" (Click & Collect / POS) auf Produktseiten

> Alle künftigen Bausteine demselben Muster folgen lassen: eigenständige
> Section + Schema + Presets, konfigurierbar, `fs-`-Prefix, scoped CSS.
