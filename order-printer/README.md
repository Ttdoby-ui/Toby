# Order Printer – B2B-Rechnungsvorlage (Netto zzgl. MwSt)

Die Datei `rechnung-b2b.liquid` ist eine fertige Vorlage für die kostenlose
**Shopify Order Printer** App. Sie weist den **Nettobetrag, die MwSt
(aufgeschlüsselt nach Steuersätzen) und den Bruttobetrag** aus – passend für
Geschäftskunden (Tag `b2b`).

> Hinweis: Order-Printer-Vorlagen liegen **in der App**, nicht im Theme. Sie
> lassen sich nicht per API hochladen, sondern müssen einmalig manuell
> eingefügt werden (Copy & Paste).

## Einrichtung

1. Im Shopify Admin **Order Printer** öffnen (falls nicht installiert: kostenlos
   aus dem App Store „Order Printer" von Shopify installieren).
2. **Vorlagen → Vorlage hinzufügen**.
3. Als Namen z. B. `Rechnung B2B` vergeben.
4. Den **kompletten Inhalt** von `rechnung-b2b.liquid` in das Vorlagenfeld
   einfügen und speichern.
5. Test: Eine Bestellung öffnen → **Mehr Aktionen → Drucken → Rechnung B2B**.

## Vor dem Live-Einsatz anpassen

- **USt-IdNr.** in der Vorlage eintragen (Platzhalter `DE000000000` ersetzen).
- **Absenderadresse** prüfen – sie kommt aus den Shop-Einstellungen
  (`Einstellungen → Allgemein → Geschäftsdaten`).
- Voraussetzung: Shop steht auf **„Preise inkl. MwSt"** (aktuell der Fall).
  Die Vorlage rechnet die gespeicherten Bruttobeträge in Netto um.

## Pflichtangaben & rechtlicher Hinweis

Die Vorlage enthält die nach **§14 UStG** üblichen Pflichtangaben:
Name/Anschrift von Verkäufer und Käufer, USt-IdNr., Rechnungsdatum,
Rechnungsnummer (= Bestellnummer), Menge/Art der Artikel, Lieferdatum,
nach Steuersätzen aufgeschlüsseltes Netto-Entgelt sowie Steuersatz und
Steuerbetrag.

**Zwei Punkte bitte mit dem Steuerberater abstimmen:**
1. **Fortlaufende Rechnungsnummer** – hier wird die Shopify-Bestellnummer
   verwendet. Das ist gängige Praxis, sollte aber freigegeben werden.
2. **Archivierung (GoBD)** – Order Printer erzeugt PDFs auf Abruf, archiviert
   sie aber nicht revisionssicher. Aufbewahrung separat organisieren.
