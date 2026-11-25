import {
  employesList,
  paiesCalendrierList,
  paiesList,
  toutesLesPages,
  type ElementPaie,
  type Employe as EmployeServeur,
  type EtatPaie,
  type LignePaie,
  type MoisDuCalendrier as MoisServeur,
  type PaiementSalaire,
} from '@/api';

import type {
  Ajustement,
  Employe,
  InstantanePaie,
  ModePaiement,
  MoisDuCalendrier,
  Paiement,
  StatutPaie,
} from './types.ts';

/*
 * Lecture de « Gestion › Personnel et paie » sur le vrai serveur : `paies/` (états, lignes avec leur
 * employé et leur poste, qui a soumis et validé, la demande liée), `paies/calendrier/` (un jour de paie
 * par mois, les jours possibles) et `employes/` (pour un mois pas encore préparé) (voir E46).
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

const FUSEAU = 'Africa/Douala';
const jourDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU }).format(new Date(iso));
const heureDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU }).format(
    new Date(iso),
  );

const STATUTS: Record<string, StatutPaie> = {
  brouillon: 'brouillon',
  soumis: 'soumis',
  valide: 'valide',
  en_paiement: 'en-paiement',
  payee: 'payee',
};

export const moisDuServeur = (mois: string) => mois.slice(0, 7);

const deuxChiffres = (n: number) => String(n).padStart(2, '0');

/** Le jour de paie d'un mois « AAAA-MM », au plus le dernier jour du mois. */
export function jourDePaieDuMois(mois: string, jour: number): string {
  const [annee, numero] = mois.split('-').map(Number) as [number, number];
  const dernier = new Date(Date.UTC(annee, numero, 0)).getUTCDate();
  return `${mois}-${deuxChiffres(Math.min(jour, dernier))}`;
}

export function versAjustement(e: ElementPaie): Ajustement {
  return {
    id: String(e.id),
    type: e.genre === 'penalite' ? 'penalite' : 'gain',
    libelle: e.description,
    montant: e.montant,
    date: e.jour,
    par: e.auteur,
  };
}

export function versPaiement(p: PaiementSalaire): Paiement {
  return {
    montant: p.montant,
    mode: p.mode as ModePaiement,
    ...(p.reference ? { reference: p.reference } : {}),
    date: jourDeYaounde(p.paye_le),
    par: p.paye_par,
  };
}

/** Une ligne du serveur : l'identifiant de l'écran est celui de la ligne de paie. */
export function versEmploye(ligne: LignePaie): Employe {
  return {
    id: String(ligne.id),
    employeId: ligne.employe_id,
    nom: ligne.employe,
    poste: ligne.poste,
    base: ligne.base,
    absences: Number(ligne.absences),
    avances: ligne.avances,
    impaye: ligne.impaye,
    ajustements: ligne.elements.map(versAjustement),
    paiements: ligne.paiements.map(versPaiement),
  };
}

const STATUTS_CALENDRIER: Record<string, MoisDuCalendrier['statut']> = {
  payee: 'payee',
  partielle: 'partielle',
  en_retard: 'partielle',
  courante: 'courante',
  a_venir: 'planifiee',
};

/** Le calendrier du serveur : un mois par ligne, avec son jour de paie et les jours possibles. */
export function versCalendrier(mois: readonly MoisServeur[]): MoisDuCalendrier[] {
  return [...mois]
    .sort((x, y) => x.mois.localeCompare(y.mois))
    .map((m): MoisDuCalendrier => {
      const statut = STATUTS_CALENDRIER[m.statut] ?? 'courante';
      return {
        mois: m.mois,
        jour: m.jour,
        statut,
        ...(statut === 'payee' || statut === 'partielle'
          ? { total: m.total - m.impayes, ...(m.impayes ? { impayes: m.impayes } : {}) }
          : {}),
        ...(m.jours.length > 1 && (statut === 'courante' || statut === 'planifiee')
          ? { jours: m.jours }
          : {}),
      };
    });
}

const aujourdhuiLocal = () =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU }).format(new Date());

export async function lirePersonnelReel(): Promise<InstantanePaie> {
  const [etats, employes, calendrierServeur] = await Promise.all([
    toutesLesPages<EtatPaie>((page) => paiesList({ page }) as Promise<Page<EtatPaie>>),
    toutesLesPages<EmployeServeur>(
      (page) => employesList({ page }) as Promise<Page<EmployeServeur>>,
    ),
    paiesCalendrierList()
      .then((r) => (Array.isArray(r.data) ? (r.data as MoisServeur[]) : []))
      .catch(() => [] as MoisServeur[]),
  ]);
  const aujourdhui = aujourdhuiLocal();
  const courant = aujourdhui.slice(0, 7);
  const calendrier = versCalendrier(calendrierServeur);

  const recent = [...etats].sort((a, b) => b.mois.localeCompare(a.mois))[0];
  // Le dernier état est affiché tant qu'il est du mois ou pas soldé ; sinon, le mois est à préparer.
  const aAfficher =
    recent && (recent.statut !== 'payee' || moisDuServeur(recent.mois) >= courant)
      ? recent
      : undefined;
  const aPreparer = aAfficher ? null : courant;
  const mois = aAfficher ? moisDuServeur(aAfficher.mois) : courant;
  const duMois = calendrierServeur.find((m) => m.mois === mois);
  const demandeLiee = aAfficher?.demande ?? null;
  const lignes: Employe[] = aAfficher
    ? aAfficher.lignes.map(versEmploye)
    : employes
        .filter((e) => e.actif !== false)
        .map((e) => ({
          id: `employe-${e.id}`,
          employeId: e.id,
          nom: e.nom,
          poste: e.poste ?? '',
          base: e.salaire_base,
          absences: 0,
          avances: 0,
          impaye: 0,
          ajustements: [],
          paiements: [],
        }));
  return {
    mois,
    statut: aAfficher ? (STATUTS[aAfficher.statut] ?? 'brouillon') : 'brouillon',
    jourDePaie: aAfficher?.jour_de_paie ?? duMois?.jour ?? jourDePaieDuMois(mois, 5),
    joursPossibles: duMois?.jours ?? [],
    soumisPar: aAfficher?.soumis_par ?? '',
    validePar: aAfficher?.valide_par ?? '',
    valideA: aAfficher?.valide_le ? heureDeYaounde(aAfficher.valide_le) : '',
    demande:
      demandeLiee && demandeLiee.statut === 'en_attente'
        ? { id: String(demandeLiee.id), numero: demandeLiee.numero }
        : null,
    employes: lignes,
    calendrier,
    aujourdhui,
    ...(aAfficher ? { etat: aAfficher.id } : { aPreparer }),
  };
}
