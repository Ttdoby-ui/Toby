# Shopify → DATEV Export (eingebettete App)

Exportiert Shopify-Bestellungen als **DATEV-Buchungsstapel (EXTF, Datenkategorie 21)**
mit eindeutiger Zuordnung der **Zahlungsweise** (Kreditkarte/Shopify Payments, Rechnung,
Bar, PayPal, Klarna …) zum passenden **DATEV-Gegenkonto** und Bezug zur **Rechnungsnummer**
(Belegfeld 1). Kontenrahmen: **SKR03** (überschreibbar).

## Status

| Baustein | Stand |
|---|---|
| DATEV-Export-Engine (`lib/`) | ✅ fertig & getestet (`npm test`, 5/5 grün) |
| Zahlart-Erkennung | ✅ fertig |
| SKR03-Konten-Mapping | ✅ fertig (Defaults, pro Shop überschreibbar) |
| Eingebettetes App-Gerüst (OAuth/UI) | ⏳ nächster Schritt – siehe „Deploy" |

Die Engine ist bewusst unabhängig vom App-Rahmen gehalten: sie nimmt rohe Shopify-Orders
entgegen und liefert den fertigen EXTF-String. Dadurch ist sie isoliert testbar und
sowohl in der eingebetteten App als auch (übergangsweise) in einem GitHub-Action-Skript nutzbar.

## Engine im Überblick

```
lib/
├── payment-methods.mjs   Erkennt die Zahlungsweise aus order.transactions / gateways
├── skr03-accounts.mjs    Zahlart → Geldkonto, USt-Satz → Erlöskonto (SKR03-Defaults)
├── datev-extf.mjs        Baut den EXTF-Buchungsstapel (Header + Spalten + Buchungssätze)
└── datev-extf.test.mjs   Tests mit Beispiel-Bestellungen
```

Beispiel-Ausgabe (gekürzt):

```
"EXTF";700;21;"Buchungsstapel";13;…;1234567;1001;20260101;4;20260601;20260630;"Shopify Juni 2026";…
"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen";…;"Konto";"Gegenkonto (ohne BU-Schlüssel)";…;"Belegfeld 1";…
119,00;S;"EUR";;;;1361;8400;;1706;"8897";"8897";;"Shopify Payments (Kreditkarte) #8897"
54,00;S;"EUR";;;;1200;8400;;1806;"8898";"8898";;"Rechnung / Vorkasse (Überweisung) #8898"
```

→ Kreditkarte bucht auf Verrechnungskonto **1361**, Rechnung/Überweisung auf Bank **1200**,
Erlöse auf **8400** (19 %) bzw. **8300** (7 %); die Rechnungsnummer steht in **Belegfeld 1**.

### Standard-Kontenzuordnung (SKR03)

| Zahlungsweise | Geld-/Verrechnungskonto |
|---|---|
| Shopify Payments (Kreditkarte) | 1361 |
| PayPal | 1362 |
| Klarna | 1363 |
| Rechnung / Vorkasse (Überweisung) | 1200 (Bank) |
| Nachnahme | 1360 (Geldtransit) |
| Barzahlung | 1000 (Kasse) |
| Gutschein | 1590 |

| Erlöskonto | Konto |
|---|---|
| Erlöse 19 % USt | 8400 |
| Erlöse 7 % USt | 8300 |
| steuerfrei | 8120 |

> Diese Konten sind Voreinstellungen. **Mit dem Steuerberater abstimmen** und in den
> App-Einstellungen je Shop anpassen (`AccountMapping` in `lib/skr03-accounts.mjs`).

## Tests

```bash
cd datev-export-app
npm test
```

## Deploy als eingebettete Shopify-App (nächster Schritt)

Die Engine ist fertig; für die eingebettete App im Shopify-Admin sind noch Schritte nötig,
die nur der Shop-/Account-Inhaber durchführen kann:

1. **Shopify-Partner-Account** anlegen (partners.shopify.com) und im Partner-Dashboard eine
   neue App erstellen → liefert `SHOPIFY_API_KEY` und `SHOPIFY_API_SECRET`.
2. **App-Framework**: empfohlen ist das offizielle Remix-Template
   (`npm init @shopify/app@latest`), in das die `lib/`-Engine 1:1 übernommen wird.
   Eine Export-Route ruft `buildExtf(orders, options)` auf und liefert die `.csv` zum Download
   (Encoding **Windows-1252/ANSI**, nicht UTF-8 – DATEV erwartet ANSI).
3. **Benötigte Scopes**: `read_orders` (bzw. `read_all_orders` für Bestellungen älter als 60 Tage).
4. **Einstellungen-Seite** (Polaris): Beraternummer, Mandantennummer, Wirtschaftsjahresbeginn,
   Kontenrahmen-Auswahl und das Konten-Mapping je Zahlart – pro Shop gespeichert.
5. **Hosting/Deploy**: z. B. Fly.io, Render oder Vercel; die App muss öffentlich erreichbar sein
   und benötigt eine Session-Datenbank (z. B. SQLite/Prisma aus dem Remix-Template).

### Wichtig zu DATEV

- Zieldatei-**Encoding Windows-1252** (ANSI). Die Engine liefert einen JS-String; beim Schreiben
  in `iconv-lite` o. ä. nach `win1252` konvertieren.
- **Festschreibung** steht im Header auf `0` (nicht festgeschrieben) – der Steuerberater schreibt
  den Stapel nach Prüfung in DATEV fest.
- **Rechnungsnummer**: Standardmäßig wird der Bestellname (`#8897` → `8897`) als Belegfeld 1 genutzt.
  Wenn echte Rechnungsnummern aus einer Rechnungs-App vorliegen, diese als `order.invoice_number`
  übergeben (z. B. aus einem Order-Metafeld).
