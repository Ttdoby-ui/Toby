#!/usr/bin/env python3
"""
App-Icon fuer die Shopify-App "VIP Belaege Discount".

Erzeugt zwei Varianten als SVG und rendert sie nach PNG:

  A "krone"   - Schlaeger mit goldener Krone   -> betont VIP
  B "prozent" - Schlaeger mit goldenem %-Kreis -> betont Rabatt

Bewusst ohne Schriftart: das "%" ist aus Kreisen und einem Balken gezeichnet.
Damit sieht das Icon auf jedem System gleich aus, egal welche Fonts da sind.

Shopify erwartet im Dev Dashboard 1200x1200 px. Der Hintergrund fuellt die
ganze Flaeche - Shopify rundet die Ecken selbst ab, ein eigener Rahmen wuerde
dabei abgeschnitten.

    python3 vip-belaege-icon.py
"""

import pathlib

import cairosvg

HIER = pathlib.Path(__file__).resolve().parent

BLAU_HELL = "#5A7FA8"
BLAU_DUNKEL = "#3C5A79"
GOLD = "#C19A3E"
GOLD_HELL = "#E0BC63"
ROT = "#C0392B"
ROT_DUNKEL = "#9E2E22"
WEISS = "#FFFFFF"
HOLZ = "#F2E6D2"
HOLZ_DUNKEL = "#D9C4A3"


def grundlage(inhalt: str) -> str:
    """Hintergrund, Schatten und der Schlaeger - fuer beide Varianten gleich."""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="1200" height="1200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{BLAU_HELL}"/>
      <stop offset="1" stop-color="{BLAU_DUNKEL}"/>
    </linearGradient>
    <radialGradient id="belag" cx="0.38" cy="0.32" r="0.78">
      <stop offset="0" stop-color="{ROT}"/>
      <stop offset="1" stop-color="{ROT_DUNKEL}"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{GOLD_HELL}"/>
      <stop offset="1" stop-color="{GOLD}"/>
    </linearGradient>
    <filter id="weich" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="26"/>
    </filter>
  </defs>

  <rect width="1200" height="1200" fill="url(#bg)"/>
  <!-- dezenter Lichtfleck oben links, nimmt dem Blau die Flaechigkeit -->
  <circle cx="330" cy="270" r="430" fill="#FFFFFF" opacity="0.06"/>

  <!-- Schatten unter dem Schlaeger -->
  <ellipse cx="592" cy="1062" rx="250" ry="44" fill="#1E2E3E" opacity="0.32" filter="url(#weich)"/>

  <g transform="rotate(-16 600 560)">
    <!-- Griff: Schulter am Blatt, leichte Taille, ausgestellter Abschluss.
         Ein duenner gerader Stiel liesse den Schlaeger wie eine Lupe wirken,
         ein zu kurzer wie einen Korken - daher diese Laenge. -->
    <path d="M 516 690
             C 508 760, 524 786, 524 852
             C 524 906, 516 946, 512 986
             C 508 1024, 532 1044, 600 1044
             C 668 1044, 692 1024, 688 986
             C 684 946, 676 906, 676 852
             C 676 786, 692 760, 684 690 Z"
          fill="{HOLZ}"/>
    <!-- Griffband: deckt den Grossteil des Griffs, sonst wirkt es wie ein Korken -->
    <path d="M 522 774 C 560 786, 640 786, 678 774
             L 686 1000 C 640 1012, 560 1012, 514 1000 Z"
          fill="{HOLZ_DUNKEL}"/>
    <!-- Blatt: schmale Holzkante, darauf der Belag -->
    <ellipse cx="600" cy="452" rx="268" ry="280" fill="{HOLZ}"/>
    <ellipse cx="600" cy="452" rx="246" ry="258" fill="url(#belag)"/>
    <!-- Glanzkante auf dem Belag -->
    <path d="M 600 194 A 246 258 0 0 0 354 452" fill="none" stroke="#FFFFFF"
          stroke-opacity="0.20" stroke-width="22" stroke-linecap="round"/>
  </g>

{inhalt}
</svg>
"""


def krone() -> str:
    """Goldene Krone, sitzt oben rechts auf der Schlaegerkante."""
    return f"""  <g transform="translate(812 168)">
    <circle cx="96" cy="96" r="112" fill="{BLAU_DUNKEL}" opacity="0.35"/>
    <circle cx="96" cy="96" r="95" fill="url(#gold)"/>
    <path d="M 40 128 L 28 52 L 66 84 L 96 34 L 126 84 L 164 52 L 152 128 Z"
          fill="{BLAU_DUNKEL}"/>
    <rect x="40" y="138" width="112" height="22" rx="10" fill="{BLAU_DUNKEL}"/>
  </g>"""


def prozent() -> str:
    """
    Goldener Kreis mit Prozentzeichen - aus Ringen und Balken gezeichnet,
    damit keine Schriftart noetig ist.
    """
    return f"""  <g transform="translate(812 168)">
    <circle cx="96" cy="96" r="112" fill="{BLAU_DUNKEL}" opacity="0.35"/>
    <circle cx="96" cy="96" r="95" fill="url(#gold)"/>
    <circle cx="62" cy="62" r="24" fill="none" stroke="{BLAU_DUNKEL}" stroke-width="17"/>
    <circle cx="130" cy="130" r="24" fill="none" stroke="{BLAU_DUNKEL}" stroke-width="17"/>
    <line x1="140" y1="46" x2="52" y2="146" stroke="{BLAU_DUNKEL}"
          stroke-width="19" stroke-linecap="round"/>
  </g>"""


def main() -> None:
    for name, inhalt in (("krone", krone()), ("prozent", prozent())):
        svg = grundlage(inhalt)
        svg_pfad = HIER / f"vip-belaege-{name}.svg"
        svg_pfad.write_text(svg, encoding="utf-8")

        for groesse in (1200, 512):
            ziel = HIER / f"vip-belaege-{name}-{groesse}.png"
            cairosvg.svg2png(
                bytestring=svg.encode("utf-8"),
                write_to=str(ziel),
                output_width=groesse,
                output_height=groesse,
            )
            print(f"  {ziel.name}  ({ziel.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
