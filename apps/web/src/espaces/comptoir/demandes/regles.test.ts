import { describe, expect, it } from 'vitest';

import type { Profil } from '../../../profils.ts';
import {
  codeDemande,
  destinationDe,
  peutDecider,
  peutVoirToutes,
  repartir,
  validateurDe,
} from './regles.ts';
import type { Demande, TypeDemande } from './types.ts';

const demande = (numero: number, statut: Demande['statut'] = 'en-attente'): Demande => ({
  id: `q${numero}`,
  numero,
  type: 'depense',
  titre: `Demande ${numero}`,
  detail: '',
  par: 'Willy',
  parProfil: 'gerant',
  jour: '2026-10-13',
  heure: '16:40',
  statut,
  objet: null,
});

const PROFILS: Profil[] = ['caissier', 'gerant', 'production', 'proprietaire', 'administrateur'];

describe('qui valide une demande (cahier des charges §5.9)', () => {
  it.each<[TypeDemande, Profil, ReturnType<typeof validateurDe>]>([
    ['plafond', 'caissier', 'gerant-ou-proprietaire'],
    ['production', 'production', 'gerant-ou-proprietaire'],
    ['depense', 'caissier', 'gerant'],
    ['depense', 'gerant', 'proprietaire'],
    ['paie', 'gerant', 'proprietaire'],
    ['inventaire', 'production', 'proprietaire'],
  ])('%s émise par %s : %s', (type, parProfil, attendu) => {
    expect(validateurDe({ type, parProfil })).toBe(attendu);
  });
});

describe('qui peut accorder ou refuser', () => {
  const decideurs = (type: TypeDemande, parProfil: Profil) =>
    PROFILS.filter((profil) => peutDecider({ type, parProfil }, profil));

  it('plafond et production : gérant et propriétaire', () => {
    expect(decideurs('plafond', 'caissier')).toEqual(['gerant', 'proprietaire']);
    expect(decideurs('production', 'production')).toEqual(['gerant', 'proprietaire']);
  });

  it('dépense d’une caissière : gérant et propriétaire', () => {
    expect(decideurs('depense', 'caissier')).toEqual(['gerant', 'proprietaire']);
  });

  it('dépense du gérant, paie, inventaire : le propriétaire seul', () => {
    expect(decideurs('depense', 'gerant')).toEqual(['proprietaire']);
    expect(decideurs('paie', 'gerant')).toEqual(['proprietaire']);
    expect(decideurs('inventaire', 'production')).toEqual(['proprietaire']);
  });

  it('jamais la caissière, le chef de production, l’administrateur ni une personne déconnectée', () => {
    expect(peutDecider({ type: 'plafond', parProfil: 'caissier' }, null)).toBe(false);
    expect(peutDecider({ type: 'plafond', parProfil: 'caissier' }, undefined)).toBe(false);
  });
});

describe('qui voit quoi', () => {
  it('la caissière ne voit que ses demandes', () => {
    expect(peutVoirToutes('caissier')).toBe(false);
    expect(peutVoirToutes('gerant')).toBe(true);
    expect(peutVoirToutes('proprietaire')).toBe(true);
  });
});

describe('présentation', () => {
  it('numérote sur trois chiffres, comme DEM-021', () => {
    expect(codeDemande(21)).toBe('DEM-021');
    expect(codeDemande(5)).toBe('DEM-005');
    expect(codeDemande(1200)).toBe('DEM-1200');
  });

  it('range les plus récentes d’abord, et limite les décisions à douze', () => {
    const toutes = Array.from({ length: 16 }, (_, i) =>
      demande(21 + i, i < 14 ? 'acceptee' : 'en-attente'),
    );
    const { enAttente, decisions } = repartir(toutes);
    expect(enAttente.map((d) => d.numero)).toEqual([36, 35]);
    expect(decisions).toHaveLength(12);
    expect(decisions[0]?.numero).toBe(34);
    expect(decisions.at(-1)?.numero).toBe(23);
  });

  it('mène chaque objet lié à son écran', () => {
    expect(destinationDe({ genre: 'client', id: 'brice', nom: 'Brice', solde: -4200 })).toEqual({
      ecran: 'clients',
      recherche: '?client=brice',
    });
    expect(
      destinationDe({ genre: 'depense', code: 'DEP-0014', montant: 1, semaine: 42 }).ecran,
    ).toBe('depenses');
    expect(destinationDe({ genre: 'paie', mois: '2026-10' }).ecran).toBe('personnel');
    expect(destinationDe({ genre: 'inventaire', code: 'AUD-03' }).ecran).toBe('stocks');
    expect(destinationDe({ genre: 'production' }).ecran).toBe('production');
  });
});
