#!/usr/bin/env bash
#
# Werte in die .env schreiben, Dienst neu starten, Selbsttest laufen lassen.
# Liest KEY=VALUE-Zeilen von der Standardeingabe - siehe setenv.py.
set -euo pipefail

ZIEL=/home/futurespin/einstellungen

python3 "$ZIEL/setenv.py"

chown futurespin:futurespin "$ZIEL/.env"
chmod 600 "$ZIEL/.env"

echo "==> Dienst neu starten"
systemctl restart einstellungen
sleep 2
systemctl is-active einstellungen

echo "==> Selbsttest"
cd "$ZIEL" && sudo -u futurespin .venv/bin/python selftest.py
