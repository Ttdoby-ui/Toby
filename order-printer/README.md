# Order Printer – B2B-Rechnung (Netto-Ausweis)

`rechnung-b2b.liquid` ist eine Rechnungsvorlage für die **Shopify Order Printer**
App – im selben Stil wie die Standard-Vorlage, aber mit **Netto-Positionen +
MwSt-Aufschlüsselung nach Steuersätzen** für Geschäftskunden (B2B1/B2B2/B2B3).

> Empfehlung: Als **separate** Vorlage „Rechnung B2B" anlegen und für
> B2B-Bestellungen nutzen. Endkunden (B2C) erhalten weiter die Standard-Vorlage
> mit Brutto-Ausweis (gesetzeskonform für Verbraucher).

## Einrichtung

1. Shopify Admin → **Order Printer** öffnen.
2. **Vorlagen → Vorlage hinzufügen**, Name z. B. `Rechnung B2B`.
3. Inhalt von `rechnung-b2b.liquid` komplett einfügen, speichern.
4. Bestellung → **Mehr Aktionen → Drucken → Rechnung B2B**.

## Vor dem Einsatz ausfüllen

- **USt-IdNr.** eintragen (Platzhalter `DE000000000` ersetzen).
- **Absenderadresse**: Einstellungen → Geschäftsdaten.
- Voraussetzungen (Shop-Konfiguration, aktuell erfüllt): „Preise inkl. MwSt"
  und Versand unbesteuert (`taxShipping = false`).

## Erfüllte Pflichtangaben (§14 UStG)

Name/Anschrift Verkäufer **+ USt-IdNr.**, Name/Anschrift Käufer,
Rechnungsdatum, **Liefer-/Leistungsdatum**, fortlaufende Rechnungsnummer
(`R` + Bestellnummer + 1000), Menge/Art der Artikel, **nach Steuersätzen
aufgeschlüsseltes Netto-Entgelt**, **Steuersatz + Steuerbetrag**, Bruttobetrag.

**Mit Steuerberater abstimmen:**
1. Rechnungsnummernkreis (hier Bestellnummer + 1000) freigeben.
2. Revisionssichere Archivierung (GoBD) separat sicherstellen – Order Printer
   erzeugt PDFs nur auf Abruf.
