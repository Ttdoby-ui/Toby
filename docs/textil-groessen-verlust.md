# Textilien: verlorene Größen (Stand 2026-08-07)

Auswertung aller **201 aktiven Textilien** (Tag `Textil`).

## ✅ WIEDERHERGESTELLT am 2026-08-08

**83 Artikel** haben ihre verlorenen Größen zurück, **10 Shorts** zusätzlich ihre
korrekten Optionsnamen. Die unten stehenden Listen dokumentieren den Schadensstand
**vor** der Reparatur.

**Wie:** `productOptionUpdate(optionValuesToAdd: …, variantStrategy: MANAGE)`. MANAGE legt
für jede fehlende Größe automatisch eine Variante je bestehender Farb-/Stoff-Kombination an
und **übernimmt dabei Preis, Vergleichspreis, Gewicht, `tracked` und die Lagerpolitik von den
vorhandenen Varianten derselben Kombination** – bei mehrfarbigen Artikeln also je Farbe
korrekt (verifiziert an *andro Shirt Benzon*: blau/gelb `CONTINUE`, die anderen `DENY`).
Bestand aller neuen Varianten: **0**. Danach `productOptionsReorder`, weil Shopify neue Werte
hinten anhängt; Sortierung 140, 152, 4XS, 3XS, 2XS, XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL.

⚠️ **Zwei Sorten Größen-Optionen:** die meisten sind Freitext (`optionValuesToAdd:[{name:"5XL"}]`),
einige hängen an der Taxonomie (`linkedMetafield.key == "size"`) – dort MUSS
`{linkedMetafieldValue: "gid://shopify/Metaobject/…"}` rein, `name` wird abgelehnt
(`CANNOT_SET_NAME_FOR_LINKED_OPTION_VALUE`). Betroffen waren u. a. *andro Shirt Dexar schwarz*,
*andro Sukaria Sweatpullover*, *Xiom Shirt Bentley* und vier Mizuno-Tees.

⚠️ **`productVariantsBulkCreate` kann keine NEUEN taxonomie-gebundenen Optionswerte anlegen** –
ohne `name` kommt „id oder name muss angegeben werden", mit `name` kommt
`CANNOT_SET_NAME_FOR_LINKED_OPTION_VALUE`. Deshalb immer der Weg über `productOptionUpdate`.

⚠️ **`productOptionsReorder` verlangt ALLE Optionen des Produkts** in der Payload, sonst
`MISSING_OPTION_NAME`. Reihenfolge der Optionen dabei unverändert lassen.

**Nicht angefasst:** `andro Headband Pro` (Größen-Metafeld vorhanden, aber ein Stirnband hatte
nie Größen – Fehlalarm der Methode) sowie alle Artikel aus dem Abschnitt „Entwarnung".

**Bestand/Verfügbarkeit:** Die neuen Varianten stehen auf 0 und übernehmen die Lagerpolitik
des jeweiligen Artikels – bei `DENY` erscheinen sie als „ausverkauft", bei `CONTINUE` als
gelbe Nachbestell-Größe. Wer eine Größe generell bestellbar machen will, muss ihre Policy
auf `CONTINUE` setzen.

**Rückgängig machen:** Die wiederhergestellten Varianten haben alle Bestand 0 und sind an
ihrer Größe erkennbar; einzeln über den Admin oder per `productOptionUpdate` mit
`optionValuesToDelete` + `variantStrategy: MANAGE` entfernbar.

## Methode

Shopify protokolliert **gelöschte Varianten nicht** – `Product.events` kennt nur
Produkt- und Kanal-Ereignisse. Es gibt aber zwei Spuren, die eine Löschung überleben:

1. **Taxonomie-Metafeld `shopify.size`** (Liste von `shopify--size`-Metaobjekten).
   Shopify füllt es beim Kategorisieren aus den Varianten und **räumt es nicht auf**,
   wenn später Varianten verschwinden.
   Beispiel: *Xiom Shirt Bentley* listet dort XS…4XL, hat heute aber nur noch **2XL**.
2. **Bestellpositionen.** `lineItem.variantTitle` bleibt erhalten, auch wenn die
   Variante gelöscht wird. Das ist der harte Beweis inklusive Datum.

Kontrolle der Methode: bei allen Artikeln, bei denen nichts verloren ging, stimmen
Metafeld und heutige Optionswerte **exakt** überein (inklusive Kindergrößen 140/152).
Einzige bekannte Ausnahme: *andro Headband Pro* trägt ein Größen-Metafeld, obwohl ein
Stirnband nie Größen hatte (offenbar bei einer Sammel-Anlage mitkopiert) – deshalb ist
das Metafeld ein **starkes Indiz**, die Bestellung der **Beweis**.

## Harte Beweise aus Bestellungen

