import type { Profil } from '../../../profils.ts';
import type { Personne, SessionCaisse } from './types.ts';

/** Fonds de caisse proposé à l'ouverture (US-040). */
export const FONDS_PROPOSE = 20_000;

/**
 * Espèces en caisse au-delà desquelles on propose une remise au coffre (US-041, O4, R18).
 * Valeur par défaut du cahier des charges : l'API la fournira quand le paramètre existera.
 */
export const PLAFOND_CAISSE = 100_000;

export type StatutEcart = 'juste' | 'manque' | 'excedent';

/** Écart de caisse : espèces comptées − espèces attendues (négatif : il manque de l'argent). */
export function ecartDeCaisse(attendu: number, compte: number): number {
  return compte - attendu;
}

export function statutEcart(ecart: number): StatutEcart {
  if (ecart === 0) return 'juste';
  return ecart < 0 ? 'manque' : 'excedent';
}

/** Espèces attendues = fonds + espèces encaissées − dépenses payées en caisse − remises au coffre. */
export function attenduDeCaisse(c: {
  fonds: number;
  especes: number;
  depenses: number;
  remises: number;
}): number {
  return c.fonds + c.especes - c.depenses - c.remises;
}

/** On propose une remise quand les espèces dépassent le plafond (strictement). */
export function depassePlafond(attendu: number, plafond: number = PLAFOND_CAISSE): boolean {
  return attendu > plafond;
}

/** Remise proposée : tout sauf le fonds de caisse, qui reste dans le tiroir. */
export function montantProposeAuCoffre(attendu: number, fonds: number): number {
  return Math.max(0, attendu - fonds);
}

/** Chiffres seulement, comme la saisie des champs de montant de la maquette. */
export function nombreSaisi(texte: string): number {
  const valeur = Number.parseInt(texte.replace(/\D/g, ''), 10);
  return Number.isNaN(valeur) ? 0 : valeur;
}

/** Ce que chaque profil peut faire sur l'écran. L'API vérifie chaque droit : ceci n'est que l'affichage. */
export type DroitsCaisse = {
  /** Voit les caisses de toutes les caissières (et peut filtrer) ; la caissière voit les siennes. */
  voitToutes: boolean;
  ouvrir: boolean;
  fermer: boolean;
  rouvrir: boolean;
  remettreAuCoffre: boolean;
};

export function droitsCaisse(
  profil: Profil | null | undefined,
  /** La caisse ouverte est celle de la personne connectée. */
  estSaCaisse: boolean,
): DroitsCaisse {
  const direction = profil === 'gerant' || profil === 'proprietaire';
  const peutAgir = direction || (profil === 'caissier' && estSaCaisse);
  return {
    voitToutes: direction,
    // Maquette : la caissière et le gérant ouvrent ; le propriétaire consulte seulement.
    ouvrir: profil === 'caissier' || profil === 'gerant',
    fermer: peutAgir,
    rouvrir: direction,
    remettreAuCoffre: peutAgir,
  };
}

/** Ouvrir un créneau où une autre personne est planifiée reste permis, mais l'ouverture est signalée. */
export function ouvertureHorsPlanning(planifiee: Personne | null, moi: string): boolean {
  return planifiee !== null && planifiee.id !== moi;
}

/** Lignes du tableau : la caisse choisie (ou toutes), la plus récente d'abord. */
export function lignesDuTableau(
  sessions: readonly SessionCaisse[],
  filtre: string,
): SessionCaisse[] {
  return sessions.filter((s) => filtre === 'all' || s.caissiere.id === filtre).toReversed();
}

export type SyntheseCaissiere = {
  personne: Personne;
  ouvertures: number;
  fermetures: number;
  recette: number;
  /** Somme des écarts des caisses fermées. */
  ecart: number;
  derniere: SessionCaisse | null;
};

/** Cartes de synthèse : une par caissière, calculée sur toutes ses ouvertures. */
export function syntheseCaissiere(
  personne: Personne,
  sessions: readonly SessionCaisse[],
): SyntheseCaissiere {
  const siennes = sessions.filter((s) => s.caissiere.id === personne.id);
  const fermees = siennes.filter((s) => !s.enCours);
  return {
    personne,
    ouvertures: siennes.length,
    fermetures: fermees.length,
    recette: siennes.reduce((somme, s) => somme + s.recette, 0),
    ecart: fermees.reduce((somme, s) => somme + ecartDeCaisse(s.attendu, s.compte ?? s.attendu), 0),
    derniere: siennes.at(-1) ?? null,
  };
}

/** Cartes affichées : la caissière ne voit que la sienne, la direction voit toutes les caissières. */
export function cartesVisibles(
  caissieres: readonly Personne[],
  droits: DroitsCaisse,
  moi: string,
): Personne[] {
  return caissieres.filter((c) => droits.voitToutes || c.id === moi);
}

export type NiveauStatutCaisse = 'ok' | 'surveiller' | 'bloquant';

/** Statut d'une ligne : ouverte, juste, manque ou excédent (jamais la couleur seule : un mot). */
export function statutDeSession(s: SessionCaisse): {
  cle: 'ouverte' | StatutEcart;
  niveau: NiveauStatutCaisse;
} {
  if (s.enCours) return { cle: 'ouverte', niveau: 'ok' };
  const statut = statutEcart(ecartDeCaisse(s.attendu, s.compte ?? s.attendu));
  return {
    cle: statut,
    niveau: statut === 'juste' ? 'ok' : statut === 'manque' ? 'bloquant' : 'surveiller',
  };
}
