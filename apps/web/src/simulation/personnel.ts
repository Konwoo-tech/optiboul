import type { ModeDepense } from '@/espaces/comptoir/depenses/types.ts';
import {
  calculerPaie,
  droitsPaie,
  estModifiable,
  montantAPayer,
  paiementOuvert,
  totaux,
} from '@/espaces/gestion/personnel/regles.ts';
import {
  MODES_PAIEMENT,
  type Ajustement,
  type DemandeDePaie,
  type Employe,
  type InstantanePaie,
  type ModePaiement,
  type MoisDuCalendrier,
  type StatutPaie,
} from '@/espaces/gestion/personnel/types.ts';
import { jourSemaine } from '@/espaces/gestion/semaines/affichage.ts';
import { formaterNombre } from '@/utils';

import { dateDuJour, heureCourante } from './comptoir.ts';
import { enregistrerSalaire, type Acteur } from './depenses.ts';
import { consigner } from './journal.ts';
import { prochainNumeroDemande } from './numerosDemandes.ts';
import { personne } from './planning.ts';
import { lireUtilisateurConnecte } from './session.ts';

/*
 * Faux serveur de « Gestion › Personnel » (US-174, récits US-120 à US-124) : les données et les
 * règles de la maquette « OptiBoul ERP v2 » (état `payroll`, `payPlan`, fonctions `payCalc` et
 * `vPersonnel`). Les comptes (noms, profils) viennent de `planning.ts` / `donnees.ts` : un employé
 * qui a un compte n'est pas redéclaré ici. Chaque paiement crée une dépense « Salaires » dans
 * `depenses.ts`. La demande de validation de l'état de paie est tranchée par l'écran Demandes
 * (`demandes.ts` appelle `trancherDemandeDePaie`). Tout vit en mémoire.
 */

type Corps = Record<string, unknown>;
type Journal = { heure: string; qui: string; quoi: string };

const RACINE = '/api/v1/simulation/gestion/personnel/';
const MOIS_DE_LA_PAIE = '2026-10';

const probleme = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });
const refus = () => probleme(403, 'droit_insuffisant', 'Votre profil ne permet pas cette action.');

/** Nom du compte de démonstration ; `repli` pour un employé qui n'a pas de compte. */
const nomDe = (id: string, repli = id) => personne(id)?.nom ?? repli;

type Depart = {
  id: string;
  repli: string;
  poste: string;
  base: number;
  absences: number;
  avances: number;
  impaye: number;
  ajustements?: ReadonlyArray<readonly [Ajustement['type'], string, number, string, string]>;
};

/** Les huit employés de la maquette (`payroll.rows`), dans l'ordre de l'état de paie. */
const departs = (): readonly Depart[] => [
  {
    id: 'willy',
    repli: 'Willy',
    poste: 'Gérant',
    base: 80_000,
    absences: 0,
    avances: 20_000,
    impaye: 0,
  },
  {
    id: 'davy',
    repli: 'Davy',
    poste: 'Caissier',
    base: 60_000,
    absences: 1,
    avances: 10_000,
    impaye: 0,
    ajustements: [
      ['gain', 'Prime caisse juste · semaine 41', 5_000, '2026-10-11', 'patrick'],
      ['penalite', 'Manque de caisse · nuit du 12 oct.', 500, '2026-10-13', 'willy'],
    ],
  },
  {
    id: 'rachel',
    repli: 'Rachel',
    poste: 'Caissière',
    base: 60_000,
    absences: 0,
    avances: 0,
    impaye: 0,
  },
  {
    id: 'serge',
    repli: 'Serge',
    poste: 'Chef de production',
    base: 90_000,
    absences: 0,
    avances: 25_000,
    impaye: 0,
    ajustements: [
      ['gain', 'Prime production sans écart · semaine 41', 10_000, '2026-10-11', 'fotso'],
    ],
  },
  {
    id: 'ignace',
    repli: 'Ignace',
    poste: 'Boulanger',
    base: 70_000,
    absences: 2,
    avances: 15_000,
    impaye: 0,
    ajustements: [['penalite', 'Retard au pétrissage · 13 oct.', 2_000, '2026-10-13', 'serge']],
  },
  {
    id: 'martin',
    repli: 'Martin',
    poste: 'Boulanger',
    base: 70_000,
    absences: 0,
    avances: 0,
    impaye: 0,
  },
  {
    id: 'blaise',
    repli: 'Blaise',
    poste: 'Aide boulanger',
    base: 50_000,
    absences: 1,
    avances: 5_000,
    impaye: 15_000,
  },
  {
    id: 'odile',
    repli: 'Odile',
    poste: 'Vendeuse au guichet',
    base: 50_000,
    absences: 0,
    avances: 10_000,
    impaye: 5_000,
    ajustements: [
      ['gain', 'Heures supplémentaires · sam. 10 oct.', 3_000, '2026-10-10', 'patrick'],
    ],
  },
];

