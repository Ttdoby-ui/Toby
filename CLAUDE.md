# Toby – Shopify Theme Projekt

## Shopify Theme-Regeln

- **Alle Änderungen zuerst im Entwurf-Theme** "Entwurf Horizon 4.1.1"
  (ID: `gid://shopify/OnlineStoreTheme/200523612508`, UNPUBLISHED)
- Erst nach Abnahme durch den User ins Live-Theme ("Futurespin Live",
  ID: `gid://shopify/OnlineStoreTheme/202301309276`, MAIN) übernehmen
- Niemals direkt ins aktive/live Theme schreiben ohne ausdrückliche Anweisung
- Es gibt ein zweites Entwurf-Theme "Entwurf-Futurespin"
  (ID: `gid://shopify/OnlineStoreTheme/200580792668`) — vor dem Arbeiten kurz
  klären, welches gemeint ist
- Theme-IDs ändern sich, wenn Themes neu angelegt/dupliziert werden. Im Zweifel
  per `themes(first: 20) { nodes { id name role } }` die aktuellen IDs holen und
  diesen Abschnitt aktualisieren, statt auf die hier notierten IDs zu vertrauen.
- Das `size`-Feld der Theme-Files-API ist **nicht** die echte Bytelänge der
  Datei — zum Vergleich zweier Themes den Dateiinhalt hashen, nicht `size`.

## Shopify App-Entwicklung (Dev Dashboard)

- Apps werden ausschließlich über das **Dev Dashboard** (`dev.shopify.com/dashboard`) erstellt — nicht mehr direkt im Shopify Admin
- **Kein statischer Access Token** — Shopify nutzt den **Client Credentials Grant** (Token läuft nach 24h ab)
- Token-Endpunkt: `POST https://api.shopify.com/auth/access_token` mit JSON-Body:
  ```json
  { "client_id": "...", "client_secret": "...", "grant_type": "client_credentials" }
  ```
- Secrets in GitHub Actions: `SHOPIFY_API_KEY` (Client-ID) + `SHOPIFY_API_SECRET` (Schlüssel) — **kein** `SHOPIFY_ACCESS_TOKEN`
- Scopes im Dev Dashboard unter **Konfiguration → Admin-API-Bereiche** setzen, dann App auf Store installieren
- Das "Schlüssel"-Feld im Dev Dashboard ist der **Client Secret** (nicht direkt als Access Token verwendbar)

## Git

- Feature-Branch: `claude/shopify-adhesive-service-vkfNR`
- Kein Push auf andere Branches ohne explizite Erlaubnis
- Kein Pull Request ohne ausdrückliche Anfrage
