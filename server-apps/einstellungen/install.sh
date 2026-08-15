#!/usr/bin/env bash
#
# Installiert/aktualisiert die App "Futurespin Einstellungen" auf dem Server.
#
# Aufruf (als root, per ssh):
#   curl -fsSL <raw-url>/install.sh | bash
#
# Idempotent: mehrfach ausfuehrbar. Eine vorhandene .env und die Datenbank
# werden NIE ueberschrieben - ein erneuter Lauf ist also das Update.
#
# Die Dateien kommen per curl direkt aus dem Repo. Das ist bewusst so: beim
# Kopieren ueber eine Windows-Konsole gehen Umlaute gern doppelt kodiert durch
# (siehe Skill futurespin-server), ein Download ist byte-exakt.

set -euo pipefail

REPO_RAW="${REPO_RAW:?REPO_RAW nicht gesetzt}"   # z.B. https://raw.githubusercontent.com/user/repo/<sha>
ZIEL=/home/futurespin/einstellungen
NUTZER=futurespin
PORT="${PORT:-5001}"

echo "==> Zielverzeichnis $ZIEL"
id -u "$NUTZER" >/dev/null 2>&1 || { echo "Benutzer $NUTZER fehlt."; exit 1; }
install -d -o "$NUTZER" -g "$NUTZER" "$ZIEL" "$ZIEL/templates"

hole() {
  local pfad="$1"
  local tmp
  tmp="$(mktemp)"
  # --fail, damit ein 404 nicht als HTML-Fehlerseite in der Datei landet.
  curl -fsSL "$REPO_RAW/server-apps/einstellungen/$pfad" -o "$tmp"
  install -o "$NUTZER" -g "$NUTZER" -m 644 "$tmp" "$ZIEL/$pfad"
  rm -f "$tmp"
  echo "    $pfad"
}

echo "==> Dateien laden"
for f in app.py rabatte.py shopify_api.py requirements.txt einstellungen.service; do hole "$f"; done
for f in base.html login.html index.html rabatt.html bestaetigen.html protokoll.html fehler.html; do
  hole "templates/$f"
done

echo "==> Virtuelle Umgebung"
if [ ! -x "$ZIEL/.venv/bin/python" ]; then
  sudo -u "$NUTZER" python3 -m venv "$ZIEL/.venv"
fi
sudo -u "$NUTZER" "$ZIEL/.venv/bin/pip" install --quiet --upgrade pip
sudo -u "$NUTZER" "$ZIEL/.venv/bin/pip" install --quiet -r "$ZIEL/requirements.txt"

echo "==> .env"
if [ -f "$ZIEL/.env" ]; then
  echo "    vorhanden - bleibt unveraendert"
else
  GEHEIM="$(python3 -c 'import secrets;print(secrets.token_hex(32))')"
  cat > "$ZIEL/.env" <<ENV
SHOPIFY_STORE_DOMAIN=e7ee88-2.myshopify.com
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
EINSTELLUNGEN_PASSWORT=
FLASK_SECRET_KEY=$GEHEIM
PORT=$PORT
ENV
  chown "$NUTZER:$NUTZER" "$ZIEL/.env"
  chmod 600 "$ZIEL/.env"
  echo "    neu angelegt - muss noch ausgefuellt werden"
fi

echo "==> systemd"
install -m 644 "$ZIEL/einstellungen.service" /etc/systemd/system/einstellungen.service
systemctl daemon-reload
systemctl enable --quiet einstellungen
systemctl restart einstellungen
sleep 2

echo "==> Pruefung"
systemctl is-active einstellungen || true
CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/healthz" || true)"
echo "    healthz: HTTP $CODE"

echo
if grep -q '^EINSTELLUNGEN_PASSWORT=$' "$ZIEL/.env" 2>/dev/null; then
  cat <<'HINWEIS'
NOCH ZU TUN
  1) nano /home/futurespin/einstellungen/.env
     - SHOPIFY_API_KEY / SHOPIFY_API_SECRET  (App "VIP Belaege Discount")
     - EINSTELLUNGEN_PASSWORT                (Login fuer die Oberflaeche)
  2) systemctl restart einstellungen
  3) Caddy-Block ergaenzen, siehe README.md
HINWEIS
else
  echo "Fertig. Bei Aenderungen: systemctl restart einstellungen"
fi