type DemandePaie = {
  id: string;
  numero: number;
  par: string;
  statut: 'en-attente' | 'acceptee' | 'refusee';
  /** Jour et heure d'émission. */
  jour: string;
  heure: string;
  mois: string;
  detail: string;
  detailEn: string;
  decidePar?: string;
  decideA?: string;
};

type Etat = {
  statut: StatutPaie;
  jourDePaie: string;
  soumisPar: string;
  validePar: string;
  valideA: string;
  employes: Employe[];
  /** Jours de paie des mois à venir, modifiables. */
  joursPlanifies: Record<string, string>;
  demandes: DemandePaie[];
  journal: Journal[];
};

/** Jours que le gérant peut choisir pour la paie d'octobre. */
const JOURS_OCTOBRE = ['2026-10-30', '2026-10-31', '2026-11-02'];
/** Jours proposés pour les paies planifiées. */
const joursPlanifiables = (): Record<string, string[]> => ({
  '2026-11': ['2026-11-27', '2026-11-28', '2026-11-30'],
  '2026-12': ['2026-12-30', '2026-12-31'],
});

let sequence = 0;

function etatInitial(): Etat {
  return {
    statut: 'brouillon',
    jourDePaie: '2026-10-31',
    soumisPar: '',
    validePar: '',
    valideA: '',
    employes: departs().map((d) => ({
      id: d.id,
      nom: nomDe(d.id, d.repli),
      poste: d.poste,
      base: d.base,
      absences: d.absences,
      avances: d.avances,
      impaye: d.impaye,
      ajustements: (d.ajustements ?? []).map(([type, libelle, montant, date, par], rang) => ({
        id: `${d.id}-${rang + 1}`,
        type,
        libelle,
        montant,
        date,
        par: nomDe(par),
      })),
      paiements: [],
    })),
    joursPlanifies: { '2026-11': '2026-11-30', '2026-12': '2026-12-31' },
    demandes: [],
    journal: [],
  };
}

let courant: Etat | undefined;
const lireEtat = (): Etat => (courant ??= etatInitial());

/** Remet la paie à son état de départ (tests). */
export function reinitialiserPersonnel(): void {
  courant = undefined;
  sequence = 0;
}

/** Actions tracées dans le journal, plus récentes en premier (tests). */
export function journalPersonnel(): readonly Journal[] {
  return lireEtat().journal;
}

function tracer(qui: string, quoi: string, changement?: { avant: string; apres: string }) {
  lireEtat().journal = [{ heure: heureCourante(), qui, quoi }, ...lireEtat().journal];
  consigner({ auteur: qui, type: 'paie', texte: quoi, ...changement });
}

