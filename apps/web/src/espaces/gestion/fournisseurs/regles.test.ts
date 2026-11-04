import { describe, expect, it } from 'vitest';

import {
  commandesAvecManque,
  commandesPlanifiees,
  detteFournisseurs,
  droitsFournisseurs,
  etatDeFacture,
  facturesEnRetard,
  filtrerQuantite,
  joursPlanifiables,
  manque,
  matieresDe,
  montantDeReception,
  quantiteValide,
  sePaie,
  trierCommandes,
} from './regles.ts';
import type { Commande, Facture } from './types.ts';

const commande = (numero: string, statut: Commande['statut'], extra: Partial<Commande> = {}) =>
  ({
    numero,
    fournisseur: 'f1',
    matiere: 'farine',
    commandee: 10,
    recue: 0,
    jour: '2026-10-14',
    statut,
    planifieePar: 'Willy',
    recuePar: '',
    recueLe: null,
    semaine: 'S42',
    ...extra,
  }) satisfies Commande;

const facture = (numero: string, statut: Facture['statut'], montant: number, enRetard = false) =>
  ({
    numero,
    fournisseur: 'f1',
    objet: { genre: 'farine', semaine: 42, sacs: 1 },
    montant,
    echeance: '2026-10-14',
    statut,
    enRetard,
    semaine: 'S42',
  }) satisfies Facture;

describe('Fournisseurs : droits', () => {
  it('le gérant gère, le propriétaire consulte, les autres profils n’ont pas accès', () => {
    expect(droitsFournisseurs('gerant')).toEqual({ voir: true, modifier: true });
    expect(droitsFournisseurs('proprietaire')).toEqual({ voir: true, modifier: false });
    for (const profil of ['caissier', 'production', 'administrateur'] as const) {
      expect(droitsFournisseurs(profil)).toEqual({ voir: false, modifier: false });
    }
    expect(droitsFournisseurs(undefined).voir).toBe(false);
  });
});

describe('Fournisseurs : calculs', () => {
  it('propose huit jours, aujourd’hui compris', () => {
    const jours = joursPlanifiables('2026-10-14');
    expect(jours).toHaveLength(8);
    expect(jours[0]).toBe('2026-10-14');
    expect(jours[7]).toBe('2026-10-21');
  });

  it('calcule le montant d’une réception au franc près', () => {
    expect(montantDeReception(44, 19_525)).toBe(859_100);
    expect(montantDeReception(2.5, 300)).toBe(750);
    expect(montantDeReception(0.3333, 300)).toBe(100);
  });

  it('calcule le manquant sans dérive décimale', () => {
    expect(manque({ commandee: 10, recue: 6 })).toBe(4);
    expect(manque({ commandee: 0.3, recue: 0.1 })).toBe(0.2);
  });

  it('met les réceptions à faire d’abord et garde l’ordre d’arrivée', () => {
    const triees = trierCommandes([
      commande('BC-030', 'recue'),
      commande('BC-034', 'planifiee'),
      commande('BC-032', 'partielle'),
      commande('BC-033', 'planifiee'),
    ]).map((c) => c.numero);
    expect(triees).toEqual(['BC-034', 'BC-033', 'BC-030', 'BC-032']);
  });

  it('compte la dette, les retards, les manquants et les réceptions planifiées', () => {
    const factures = [
      facture('A', 'a-payer', 100, true),
      facture('B', 'en-cours', 50),
      facture('C', 'payee', 900),
      facture('D', 'a-payer', 10, true),
    ];
    expect(detteFournisseurs(factures)).toBe(160);
    expect(facturesEnRetard(factures).map((f) => f.numero)).toEqual(['A', 'D']);
    const commandes = [
      commande('1', 'planifiee'),
      commande('2', 'partielle'),
      commande('3', 'recue'),
    ];
    expect(commandesAvecManque(commandes)).toHaveLength(1);
    expect(commandesPlanifiees(commandes)).toHaveLength(1);
  });

  it('une facture en retard et à payer s’affiche « en retard » ; une facture en cours garde son statut', () => {
    expect(etatDeFacture({ statut: 'a-payer', enRetard: true })).toBe('en-retard');
    expect(etatDeFacture({ statut: 'a-payer', enRetard: false })).toBe('a-payer');
    expect(etatDeFacture({ statut: 'en-cours', enRetard: true })).toBe('en-cours');
    expect(etatDeFacture({ statut: 'payee', enRetard: false })).toBe('payee');
  });

  it('seule une facture « à payer » se paie', () => {
    expect(sePaie({ statut: 'a-payer' })).toBe(true);
    expect(sePaie({ statut: 'en-cours' })).toBe(false);
    expect(sePaie({ statut: 'payee' })).toBe(false);
  });

  it('valide et filtre les quantités saisies', () => {
    expect(quantiteValide(0)).toBe(false);
    expect(quantiteValide(-2)).toBe(false);
    expect(quantiteValide(Number.NaN)).toBe(false);
    expect(quantiteValide(0.5)).toBe(true);
    expect(filtrerQuantite('1a2,5x.')).toBe('12,5.');
  });

  it('donne les matières d’un fournisseur, aucune s’il est inconnu', () => {
    const liste = [{ id: 'f2', matieres: ['levure', 'sel'] as const }];
    expect(matieresDe(liste, 'f2')).toEqual(['levure', 'sel']);
    expect(matieresDe(liste, 'zz')).toEqual([]);
  });
});
