# Multi-Sport: Ein Store, drei Sportwelten

Umsetzung von „3 Shops" in **einer** Shopify-Instanz (Entwurf-Futurespin,
`200580792668`) – ein Checkout, ein Katalog, kein Zusatzabo.

## Architektur

```
/  (Root)  ──▶  Auswahl-Landingpage (Chooser)   [templates/index.json → fs-sport-landing]
                 │
                 ├─▶ /pages/welt-tischtennis   [templates/page.welt-tischtennis.json]
                 ├─▶ /pages/welt-padel         [templates/page.welt-padel.json]
                 └─▶ /pages/welt-pickleball    [templates/page.welt-pickleball.json]
```

- **Chooser** (`/`): 3-Panel-Sportweltauswahl (Tischtennis/Padel/Pickleball),
  Section `fs-sport-landing`. Beliebig um weitere Sportarten erweiterbar.
- **Welt-Seiten**: identisches Layout, je Sport eigenes Sortiment. Sections je
  Welt: `fs-brand-hero` → `fs-collection-strip` (Sortiment aus der Sport-
  Collection) → `fs-courts-booking` (Playtomic) → `fs-locations` → `fs-trust-bar`
  → `fs-newsletter`.
  - Tischtennis → Collection `bestseller`
  - Padel → Collection `padel`
  - Pickleball → Collection `pickleball`
- **Sportart-Umschalter** (`fs-sport-switcher`): globales Aufklapp-Dropdown in
  der Header-Gruppe (`sections/header-group.json`), auf jeder Seite. Reine
  CSS-Lösung (`details/summary`), aktive Welt wird per URL erkannt.

## Shopify-Objekte (Store-seitig, nicht im Repo)

- **Seiten** (mit Template-Zuweisung `templateSuffix`):
  `welt-tischtennis`, `welt-padel`, `welt-pickleball` (veröffentlicht).
- **Menü** `futurespin-hauptnav`: Sport-Top-Punkte zeigen auf die Welt-Seiten
  (`/pages/welt-*`), Unterpunkte weiterhin auf die jeweiligen Collections.
- **Header-Gruppe**: `fs-sport-switcher` in `order` ergänzt (nach dem Header).

## Neue Sportart hinzufügen (Blueprint)

1. Collection für die Sportart anlegen/füllen.
2. Neues Template `templates/page.welt-<sport>.json` (Kopie einer Welt, Hero +
   Collection anpassen), deployen.
3. Seite `welt-<sport>` mit `templateSuffix: welt-<sport>` anlegen.
4. Block in `fs-sport-landing` (Chooser) **und** in `fs-sport-switcher` ergänzen;
   Top-Punkt im Menü `futurespin-hauptnav` ergänzen.

## Hinweise / offen

- Welt-Hero nutzt aktuell die Sport-Bilder (IMG-5629/5630/5631); eigene
  Hero-Fotos je Welt können im Customizer gesetzt werden.
- Padel-/Pickleball-Collections müssen befüllt sein, damit der Collection-Strip
  Produkte zeigt (sonst erscheint ein Platzhaltertext).
- Playtomic-URLs weiterhin `#` (überall gleich; zentral in den Welt-Templates /
  im Customizer setzbar).
- `fs-collection-strip` ist bewusst leichtgewichtig; für volle Produktkarten
  (Quick-Add etc.) kann Horizons `product-list` genutzt werden.
