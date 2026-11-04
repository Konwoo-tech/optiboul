import type { Profil } from '../../../profils.ts';
import type { Ajustement, Employe, StatutPaie } from './types.ts';

/** Jours ouvrés d'un mois pour la paie : une absence vaut base ÷ 26 par jour (US-120). */
export const JOURS_PAR_MOIS = 26;

export type CalculPaie = {
  /** Retenue des absences, FCFA. */
  absences: number;
  gains: number;
  penalites: number;
  net: number;
  paye: number;
  reste: number;
};

const somme = (lignes: readonly Pick<Ajustement, 'montant'>[]) =>
  lignes.reduce((total, ligne) => total + ligne.montant, 0);

/**
 * Net = base − absences − avances − pénalités + gains + impayé antérieur ; le jour d'absence vaut
 * base ÷ 26, arrondi au franc avant de multiplier (maquette : `payCalc`).
 */
export function calculerPaie(employe: Employe): CalculPaie {
  const absences = employe.absences * Math.round(employe.base / JOURS_PAR_MOIS);
  const gains = somme(employe.ajustements.filter((a) => a.type === 'gain'));
  const penalites = somme(employe.ajustements.filter((a) => a.type === 'penalite'));
  const net = employe.base - absences - employe.avances - penalites + gains + employe.impaye;
  const paye = somme(employe.paiements);
  return { absences, gains, penalites, net, paye, reste: net - paye };
}

export type TotauxPaie = { net: number; paye: number; reste: number; impayes: number };

export function totaux(employes: readonly Employe[]): TotauxPaie {
  return employes.reduce<TotauxPaie>(
    (cumul, employe) => {
      const calcul = calculerPaie(employe);
      return {
        net: cumul.net + calcul.net,
        paye: cumul.paye + calcul.paye,
        reste: cumul.reste + calcul.reste,
        impayes: cumul.impayes + employe.impaye,
      };
    },
    { net: 0, paye: 0, reste: 0, impayes: 0 },
  );
}

/**
 * Droits sur la paie (cahier des charges §3.3) : le gérant prépare et paie, le propriétaire
 * valide (et prépare au besoin) ; aucun autre profil ne voit ces données. Le faux serveur
 * applique les mêmes règles et répond 403 sinon.
 */
export type DroitsPaie = {
  voir: boolean;
  /** Ajouter ou retirer un gain ou une pénalité, choisir le jour de paie : état en brouillon. */
  preparer: boolean;
  soumettre: boolean;
  valider: boolean;
  payer: boolean;
};

export function droitsPaie(profil: Profil | null | undefined): DroitsPaie {
  const direction = profil === 'gerant' || profil === 'proprietaire';
  return {
    voir: direction,
    preparer: direction,
    soumettre: profil === 'gerant',
    valider: profil === 'proprietaire',
    payer: profil === 'gerant',
  };
}

/** Les lignes ne se modifient qu'en brouillon : soumis, l'état est figé (US-122). */
export const estModifiable = (statut: StatutPaie) => statut === 'brouillon';

/** Le paiement s'ouvre une fois l'état validé et jusqu'à ce que tout soit payé. */
export const paiementOuvert = (statut: StatutPaie) =>
  statut === 'valide' || statut === 'en-paiement';

export type ErreurAjustement = 'libelle' | 'montant';

/** Description et montant sont obligatoires ; le montant est un entier positif de FCFA. */
export function erreurAjustement(libelle: string, montant: string): ErreurAjustement | null {
  if (!libelle.trim()) return 'libelle';
  if (!/^\d+$/.test(montant) || Number(montant) <= 0) return 'montant';
  return null;
}

/** Montant saisi pour un paiement ; vide : tout le reste. Jamais plus que le reste (maquette). */
export function montantAPayer(saisi: string, reste: number): number {
  const valeur = Number(saisi.replace(/\D/g, ''));
  return Math.min(valeur > 0 ? valeur : reste, reste);
}

/** Jours entre deux jours ISO (positif : le second est à venir). */
export function joursEntre(de: string, a: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

/** « AAAA-MM » d'un jour ISO. */
export const moisDe = (jour: string) => jour.slice(0, 7);