/** « octobre 2026 » : le mois en toutes lettres, pour les libellés de dépense. */
const moisEnToutesLettres = (mois: string, langue = 'fr') =>
  new Intl.DateTimeFormat(langue, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${mois}-15T12:00:00Z`),
  );

const calendrier = (etat: Etat): MoisDuCalendrier[] => {
  const jours = joursPlanifiables();
  return [
    { mois: '2026-08', jour: '2026-08-31', statut: 'payee', total: 575_000, impayes: 0 },
    { mois: '2026-09', jour: '2026-09-30', statut: 'partielle', total: 588_000, impayes: 20_000 },
    { mois: MOIS_DE_LA_PAIE, jour: etat.jourDePaie, statut: 'courante' },
    ...Object.entries(etat.joursPlanifies).map(([mois, jour]) => ({
      mois,
      jour,
      statut: 'planifiee' as const,
      jours: jours[mois],
    })),
  ];
};

const demandeEnAttente = (etat: Etat): DemandeDePaie | null => {
  const d = etat.demandes.find((x) => x.statut === 'en-attente');
  return d ? { id: d.id, numero: d.numero } : null;
};

function instantane(): InstantanePaie {
  const etat = lireEtat();
  return structuredClone({
    mois: MOIS_DE_LA_PAIE,
    statut: etat.statut,
    jourDePaie: etat.jourDePaie,
    joursPossibles: JOURS_OCTOBRE,
    soumisPar: etat.soumisPar,
    validePar: etat.validePar,
    valideA: etat.valideA,
    demande: demandeEnAttente(etat),
    employes: etat.employes,
    calendrier: calendrier(etat),
    aujourdhui: dateDuJour(),
  });
}

const reponse = () => Response.json(instantane());

function acteur(): Acteur | undefined {
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur) return undefined;
  const { profil, nom } = utilisateur;
  return profil === 'gerant' || profil === 'proprietaire' ? { nom, profil } : undefined;
}

const MODE_DE_DEPENSE: Record<ModePaiement, ModeDepense> = {
  especes: 'caisse',
  mobile: 'mobile',
  banque: 'banque',
};

const modeSaisi = (valeur: unknown): ModePaiement | undefined =>
  MODES_PAIEMENT.find((m) => m === valeur);

/** R7 : la référence de la transaction est obligatoire pour tout paiement par mobile money. */
function referenceDe(mode: ModePaiement, corps: Corps): string | null {
  const reference = typeof corps.reference === 'string' ? corps.reference.trim().slice(0, 60) : '';
  return mode === 'mobile' && !reference ? null : reference;
}

const referenceManquante = () =>
  probleme(400, 'reference_obligatoire', 'Indiquez la référence de la transaction mobile money.');

const verrouille = () =>
  probleme(409, 'etat_verrouille', 'Les lignes sont verrouillées une fois l’état de paie soumis.');
const fermee = () =>
  probleme(409, 'paiement_ferme', 'Le paiement s’ouvre après validation par le propriétaire.');

function choisirLeJour(a: Acteur, corps: Corps): Response {
  const etat = lireEtat();
  if (!droitsPaie(a.profil).preparer) return refus();
  if (!estModifiable(etat.statut)) return verrouille();
  const jour = corps.jour;
  if (typeof jour !== 'string' || !JOURS_OCTOBRE.includes(jour)) {
    return probleme(400, 'jour_invalide', 'Ce jour de paie n’est pas proposé.');
  }
  const avant = etat.jourDePaie;
  etat.jourDePaie = jour;
  tracer(a.nom, `Jour de paie d’octobre fixé au ${jour}`, { avant, apres: jour });
  return reponse();
}

function planifierLeMois(a: Acteur, corps: Corps): Response {
  const etat = lireEtat();
  if (!droitsPaie(a.profil).preparer) return refus();
  const mois = typeof corps.mois === 'string' ? corps.mois : '';
  const jours = joursPlanifiables()[mois];
  if (!jours) return probleme(404, 'mois_inconnu', 'Ce mois n’est pas planifiable.');
  if (typeof corps.jour !== 'string' || !jours.includes(corps.jour)) {
    return probleme(400, 'jour_invalide', 'Ce jour de paie n’est pas proposé.');
  }
  const avant = etat.joursPlanifies[mois] ?? '';
  etat.joursPlanifies[mois] = corps.jour;
  tracer(a.nom, `Jour de paie de ${moisEnToutesLettres(mois)} planifié au ${corps.jour}`, {
    avant,
    apres: corps.jour,
  });
  return reponse();
}

function ajouterUneLigne(a: Acteur, corps: Corps): Response {
  const etat = lireEtat();
  if (!droitsPaie(a.profil).preparer) return refus();
  const employe = etat.employes.find((e) => e.id === corps.employe);
  if (!employe) return probleme(404, 'employe_inconnu', 'Employé inconnu.');
  if (!estModifiable(etat.statut)) return verrouille();
  const libelle = typeof corps.libelle === 'string' ? corps.libelle.trim() : '';
  const { type, montant } = corps;
  if (type !== 'gain' && type !== 'penalite') {
    return probleme(400, 'type_invalide', 'Choisissez un gain ou une pénalité.');
  }
  if (!libelle) return probleme(400, 'libelle_obligatoire', 'Indiquez la description.');
  if (typeof montant !== 'number' || !Number.isInteger(montant) || montant <= 0) {
    return probleme(400, 'montant_invalide', 'Indiquez un montant en FCFA.');
  }
  employe.ajustements.push({
    id: `a${Date.now()}-${++sequence}`,
    type,
    libelle,
    montant,
    date: dateDuJour(),
    par: a.nom,
  });
  tracer(
    a.nom,
    `${type === 'gain' ? 'Gain' : 'Pénalité'} ajouté(e) à ${employe.nom} : ${libelle} – ${montant} FCFA`,
  );
  return reponse();
}

function retirerUneLigne(a: Acteur, id: string): Response {
  const etat = lireEtat();
  if (!droitsPaie(a.profil).preparer) return refus();
  const employe = etat.employes.find((e) => e.ajustements.some((l) => l.id === id));
  const ligne = employe?.ajustements.find((l) => l.id === id);
  if (!employe || !ligne) return probleme(404, 'ligne_inconnue', 'Ligne inconnue.');
  if (!estModifiable(etat.statut)) return verrouille();
  employe.ajustements = employe.ajustements.filter((l) => l.id !== id);
  tracer(a.nom, `Suppression de la ligne « ${ligne.libelle} » (${employe.nom})`);
  return reponse();
}

/** Détail de la demande, en français et en anglais (la maquette ne traduit que le titre). */
function detailsDeLaDemande(etat: Etat): Pick<DemandePaie, 'detail' | 'detailEn'> {
  const net = formaterNombre(totaux(etat.employes).net);
  const n = etat.employes.length;
  return {
    detail: `${net} FCFA net · ${n} employés · paie prévue le ${jourSemaine(etat.jourDePaie, 'fr')}`,
    detailEn: `${net} FCFA net · ${n} employees · payday ${jourSemaine(etat.jourDePaie, 'en')}`,
  };
}

function soumettre(a: Acteur): Response {
  const etat = lireEtat();
  if (!droitsPaie(a.profil).soumettre) return refus();
  if (etat.statut !== 'brouillon') {
    return probleme(409, 'deja_soumis', 'L’état de paie a déjà été soumis.');
  }
  etat.statut = 'soumis';
  etat.soumisPar = a.nom;
  etat.demandes = [
    {
      id: `p${Date.now()}-${++sequence}`,
      numero: prochainNumeroDemande(),
      par: a.nom,
      statut: 'en-attente',
      jour: dateDuJour(),
      heure: heureCourante(),
      mois: MOIS_DE_LA_PAIE,
      ...detailsDeLaDemande(etat),
    },
    ...etat.demandes,
  ];
  tracer(
    a.nom,
    `État de paie ${moisEnToutesLettres(MOIS_DE_LA_PAIE)} soumis au propriétaire (${totaux(etat.employes).net} FCFA)`,
  );
  return reponse();
}

/** Paiement d'un salaire : l'enregistre sur l'employé et crée la dépense « Salaires » (R12). */
function payer(
  a: Acteur,
  employe: Employe,
  montant: number,
  mode: ModePaiement,
  reference: string,
): string {
  const etat = lireEtat();
  employe.paiements.push({
    montant,
    mode,
    date: dateDuJour(),
    par: a.nom,
    ...(reference ? { reference } : {}),
  });
  const depense = enregistrerSalaire(a, {
    libelle: `Salaire ${moisEnToutesLettres(MOIS_DE_LA_PAIE)} · ${employe.nom}`,
    montant,
    mode: MODE_DE_DEPENSE[mode],
  });
  etat.statut = etat.employes.every((e) => calculerPaie(e).reste <= 0) ? 'payee' : 'en-paiement';
  return `DEP-${String(depense.numero).padStart(4, '0')}`;
}

function payerUnSalaire(a: Acteur, corps: Corps): Response {
  const etat = lireEtat();
  if (!droitsPaie(a.profil).payer) return refus();
  const employe = etat.employes.find((e) => e.id === corps.employe);
  if (!employe) return probleme(404, 'employe_inconnu', 'Employé inconnu.');
  if (!paiementOuvert(etat.statut)) return fermee();
  const mode = modeSaisi(corps.mode);
  if (!mode) return probleme(400, 'mode_inconnu', 'Mode de paiement inconnu.');
  const reference = referenceDe(mode, corps);
  if (reference === null) return referenceManquante();
  const { reste } = calculerPaie(employe);
  if (reste <= 0) return probleme(409, 'deja_paye', 'Ce salaire est déjà soldé.');
  const demande = corps.montant;
  if (
    demande !== undefined &&
    (typeof demande !== 'number' || !Number.isInteger(demande) || demande <= 0 || demande > reste)
  ) {
    return probleme(
      400,
      'montant_invalide',
      'Indiquez un montant en FCFA, au plus le reste à payer.',
    );
  }
  const montant = montantAPayer(String(demande ?? ''), reste);
  const code = payer(a, employe, montant, mode, reference);
  tracer(
    a.nom,
    `Paiement salaire ${employe.nom} : ${montant} FCFA (${mode})${
      montant < reste ? ` · reste ${reste - montant} FCFA impayé` : ''
    } · ${code}`,
  );
  return Response.json({ instantane: instantane(), depenses: [code] });
}

function payerLesRestes(a: Acteur, corps: Corps): Response {
  const etat = lireEtat();
  if (!droitsPaie(a.profil).payer) return refus();
  if (!paiementOuvert(etat.statut)) return fermee();
  const mode = modeSaisi(corps.mode);
  if (!mode) return probleme(400, 'mode_inconnu', 'Mode de paiement inconnu.');
  const reference = referenceDe(mode, corps);
  if (reference === null) return referenceManquante();
  const codes = etat.employes.flatMap((employe) => {
    const { reste } = calculerPaie(employe);
    return reste > 0 ? [payer(a, employe, reste, mode, reference)] : [];
  });
  if (codes.length === 0) return probleme(409, 'rien_a_payer', 'Tous les salaires sont soldés.');
  tracer(
    a.nom,
    `Paie ${moisEnToutesLettres(MOIS_DE_LA_PAIE)} : ${codes.length} salaires payés (${mode})`,
  );
  return Response.json({ instantane: instantane(), depenses: codes });
}

export type ResultatDecision = 'ok' | 'inconnue' | 'interdit' | 'deja-decidee';

/** Demandes de validation de l'état de paie, plus récentes d'abord (écran « Demandes »). */
export function demandesDePaie(): readonly DemandePaie[] {
  return structuredClone(lireEtat().demandes);
}

/**
 * Accord ou refus de l'état de paie, par le propriétaire seul : accordé, le paiement s'ouvre ;
 * refusé, l'état revient en brouillon (maquette : `decide`).
 */
export function trancherDemandeDePaie(
  a: { nom: string; profil: string },
  id: string,
  accord: boolean,
): ResultatDecision {
  const etat = lireEtat();
  const demande = etat.demandes.find((d) => d.id === id);
  if (!demande) return 'inconnue';
  if (a.profil !== 'proprietaire') return 'interdit';
  if (demande.statut !== 'en-attente') return 'deja-decidee';
  demande.statut = accord ? 'acceptee' : 'refusee';
  demande.decidePar = a.nom;
  demande.decideA = heureCourante();
  etat.statut = accord ? 'valide' : 'brouillon';
  etat.validePar = accord ? a.nom : '';
  etat.valideA = accord ? heureCourante() : '';
  if (!accord) etat.soumisPar = '';
  tracer(
    a.nom,
    `${accord ? 'Accord' : 'Refus'} – État de paie ${moisEnToutesLettres(demande.mois)}`,
  );
  return 'ok';
}

/** Réponses de « Gestion › Personnel » ; `undefined` pour une route qui n'est pas la sienne. */
export function repondrePersonnel(url: URL, methode: string, corps: Corps): Response | undefined {
  if (!url.pathname.startsWith(RACINE)) return undefined;
  const appel = `${methode} ${url.pathname.slice(RACINE.length)}`;

  if (!lireUtilisateurConnecte()) return probleme(403, 'non_authentifie', 'Connexion requise.');
  const a = acteur();
  if (!a) return refus();

  const suppression = /^DELETE ajustements\/([^/]+)\/$/.exec(appel);
  if (suppression) return retirerUneLigne(a, suppression[1]!);

  switch (appel) {
    case 'GET ':
      return reponse();
    case 'PUT jour/':
      return choisirLeJour(a, corps);
    case 'PUT calendrier/':
      return planifierLeMois(a, corps);
    case 'POST ajustements/':
      return ajouterUneLigne(a, corps);
    case 'POST soumettre/':
      return soumettre(a);
    case 'POST paiements/':
      return payerUnSalaire(a, corps);
    case 'POST paiements/restes/':
      return payerLesRestes(a, corps);
    default:
      return undefined;
  }
}
