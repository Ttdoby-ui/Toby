#!/usr/bin/env python3
"""
Setzt Werte in der .env - liest KEY=VALUE-Zeilen von der Standardeingabe.

Gedacht fuer den Aufruf ueber ssh, wenn kein Editor zur Verfuegung steht:

    "SCHLUESSEL=wert" | ssh root@server "bash /home/futurespin/einstellungen/setenv.sh"

Warum ueber die Standardeingabe und nicht als Argument: Argumente stehen in der
Prozessliste des Servers und im Verlauf der lokalen Konsole. Die Eingabe nicht.

Vorhandene Zeilen werden ersetzt, unbekannte Schluessel angehaengt, alles
uebrige bleibt unveraendert - insbesondere der FLASK_SECRET_KEY.
"""

import pathlib
import sys

ENV = pathlib.Path("/home/futurespin/einstellungen/.env")


def main() -> int:
    if not ENV.exists():
        print(f"{ENV} fehlt - erst install.sh laufen lassen.")
        return 1

    zeilen = ENV.read_text(encoding="utf-8").splitlines()
    gesetzt = []

    for roh in sys.stdin.read().splitlines():
        # Windows-Zeilenenden abschneiden, sonst landet ein \r im Wert und
        # Shopify lehnt den Header spaeter ab.
        eintrag = roh.strip().rstrip("\r")
        if not eintrag or eintrag.startswith("#") or "=" not in eintrag:
            continue
        schluessel, wert = eintrag.split("=", 1)
        schluessel = schluessel.strip()
        wert = wert.strip()
        if not schluessel or not wert:
            continue

        for i, z in enumerate(zeilen):
            if z.split("=", 1)[0].strip() == schluessel:
                zeilen[i] = f"{schluessel}={wert}"
                break
        else:
            zeilen.append(f"{schluessel}={wert}")
        gesetzt.append(schluessel)

    if not gesetzt:
        print("Keine verwertbaren Zeilen empfangen - nichts geaendert.")
        return 1

    ENV.write_text("\n".join(zeilen) + "\n", encoding="utf-8")
    for schluessel in gesetzt:
        print(f"  gesetzt: {schluessel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