| Artikel | Größe | Bestellung | Datum |
|---|---|---|---|
| andro Shirt Dexar schwarz | M / Schwarz | #1884 | 2025-09-13 |
| andro T-Shirt Tylos | M / Schwarz | #5488 | 2026-02-01 |
| andro T-Shirt Tylos | M / Schwarz | #6775 | 2026-03-21 |
| andro Shirt Dexar blau | 2XL / Blau | #1437 | 2025 |

## Wahrscheinliche Ursache

Ein **fehlerhafter Massen-Import/Bulk-Edit**, kein schleichender Verschleiß:

- 🚨 **Bei zehn Artikeln sind die Optionsnamen zerschossen** – die Option heißt nicht
  mehr „Größe"/„Farbe", sondern **„2XS"/„schwarz"** (also der erste *Wert* steht im
  *Namen*). Das ist die Signatur einer verrutschten Spalte in einem CSV-Import bzw.
  Bulk-Edit. Betroffen: andro Shorts Tarox, andro Shorts Cuso, andro Shorts 2-in-1 Nebro,
  Donic Shorts Beam, Donic Shorts Dive, Donic Shorts Velora, Tibhar Shorts Mundo,
  Tibhar Shorts Osmium, Tibhar Shorts L2 River, Tibhar Shorts L2 Underbrush blau/pink.
- **Alle zehn sind Shorts.** Und drei der schwersten Größenverluste sind ebenfalls
  Shorts (Beam, Dive, Mundo). Ein Produkt-CSV-Import **ersetzt** die Variantenliste
  eines Produkts durch genau die Zeilen der Datei – eine unvollständige Datei löscht
  also stillschweigend Varianten.
- Zeitfenster: die betroffenen Produkte wurden überwiegend **Mitte Juli 2026**
  zuletzt geändert, teils sekundengleich in Paaren (z. B. 2026-07-29T10:49:29Z für
  zwei Donic-Artikel) – typisch für Batch-Läufe.
- Die überlebenden Varianten tragen als `updatedAt` noch den Hauspreis-Lauf
  (2026-07-07), das Produkt selbst ist später geändert worden → die Änderung betraf
  die Variantenliste, nicht die Preise.

Keiner unserer Repo-Workflows löscht Varianten (`productVariantsBulkUpdate`,
`tagsAdd`, `productCreateMedia` können das nicht). Der Farb-Merge nutzt zwar das
deklarative `productSet`, betrifft aber nur die 137 zusammengeführten Farb-Sets –
die hier betroffenen Artikel sind größtenteils **nicht** gemergt.

## Schwere Fälle (5 und mehr Größen verloren)

| Artikel | heute | verloren |
|---|---|---|
| Xiom Shirt Bentley | 2XL | XS, S, M, L, XL, 3XL, 4XL |
| andro T-Shirt Tylos | L, XL | 2XS, XS, S, M, 2XL, 3XL, 4XL |
| Donic Shorts Beam | 140, 152, 2XS, XS, S | M, L, XL, 2XL, 3XL, 4XL, 5XL |
| Donic Shorts Dive | 140, 152, 2XS, XS, S | M, L, XL, 2XL, 3XL, 4XL, 5XL |
| Tibhar Shorts Mundo | 2XS, XS, S, M, L | 140, 152, XL, 2XL, 3XL, 4XL, 5XL |
| Victas V-TShirt 227 | 3XS, 2XS, XS, S | M, L, XL, 2XL, 3XL, 4XL |
| futurespin Hoodie Crew | S, M, L, XL, 2XL | 3XS, 2XS, XS, 3XL, 4XL, 5XL |
| Victas V-Shirt 210 blau | 3XS, 2XS, XS, S, M | L, XL, 2XL, 3XL, 4XL |
| Victas T-Shirt V-Shirt 221 | 2XS, XS, S, M, L | 3XS, XL, 2XL, 3XL, 4XL |
| Victas T-Shirt V-Shirt Promotion | 3XS, 2XS, XS, S, M | L, XL, 2XL, 3XL, 4XL |

## Mittlere Fälle (3–4 Größen verloren)

| Artikel | verloren |
|---|---|
| Mizuno Shirt Chiba | 2XS, XS, 4XL, 5XL |
| Mizuno Anzugjacke Chiba | 2XS, XS, 4XL, 5XL |
| Joola Polo Team 25 | 2XS, 3XL, 4XL, 5XL |
| Joola T-Shirt Competition 25 | 2XS, 3XL, 4XL, 5XL |
| Joola Short Maco 25 | 2XS, 3XL, 4XL, 5XL |
| Joola Short Essential 25 | 2XS, 3XL, 4XL, 5XL |
| futurespin Shorts Evolution | 3XS, 2XS, XS, 5XL |
| GEWO Ladyshirt Sarno III | 2XL, 3XL, 4XL |
| Xiom T-Shirt Austin | 2XL, 3XL, 4XL |
| andro Sukaria Sweatpullover | 3XS, 4XL, 5XL |
| andro Shorts 2-in-1 Nebro | 3XS, 4XL, 5XL |

