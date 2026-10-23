import type { NiveauSeuil } from '@/utils';

import type { Profil } from '../../../profils.ts';
import type { Depense, DemandeDepense, LigneBudget, TypeRattachement } from './types.ts';

/** Seuil de validation par défaut du cahier des charges (R8) : 50 000 FCFA. */
export const SEUIL_PAR_DEFAUT = 50_000;

export type DroitsDepenses = {
  /** Voir le budget et la liste des dépenses. */
  voir: boolean;
  /** Saisir une dépense. Le propriétaire valide mais ne saisit pas (cahier des charges §3.3). */
  saisir: boolean;
};

export function droitsDepenses(profil: Profil | null | undefined): DroitsDepenses {
  const voir = profil === 'caissier' || profil === 'gerant' || profil === 'proprietaire';
  return { voir, saisir: profil === 'caissier' || profil === 'gerant' };
}

/** Rattachement proposé au départ : la caissière achète pendant la session, le gérant en général. */
export function rattachementParDefaut(profil: Profil | null | undefined): TypeRattachement {
  return profil === 'caissier' ? 'production' : 'semaine';
}

/**
 * Une dépense atteignant le seuil attend une validation, sauf celle du propriétaire (R8). Le seuil
 * est inclus : 50 000 FCFA déclenchent la demande.
 */
export function exigeValidation(
  montant: number,
  seuil: number,
  profil: Profil | null | undefined,
): boolean {
  return montant >= seuil && profil !== 'proprietaire';
}

/** Qui valide : le gérant pour la caissière, le propriétaire pour le gérant (§5.8). */
export function validateurDe(profilAuteur: Profil): 'gerant' | 'proprietaire' {
  return profilAuteur === 'caissier' ? 'gerant' : 'proprietaire';
}

/** Le propriétaire décide de tout ; le gérant, des dépenses qui ne sont pas les siennes. */
export function peutDecider(profil: Profil | null | undefined, profilAuteur: Profil): boolean {
  if (profil === 'proprietaire') return true;
  return profil === 'gerant' && profilAuteur !== 'gerant';
}

/**
 * Niveau d'une catégorie du budget : « à surveiller » au-dessus de 85 %, « dépassé » au-dessus de
 * 100 %. Les deux seuils sont stricts, comme dans la maquette (85 % pile reste « OK »).
 */
export function niveauBudget(realise: number, budget: number): NiveauSeuil {
  if (budget <= 0) return realise > 0 ? 'bloquant' : 'ok';
  const pourcent = (realise / budget) * 100;
  if (pourcent > 100) return 'bloquant';
  if (pourcent > 85) return 'surveiller';
  return 'ok';
}

/** Largeur de la barre, entre 0 et 100 %. */
export function remplissage(realise: number, budget: number): number {
  if (budget <= 0) return realise > 0 ? 100 : 0;
  return Math.min(100, (realise / budget) * 100);
}

export function totauxBudget(lignes: readonly LigneBudget[]): {
  budget: number;
  realise: number;
  pourcent: number;
} {
  const budget = lignes.reduce((somme, l) => somme + l.budget, 0);
  const realise = lignes.reduce((somme, l) => somme + l.realise, 0);
  return { budget, realise, pourcent: budget > 0 ? Math.round((realise / budget) * 100) : 0 };
}

export const entierSaisi = (texte: string): number => {
  const valeur = Number.parseInt(texte.replace(/\D/g, ''), 10);
  return Number.isNaN(valeur) ? 0 : valeur;
};

/** Quantité de stock : décimale avec virgule ou point (« 2,5 »). 0 si illisible. */
export function quantiteSaisie(texte: string): number {
  const valeur = Number.parseFloat(texte.replace(',', '.'));
  return Number.isFinite(valeur) && valeur > 0 ? valeur : 0;
}

export type BrouillonDepense = {
  libelle: string;
  montant: string;
  rattachement: TypeRattachement;
  quantite: string;
};

export type ErreurSaisie = 'libelle' | 'montant' | 'quantite';

/** Première erreur de la saisie, dans l'ordre de la maquette : libellé, montant, puis quantité. */
export function erreurDeSaisie(brouillon: BrouillonDepense): ErreurSaisie | null {
  if (!brouillon.libelle.trim()) return 'libelle';
  if (!entierSaisi(brouillon.montant)) return 'montant';
  if (brouillon.rattachement === 'stock' && !quantiteSaisie(brouillon.quantite)) return 'quantite';
  return null;
}

/** « DEP-0016 ». */
export const numeroDepense = (numero: number) => `DEP-${String(numero).padStart(4, '0')}`;

/** « DEM-021 ». */
export const numeroDemande = (numero: number) => `DEM-${String(numero).padStart(3, '0')}`;

export type FiltreSemaine = 'all' | string;
export type FiltreRattachement = 'all' | TypeRattachement;

export function filtrerDepenses(
  depenses: readonly Depense[],
  semaine: FiltreSemaine,
  rattachement: FiltreRattachement,
): Depense[] {
  return depenses.filter(
    (d) =>
      (semaine === 'all' || d.semaine === semaine) &&
      (rattachement === 'all' || d.rattachement.type === rattachement),
  );
}

/** Semaines proposées par le filtre : celles qui ont au moins une dépense. */
export function semainesAvecDepenses<S extends { id: string }>(
  semaines: readonly S[],
  depenses: readonly Depense[],
): S[] {
  return semaines.filter((s) => depenses.some((d) => d.semaine === s.id));
}

/** Demande liée à une dépense, s'il y en a une. */
export const demandeDe = (
  depense: Depense,
  demandes: readonly DemandeDepense[],
): DemandeDepense | undefined => demandes.find((d) => d.depenseId === depense.id);
