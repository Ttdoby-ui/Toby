/**
 * Mandanten-Konfiguration für den DATEV-Export.
 *
 * In der späteren eingebetteten App werden diese Werte pro Shop in der Datenbank
 * gespeichert und über die Einstellungen-Seite gepflegt. Bis dahin dienen sie als
 * zentrale Defaults für die Engine / ein Übergangs-Skript.
 */

import { SKR03_DEFAULT } from './lib/skr03-accounts.mjs';

export const DATEV_CONFIG = {
  // Aus den DATEV-Stammdaten des Steuerberaters
  beraterNr: 290882, // Beraternummer
  mandantNr: 15000, // Mandantennummer

  // Wirtschaftsjahresbeginn – Standard: Kalenderjahr.
  // TODO bestätigen: weicht das Wirtschaftsjahr vom Kalenderjahr ab?
  wjBeginn: '2026-01-01',

  // Kontenrahmen / Konten-Mapping (SKR03). Mit dem Steuerberater abstimmen.
  mapping: SKR03_DEFAULT,

  currency: 'EUR',
};
