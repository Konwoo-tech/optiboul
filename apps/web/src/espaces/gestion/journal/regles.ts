import type { Profil } from '../../../profils.ts';
import { SANS_FILTRE, type EntreeJournal, type FiltresJournal, type TypeAction } from './types.ts';

/**
 * Cahier des charges §3.3 : le journal est consulté par le gérant, le propriétaire et
 * l'administrateur, ni par la caissière ni par le responsable de production. Lecture seule pour
 * tous : aucune action ne le modifie. L'API vérifie ce droit.
 */
export function peutVoirJournal(profil: Profil | null | undefined): boolean {
  return profil === 'gerant' || profil === 'proprietaire' || profil === 'administrateur';
}

/** Les jours « AAAA-MM-JJ » se comparent comme du texte. */
const estJour = (valeur: string) => /^\d{4}-\d{2}-\d{2}$/.test(valeur);

export type ErreurFiltre = 'periode-invalide' | 'periode-inversee';

/** Valide la période : deux jours bien formés (ou vides), le premier au plus égal au second. */
export function erreurDeFiltre(filtres: FiltresJournal): ErreurFiltre | null {
  const { du, au } = filtres;
  if ((du && !estJour(du)) || (au && !estJour(au))) return 'periode-invalide';
  if (du && au && du > au) return 'periode-inversee';
  return null;
}

export const filtreActif = (filtres: FiltresJournal): boolean =>
  filtres.auteur !== SANS_FILTRE.auteur ||
  filtres.type !== SANS_FILTRE.type ||
  filtres.du !== SANS_FILTRE.du ||
  filtres.au !== SANS_FILTRE.au;

/** Une entrée répond-elle aux filtres ? Période bornes comprises. */
export function repondAuxFiltres(entree: EntreeJournal, filtres: FiltresJournal): boolean {
  if (filtres.auteur && entree.auteur !== filtres.auteur) return false;
  if (filtres.type && entree.type !== filtres.type) return false;
  if (filtres.du && entree.jour < filtres.du) return false;
  if (filtres.au && entree.jour > filtres.au) return false;
  return true;
}

/**
 * Début de ligne comme la maquette : « 21:41 » pour une action du jour, « 13 oct. 16:40 » pour
 * une plus ancienne.
 */
export function horodatage(
  entree: Pick<EntreeJournal, 'jour' | 'heure'>,
  aujourdhui: string,
  jourCourt: (jour: string) => string,
): string {
  return entree.jour === aujourdhui ? entree.heure : `${jourCourt(entree.jour)} ${entree.heure}`;
}

/** Décisions et demandes : classées à part, quel que soit l'écran qui les consigne. */
const DECISION = /^(Accord|Refus) – |^(Demande|Autorisation) /;

/** Type d'une action : celui de l'écran qui la consigne, sauf les décisions et demandes. */
export function typeDeLAction(parDefaut: TypeAction, texte: string): TypeAction {
  return DECISION.test(texte) ? 'demande' : parDefaut;
}
