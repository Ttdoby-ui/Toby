# Futurespin Einstellungen

Weboberfläche für die kopflosen Shopify-Apps. **v1 deckt die Kollektionsrabatte ab.**

## Warum

Die App „VIP Beläge Discount" hat keine Admin-UI-Extension. Klickt man ihre Rabatte im
Shopify-Admin an, leitet Shopify auf die `application_url` um (futurespin.de) – es gibt gar
kein Formular. Staffeln ließen sich bisher nur über einen GitHub-Workflow oder direkte
API-Aufrufe ändern. Diese Seite schließt die Lücke.

## Was sie kann

| | |
|---|---|
| Übersicht | alle Rabatte mit `kollektionsrabatt.config`-Metafeld: Status, Kollektion, Staffeln, VIP-Stufen |
| Bearbeiten | Mengenstaffeln (bis 5) und VIP-Stufen (bis 5) |
| Schutz | Plausibilitätsprüfung, Vorher-Nachher-Vergleich, Bestätigungsschritt |
| Protokoll | jede Änderung mit Zeitpunkt und vollständigem Vorzustand in SQLite |

**Nicht dabei**, weil im Function-Code fest verdrahtet (Änderung braucht `shopify app deploy`):
`pos-abrundung` (`STEP_CENTS`) und `hide-b2b-versand` (B2B-Tagliste). Beides ließe sich
nachrüsten, indem man die Werte ebenfalls in ein Metafeld verlegt.

## 🚨 Kein Entwurf/Live

Rabatt-Functions kennen keine Vorschau. Was gespeichert wird, gilt **sofort** im Warenkorb
aller Kunden. Deshalb der Bestätigungsschritt – und deshalb das Protokoll, aus dem sich der
Vorzustand jederzeit ablesen und von Hand zurückschreiben lässt.

## Token

Zwei Wege, in `.env`:

1. **Empfohlen – Client-Credentials der App „VIP Beläge Discount"** (`SHOPIFY_API_KEY` +
   `SHOPIFY_API_SECRET`). Derselbe Weg wie in `vip-discount-function/scripts/create-kollektionsrabatt.mjs`,
   dort erprobt. Vorteil: damit sind später auch Mutationen möglich, die **nur die besitzende
   App** ausführen darf – Rabatt aktivieren/pausieren, `combinesWith`.
   ⚠️ Der Token kommt vom OAuth-Endpunkt **des Stores** (`https://<shop>.myshopify.com/admin/oauth/access_token`),
   nicht von `api.shopify.com` – letzterer liefert nur einen App-Management-Token, den die
   Admin-API mit 401 ablehnt.
2. **Alternative – fertiger Admin-Token** (`SHOPIFY_ACCESS_TOKEN`) mit `write_discounts`.
   Reicht für das Config-Metafeld, nicht für die App-eigenen Mutationen.

## Aufspielen

```bash
sudo -u futurespin mkdir -p /home/futurespin/einstellungen
# Dateien aus server-apps/einstellungen/ dorthin kopieren
sudo -u futurespin python3 -m venv /home/futurespin/einstellungen/.venv
sudo -u futurespin /home/futurespin/einstellungen/.venv/bin/pip install -r requirements.txt

sudo -u futurespin cp .env.example /home/futurespin/einstellungen/.env
sudo -u futurespin chmod 600 /home/futurespin/einstellungen/.env
# .env ausfüllen: Store-Domain, Zugangsdaten, Passwort, FLASK_SECRET_KEY
#   FLASK_SECRET_KEY erzeugen: python3 -c "import secrets;print(secrets.token_hex(32))"

sudo cp einstellungen.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now einstellungen
systemctl is-active einstellungen
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5001/healthz    # 200
```

Port **5001** – 5000 gehört der Logistik-App. Lauscht nur auf `127.0.0.1`.

**Caddy** (neue Subdomain vorher bei XONIC erbitten, Typ A → `152.53.145.162`, Proxy **aus**):

```
einstellungen.futurespin.de {
	encode zstd gzip
	reverse_proxy 127.0.0.1:5001
}
```

Danach `systemctl reload caddy`. Kein eigenes Log-Verzeichnis angeben – Caddy darf dort nicht
schreiben und verweigert sonst das Neuladen.

**Ohne eigene Subdomain** geht auch ein Unterpfad der bestehenden Domain:

```
app.futurespin.de {
	encode zstd gzip
	handle_path /einstellungen/* { reverse_proxy 127.0.0.1:5001 }
	reverse_proxy 127.0.0.1:5000
}
```

**Sicherung**: `einstellungen.db` in `sicherung.sh` ergänzen – dort steht das Änderungsprotokoll.

## Nach Änderungen

```bash
systemctl restart einstellungen
journalctl -u einstellungen -n 40 --no-pager
```

## Tests

`app.py`, `rabatte.py` und die Templates sind mit einem Stub gegen die echte Konfiguration
geprüft (18 Fälle: Login, Rendering, Plausibilitätsprüfungen, Bestätigungsschritt,
Schreibvorgang, Protokoll). Der Stub ersetzt `rabatte.list_discounts` und `rabatte.save_config`,
es geht dabei nichts an den Live-Shop.

## Später

- `pos-abrundung` und `hide-b2b-versand` auf Metafelder umstellen → auch ohne Deploy einstellbar
- Rabatt aktivieren/pausieren (braucht Weg 1 beim Token)
- Prüfung „liegt ein Artikel gleichzeitig in VIP- und Belag-Kollektion?" – genau der Fehler
  vom 05.08.2026, als Beläge ohne `Belag`-Tag von zwei Rabatt-Functions erfasst wurden
- UVP-App und Futurespin B2B ergänzen, sobald deren Code vorliegt
