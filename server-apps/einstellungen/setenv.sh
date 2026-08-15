#!/usr/bin/env bash
#
# Werte in die .env schreiben, Dienst neu starten, Selbsttest laufen lassen.
#
# Zwei Betriebsarten:
#
#   1. Interaktiv (ssh -t ...) - der Server fragt die Werte ab.
#      Empfohlen: nichts landet im Verlauf der lokalen Konsole, und das
#      Einfuegen mehrzeiliger Blocks in PowerShell kann nicht schiefgehen
#      (dort verschluckt Read-Host die restlichen eingefuegten Zeilen).
#
#   2. Ueber die Standardeingabe - KEY=VALUE-Zeilen, eine pro Zeile.
#      Fuer Automatisierung.
#
set -euo pipefail

ZIEL=/home/futurespin/einstellungen

if [ -t 0 ]; then
  echo "Zugangsdaten fuer die Einstellungs-Oberflaeche"
  echo "Leer lassen und Enter druecken = Wert bleibt unveraendert."
  echo
  read -rp "SHOPIFY_API_KEY     : " KEY || true
  read -rp "SHOPIFY_API_SECRET  : " SECRET || true
  read -rsp "EINSTELLUNGEN_PASSWORT (Eingabe unsichtbar): " PW || true
  echo
  read -rsp "Passwort wiederholen                       : " PW2 || true
  echo
  echo

  if [ -n "${PW:-}" ] && [ "${PW:-}" != "${PW2:-}" ]; then
    echo "Die beiden Passwoerter stimmen nicht ueberein - nichts geaendert."
    exit 1
  fi

  EINGABE=""
  [ -n "${KEY:-}" ]    && EINGABE="${EINGABE}SHOPIFY_API_KEY=${KEY}"$'\n'
  [ -n "${SECRET:-}" ] && EINGABE="${EINGABE}SHOPIFY_API_SECRET=${SECRET}"$'\n'
  [ -n "${PW:-}" ]     && EINGABE="${EINGABE}EINSTELLUNGEN_PASSWORT=${PW}"$'\n'

  if [ -z "$EINGABE" ]; then
    echo "Nichts eingegeben - nichts geaendert."
    exit 1
  fi

  printf '%s' "$EINGABE" | python3 "$ZIEL/setenv.py"
else
  python3 "$ZIEL/setenv.py"
fi

chown futurespin:futurespin "$ZIEL/.env"
chmod 600 "$ZIEL/.env"

echo
echo "==> Dienst neu starten"
systemctl restart einstellungen
sleep 2
systemctl is-active einstellungen

echo
echo "==> Selbsttest"
cd "$ZIEL" && sudo -u futurespin .venv/bin/python selftest.py

echo
echo "==> Weiterleitung pruefen (muss den Unterpfad enthalten)"
curl -s -o /dev/null -D - -H 'X-Forwarded-Prefix: /einstellungen' \
  http://127.0.0.1:5001/einstellungen/ | grep -i '^location' || true
