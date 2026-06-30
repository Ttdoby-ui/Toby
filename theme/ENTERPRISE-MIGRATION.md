# Umstieg auf das Enterprise-Theme – Vorbereitung & Plan

Ziel: Futurespin auf das **Enterprise-Theme** (Shopify Theme Store, Online
Store 2.0) umstellen und die bisherige Custom-Arbeit + die neue Multi-Sport-
Markenidentität dort sauber aufsetzen.

## Wichtig: Du musst nicht erst kaufen, um zu starten

Das Enterprise-Theme kostet **einmalig 400 USD pro Store**, hat aber eine
**kostenlose, unbegrenzte Testphase** – bezahlt wird **erst beim
Veröffentlichen**. Praktisch heißt das:

1. Im Shopify Theme Store „Enterprise" → **Theme zur Theme-Bibliothek
   hinzufügen** (Testversion). Es landet als **UNVERÖFFENTLICHTES** Theme in
   eurer Bibliothek.
2. Wir können es ab sofort vollständig anpassen, befüllen und im Customizer
   bearbeiten – **ohne Zahlung**.
3. Erst wenn alles steht und ihr live gehen wollt, kauft ihr es zum
   Veröffentlichen.

> Sobald das Enterprise-Theme als unveröffentlichtes Theme in der Bibliothek
> ist, sag mir die Theme-ID – dann deploye/baue ich direkt darauf weiter.

## Was bereits Enterprise-tauglich vorbereitet ist

Die drei neuen Sections sind **theme-agnostisch** gebaut (Standard-OS-2.0-
Section-mit-Blocks-Muster, eigenes scoped CSS, keine Horizon-spezifischen
Snippets mehr):

- `theme/sections/fs-sport-worlds.liquid` – Sportwelten
- `theme/sections/fs-courts-booking.liquid` – Courts buchen (Playtomic)
- `theme/sections/fs-trust-bar.liquid` – Trust-Leiste

Sie lassen sich per Workflow „Theme-Dateien pushen" mit **derselben** Datei-
Liste in **jedes** unveröffentlichte Theme schieben – einfach die `theme_id`
auf das Enterprise-Theme setzen. Das Push-Skript prüft die Theme-Rolle und
verweigert weiterhin Schreibzugriffe aufs Live-Theme.

## Architektur-Hinweis (Horizon → Enterprise)

| | Horizon (aktuell) | Enterprise (Ziel) |
|---|---|---|
| Basis | OS 2.0 + neue „Theme-Blocks" | OS 2.0, Section-/Block-Muster |
| Stärken | modernes Block-System | große Kataloge: Mega-Menü, Filter, Swatches, Predictive Search |
| Unsere fs-Sections | ✅ laufen | ✅ laufen (portabel gebaut) |

Wichtig: Die **bestehende, tiefe Custom-Arbeit** (Schläger-Finder,
Produkt-Vergleich, Produkt-FAQ/-Schema/-Werte, Google-Bewertung, erweiterte
Filter) ist als **Horizon-Theme-Blocks + Horizon-JS** gebaut. Diese Teile sind
**nicht 1:1 portabel** – sie müssen für Enterprise neu als Enterprise-Sections/
Blocks aufgesetzt bzw. als App-Blocks/Custom-Liquid integriert werden. Das ist
der größte Aufwandsposten der Migration und sollte eingeplant werden.

## Brand-Spec zum Nachbauen in Enterprise

Aus dem aktuellen Theme übernommen, damit das Erscheinungsbild erhalten bleibt
(„Branding MUSS erhalten bleiben"):

**Schriften**
- Body: **Outfit** (Regular/400, Medium/500)
- Headlines & Accent: **Archivo** (Bold/700)
- Größen: H1 52 / H2 40 / H3 28 / H4 22, Fließtext 14

**Farben (Enterprise „Color schemes")**
- Hintergrund `#ffffff`, Text `#000000`
- Grautöne: `#333333`, `#dfdfdf`, `#f5f5f5`, `#eef1ea`
- **Akzent = Futurespin-Blau** → exakten Markenwert eintragen (Platzhalter
  in den Sections: `#486A8F`). In Enterprise als eigenes Color-Scheme/
  Accent hinterlegen und konsequent für Buttons, Links, Icons, Badges,
  aktive Zustände nutzen.

**Buttons**
- Primär: Eckenradius ~20px, gefüllt
- Sekundär: Eckenradius ~14px, 1px Rahmen

**Logo**
- Schriftlogo (`fs_schriftlogo.avif`), Höhe ~54px Desktop / ~32px Mobil

## Migrations-Checkliste

1. [ ] Enterprise als Testversion zur Theme-Bibliothek hinzufügen (unveröffentlicht)
2. [ ] Theme-ID an mich geben → ich pushe die fs-Sections + baue weiter
3. [ ] Brand-Spec setzen: Schriften (Outfit/Archivo), Color-Scheme inkl.
       Futurespin-Blau, Buttons, Logo, Favicon
4. [ ] Globale Einstellungen: Seitenbreite, Card-Hover, Badges
5. [ ] Header/Navigation auf Multi-Sport umstellen (Tischtennis / Padel /
       Pickleball / Courts buchen / Standorte / Marken / Beratung / Sale),
       Mega-Menü von Enterprise nutzen
6. [ ] Startseite mit Master-Prompt-Reihenfolge aufbauen (Hero → Sportwelten →
       Courts → Bestseller → Neuheiten → Marken → Beratung → Standorte →
       Community → Trust → Newsletter)
7. [ ] Collection-Filter neu konfigurieren (Enterprise-Filter: Marke, Preis,
       Gewicht, Spielstärke, Tempo, Kontrolle, Spin, Härte, Schwammstärke …)
8. [ ] Produktseiten-Bausteine neu aufsetzen (Galerie, Sticky Buy Box, USP,
       Technische Daten, FAQ, Bewertungen, Cross-Selling)
9. [ ] Tiefe Custom-Features migrieren/neu bauen (Schläger-Finder,
       Produkt-Vergleich, Belag-/Holzfinder, Padel-/Pickleball-Finder)
10. [ ] Apps neu verbinden (Judge.me Reviews, Inbox-Chat, ggf. Urgency)
11. [ ] B2B/VIP-Logik (Kunden-Tags B2B1–3, VIP-Rabatte) neu integrieren
12. [ ] Performance/SEO/A11y-Check, mobil + Desktop
13. [ ] Abnahme → Enterprise kaufen & veröffentlichen

## Empfehlung zur Reihenfolge

Erst **Brand-Spec + Navigation + Startseite** in Enterprise stehen lassen
(schneller sichtbarer Fortschritt, geringes Risiko), dann die tiefen
Custom-Features migrieren. So ist früh ein vorzeigbarer Stand da, während der
aufwändige Teil (Finder/Vergleich) parallel läuft.
