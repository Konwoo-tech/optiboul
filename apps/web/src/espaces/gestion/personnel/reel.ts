import {
  demandesList,
  employesList,
  paiesList,
  parametresList,
  toutesLesPages,
  type Demande,
  type ElementPaie,
  type Employe as EmployeServeur,
  type EtatPaie,
  type LignePaie,
  type Parametre,
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
 * Lecture de « Gestion › Personnel et paie » sur le vrai serveur : `paies/` (états et lignes),
 * `employes/` (poste), `demandes/` (la validation de l'état) et le paramètre `jour_de_paie`. Le
 * serveur n'a pas de calendrier : il est déduit des états déjà préparés (voir E46).
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
export function versEmploye(ligne: LignePaie, poste: string): Employe {
  return {
    id: String(ligne.id),
    nom: ligne.employe,
    poste,
    base: ligne.base,
    absences: Number(ligne.absences),
    avances: ligne.avances,
    impaye: ligne.impaye,
    ajustements: ligne.elements.map(versAjustement),
    paiements: ligne.paiements.map(versPaiement),
  };
}

const sommePayee = (etat: EtatPaie) => etat.lignes.reduce((somme, l) => somme + l.paye, 0);
const sommeReste = (etat: EtatPaie) => etat.lignes.reduce((somme, l) => somme + l.reste, 0);

/** Le calendrier : un mois par état préparé, du plus ancien au plus récent. */
export function versCalendrier(
  etats: readonly EtatPaie[],
  courant: string,
  jour: number,
  aPreparer: string | null,
): MoisDuCalendrier[] {
  const mois = [...etats]
    .sort((a, b) => a.mois.localeCompare(b.mois))
    .map((e): MoisDuCalendrier => {
      const m = moisDuServeur(e.mois);
      const base = { mois: m, jour: jourDePaieDuMois(m, jour) };
      if (e.statut === 'payee') return { ...base, statut: 'payee', total: sommePayee(e) };
      if (m < courant) {
        return {
          ...base,
          statut: 'partielle',
          total: sommePayee(e),
          impayes: sommeReste(e),
        };
      }
      return { ...base, statut: 'courante' };
    });
  return aPreparer
    ? [...mois, { mois: aPreparer, jour: jourDePaieDuMois(aPreparer, jour), statut: 'planifiee' }]
    : mois;
}

const aujourdhuiLocal = () =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU }).format(new Date());

export async function lirePersonnelReel(): Promise<InstantanePaie> {
  const [etats, employes, demandes, parametres] = await Promise.all([
    toutesLesPages<EtatPaie>((page) => paiesList({ page }) as Promise<Page<EtatPaie>>),
    toutesLesPages<EmployeServeur>(
      (page) => employesList({ page }) as Promise<Page<EmployeServeur>>,
    ),
    toutesLesPages<Demande>(
      (page) => demandesList({ type: 'paie', page }) as Promise<Page<Demande>>,
    ).catch(() => [] as Demande[]),
    parametresList().catch(() => null),
  ]);
  const aujourdhui = aujourdhuiLocal();
  const courant = aujourdhui.slice(0, 7);
  const parametre = ((parametres?.data ?? []) as Parametre[]).find((p) => p.cle === 'jour_de_paie');
  const jour = Number(parametre?.valeur ?? 5);
  const postes = new Map(employes.map((e) => [e.nom, e.poste ?? ''] as const));

  const recent = [...etats].sort((a, b) => b.mois.localeCompare(a.mois))[0];
  // Le dernier état est affiché tant qu'il est du mois ou pas soldé ; sinon, le mois est à préparer.
  const aAfficher =
    recent && (recent.statut !== 'payee' || moisDuServeur(recent.mois) >= courant)
      ? recent
      : undefined;
  const aPreparer = aAfficher ? null : courant;
  const mois = aAfficher ? moisDuServeur(aAfficher.mois) : courant;
  const demandeDe = aAfficher
    ? demandes.filter((d) => d.objet_id === aAfficher.id).sort((a, b) => b.id - a.id)[0]
    : undefined;
  const lignes: Employe[] = aAfficher
    ? aAfficher.lignes.map((l) => versEmploye(l, postes.get(l.employe) ?? ''))
    : employes
        .filter((e) => e.actif !== false)
        .map((e) => ({
          id: `employe-${e.id}`,
          nom: e.nom,
          poste: e.poste ?? '',
          base: e.salaire_base,
          absences: 0,
          avances: 0,
          impaye: 0,
          ajustements: [],
          paiements: [],
        }));
  const choix = (parametre?.choix ?? []) as number[];
  return {
    mois,
    statut: aAfficher ? (STATUTS[aAfficher.statut] ?? 'brouillon') : 'brouillon',
    jourDePaie: jourDePaieDuMois(mois, jour),
    joursPossibles: choix.map((c) => jourDePaieDuMois(mois, c)),
    soumisPar: demandeDe?.emetteur ? ((demandeDe.emetteur as { nom?: string }).nom ?? '') : '',
    validePar: demandeDe?.decide_par_nom ?? '',
    valideA: demandeDe?.decide_le ? heureDeYaounde(demandeDe.decide_le) : '',
    demande:
      demandeDe && demandeDe.statut === 'en_attente'
        ? { id: String(demandeDe.id), numero: demandeDe.numero }
        : null,
    employes: lignes,
    calendrier: versCalendrier(etats, courant, jour, aPreparer),
    aujourdhui,
    ...(aAfficher ? { etat: aAfficher.id } : { aPreparer }),
  };
}