## Kleine Fälle (1–2 Größen verloren)

**4XL fehlt** (GEWO-Serie): Polo Sarno I, Polo Sarno II, Shirt Lugo I, Shirt Lugo II,
Shirt Ponza I, Shirt Ponza II, Shirt Ponza III, Shirt Tamarro I, Shirt Tamarro II

**4XS fehlt** (GEWO-Serie): Shirt Sarno III, Anzug Ponza II, Hoodie Ponza II,
Anzug Atani, Polo Atani, Shirt Carneval, Shirt Santo

**3XL fehlt** (Mizuno-Serie): Core Graphic Short Sleeve Tee Capri Breeze, Core Mizuno Tee,
Core RB Tee, Core Graphic Tee, Release Tape Tee, Athletics Tee schwarz, Core Graphic RB Tee,
Heritage Tee peacock, Athletics Graphic T-Shirt, Core Impulse Short Sleeve Tee aquifer,
Short Sleeve Tee, Impulse Core Tee

**4XL + 5XL fehlen:** andro Hemd Lavor, andro Shirt Benzon, andro Shirt Avos schwarz/blau,
andro Shirt Avos schwarz/rot, Donic Poloshirt Flame, Donic Poloshirt Fire,
Donic T-Shirt Furious, Joola Shirt Zephir

**3XS + 5XL fehlen:** andro Hoodie Doley, andro Hose Doley, Tibhar Jacke Jura,
Tibhar Hose Jura, Victas Jacke V-Tracksuit 118, Victas Hose V-Tracksuit 118,
Donic Jacke Trail, Donic Jacke Capri

**Nur 5XL fehlt:** andro Hemd Avos, andro Jacke Marbery, andro Hose Marbery schwarz,
andro Shorts Tarox, andro Shorts Cuso, Victas V-TShirt Training, Victas Shorts V-Shorts 319,
Victas Shorts V-Shorts 320, Victas V-Hoodie 120, Tibhar Trainingsanzug Domino,
Tibhar Trainingsanzug L2 River, Tibhar Trainingsanzug L2 Underbrush royal

**Sonstige:** Xiom Shirt Lipstick (2XS, 5XL) · Joola Polo Team 26 (3XS, 2XS) ·
Joola Shirt Centrela (**L, XL** – Mittelgrößen!) · Tibhar Shorts Osmium (140, 152) ·
Victas Trainingsanzug V-Tracksuit 119 (140, 152) · andro Shirt Dexar schwarz (M, XL)

## Entwarnung – diese Artikel hatten nie größere Größen

Aus meiner ersten Liste („kein XXL/3XL/4XL") fallen diese heraus, weil sie den
Größenlauf nie hatten:

Donic Hemd Caliber schwarz/rot (nur M, L, XL) · Mizuno DryLite Cooltouch Tee (nur M, L) ·
Mizuno DryLite HexTee (nur S, M, L) · Donic Hemd Rafter anthrazit (nur 2XL) ·
Donic T-Shirt Bluestar · Xiom Shirt Thunder · Xiom Shirt Blade · Nexy Embla Shirt ·
futurespin T-Shirt Melange · futurespin Shorts Bermuda · futurespin Shorts Performance ·
Donic T-Shirt Cream / Drop / Nova / Sector / Slate · Mizuno Runbird Short Sleeve Tee schwarz ·
andro Jacke Adkins · andro Longsleeve Scalzo · Mizuno Shorts Trad · Mizuno Anzughose Chiba

## Zusammenfassung

- **86 von 201 aktiven Textilien** haben nachweislich Größen verloren.
- Schwerpunkt sind die **Randgrößen 4XS / 3XS / 4XL / 5XL** und die Kindergrößen 140/152 –
  aber es fehlen auch **Mittelgrößen** (Joola Shirt Centrela: L und XL; andro Shirt Dexar: M).
- 10 Shorts-Artikel haben zusätzlich **kaputte Optionsnamen** („2XS" statt „Größe") –
  der sichtbarste Hinweis auf die Ursache.

## Werkzeuge

- `scripts/audit-textil-groessen.mjs` + Workflow **„Textil-Größen-Audit"**
  (rein lesend; scannt zusätzlich die Bestellhistorie und liefert je verlorener Größe
  die letzte Bestellung mit Datum). Der Workflow muss – wie die übrigen
  Skript-Workflows – auf `main` liegen, um per `workflow_dispatch` auslösbar zu sein.
