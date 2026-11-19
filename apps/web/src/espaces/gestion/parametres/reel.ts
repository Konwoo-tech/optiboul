import {
  parametresHistoriqueList,
  parametresList,
  produitsList,
  toutesLesPages,
  type Parametre as ParametreServeur,
  type Produit,
} from '@/api';

import { codeAffiche } from '../../atelier/production/fiches.ts';
import type { Parametre, ProduitParametre, ValeurPassee } from './types.ts';

/*
 * Lecture de « Gestion › Paramètres » sur le vrai serveur : `parametres/` (catalogue complet, non
 * paginé), `parametres/{clé}/historique/` et `produits/` (résumé des fiches techniques). Le serveur
 * rend déjà le modèle de l'écran ; seuls les produits sont convertis.
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

export async function lireParametresReels(): Promise<Parametre[]> {
  return (await parametresList()).data as unknown as ParametreServeur[] as unknown as Parametre[];
}

export async function lireHistoriqueReel(cle: string): Promise<ValeurPassee[]> {
  return (await parametresHistoriqueList(cle)).data as unknown as ValeurPassee[];
}

type ProduitAvecFiche = Produit & {
  fiche: { poids_boule: number; pains_par_boule: number; pains_par_sac: number } | null;
};

/** Une ligne du tableau « Produits et fiches techniques » ; un produit sans fiche est écarté. */
export function versProduit(produit: ProduitAvecFiche): ProduitParametre | undefined {
  const fiche = produit.fiche;
  if (!fiche) return undefined;
  return {
    id: produit.code.toLowerCase(),
    code: codeAffiche(produit.code),
    nom: produit.nom,
    nomEn: produit.nom_en || produit.nom,
    boule: fiche.poids_boule,
    pb: fiche.pains_par_boule,
    painsParSac: fiche.pains_par_sac,
    // Un seul prix de vente côté serveur (les tarifs des clients sont à part).
    prix: (produit.prix ?? 0) > 0 ? [produit.prix as number, produit.prix as number] : null,
  };
}

export async function lireProduitsReels(): Promise<ProduitParametre[]> {
  const produits = await toutesLesPages<Produit>(
    (page) => produitsList({ page }) as Promise<Page<Produit>>,
  );
  return (produits as unknown as ProduitAvecFiche[])
    .map(versProduit)
    .filter((p): p is ProduitParametre => p !== undefined);
}
