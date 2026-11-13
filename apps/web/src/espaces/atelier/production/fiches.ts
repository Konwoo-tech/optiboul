import {
  mouvementsStockEtatList,
  produitsList,
  produitsNouvelleVersionCreate,
  toutesLesPages,
  type LigneEtat,
  type Produit,
} from '@/api';

import { calculerFiche } from './regles.ts';
import type {
  FicheProduit,
  InstantaneFiches,
  Matiere,
  ModificationFiche,
  Recette,
} from './types.ts';

/*
 * Fiches techniques sur le vrai serveur : `produits/` (version courante de chaque fiche) et
 * `produits/{id}/nouvelle-version/` (une modification crée une version). Les prix des matières se
 * déduisent de l'état du stock. Le serveur ne donne ni la cuisson ni les pains produits le mois
 * dernier : valeurs d'attente (E40).
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

type FicheServeur = {
  version: number;
  poids_boule: number;
  pains_par_boule: number;
  pains_par_sac: number;
  recette: Record<string, string>;
  cree_par_nom: string;
  cree_le: string;
};
type ProduitServeur = {
  id: number;
  code: string;
  nom: string;
  nom_en: string;
  prix: number;
  fiche: FicheServeur | null;
};

const FUSEAU = 'Africa/Douala';
const jourDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU }).format(new Date(iso));
const heureDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU }).format(
    new Date(iso),
  );

/** Minutes de cuisson affichées quand le serveur n'en donne pas. */
export const CUISSON_PAR_DEFAUT = 24;

/** Le serveur compte le sel, la levure et l'améliorant en grammes ; l'écran en kilos. */
const EN_GRAMMES = ['sel', 'levure', 'ameliorant'] as const;

/** Recette d'un sac du serveur, dans les unités de l'écran. */
export function versRecette(fiche: FicheServeur): Recette {
  const q = (code: string) => Number(fiche.recette[code] ?? 0);
  return {
    boule: fiche.poids_boule,
    pb: fiche.pains_par_boule,
    farine: q('farine'),
    eau: q('eau'),
    sel: q('sel') / 1000,
    levure: q('levure') / 1000,
    ameliorant: q('ameliorant') / 1000,
    glace: q('glace'),
  };
}

/** Recette de l'écran, dans les unités du serveur (grammes pour le sel, la levure, l'améliorant). */
export function versRecetteServeur(recette: Recette): Record<string, string> {
  const valeurs: Record<string, number> = {
    farine: recette.farine,
    eau: recette.eau,
    glace: recette.glace,
  };
  for (const m of EN_GRAMMES) valeurs[m] = Math.round(recette[m] * 1000 * 1000) / 1000;
  return Object.fromEntries(Object.entries(valeurs).map(([m, v]) => [m, String(v)]));
}

/** « GC135 » devient « GC 135 », comme sur la pastille de l'écran. */
export const codeAffiche = (code: string) => code.replace(/^([A-Za-z]+)(\d+)$/, '$1 $2');

export function versFiche(produit: ProduitServeur): FicheProduit | undefined {
  const fiche = produit.fiche;
  if (!fiche) return undefined;
  return {
    id: produit.code.toLowerCase(),
    idServeur: produit.id,
    code: codeAffiche(produit.code),
    nom: produit.nom,
    nomEn: produit.nom_en || produit.nom,
    recette: versRecette(fiche),
    version: fiche.version,
    modifieLe: jourDeYaounde(fiche.cree_le),
    modifieA: heureDeYaounde(fiche.cree_le),
    modifiePar: fiche.cree_par_nom,
    // Un seul prix de vente côté serveur (les tarifs des clients sont à part).
    prix: produit.prix > 0 ? [produit.prix, produit.prix] : null,
    produitsOctobre: 0,
    cuisson: CUISSON_PAR_DEFAUT,
  };
}

/** Prix unitaire de chaque matière d'après la valeur et la quantité en stock (farine au sac, le reste au kilo). */
export function prixDesMatieres(etat: readonly LigneEtat[]): Record<Matiere, number> {
  const prix = Object.fromEntries(
    (['farine', 'sel', 'levure', 'ameliorant', 'glace', 'bois', 'huile'] as Matiere[]).map((m) => [
      m,
      0,
    ]),
  ) as Record<Matiere, number>;
  for (const ligne of etat) {
    const quantite = Number(ligne.quantite);
    if (!(ligne.matiere in prix) || quantite <= 0) continue;
    const unitaire = ligne.valeur / quantite;
    const m = ligne.matiere as Matiere;
    prix[m] = Math.round(
      m === 'farine'
        ? unitaire * 50
        : (EN_GRAMMES as readonly string[]).includes(m)
          ? unitaire * 1000
          : unitaire,
    );
  }
  return prix;
}

export async function lireFichesReelles(): Promise<InstantaneFiches> {
  const [produits, etat] = await Promise.all([
    toutesLesPages<Produit>((page) => produitsList({ page }) as Promise<Page<Produit>>),
    mouvementsStockEtatList()
      .then((r) => r.data as unknown as LigneEtat[])
      .catch(() => [] as LigneEtat[]),
  ]);
  return {
    fiches: (produits as unknown as ProduitServeur[])
      .map(versFiche)
      .filter((f): f is FicheProduit => f !== undefined),
    prix: prixDesMatieres(etat),
  };
}

/** Enregistre la recette modifiée : le serveur crée une nouvelle version de la fiche. */
export async function modifierFicheSurLeServeur(
  idServeur: number,
  recette: ModificationFiche,
  prix: Record<Matiere, number>,
): Promise<InstantaneFiches> {
  await produitsNouvelleVersionCreate(idServeur, {
    poids_boule: Math.round(recette.boule),
    pains_par_boule: Math.round(recette.pb),
    // Le rendement d'un sac se déduit de la recette (pâte du sac ÷ poids d'un pain).
    pains_par_sac: Math.max(1, calculerFiche(recette, prix, null).painsParSac),
    recette: versRecetteServeur(recette),
  });
  return lireFichesReelles();
}
