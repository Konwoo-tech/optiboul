import { describe, expect, it } from 'vitest';

import { libelleDeCopie, peutGererLesSauvegardes } from './regles.ts';

describe('droit sur les sauvegardes', () => {
  it('est réservé à l’administrateur (cahier des charges §3.3)', () => {
    expect(peutGererLesSauvegardes('administrateur')).toBe(true);
    for (const profil of ['caissier', 'gerant', 'production', 'proprietaire'] as const) {
      expect(peutGererLesSauvegardes(profil)).toBe(false);
    }
    expect(peutGererLesSauvegardes(null)).toBe(false);
    expect(peutGererLesSauvegardes(undefined)).toBe(false);
  });
});

describe('libellé d’une copie', () => {
  it('donne la date courte et l’heure de la boulangerie (UTC+1)', () => {
    expect(libelleDeCopie('2026-10-14T20:30:00Z')).toBe('14 oct. 21:30');
    expect(libelleDeCopie('2026-10-12T16:52:00Z')).toBe('12 oct. 17:52');
  });

  it('change de jour avec le fuseau', () => {
    expect(libelleDeCopie('2026-10-13T23:30:00Z')).toBe('14 oct. 00:30');
  });
});
