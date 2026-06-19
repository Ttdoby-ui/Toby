# Order Printer – Rechnung (eine Vorlage für B2B & B2C)

`rechnung.liquid` ist **eine** Rechnungsvorlage für die **Shopify Order Printer**
App, die automatisch unterscheidet:

- **B2B** (Kunde hat Tag `B2B1`/`B2B2`/`B2B3`): Positionen **netto**, „zzgl. MwSt".
- **B2C** (alle anderen): Positionen **brutto**, „inkl. MwSt".

In beiden Fällen wird die MwSt nach Steuersätzen aufgeschlüsselt.

## Einrichtung

1. Shopify Admin → **Order Printer** → **Vorlagen → Vorlage hinzufügen**.
2. Name z. B. `Rechnung`, Inhalt von `rechnung.liquid` einfügen, speichern.
3. Bestellung → **Mehr Aktionen → Drucken → Rechnung**.

## UNBEDINGT ausfüllen (Platzhalter ersetzen)

In der Vorlage stehen Platzhalter, die durch echte Daten ersetzt werden müssen:

- **USt-IdNr.** `DE000000000` (oder Steuernummer – eine davon genügt)
- **Steuernummer** `000/000/00000` (optional, falls keine USt-IdNr.)
- **Fußzeile (Pflichtangaben):** Rechtsform, Inhaber/Geschäftsführer, Anschrift,
  ggf. Registergericht + HRB-Nr., **Bankverbindung (IBAN/BIC)**
- Absenderadresse kommt aus **Einstellungen → Geschäftsdaten**

## Abgedeckte Pflichtangaben (§14 UStG + Geschäftsbrief)

- Name/Anschrift Verkäufer **+ USt-IdNr./Steuernummer**
- Name/Anschrift Käufer
- Rechnungsdatum **+ Liefer-/Leistungsdatum**
- Fortlaufende Rechnungsnummer (`R` + Bestellnummer + 1000)
- Menge/Art der Artikel
- **Nach Steuersätzen aufgeschlüsseltes Netto-Entgelt + Steuersatz + Steuerbetrag**
- Bruttobetrag, Zahlungsstatus
- **Zahlungsbedingungen**, Steuerbefreiungs-/Reverse-Charge-Hinweis (automatisch,
  wenn keine USt ausgewiesen wird)
- **Anbieterkennzeichnung** in der Fußzeile (Rechtsform, Register, Bankverbindung)

## Voraussetzungen (Shop-Konfiguration, aktuell erfüllt)

- „Preise inkl. MwSt" (taxesIncluded = true)
- Versand unbesteuert (taxShipping = false) → Versand netto = brutto

## Mit Steuerberater abstimmen

1. Rechnungsnummernkreis (Bestellnummer + 1000) freigeben.
2. Revisionssichere Archivierung (GoBD) separat sicherstellen.
