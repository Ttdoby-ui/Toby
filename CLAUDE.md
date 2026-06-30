# Toby – Shopify Theme Projekt

## Shopify Theme-Regeln

- **Alle Änderungen zuerst in einem UNVERÖFFENTLICHTEN Entwurfs-Theme** – niemals direkt ins aktive/live (MAIN) Theme ohne ausdrückliche Anweisung
- Erst nach Abnahme durch den User ins Live-Theme übernehmen

### Aktuelle Theme-IDs (Stand 2026-06-29, via Admin-API verifiziert)

> Hinweis: Die früher hier notierten IDs (`199959052636`, `184788123996`) existieren nicht mehr. Theme-IDs ändern sich bei jedem Kopier-/Update-Vorgang – vor dem Pushen immer per `themes`-Query gegenprüfen.

- **Entwurf-Horizon** (UNPUBLISHED): `gid://shopify/OnlineStoreTheme/200401420636`
- **Aktives Arbeits-Entwurf** „Aktualisierte Kopie von Kopie von Entwurf-Horizon" (UNPUBLISHED): `gid://shopify/OnlineStoreTheme/200523612508` – enthält die gesamte Futurespin-Custom-Arbeit (Schläger-Finder, Produkt-Vergleich, FAQ/Schema, Google-Bewertung etc.)
- **Entwurf-Futurespin** (UNPUBLISHED, **aktives Design-System-Theme**): `gid://shopify/OnlineStoreTheme/200580792668` – Horizon-Kopie mit gesamter Custom-Arbeit; hier laufen die neuen `fs-`-Design-System-Sections.
- **futurespin live** (MAIN, schreibgeschützt): `gid://shopify/OnlineStoreTheme/200523088220`
- **Enterprise** (DEMO/Testversion): `gid://shopify/OnlineStoreTheme/200576827740`

> **Entscheidung (2026-06-30): Wir bleiben auf Horizon.** Enterprise ist verworfen.
> (Hintergrund: Enterprise ist eine DEMO-Testversion – Shopify sperrt den
> Code-Zugriff auf nicht gekaufte Theme-Store-Themes, „Zugriff verweigert".)
> `theme/ENTERPRISE-MIGRATION.md` ist damit nur noch Archiv.

Store: `e7ee88-2.myshopify.com` (futurespin.de). Theme-Basis: **Horizon** (Block-Architektur), Schriften Outfit (Body) / Archivo (Headlines).

### Design System & Deployment

- Versionierte `fs-`-Sections liegen unter `theme/sections/`; Design-System-Doku: `theme/DESIGN-SYSTEM.md`.
- Deploy in **unveröffentlichte** Themes via Admin-API `themeFilesUpsert` (byte-genau via Roh-GitHub-URL, Repo ist öffentlich). **Wichtig:** `body type: URL` meldet Validierungsfehler **stillschweigend** (Datei erscheint dann einfach nicht) – bei Problemen `type: BASE64` nutzen, das liefert die synchrone Fehlermeldung.
- Schema-Stolpersteine: `header`-`content` max. **50 Zeichen**; ein Liquid-Filter (`| escape`) muss in `image_tag` das **letzte** Argument sein.

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
