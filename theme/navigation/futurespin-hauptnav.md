# Multi-Sport-Navigation – `futurespin-hauptnav`

Skalierbare Hauptnavigation für das Multi-Sport-Konzept. **Store-globales Menü**
(Linklist), angelegt via Admin-API `menuCreate` — bewusst als **neues** Menü,
damit das Live-Theme (das weiterhin `main-menu` nutzt) unberührt bleibt.

- Menü-Handle: `futurespin-hauptnav` · ID: `gid://shopify/Menu/336645914972`
- Verwendet von: **Entwurf-Futurespin** (`200580792668`) – im Header-Block
  `_header-menu` **und** in `mobile-category-chips` (`sections/header-group.json`,
  Einstellung `menu`). Umschalten alternativ im Customizer: Header → Menü.

## Struktur

| Top-Level | Ziel | Unterpunkte |
|---|---|---|
| 🏓 **Tischtennis** | `/pages/tischtennis` | Beläge, Hölzer, Komplettschläger, Bälle, Pflege & Montage, Taschen & Hüllen, Schuhe & Textilien, Vereinsbedarf, Lehrgänge |
| 🎾 **Padel** | `/collections/padel` | Schläger, Bälle, Bekleidung, Schuhe, Taschen, Zubehör |
| 🥒 **Pickleball** | `/collections/pickleball` | Schläger, Bälle, Bekleidung, Schuhe, Taschen, Zubehör |
| 🏟 **Courts buchen** | `/pages/courts` | Standorte |
| 📍 **Standorte** | `/pages/standorte` | – |
| 🏷 **Marken** | `/pages/marken` | – |
| 📚 **Beratung** | `/pages/beratung` | Schlägerfinder (`/pages/schlaeger-konfigurator`) |
| 🔥 **Sale** | `/collections/sale-1` | – |

Alle Unterpunkte verlinken auf **real existierende Collections** (aus
`main-menu`, `menu-padel`, `menu-pickleball` übernommen). Erweiterbar: neue
Sportart = neuer Top-Level-Punkt, gleiches Muster.

## Dazu angelegte Seiten (Landingpage-Ziele)

Als veröffentlichte Platzhalter-Seiten erstellt, damit die Top-Level-Links
auflösen — werden als Nächstes mit dem Design System (Hero, Sportwelten, Courts,
Standorte, Card Grid) bestückt:

| Seite | Handle | Geplante Sections |
|---|---|---|
| Tischtennis | `tischtennis` | Brand Hero + Sportwelt-Inhalte |
| Courts buchen | `courts` | **Courts buchen** (`fs-courts-booking`) |
| Standorte | `standorte` | **Standorte** (`fs-locations`) |
| Marken | `marken` | Logo-/Marken-Grid |
| Beratung | `beratung` | **Card Grid** (`fs-card-grid`) mit Findern |

> Padel/Pickleball-Top-Level zeigen direkt auf die vorhandenen Collections; bei
> Bedarf später auf eigene `/pages/padel` bzw. `/pages/pickleball` umstellen.

## Hinweise

- Im Header-Group existiert bereits eine theme-eigene Section `fs-sport-nav`
  („Sport-Navigation") – unverändert gelassen.
- Menü-Reproduktion: siehe `menuCreate`-Aufruf in der Session-Historie; bei
  Wiederherstellung dieselbe Struktur mit Typ `HTTP` + relativen URLs anlegen.
