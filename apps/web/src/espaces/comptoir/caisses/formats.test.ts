import { describe, expect, it } from 'vitest';

import { jourAvecSemaine, jourCourt } from './formats.ts';

describe('jours des caisses', () => {
  it('écrit « lun. 12 oct. » en français et « Mon Oct 12 » en anglais, comme la maquette', () => {
    expect(jourAvecSemaine('2026-10-12', 'fr')).toBe('lun. 12 oct.');
    expect(jourAvecSemaine('2026-10-12', 'en')).toBe('Mon Oct 12');
    expect(jourAvecSemaine('2026-10-14', 'fr')).toBe('mer. 14 oct.');
  });

  it('abrège le jour seul', () => {
    expect(jourCourt('2026-10-15', 'fr')).toBe('15 oct.');
    expect(jourCourt('2026-10-15', 'en')).toBe('Oct 15');
  });

  it('dit « 1er » le premier du mois en français', () => {
    expect(jourCourt('2026-11-01', 'fr')).toBe('1er nov.');
    expect(jourCourt('2026-11-01', 'en')).toBe('Nov 1');
  });
});
