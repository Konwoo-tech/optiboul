import type { Profil } from '../../../profils.ts';

/**
 * Cahier des charges §3.3 : « Tableau de bord complet » pour le gérant et le propriétaire, ni la
 * caissière, ni le responsable de production, ni l'administrateur. L'API vérifie ce droit.
 */
export function peutVoirTableauDeBord(profil: Profil | null | undefined): boolean {
  return profil === 'gerant' || profil === 'proprietaire';
}

/** Taux d'encaissement en pourcentage, au dixième : 4 231 400 sur 4 396 750 → 96,2 (comme la maquette). */
export function tauxEncaissement(encaisse: number, du: number): number {
  return du > 0 ? Number(((encaisse / du) * 100).toFixed(1)) : 0;
}

/** Hauteur d'une barre en % de la plus haute, jamais invisible (2 % au minimum). */
export function hauteurDeBarre(valeur: number, maximum: number): number {
  return maximum > 0 ? Math.max(2, (valeur / maximum) * 100) : 2;
}

/** Largeur d'une barre de production en % de la plus grande, jamais invisible (0,5 % au minimum). */
export function largeurDeBarre(valeur: number, maximum: number): number {
  return maximum > 0 ? Math.max(0.5, (valeur / maximum) * 100) : 0.5;
}
