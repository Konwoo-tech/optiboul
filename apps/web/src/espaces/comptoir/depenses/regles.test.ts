import { describe, expect, it } from 'vitest';

import {
  demandeDe,
  droitsDepenses,
  entierSaisi,
  erreurDeSaisie,
  exigeValidation,
  filtrerDepenses,
  niveauBudget,
  numeroDemande,
  numeroDepense,
  peutDecider,
  quantiteSaisie,
  rattachementParDefaut,
  remplissage,
  semainesAvecDepenses,
  totauxBudget,
  validateurDe,
} from './regles.ts';
import type { DemandeDepense, Depense } from './types.ts';

const depense = (extra: Partial<Depense> = {}): Depense => ({
  id: 'e1',
  numero: 1,
  date: '2026-10-14',
  semaine: 'S42',
  categorie: 'matieres',
  libelle: 'Levure',
  montant: 1000,
  mode: 'caisse',
  par: 'Davy',
  parProfil: 'caissier',
  statut: 'validee',
  photo: true,
  rattachement: { type: 'semaine' },
  ...extra,
});

describe('droits', () => {
  it('la caissière et le gérant saisissent, le propriétaire consulte', () => {
    expect(droitsDepenses('caissier')).toEqual({ voir: true, saisir: true });
    expect(droitsDepenses('gerant')).toEqual({ voir: true, saisir: true });
    expect(droitsDepenses('proprietaire')).toEqual({ voir: true, saisir: false });
  });

  it('le chef de production, l’administrateur et personne ne voient rien', () => {
    for (const profil of ['production', 'administrateur', undefined] as const) {
      expect(droitsDepenses(profil)).toEqual({ voir: false, saisir: false });
    }
  });

  it('rattache par défaut à la production pour la caissière, à la semaine pour les autres', () => {
    expect(rattachementParDefaut('caissier')).toBe('production');
    expect(rattachementParDefaut('gerant')).toBe('semaine');
  });
});

describe('validation au-dessus du seuil (R8)', () => {
  it('le seuil est inclus', () => {
    expect(exigeValidation(49_999, 50_000, 'caissier')).toBe(false);
    expect(exigeValidation(50_000, 50_000, 'caissier')).toBe(true);
    expect(exigeValidation(65_000, 50_000, 'gerant')).toBe(true);
  });

  it('la dépense du propriétaire n’attend personne', () => {
    expect(exigeValidation(900_000, 50_000, 'proprietaire')).toBe(false);
  });

  it('le gérant valide la caissière, le propriétaire valide le gérant', () => {
    expect(validateurDe('caissier')).toBe('gerant');
    expect(validateurDe('gerant')).toBe('proprietaire');
    expect(peutDecider('gerant', 'caissier')).toBe(true);
    expect(peutDecider('gerant', 'gerant')).toBe(false);
    expect(peutDecider('proprietaire', 'gerant')).toBe(true);
    expect(peutDecider('proprietaire', 'caissier')).toBe(true);
    expect(peutDecider('caissier', 'caissier')).toBe(false);
  });
});

describe('budget', () => {
  it('« à surveiller » au-dessus de 85 %, « dépassé » au-dessus de 100 % (seuils stricts)', () => {
    expect(niveauBudget(85, 100)).toBe('ok');
    expect(niveauBudget(86, 100)).toBe('surveiller');
    expect(niveauBudget(100, 100)).toBe('surveiller');
    expect(niveauBudget(101, 100)).toBe('bloquant');
    expect(niveauBudget(0, 0)).toBe('ok');
    expect(niveauBudget(1, 0)).toBe('bloquant');
  });

  it('la barre est bornée à 100 %', () => {
    expect(remplissage(50, 100)).toBe(50);
    expect(remplissage(250, 100)).toBe(100);
    expect(remplissage(0, 0)).toBe(0);
  });

  it('additionne les catégories et arrondit le pourcentage', () => {
    expect(
      totauxBudget([
        { categorie: 'eau', budget: 45_000, realise: 12_000 },
        { categorie: 'extra', budget: 30_000, realise: 5_000 },
      ]),
    ).toEqual({ budget: 75_000, realise: 17_000, pourcent: 23 });
    expect(totauxBudget([]).pourcent).toBe(0);
  });
});

describe('saisie', () => {
  const base = { libelle: 'Sel', montant: '3000', rattachement: 'semaine', quantite: '' } as const;

  it('contrôle d’abord le libellé, puis le montant, puis la quantité de stock', () => {
    expect(erreurDeSaisie({ ...base, libelle: '  ', montant: '' })).toBe('libelle');
    expect(erreurDeSaisie({ ...base, montant: '' })).toBe('montant');
    expect(erreurDeSaisie({ ...base, montant: '0' })).toBe('montant');
    expect(erreurDeSaisie({ ...base, rattachement: 'stock' })).toBe('quantite');
    expect(erreurDeSaisie({ ...base, rattachement: 'stock', quantite: '2,5' })).toBeNull();
    expect(erreurDeSaisie(base)).toBeNull();
  });

  it('lit les montants en chiffres et les quantités avec virgule ou point', () => {
    expect(entierSaisi('12 500 FCFA')).toBe(12_500);
    expect(entierSaisi('abc')).toBe(0);
    expect(quantiteSaisie('2,5')).toBe(2.5);
    expect(quantiteSaisie('2.5')).toBe(2.5);
    expect(quantiteSaisie('0')).toBe(0);
    expect(quantiteSaisie('x')).toBe(0);
  });

  it('numérote DEP-xxxx sur 4 chiffres et DEM-xxx sur 3', () => {
    expect(numeroDepense(16)).toBe('DEP-0016');
    expect(numeroDepense(12_345)).toBe('DEP-12345');
    expect(numeroDemande(21)).toBe('DEM-021');
  });
});

describe('filtres', () => {
  const liste = [
    depense({ id: 'a', semaine: 'S41', rattachement: { type: 'semaine' } }),
    depense({
      id: 'b',
      semaine: 'S42',
      rattachement: { type: 'production', session: { type: 'nuit', date: '2026-10-14' } },
    }),
    depense({
      id: 'c',
      semaine: 'S42',
      rattachement: {
        type: 'stock',
        matiere: 'bois',
        quantite: 1,
        session: { type: 'nuit', date: '2026-10-12' },
      },
    }),
  ];

  it('croise la semaine et le rattachement', () => {
    expect(filtrerDepenses(liste, 'all', 'all')).toHaveLength(3);
    expect(filtrerDepenses(liste, 'S42', 'all').map((d) => d.id)).toEqual(['b', 'c']);
    expect(filtrerDepenses(liste, 'all', 'semaine').map((d) => d.id)).toEqual(['a']);
    expect(filtrerDepenses(liste, 'S42', 'stock').map((d) => d.id)).toEqual(['c']);
    expect(filtrerDepenses(liste, 'S41', 'stock')).toEqual([]);
  });

  it('ne propose que les semaines qui ont des dépenses', () => {
    const semaines = [{ id: 'S41' }, { id: 'S42' }, { id: 'S43' }];
    expect(semainesAvecDepenses(semaines, liste).map((s) => s.id)).toEqual(['S41', 'S42']);
  });

  it('retrouve la demande liée à une dépense', () => {
    const demande = { id: 'q1', depenseId: 'b' } as DemandeDepense;
    expect(demandeDe(liste[1]!, [demande])).toBe(demande);
    expect(demandeDe(liste[0]!, [demande])).toBeUndefined();
  });
});
