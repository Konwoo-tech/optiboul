import { describe, expect, it } from 'vitest';

import { formatFCFA } from '@/utils';

import {
  formaterValeur,
  memeValeur,
  messageDeLErreur,
  peutConsulterParametres,
  peutModifierParametres,
  validerValeur,
} from './regles.ts';

const montant = { genre: 'montant', choix: [], minimum: null, maximum: null } as const;
const pourcentage = { genre: 'pourcentage', choix: [], minimum: null, maximum: null } as const;
const jourDePaie = { genre: 'entier', choix: [], minimum: 1, maximum: 28 } as const;
const inactivite = { genre: 'choix', choix: [1, 5, 10, 15], minimum: null, maximum: null } as const;
const heure = { genre: 'heure', choix: [], minimum: null, maximum: null } as const;
const jour = { genre: 'jour', choix: [], minimum: null, maximum: null } as const;
const jours = { genre: 'jours', choix: [], minimum: null, maximum: null } as const;

describe('droits sur les paramètres (§3.3)', () => {
  it('le propriétaire modifie, l’administrateur consulte, les autres n’ont rien', () => {
    expect(peutModifierParametres('proprietaire')).toBe(true);
    expect(peutModifierParametres('administrateur')).toBe(false);
    expect(peutConsulterParametres('proprietaire')).toBe(true);
    expect(peutConsulterParametres('administrateur')).toBe(true);
    for (const profil of ['caissier', 'gerant', 'production', null, undefined] as const) {
      expect(peutConsulterParametres(profil)).toBe(false);
      expect(peutModifierParametres(profil)).toBe(false);
    }
  });
});

describe('validerValeur', () => {
  it('accepte un montant entier positif ou nul, refuse le reste', () => {
    expect(validerValeur(montant, 3_000)).toEqual({ ok: true, valeur: 3_000 });
    expect(validerValeur(montant, 0)).toEqual({ ok: true, valeur: 0 });
    for (const faux of [1.5, '2000', null, true, Number.NaN]) {
      expect(validerValeur(montant, faux)).toEqual({ ok: false, erreur: { code: 'entier' } });
    }
    expect(validerValeur(montant, -1)).toEqual({
      ok: false,
      erreur: { code: 'bornes', minimum: 0, maximum: null },
    });
  });

  it('borne un pourcentage à 100 et un entier à ses bornes', () => {
    expect(validerValeur(pourcentage, 100).ok).toBe(true);
    expect(validerValeur(pourcentage, 101)).toEqual({
      ok: false,
      erreur: { code: 'bornes', minimum: 0, maximum: 100 },
    });
    expect(validerValeur(jourDePaie, 28).ok).toBe(true);
    expect(validerValeur(jourDePaie, 29).ok).toBe(false);
    expect(validerValeur(jourDePaie, 0).ok).toBe(false);
  });

  it('n’accepte qu’une valeur permise pour un choix', () => {
    expect(validerValeur(inactivite, 10).ok).toBe(true);
    expect(validerValeur(inactivite, 7)).toEqual({
      ok: false,
      erreur: { code: 'choix', permis: [1, 5, 10, 15] },
    });
    expect(validerValeur(inactivite, '5').ok).toBe(false);
  });

  it('contrôle les heures et les jours', () => {
    expect(validerValeur(heure, '09:05').ok).toBe(true);
    for (const faux of ['9:05', '24:00', '10:60', 1000, null]) {
      expect(validerValeur(heure, faux)).toEqual({ ok: false, erreur: { code: 'heure' } });
    }
    expect(validerValeur(jour, 'jeudi').ok).toBe(true);
    expect(validerValeur(jour, 'Jeudi')).toEqual({ ok: false, erreur: { code: 'jour' } });
  });

  it('range une liste de jours dans l’ordre de la semaine, sans doublon', () => {
    expect(validerValeur(jours, ['samedi', 'jeudi', 'samedi'])).toEqual({
      ok: true,
      valeur: ['jeudi', 'samedi'],
    });
    for (const faux of [[], ['funday'], 'lundi', null]) {
      expect(validerValeur(jours, faux)).toEqual({ ok: false, erreur: { code: 'jours' } });
    }
  });
});

describe('messages et formats', () => {
  it('formule chaque refus', () => {
    expect(messageDeLErreur({ code: 'bornes', minimum: 1, maximum: 24 })).toBe(
      'Valeur attendue entre 1 et 24.',
    );
    expect(messageDeLErreur({ code: 'bornes', minimum: 0, maximum: null })).toBe(
      'Valeur attendue entre 0 et ∞.',
    );
    expect(messageDeLErreur({ code: 'choix', permis: [1, 5] })).toBe('Valeur permise : 1, 5.');
    expect(messageDeLErreur({ code: 'entier' })).toBe('Nombre entier attendu.');
    expect(messageDeLErreur({ code: 'heure' })).toContain('HH:MM');
    expect(messageDeLErreur({ code: 'jour' })).toContain('lundi');
    expect(messageDeLErreur({ code: 'jours' })).toContain('Liste');
  });

  it('compare les listes élément par élément', () => {
    expect(memeValeur(['jeudi'], ['jeudi'])).toBe(true);
    expect(memeValeur(['jeudi'], ['jeudi', 'samedi'])).toBe(false);
    expect(memeValeur(5, 5)).toBe(true);
    expect(memeValeur(5, '5')).toBe(false);
  });

  it('écrit la valeur avec son unité', () => {
    expect(formaterValeur({ genre: 'montant', unite: 'FCFA' }, 20_000)).toBe(formatFCFA(20_000));
    expect(formaterValeur({ genre: 'pourcentage', unite: '% de la moyenne' }, 10)).toBe('10 %');
    expect(formaterValeur({ genre: 'entier', unite: 'heures (et à chaque clôture)' }, 4)).toBe(
      '4 heures',
    );
    expect(formaterValeur({ genre: 'entier', unite: '' }, 3)).toBe('3');
    expect(formaterValeur({ genre: 'jours', unite: '' }, ['jeudi', 'samedi'])).toBe(
      'jeudi, samedi',
    );
    expect(formaterValeur({ genre: 'heure', unite: '' }, '10:00')).toBe('10:00');
  });
});
