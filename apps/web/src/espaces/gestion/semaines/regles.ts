import type { Profil } from '../../../profils.ts';
import type {
  AffectationJour,
  Controle,
  CreneauReel,
  Planning,
  Semaine,
  StatutSemaine,
} from './types.ts';

export type DroitsSemaines = {
  /** Voir les semaines : le gérant, le propriétaire et le responsable de production (§3.3). */
  voir: boolean;
};

export function droitsSemaines(profil: Profil | null | undefined): DroitsSemaines {
  return {
    voir: profil === 'gerant' || profil === 'proprietaire' || profil === 'production',
  };
}

/** Les sept jours d'une semaine, du lundi au dimanche (« AAAA-MM-JJ »). */
export function joursDeLaSemaine(lundi: string): string[] {
  const depart = new Date(`${lundi}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, rang) => {
    const jour = new Date(depart);
    jour.setUTCDate(depart.getUTCDate() + rang);
    return jour.toISOString().slice(0, 10);
  });
}

/** Nombre de créneaux (7 jours × jour / nuit) d'une semaine. */
export const CRENEAUX_PAR_SEMAINE = 14;

/** Créneaux auxquels le planning a mis une caissière. */
export function creneauxAffectes(semaine: Semaine, planning: Planning): number {
  const jours = planning[semaine.id] ?? {};
  return joursDeLaSemaine(semaine.du).reduce((somme, jour) => {
    const affectation: Partial<AffectationJour> = jours[jour] ?? {};
    return somme + (affectation.jour ? 1 : 0) + (affectation.nuit ? 1 : 0);
  }, 0);
}

/** Semaine ouverte, sinon dernière clôturée, sinon la première (maquette : `curWeek`). */
export function semaineCourante(semaines: readonly Semaine[]): Semaine | undefined {
  return (
    semaines.find((s) => s.statut === 'ouverte') ??
    [...semaines].reverse().find((s) => s.statut === 'cloturee') ??
    semaines[0]
  );
}

const estGerantDe = (semaine: Semaine, nom: string) => semaine.gerant?.nom === nom;

/** Le propriétaire planifie les semaines et affecte le gérant et le responsable (§3.3). */
export function peutAffecter(profil: Profil | null | undefined, semaine: Semaine): boolean {
  return profil === 'proprietaire' && semaine.statut === 'planifiee';
}

/**
 * Planning des caisses : le propriétaire, ou le gérant de cette semaine, tant qu'elle n'est pas
 * clôturée. Le responsable de production et les autres gérants consultent.
 */
export function peutPlanifier(
  profil: Profil | null | undefined,
  semaine: Semaine,
  nom: string,
): boolean {
  if (semaine.statut === 'cloturee') return false;
  return profil === 'proprietaire' || (profil === 'gerant' && estGerantDe(semaine, nom));
}

export type RaisonOuverture =
  /** Le gérant ou le responsable de production n'est pas encore affecté. */
  | { cle: 'affecter' }
  /** Une autre semaine est ouverte (R2). */
  | { cle: 'autreOuverte'; numero: number }
  | { cle: 'precedente' }
  | { cle: 'droit' };

/**
 * Ce qui empêche d'ouvrir la semaine, dans l'ordre de la maquette ; `null` : on peut l'ouvrir.
 * Cahier des charges §5.1 : le propriétaire ou le gérant affecté, la semaine précédente
 * clôturée, le gérant et le responsable affectés ; R2 : une seule semaine ouverte à la fois.
 */
export function raisonOuverture(
  semaine: Semaine,
  semaines: readonly Semaine[],
  profil: Profil | null | undefined,
  nom: string,
): RaisonOuverture | null {
  if (semaine.statut !== 'planifiee') return null;
  if (!semaine.gerant || !semaine.production) return { cle: 'affecter' };
  const ouverte = semaines.find((s) => s.statut === 'ouverte');
  if (ouverte) return { cle: 'autreOuverte', numero: ouverte.numero };
  const rang = semaines.findIndex((s) => s.id === semaine.id);
  if (rang > 0 && semaines[rang - 1]!.statut !== 'cloturee') return { cle: 'precedente' };
  if (profil !== 'proprietaire' && !(profil === 'gerant' && estGerantDe(semaine, nom))) {
    return { cle: 'droit' };
  }
  return null;
}

export const peutOuvrir = (
  semaine: Semaine,
  semaines: readonly Semaine[],
  profil: Profil | null | undefined,
  nom: string,
) => semaine.statut === 'planifiee' && raisonOuverture(semaine, semaines, profil, nom) === null;

/** Un contrôle bloquant en échec (caisse ouverte, production en cours) interdit la clôture (R3). */
export const aDesBloquants = (controles: readonly Controle[]): boolean =>
  controles.some((c) => c.niveau === 'bloquant');

/** Gérant de la semaine ou propriétaire, une fois les contrôles bloquants levés. */
export function peutCloturer(
  profil: Profil | null | undefined,
  semaine: Semaine,
  nom: string,
  controles: readonly Controle[],
): boolean {
  return (
    semaine.statut === 'ouverte' &&
    !aDesBloquants(controles) &&
    (profil === 'proprietaire' || (profil === 'gerant' && estGerantDe(semaine, nom)))
  );
}

/** Ce que dit la note sous le bouton de clôture. */
export type NoteCloture = 'bloquants' | 'droit' | 'prevue';

export function noteCloture(
  profil: Profil | null | undefined,
  semaine: Semaine,
  nom: string,
  controles: readonly Controle[],
): NoteCloture {
  if (aDesBloquants(controles)) return 'bloquants';
  if (profil !== 'proprietaire' && !(profil === 'gerant' && estGerantDe(semaine, nom))) {
    return 'droit';
  }
  return 'prevue';
}

/** « Juste » à zéro, sinon l'écart signé : vert, rouge s'il manque de l'argent, ambre s'il y en a trop. */
export function niveauDeLEcart(ecart: number): 'ok' | 'bloquant' | 'surveiller' {
  if (ecart === 0) return 'ok';
  return ecart < 0 ? 'bloquant' : 'surveiller';
}

export const niveauDuStatut = (statut: StatutSemaine): 'ok' | 'neutre' | 'surveiller' =>
  statut === 'ouverte' ? 'ok' : statut === 'cloturee' ? 'neutre' : 'surveiller';

/** Le créneau réel d'un jour et d'un type (une ligne de caisse), s'il y en a un. */
export function creneauReel(
  creneaux: readonly CreneauReel[],
  jour: string,
  type: 'jour' | 'nuit',
): CreneauReel | undefined {
  return creneaux.find((c) => c.jour === jour && c.type === type);
}

/** Semaine qui contient un jour donné. */
export const semaineDuJour = (semaines: readonly Semaine[], jour: string): Semaine | undefined =>
  semaines.find((s) => jour >= s.du && jour <= s.au);
