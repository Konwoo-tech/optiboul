import { describe, expect, it } from 'vitest';

import {
  cloudEnRetard,
  libelleDeCopie,
  peutGererLesSauvegardes,
  SEUIL_ALERTE_CLOUD_HEURES,
} from './regles.ts';

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

describe('alerte de copie cloud en retard', () => {
  const maintenant = new Date('2026-10-14T17:02:00Z');

  it('vaut 48 h', () => expect(SEUIL_ALERTE_CLOUD_HEURES).toBe(48));

  it('alerte au-delà de 48 h exactement, pas à 48 h pile', () => {
    expect(cloudEnRetard('2026-10-12T17:02:00Z', maintenant)).toBe(false);
    expect(cloudEnRetard('2026-10-12T17:01:59Z', maintenant)).toBe(true);
    expect(cloudEnRetard('2026-10-14T16:00:00Z', maintenant)).toBe(false);
  });

  it('le scénario de la maquette (copie du 12 oct. 17:52) est en retard', () => {
    expect(cloudEnRetard('2026-10-12T16:52:00Z', maintenant)).toBe(true);
  });

  it('alerte quand il n’y a jamais eu de copie ou que la date est illisible', () => {
    expect(cloudEnRetard(null, maintenant)).toBe(true);
    expect(cloudEnRetard('pas une date', maintenant)).toBe(true);
  });

  it('ne signale pas une copie datée du futur', () => {
    expect(cloudEnRetard('2026-10-20T00:00:00Z', maintenant)).toBe(false);
  });

  it('respecte un seuil donné', () => {
    expect(cloudEnRetard('2026-10-14T10:00:00Z', maintenant, 4)).toBe(true);
    expect(cloudEnRetard('2026-10-14T14:00:00Z', maintenant, 4)).toBe(false);
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
