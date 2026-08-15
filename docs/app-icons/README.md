# App-Icons

## VIP Beläge Discount

Zwei Varianten, erzeugt von `vip-belaege-icon.py`:

| Datei | Motiv | Betont |
|---|---|---|
| `vip-belaege-krone-*.png` | Schläger + goldene Krone | VIP |
| `vip-belaege-prozent-*.png` | Schläger + goldenes % | Rabatt |

Jeweils in **1200 px** (das erwartet das Dev Dashboard) und 512 px zur Ansicht.
Die `.svg` sind die Quellen – daraus lässt sich jede Größe verlustfrei rendern.

**Hochladen:** dev.shopify.com/dashboard → App „VIP Beläge Discount" →
Einstellungen → App-Symbol → die 1200er-Datei wählen.

Der Hintergrund füllt die ganze Fläche, weil Shopify die Ecken selbst abrundet –
ein eigener Rahmen würde dabei angeschnitten.

Farben aus dem Futurespin-Schema: Blau `#486A8F` (hier als Verlauf 5A7FA8 → 3C5A79),
VIP-Gold `#C19A3E`.

Neu erzeugen:

```bash
pip install cairosvg
python3 vip-belaege-icon.py
```
