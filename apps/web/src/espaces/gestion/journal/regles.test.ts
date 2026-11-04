import { describe, expect, it } from 'vitest';

import {
  erreurDeFiltre,
  filtreActif,
  horodatage,
  peutVoirJournal,
  repondAuxFiltres,
  typeDeLAction,
} from './regles.ts';
import { SANS_FILTRE, type EntreeJournal } from './types.ts';

const entree: EntreeJournal = {
  id: 'J-1',
  quand: '2026-10-14T20:41:00.000Z',
  jour: '2026-10-14',
  heure: '21:41',
  auteur: 'Davy',
  profil: 'caissier',
  type: 'session',
  texte: 'Livraison',
};

describe('droit de consulter le journal (cahier des charges §3.3)', () => {
  it('gérant, propriétaire et administrateur seulement', () => {
    expect(peutVoirJournal('gerant')).toBe(true);
    expect(peutVoirJournal('proprietaire')).toBe(true);
    expect(peutVoirJournal('administrateur')).toBe(true);
    expect(peutVoirJournal('caissier')).toBe(false);
    expect(peutVoirJournal('production')).toBe(false);
    expect(peutVoirJournal(null)).toBe(false);
    expect(peutVoirJournal(undefined)).toBe(false);
  });
});

describe('filtres', () => {
  it('sans filtre, tout passe', () => {
    expect(repondAuxFiltres(entree, SANS_FILTRE)).toBe(true);
    expect(filtreActif(SANS_FILTRE)).toBe(false);
  });

  it('auteur, type et période (bornes comprises)', () => {
    const f = { ...SANS_FILTRE };
    expect(repondAuxFiltres(entree, { ...f, auteur: 'Davy' })).toBe(true);
    expect(repondAuxFiltres(entree, { ...f, auteur: 'Willy' })).toBe(false);
    expect(repondAuxFiltres(entree, { ...f, type: 'session' })).toBe(true);
    expect(repondAuxFiltres(entree, { ...f, type: 'caisse' })).toBe(false);
    expect(repondAuxFiltres(entree, { ...f, du: '2026-10-14', au: '2026-10-14' })).toBe(true);
    expect(repondAuxFiltres(entree, { ...f, du: '2026-10-15' })).toBe(false);
    expect(repondAuxFiltres(entree, { ...f, au: '2026-10-13' })).toBe(false);
    expect(filtreActif({ ...f, auteur: 'Davy' })).toBe(true);
  });

  it('valide la période', () => {
    expect(erreurDeFiltre(SANS_FILTRE)).toBeNull();
    expect(erreurDeFiltre({ ...SANS_FILTRE, du: '2026-10-01', au: '2026-10-01' })).toBeNull();
    expect(erreurDeFiltre({ ...SANS_FILTRE, du: '2026-10-02', au: '2026-10-01' })).toBe(
      'periode-inversee',
    );
    expect(erreurDeFiltre({ ...SANS_FILTRE, du: 'hier' })).toBe('periode-invalide');
  });
});

describe('horodatage et type', () => {
  it('une action du jour n’affiche que l’heure, une plus ancienne ajoute le jour', () => {
    const court = (j: string) => `[${j}]`;
    expect(horodatage(entree, '2026-10-14', court)).toBe('21:41');
    expect(horodatage(entree, '2026-10-15', court)).toBe('[2026-10-14] 21:41');
  });

  it('les décisions et demandes forment le type « demande »', () => {
    expect(typeDeLAction('stock', 'Accord – Inventaire AUD-08')).toBe('demande');
    expect(typeDeLAction('stock', 'Refus – Dépense DEP-0017')).toBe('demande');
    expect(typeDeLAction('session', 'Demande d’autorisation : Alex')).toBe('demande');
    expect(typeDeLAction('session', 'Autorisation de dépassement du plafond : Alex')).toBe(
      'demande',
    );
    expect(typeDeLAction('stock', 'Mouvement de stock manuel')).toBe('stock');
  });

  it('range les libellés réels des faux serveurs : décisions en « demande », le reste à l’écran appelant', () => {
    // Libellés émis par comptoir.ts et depenses.ts.
    expect(typeDeLAction('session', 'Accord – Livraison au-delà du plafond : Brice')).toBe(
      'demande',
    );
    expect(typeDeLAction('session', 'Refus – Livraison au-delà du plafond : Brice')).toBe(
      'demande',
    );
    expect(typeDeLAction('depense', 'Refus – Dépense DEP-0014')).toBe('demande');
    expect(typeDeLAction('session', 'Demande d’autorisation : Brice')).toBe('demande');
    expect(typeDeLAction('production', 'Demande d’augmentation de production : +1 sac')).toBe(
      'demande',
    );
    expect(typeDeLAction('session', 'Livraison Alex – 5 000 FCFA dû, 4 000 reçu')).toBe('session');
    expect(typeDeLAction('depense', 'Dépense DEP-0017 : Joint – 8 000 FCFA')).toBe('depense');
    expect(typeDeLAction('depense', 'Dépense soumise : Réparation du pétrin')).toBe('depense');
    expect(typeDeLAction('caisse', 'Fermeture de caisse · écart -500 FCFA')).toBe('caisse');
    expect(typeDeLAction('connexion', 'Connexion via e-mail')).toBe('connexion');
  });
});
