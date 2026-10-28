import {
  actionDuCycle,
  bornerSupplement,
  calculerPlan,
  calculerDemande,
  champInvalide,
  consommationComplete,
  droitsProduction,
  ecartAJustifier,
  ecartEnKg,
  limiteEcartKg,
  peutSaisir,
  realiseComplet,
  SEUIL_ECART_KG_PAR_SAC,
  sortiesDeStock,
  supplementEnDemande,
  supplementPossible,
  supplementVide,
  totalSacs,
  type DroitsProduction,
} from '@/espaces/atelier/production/regles.ts';
import {
  ETAPES,
  INGREDIENTS,
  MOTIFS_ECART,
  type MotifEcart,
  MOTIFS_SUPPLEMENT,
  type Consommation,
  type DemandeProduction,
  type Etape,
  type FicheProduit,
  type InstantaneFiches,
  type InstantaneProduction,
  type Jalon,
  type Justification,
  type LigneHistorique,
  type MotifSupplement,
  type Quantites,
  type Realise,
  type Recette,
} from '@/espaces/atelier/production/types.ts';
import { MATIERES } from '@/espaces/comptoir/depenses/types.ts';
import { CLES_PRODUIT } from '@/espaces/comptoir/session/types.ts';
import { formaterDateCourte, formaterNombre, type Creneau } from '@/utils';

import type { Profil } from '../profils.ts';
import {
  abonnerOuvertureDeSession,
  commandesDeLaSession,
  dateDuJour,
  heureCourante,
} from './comptoir.ts';
import type { NotificationSimulee } from './notifications.ts';
import { contexteSemaines } from './planning.ts';
import { prochainNumeroDemande } from './numerosDemandes.ts';
import { lireUtilisateurConnecte } from './session.ts';
import { prixDesMatieres, sortirDuStockDepuisProduction, stockDesMatieres } from './stocks.ts';

/*
 * Faux serveur de « Atelier › Production » (US-169, récits US-080 à US-089) : les données et les
 * règles de la maquette « OptiBoul ERP v2 » (fonctions plan, demand, vProduction, vProdFlow,
 * prodRecord, prodOuts, vProduit). Il lit les commandes dans la session (`comptoir.ts`), le stock
 * dans `stock.ts`, et range ses demandes d'augmentation dans l'écran « Demandes » (`demandes.ts`).
 * Tout vit en mémoire : un rechargement de la page remet la production à son état de départ.
 */

type Corps = Record<string, unknown>;

const RACINE = '/api/v1/simulation/atelier/production/';

const probleme = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });

const refus = () => probleme(403, 'droit_insuffisant', 'Votre profil ne permet pas cette action.');

/** Gérant et responsable de production de la semaine 42 (maquette). */
const GERANT = 'Willy';
const RESPONSABLE = 'Serge';

/** Semaine courante, gérant et responsable : ils suivent l'écran des semaines (`planning.ts`). */
function equipeDeLaSemaine() {
  const { semaine, gerantDeLaSemaine, responsableProduction } = contexteSemaines();
  return { semaine, gerant: gerantDeLaSemaine, responsable: responsableProduction };
}

type Journal = { heure: string; qui: string; quoi: string };

/** Demande d'augmentation de production, telle que l'écran « Demandes » la range. */
export type DemandeDeProduction = DemandeProduction & {
  par: string;
  jour: string;
  heure: string;
  statut: 'en-attente' | 'acceptee' | 'refusee';
  decidePar: string;
  decideA: string;
};

type Evenement = {
  id: string;
  /** Profils qui reçoivent la notification. */
  pour: readonly Profil[];
  jour: string;
  heure: string;
  fr: { titre: string; detail: string };
  en: { titre: string; detail: string };
};

type Etat = {
  session: { type: Creneau; date: string };
  etape: Etape;
  planPropose: Jalon | null;
  planValide: Jalon | null;
  ouverte: Jalon | null;
  cloturee: Jalon | null;
  supplement: Quantites;
  realise: Realise;
  consommation: Consommation;
  justification: Justification | null;
  /** Qui a justifié l'écart de matières (tableau de bord). */
  justifiePar: string | null;
  demandes: DemandeDeProduction[];
  historique: LigneHistorique[];
  evenements: Evenement[];
  fiches: FicheProduit[];
  journal: Journal[];
};

const realiseVide = (): Realise => ({ BAG: null, KO: null, GC: null });

const consommationVide = (): Consommation => ({
  farine: null,
  sel: null,
  levure: null,
  ameliorant: null,
  glace: null,
  bois: null,
  huile: null,
});

const execution = (
  date: string,
  type: Creneau,
  sacs: number,
  prevus: number,
  realise: number,
  ecartKg: number,
  ouvertA: string,
  clotureA: string,
  note?: string,
): LigneHistorique => ({
  id: `P-${date}-${type}`,
  date,
  type,
  responsable: RESPONSABLE,
  validePar: GERANT,
  ouvertA,
  clotureA,
  sacs,
  prevus,
  realise,
  ecartKg,
  statut: 'cloturee',
  ...(note ? { note } : {}),
});

/** Les cinq productions déjà clôturées de la semaine 42 (maquette : `prodRuns`). */
const historiqueDeDepart = (): LigneHistorique[] => [
  execution('2026-10-12', 'jour', 6, 1894, 1871, 3.1, '06:30', '13:40'),
  execution('2026-10-12', 'nuit', 9, 2862, 2840, 4, '19:02', '05:10'),
  execution('2026-10-13', 'jour', 6, 1890, 1902, 2.2, '06:31', '13:35'),
  execution(
    '2026-10-13',
    'nuit',
    8,
    2565,
    2498,
    21.4,
    '19:00',
    '05:20',
    'Brûlés (four 2), justifié par Serge',
  ),
  execution('2026-10-14', 'jour', 6, 1894, 1880, 5, '06:29', '13:42'),
];

const RECETTE_DE_BASE = {
  farine: 50,
  eau: 27.4,
  sel: 0.6,
  levure: 0.45,
  ameliorant: 0.3,
  glace: 5,
} as const;

const fiche = (
  id: string,
  code: string,
  nom: string,
  nomEn: string,
  boule: number,
  pb: number,
  prix: FicheProduit['prix'],
  produitsOctobre: number,
  cuisson: number,
): FicheProduit => ({
  id,
  code,
  nom,
  nomEn,
  recette: { ...RECETTE_DE_BASE, boule, pb },
  version: 3,
  modifieLe: '2026-10-02',
  modifieA: '',
  modifiePar: 'M. Fotso',
  prix,
  produitsOctobre,
  cuisson,
});

/** Les sept produits de la maquette (constante PRD), avec leurs fiches techniques. */
const fichesDeDepart = (): FicheProduit[] => [
  fiche('bag', 'BAG', 'Baguette', 'Baguette', 5000, 20, [100, 110], 34_120, 18),
  fiche('ko', 'KO', 'Kirikou', 'Kirikou', 3700, 20, [70, 75], 15_400, 14),
  fiche('gc135', 'GC 135', 'Gros court 135', 'Short loaf 135', 7300, 20, [160, 165], 4_300, 24),
  fiche('gc170', 'GC 170', 'Gros court 170', 'Short loaf 170', 4500, 10, null, 620, 28),
  fiche('pl', 'PL', 'Pain long', 'Long loaf', 7300, 20, null, 1_150, 24),
  fiche('c2', 'C2', 'Coupé en 2', 'Split loaf', 7300, 20, [165, 165], 80, 24),
  fiche('psl', 'PSL', 'Spéciaux', 'Specials', 5250, 10, null, 0, 30),
];

/**
 * État de départ de la maquette : la production de la nuit du 14 octobre est en cours, le plan
 * proposé par Serge à 17:20, validé par Willy à 17:42, la production ouverte à 19:05.
 */
function etatInitial(): Etat {
  const { type, date } = commandesDeLaSession();
  return {
    session: { type, date },
    etape: 'en-cours',
    planPropose: { par: RESPONSABLE, a: '17:20' },
    planValide: { par: GERANT, a: '17:42' },
    ouverte: { par: RESPONSABLE, a: '19:05' },
    cloturee: null,
    supplement: supplementVide(),
    realise: realiseVide(),
    consommation: consommationVide(),
    justification: null,
    justifiePar: null,
    demandes: [],
    historique: historiqueDeDepart(),
    evenements: [],
    fiches: fichesDeDepart(),
    journal: [],
  };
}

let courant: Etat | undefined;
const lireEtat = (): Etat => (courant ??= etatInitial());
let sequence = 0;

/** Remet la production à son état de départ (tests). */
export function reinitialiserProduction(): void {
  courant = undefined;
  sequence = 0;
}

/** Actions tracées dans le journal, plus récentes en premier (tests). */
export function journalProduction(): readonly Journal[] {
  return lireEtat().journal;
}

function tracer(qui: string, quoi: string) {
  lireEtat().journal = [{ heure: heureCourante(), qui, quoi }, ...lireEtat().journal];
}

/**
 * Ce que le tableau de bord signale de la production : les productions archivées « non clôturées »
 * (US-085) et l'écart de matières justifié de la session en cours (R10, US-084).
 */
export function signauxDeProduction(): {
  nonCloturees: Array<{ jour: string; creneau: Creneau }>;
  ecartsMatiere: Array<{ par: string; motif: MotifEcart }>;
} {
  sAbonner();
  const { historique, justification, justifiePar } = lireEtat();
  return {
    nonCloturees: historique
      .filter((ligne) => ligne.statut === 'non-cloturee')
      .map((ligne) => ({ jour: ligne.date, creneau: ligne.type })),
    ecartsMatiere:
      justification && justifiePar ? [{ par: justifiePar, motif: justification.motif }] : [],
  };
}

/** Une production est en cours ou son plan attend : la semaine ne peut pas se clôturer (R3). */
export function productionEnCours(): boolean {
  return ['plan-propose', 'plan-valide', 'en-cours'].includes(lireEtat().etape);
}

/**
 * Ce que l'écran des semaines lit de la production : les productions rattachées aux semaines (celles
 * de l'historique) et, tant que le cycle n'est pas clôturé, celle de la session en cours.
 */
export function productionsRattachees(): {
  historique: ReadonlyArray<
    Pick<LigneHistorique, 'date' | 'type' | 'sacs' | 'note' | 'motif' | 'responsable'>
  >;
  enCours: { date: string; type: Creneau; sacs: number } | null;
} {
  sAbonner();
  const etat = lireEtat();
  const plan = calculerPlan(commandesDeLaSession().pains, etat.supplement);
  return {
    historique: etat.historique.map(({ date, type, sacs, note, motif, responsable }) => ({
      date,
      type,
      sacs,
      responsable,
      ...(note ? { note } : {}),
      ...(motif ? { motif } : {}),
    })),
    enCours: productionEnCours()
      ? { date: etat.session.date, type: etat.session.type, sacs: plan.sacs }
      : null,
  };
}

// ───────────────────────────── notifications ─────────────────────────────

const libelleSession = ({ type, date }: { type: Creneau; date: string }, langue: 'fr' | 'en') =>
  langue === 'fr'
    ? `${type === 'nuit' ? 'Nuit' : 'Jour'} du ${formaterDateCourte(new Date(date), 'fr')}`
    : `${type === 'nuit' ? 'Night' : 'Day'} of ${formaterDateCourte(new Date(date), 'en')}`;

function annoncer(
  pour: readonly Profil[],
  fr: Evenement['fr'],
  en: Evenement['en'],
  jour = dateDuJour(),
) {
  const etat = lireEtat();
  etat.evenements = [
    { id: `production-evt-${++sequence}`, pour, jour, heure: heureCourante(), fr, en },
    ...etat.evenements,
  ];
}

const sacs = (n: number) => `${n} sac(s)`;

const texteSupplement = (quantites: Quantites): string =>
  CLES_PRODUIT.filter((cle) => quantites[cle] > 0)
    .map((cle) => `${cle === 'GC' ? 'GC 135' : cle} +${quantites[cle]} sac(s)`)
    .join(' · ');

// ───────────────────────────── lecture ─────────────────────────────

function instantane(): InstantaneProduction {
  const etat = lireEtat();
  const commandes = commandesDeLaSession();
  const plan = calculerPlan(commandes.pains, etat.supplement);
  const attente = etat.demandes.find((d) => d.statut === 'en-attente');
  return structuredClone({
    session: etat.session,
    ...equipeDeLaSemaine(),
    caissiere: commandes.caissiere,
    etape: etat.etape,
    planPropose: etat.planPropose,
    planValide: etat.planValide,
    ouverte: etat.ouverte,
    cloturee: etat.cloturee,
    clientsCommandes: commandes.clientsAyantCommande,
    plan,
    demande: calculerDemande(plan, commandes.habituelsSansCommande),
    realise: etat.realise,
    consommation: etat.consommation,
    justification: etat.justification,
    seuilEcartKg: SEUIL_ECART_KG_PAR_SAC,
    stock: stockDesMatieres(),
    demandeEnAttente: attente
      ? {
          id: attente.id,
          numero: attente.numero,
          supplement: attente.supplement,
          total: attente.total,
          motif: attente.motif,
        }
      : null,
    historique: etat.historique,
  });
}

const reponse = (extra: object = {}) => Response.json({ instantane: instantane(), ...extra });

// ───────────────────────────── acteur et droits ─────────────────────────────

type Acteur = { nom: string; profil: Profil; droits: DroitsProduction };

function acteur(): Acteur | undefined {
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur) return undefined;
  const { responsable, gerant } = equipeDeLaSemaine();
  const droits = droitsProduction(utilisateur.profil, utilisateur.nom, { responsable, gerant });
  return droits.voir ? { nom: utilisateur.nom, profil: utilisateur.profil, droits } : undefined;
}

const etapeInvalide = () =>
  probleme(409, 'etape_invalide', 'Cette action n’est pas possible à cette étape du cycle.');

// ───────────────────────────── cycle ─────────────────────────────

function avancer(a: Acteur, action: 'proposer' | 'valider' | 'ouvrir'): Response {
  const etat = lireEtat();
  if (actionDuCycle(etat.etape, a.droits) !== action) {
    // Droit manquant ou mauvaise étape : on distingue les deux pour que l'écran réagisse juste.
    const etapeAttendue: Record<typeof action, Etape> = {
      proposer: 'commandes',
      valider: 'plan-propose',
      ouvrir: 'plan-valide',
    };
    return etat.etape === etapeAttendue[action] ? refus() : etapeInvalide();
  }
  const jalon = { par: a.nom, a: heureCourante() };
  const plan = calculerPlan(commandesDeLaSession().pains, etat.supplement);
  const nom = libelleSession(etat.session, 'fr');
  const nomEn = libelleSession(etat.session, 'en');
  if (action === 'proposer') {
    etat.etape = 'plan-propose';
    etat.planPropose = jalon;
    tracer(a.nom, `Plan de production proposé : ${plan.sacs} sacs (${nom})`);
    annoncer(
      ['gerant', 'proprietaire'],
      {
        titre: `Plan de production proposé · ${plan.sacs} sacs`,
        detail: `Proposé par ${a.nom} (${nom}). À valider avant le pétrissage.`,
      },
      {
        titre: `Production plan proposed · ${plan.sacs} sacks`,
        detail: `Proposed by ${a.nom} (${nomEn}). Approve before kneading.`,
      },
    );
  } else if (action === 'valider') {
    etat.etape = 'plan-valide';
    etat.planValide = jalon;
    tracer(a.nom, `Plan de production validé (${plan.sacs} sacs, ${nom})`);
    annoncer(
      ['production', 'caissier', 'proprietaire'],
      {
        titre: `Plan de production validé · ${plan.sacs} sacs`,
        detail: `Validé par ${a.nom} (${nom}). ${formaterNombre(plan.prevus)} pains prévus.`,
      },
      {
        titre: `Production plan approved · ${plan.sacs} sacks`,
        detail: `Approved by ${a.nom} (${nomEn}). ${formaterNombre(plan.prevus)} loaves planned.`,
      },
    );
  } else {
    etat.etape = 'en-cours';
    etat.ouverte = jalon;
    tracer(a.nom, `Ouverture de la production (${nom})`);
    annoncer(
      ['caissier', 'gerant', 'proprietaire'],
      {
        titre: 'Production ouverte · pétrissage en cours',
        detail: `Ouverte par ${a.nom}. Le reste à produire est suivi en direct.`,
      },
      {
        titre: 'Production open · kneading in progress',
        detail: `Opened by ${a.nom}. Remaining output is tracked live.`,
      },
    );
  }
  return reponse();
}

/** Valeurs entières positives ou nulles ; `null` ou absente : rien de saisi. `undefined` : invalide. */
function lireValeurs<K extends string>(
  brut: unknown,
  cles: readonly K[],
): Record<K, number | null> | undefined {
  if (typeof brut !== 'object' || brut === null) return undefined;
  const lues = {} as Record<K, number | null>;
  for (const cle of cles) {
    const valeur = (brut as Record<string, unknown>)[cle];
    if (valeur === undefined || valeur === null) {
      lues[cle] = null;
    } else if (typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 0) {
      lues[cle] = valeur;
    } else {
      return undefined;
    }
  }
  return lues;
}

const valeurInvalide = () =>
  probleme(400, 'valeur_invalide', 'Saisissez des nombres entiers positifs ou nuls.');

const saisieFermee = () =>
  probleme(
    409,
    'saisie_fermee',
    'La saisie est ouverte pendant la production, par son responsable.',
  );

function saisir(a: Acteur, corps: Corps, quoi: 'realise' | 'consommation'): Response {
  const etat = lireEtat();
  if (!a.droits.responsable) return refus();
  if (!peutSaisir(etat.etape, a.droits)) return saisieFermee();
  if (quoi === 'realise') {
    const valeurs = lireValeurs(corps, CLES_PRODUIT);
    if (!valeurs) return valeurInvalide();
    etat.realise = valeurs;
    tracer(a.nom, `Production réalisée enregistrée (${libelleSession(etat.session, 'fr')})`);
  } else {
    const valeurs = lireValeurs(corps, MATIERES);
    if (!valeurs) return valeurInvalide();
    etat.consommation = valeurs;
    tracer(a.nom, `Consommation réelle enregistrée (${libelleSession(etat.session, 'fr')})`);
  }
  return reponse();
}

const dans = <T extends string>(valeurs: readonly T[], valeur: unknown): valeur is T =>
  typeof valeur === 'string' && (valeurs as readonly string[]).includes(valeur);

function justifier(a: Acteur, corps: Corps): Response {
  const etat = lireEtat();
  if (!a.droits.responsable) return refus();
  if (!peutSaisir(etat.etape, a.droits)) return saisieFermee();
  const consommation = lireValeurs(corps.consommation, MATIERES);
  if (!consommation) return valeurInvalide();
  if (!dans(MOTIFS_ECART, corps.motif)) {
    return probleme(400, 'motif_obligatoire', 'Choisissez un motif.');
  }
  const plan = calculerPlan(commandesDeLaSession().pains, etat.supplement);
  const kg = ecartEnKg(consommation, plan.sacs);
  if (!ecartAJustifier(kg, limiteEcartKg(SEUIL_ECART_KG_PAR_SAC, plan.sacs))) {
    return probleme(
      409,
      'pas_d_ecart',
      'L’écart de matières est sous le seuil : rien à justifier.',
    );
  }
  const texte = typeof corps.texte === 'string' ? corps.texte.trim() : '';
  etat.consommation = consommation;
  etat.justification = { motif: corps.motif, texte };
  etat.justifiePar = a.nom;
  tracer(
    a.nom,
    `Écart matière justifié : ${corps.motif}${texte ? ` – ${texte}` : ''} (${kg.toFixed(1)} kg)`,
  );
  const ecart = kg.toFixed(1);
  annoncer(
    ['gerant', 'proprietaire'],
    {
      titre: `Écart de matières justifié · ${ecart.replace('.', ',')} kg`,
      detail: `Justifié par ${a.nom} : ${corps.motif}${texte ? ` – ${texte}` : ''}.`,
    },
    {
      titre: `Material gap explained · ${ecart} kg`,
      detail: `Explained by ${a.nom}: ${corps.motif}${texte ? ` – ${texte}` : ''}.`,
    },
  );
  return reponse();
}

function cloturer(a: Acteur, corps: Corps): Response {
  const etat = lireEtat();
  if (!a.droits.responsable) return refus();
  if (etat.etape !== 'en-cours') return etapeInvalide();
  const realise = lireValeurs(corps.realise, CLES_PRODUIT);
  const consommation = lireValeurs(corps.consommation, MATIERES);
  if (!realise || !consommation) return valeurInvalide();
  // R5 : pas de clôture sans le réalisé ni la consommation réelle.
  if (!realiseComplet(realise)) {
    return probleme(409, 'realise_requis', 'Saisissez la production réalisée avant de clôturer.');
  }
  if (!consommationComplete(consommation)) {
    return probleme(
      409,
      'consommation_requise',
      'Saisissez la consommation réelle avant de clôturer.',
    );
  }
  // R10 : un écart de matières au-delà du seuil se justifie avant la clôture.
  const sacsDuPlan = calculerPlan(commandesDeLaSession().pains, etat.supplement).sacs;
  if (
    !etat.justification &&
    ecartAJustifier(
      ecartEnKg(consommation, sacsDuPlan),
      limiteEcartKg(SEUIL_ECART_KG_PAR_SAC, sacsDuPlan),
    )
  ) {
    return probleme(
      409,
      'justification_requise',
      'L’écart de matières dépasse le seuil : justifiez-le avant de clôturer.',
    );
  }
  etat.realise = realise;
  etat.consommation = consommation;

  const plan = calculerPlan(commandesDeLaSession().pains, etat.supplement);
  const jalon = { par: a.nom, a: heureCourante() };
  const sorties = sortiesDeStock(consommation);
  sortirDuStockDepuisProduction({
    creneau: etat.session.type,
    date: etat.session.date,
    consommations: sorties.map(({ matiere, quantite }) => ({ matiere, quantite })),
    par: a.nom,
  });

  const total = CLES_PRODUIT.reduce((somme, cle) => somme + (realise[cle] ?? 0), 0);
  etat.etape = 'cloturee';
  etat.cloturee = jalon;
  etat.historique = [
    ...etat.historique,
    {
      id: `P-${etat.session.date}-${etat.session.type}`,
      date: etat.session.date,
      type: etat.session.type,
      responsable: a.nom,
      validePar: etat.planValide?.par ?? '—',
      ouvertA: etat.ouverte?.a ?? '—',
      clotureA: jalon.a,
      sacs: plan.sacs,
      prevus: plan.prevus,
      realise: total,
      ecartKg: Math.round(ecartEnKg(consommation, plan.sacs) * 10) / 10,
      statut: 'cloturee',
      ...(etat.justification ? { motif: etat.justification.motif } : {}),
    },
  ];
  tracer(
    a.nom,
    `Clôture de la production (${libelleSession(etat.session, 'fr')}) · ${formaterNombre(total)} pains réalisés sur ${formaterNombre(plan.prevus)} · ${sorties.length} sorties de stock`,
  );
  annoncer(
    ['gerant', 'proprietaire', 'caissier'],
    {
      titre: `Production clôturée · ${formaterNombre(total)} pains`,
      detail: `Sur ${formaterNombre(plan.prevus)} prévus. Sorties de stock enregistrées.`,
    },
    {
      titre: `Production closed · ${formaterNombre(total)} loaves`,
      detail: `Of ${formaterNombre(plan.prevus)} planned. Stock issues recorded.`,
    },
  );
  return reponse({ sorties });
}

// ───────────────────────────── supplément ─────────────────────────────

function ajouterSupplement(a: Acteur, corps: Corps): Response {
  const etat = lireEtat();
  if (!a.droits.responsable) return refus();
  if (etat.etape === 'cloturee') {
    return probleme(409, 'production_cloturee', 'La production est clôturée : plus d’ajout.');
  }
  if (
    !supplementPossible(
      etat.etape,
      a.droits,
      etat.demandes.some((d) => d.statut === 'en-attente'),
    )
  ) {
    return probleme(
      409,
      'demande_en_attente',
      'Une demande d’augmentation attend déjà la réponse du gérant.',
    );
  }
  const brut = corps.sacs;
  const lus = lireValeurs(brut, CLES_PRODUIT);
  if (!lus || CLES_PRODUIT.some((cle) => bornerSupplement(lus[cle] ?? 0) !== (lus[cle] ?? 0))) {
    return probleme(400, 'supplement_invalide', 'Ajoutez entre 0 et 10 sacs par produit.');
  }
  const supplement: Quantites = { BAG: lus.BAG ?? 0, KO: lus.KO ?? 0, GC: lus.GC ?? 0 };
  const total = totalSacs(supplement);
  if (total === 0) return probleme(400, 'supplement_vide', 'Ajoutez au moins un sac.');
  if (!dans(MOTIFS_SUPPLEMENT, corps.motif)) {
    return probleme(400, 'motif_obligatoire', 'Choisissez un motif.');
  }
  const motif: MotifSupplement = corps.motif;
  const detail = `${texteSupplement(supplement)} · motif : ${MOTIFS_FR[motif]}`;
  const detailEn = `${texteSupplement(supplement).replaceAll('sac(s)', 'sack(s)')} · reason: ${MOTIFS_EN[motif]}`;

  if (supplementEnDemande(etat.etape)) {
    const demande: DemandeDeProduction = {
      id: `pp${Date.now()}-${++sequence}`,
      numero: prochainNumeroDemande(),
      supplement,
      total,
      motif,
      par: a.nom,
      jour: dateDuJour(),
      heure: heureCourante(),
      statut: 'en-attente',
      decidePar: '',
      decideA: '',
    };
    etat.demandes = [demande, ...etat.demandes];
    tracer(a.nom, `Demande d’augmentation de production : ${detail}`);
    annoncer(
      ['gerant', 'proprietaire'],
      {
        titre: `Demande d’augmentation de production · +${total} sac(s)`,
        detail: `Demandée par ${a.nom}. ${detail}. À valider dans Demandes.`,
      },
      {
        titre: `Production increase request · +${total} sack(s)`,
        detail: `Requested by ${a.nom}. ${detailEn}.`,
      },
    );
    return reponse({ demande: { id: demande.id, numero: demande.numero } });
  }

  for (const cle of CLES_PRODUIT) etat.supplement[cle] += supplement[cle];
  tracer(a.nom, `Supplément de production ajouté au plan : ${detail}`);
  annoncer(
    ['gerant'],
    {
      titre: `Supplément ajouté au plan · +${total} sac(s)`,
      detail: `Par ${a.nom}. ${detail}. Validé avec le plan.`,
    },
    {
      titre: `Extra added to the plan · +${total} sack(s)`,
      detail: `By ${a.nom}. ${detailEn}. Approved with the plan.`,
    },
  );
  return reponse();
}

const MOTIFS_FR: Record<MotifSupplement, string> = {
  habituels: 'clients habituels sans commande',
  guichet: 'ventes au guichet',
  marche: 'marché ou événement',
  tardive: 'commande tardive',
};
const MOTIFS_EN: Record<MotifSupplement, string> = {
  habituels: 'regulars without an order',
  guichet: 'counter sales',
  marche: 'market or event',
  tardive: 'late order',
};

// ───────────────────────────── demandes (écran « Demandes ») ─────────────────────────────

/** Les demandes d'augmentation de production, plus récentes d'abord. */
export function demandesDeProduction(): ReadonlyArray<DemandeLisible> {
  return lireEtat().demandes.map((d) => ({
    ...structuredClone(d),
    detail: `${texteSupplement(d.supplement)} · motif : ${MOTIFS_FR[d.motif]}`,
    detailEn: `${texteSupplement(d.supplement).replaceAll('sac(s)', 'sack(s)')} · reason: ${MOTIFS_EN[d.motif]}`,
  }));
}

type DemandeLisible = DemandeDeProduction & { detail: string; detailEn: string };

export type ResultatDecision = 'ok' | 'inconnue' | 'deja-decidee';

/** Le gérant ou le propriétaire tranche : accordée, le supplément s'ajoute au plan (R15). */
export function trancherDemandeDeProduction(
  decideur: string,
  id: string,
  accord: boolean,
): ResultatDecision {
  const etat = lireEtat();
  const demande = etat.demandes.find((d) => d.id === id);
  if (!demande) return 'inconnue';
  if (demande.statut !== 'en-attente') return 'deja-decidee';
  demande.statut = accord ? 'acceptee' : 'refusee';
  demande.decidePar = decideur;
  demande.decideA = heureCourante();
  if (accord) {
    for (const cle of CLES_PRODUIT) etat.supplement[cle] += demande.supplement[cle];
  }
  const detail = `${texteSupplement(demande.supplement)} · motif : ${MOTIFS_FR[demande.motif]}`;
  tracer(
    decideur,
    `${accord ? 'Accord' : 'Refus'} – Augmentation de production : +${demande.total} sac(s)`,
  );
  annoncer(
    ['production', 'caissier', 'gerant', 'proprietaire'],
    {
      titre: `Augmentation de production ${accord ? 'accordée' : 'refusée'} : ${sacs(demande.total)}`,
      detail: `${accord ? 'Accordée' : 'Refusée'} par ${decideur}. ${detail}`,
    },
    {
      titre: `Production increase ${accord ? 'approved' : 'refused'}: ${demande.total} sack(s)`,
      detail: `${accord ? 'Approved' : 'Refused'} by ${decideur}. ${texteSupplement(demande.supplement).replaceAll('sac(s)', 'sack(s)')} · reason: ${MOTIFS_EN[demande.motif]}`,
    },
  );
  return 'ok';
}

// ───────────────────────────── nouvelle session ─────────────────────────────

/**
 * À l'ouverture de la session suivante, une production non clôturée est archivée « non clôturée »
 * et signalée au gérant et au propriétaire (§5.5, US-085) ; le cycle repart des commandes.
 */
function passerALaSessionSuivante(precedente: { type: Creneau; date: string }) {
  const etat = lireEtat();
  if (etat.etape !== 'cloturee') {
    const plan = calculerPlan(commandesDeLaSession().pains, etat.supplement);
    etat.historique = [
      ...etat.historique,
      {
        id: `P-${precedente.date}-${precedente.type}`,
        date: precedente.date,
        type: precedente.type,
        responsable: RESPONSABLE,
        validePar: etat.planValide?.par ?? '—',
        ouvertA: etat.ouverte?.a ?? '—',
        clotureA: '—',
        sacs: plan.sacs,
        prevus: plan.prevus,
        realise: null,
        ecartKg: 0,
        statut: 'non-cloturee',
      },
    ];
    tracer('Système', `Production non clôturée archivée (${libelleSession(precedente, 'fr')})`);
    annoncer(
      ['gerant', 'proprietaire'],
      {
        titre: `Production non clôturée · ${libelleSession(precedente, 'fr').toLowerCase()}`,
        detail:
          'Archivée « non clôturée » à l’ouverture de la session suivante. À vérifier avant la clôture de la semaine.',
      },
      {
        titre: `Production not closed · ${libelleSession(precedente, 'en').toLowerCase()}`,
        detail:
          'Archived as “not closed” when the next session opened. Check before closing the week.',
      },
    );
  }
  // Une demande restée sans réponse tombe avec la session.
  for (const demande of etat.demandes.filter((d) => d.statut === 'en-attente')) {
    demande.statut = 'refusee';
    demande.decidePar = 'Système';
    demande.decideA = heureCourante();
  }
  const { type, date } =
    precedente.type === 'nuit'
      ? { type: 'jour' as const, date: lendemain(precedente.date) }
      : { type: 'nuit' as const, date: precedente.date };
  etat.session = { type, date };
  etat.etape = 'commandes';
  etat.planPropose = null;
  etat.planValide = null;
  etat.ouverte = null;
  etat.cloturee = null;
  etat.supplement = supplementVide();
  etat.realise = realiseVide();
  etat.consommation = consommationVide();
  etat.justification = null;
  etat.justifiePar = null;
}

let abonne = false;
/**
 * S'abonne à l'ouverture de la session suivante, à la première requête (et non au chargement du
 * module, ni depuis `lireEtat` : un appel au chargement garderait la simulation dans le paquet de
 * production, et un cycle de références entre fonctions inutilisées empêche de les retirer).
 */
function sAbonner() {
  if (abonne) return;
  abonne = true;
  abonnerOuvertureDeSession(passerALaSessionSuivante);
}

function lendemain(iso: string): string {
  const jour = new Date(`${iso}T12:00:00Z`);
  jour.setUTCDate(jour.getUTCDate() + 1);
  return jour.toISOString().slice(0, 10);
}

// ───────────────────────────── fiches techniques ─────────────────────────────

function fiches(): InstantaneFiches {
  return structuredClone({ fiches: lireEtat().fiches, prix: prixDesMatieres() });
}

function lireRecette(corps: Corps): Recette | undefined {
  const recette = {} as Recette;
  for (const cle of ['boule', 'pb', ...INGREDIENTS] as const) {
    const valeur = corps[cle];
    if (typeof valeur !== 'number' || !Number.isFinite(valeur) || valeur < 0) return undefined;
    recette[cle] = cle === 'pb' ? Math.round(valeur) : valeur;
  }
  return recette;
}

function modifierFiche(a: Acteur, id: string, corps: Corps): Response {
  if (!a.droits.modifierFiches) return refus();
  const etat = lireEtat();
  const fiche = etat.fiches.find((f) => f.id === id);
  if (!fiche) return probleme(404, 'produit_inconnu', 'Produit inconnu.');
  const recette = lireRecette(corps);
  // L'eau et la glace peuvent être nulles ; toutes les autres quantités sont strictement positives.
  if (!recette || champInvalide(recette)) {
    return probleme(
      400,
      'quantites_invalides',
      'Toutes les quantités doivent être supérieures à zéro (sauf l’eau et la glace).',
    );
  }
  fiche.recette = recette;
  fiche.version += 1;
  fiche.modifieLe = dateDuJour();
  fiche.modifieA = heureCourante();
  fiche.modifiePar = a.nom;
  tracer(a.nom, `Fiche technique ${fiche.code} modifiée · version ${fiche.version}`);
  return Response.json({ ...fiches(), fiche: structuredClone(fiche) });
}

// ───────────────────────────── démonstration ─────────────────────────────

const JALONS_DE_DEMO = {
  planPropose: { par: RESPONSABLE, a: '17:20' },
  planValide: { par: GERANT, a: '17:42' },
  ouverte: { par: RESPONSABLE, a: '19:05' },
} as const;

/**
 * Place le cycle à l'étape demandée, avec les heures de la maquette : de quoi montrer chaque état
 * (commandes, plan proposé, plan validé, en cours, clôturé) sans rejouer toute une session.
 * Réservé à la démonstration et au contrôle visuel ; aucun écran n'y mène.
 */
export function placerLeCycle(etape: Etape): void {
  const etat = lireEtat();
  const rang = ETAPES.indexOf(etape);
  etat.etape = etape;
  etat.planPropose = rang >= 1 ? { ...JALONS_DE_DEMO.planPropose } : null;
  etat.planValide = rang >= 2 ? { ...JALONS_DE_DEMO.planValide } : null;
  etat.ouverte = rang >= 3 ? { ...JALONS_DE_DEMO.ouverte } : null;
  etat.cloturee = rang >= 4 ? { par: RESPONSABLE, a: '05:00' } : null;
  etat.realise = realiseVide();
  etat.consommation = consommationVide();
  etat.justification = null;
  etat.justifiePar = null;
}

// ───────────────────────────── notifications ─────────────────────────────

const PROFILS_ATELIER: readonly Profil[] = ['production', 'gerant', 'proprietaire'];

/**
 * Les notifications suivent la production : « reste à produire » et « demande estimée au-dessus
 * du plan » sont recalculés (et disparaissent quand ils n'ont plus lieu d'être), et chaque étape
 * du cycle ajoute la sienne, aux profils concernés.
 */
export function adapterNotificationsALaProduction(
  profil: Profil,
  notifications: readonly NotificationSimulee[],
): NotificationSimulee[] {
  sAbonner();
  const etat = lireEtat();
  const commandes = commandesDeLaSession();
  const plan = calculerPlan(commandes.pains, etat.supplement);
  const demande = calculerDemande(plan, commandes.habituelsSansCommande);
  const adaptees: NotificationSimulee[] = [];
  const pasEnDirect: NotificationSimulee[] = [];

  for (const notification of notifications) {
    if (!notification.enDirect) {
      pasEnDirect.push(notification);
      continue;
    }
    if (notification.fr.type === 'Production') {
      if (etat.etape !== 'en-cours') continue;
      const reste = CLES_PRODUIT.map((cle) => ({
        cle,
        libelle: cle === 'GC' ? 'GC 135' : cle,
        valeur: Math.max(0, plan.lignes[cle].prevus - (etat.realise[cle] ?? 0)),
      }));
      const somme = formaterNombre(reste.reduce((total, r) => total + r.valeur, 0));
      const lignes = reste.map((r) => `${r.libelle} : ${formaterNombre(r.valeur)}`).join(' · ');
      adaptees.push({
        ...notification,
        id: `${notification.id}-${reste.map((r) => r.valeur).join('.')}`,
        fr: {
          ...notification.fr,
          titre: `Reste à produire : ${somme} pains`,
          detail: `${lignes} · sur ${formaterNombre(plan.prevus)} prévus.`,
        },
        en: {
          ...notification.en,
          titre: `Left to produce: ${somme} loaves`,
          detail: `${lignes} · of ${formaterNombre(plan.prevus)} planned.`,
        },
      });
      continue;
    }
    if (notification.fr.type === 'Demande') {
      const besoins = CLES_PRODUIT.filter((cle) => demande[cle].besoin > 0);
      const total = besoins.reduce((somme, cle) => somme + demande[cle].besoin, 0);
      if (total === 0 || etat.etape === 'cloturee') continue;
      const lignes = besoins
        .map((cle) => `${cle === 'GC' ? 'GC 135' : cle} +${demande[cle].besoin}`)
        .join(' · ');
      adaptees.push({
        ...notification,
        id: `${notification.id}-${total}`,
        fr: {
          ...notification.fr,
          titre: `Demande estimée au-dessus du plan · +${total} sac(s) suggéré(s)`,
          detail: `${lignes}. Le chef peut augmenter la production depuis Production → Plan.`,
        },
        en: {
          ...notification.en,
          titre: `Estimated demand above plan · +${total} sack(s) suggested`,
          detail: `${lignes}. The head baker can increase production from Production → Plan.`,
        },
      });
      continue;
    }
    adaptees.push(notification);
  }

  const peutOuvrir = PROFILS_ATELIER.includes(profil);
  const gestion = profil === 'gerant' || profil === 'proprietaire';
  const evenements = etat.evenements
    .filter((evenement) => evenement.pour.includes(profil))
    .map((evenement): NotificationSimulee => {
      const versLesDemandes = evenement.fr.titre.startsWith('Demande d’augmentation');
      return {
        id: evenement.id,
        enDirect: false,
        fr: {
          type: 'Programmation',
          heure: `${formaterDateCourte(new Date(evenement.jour), 'fr')} ${evenement.heure}`,
          ...evenement.fr,
        },
        en: {
          type: 'Schedule',
          heure: `${formaterDateCourte(new Date(evenement.jour), 'en')} ${evenement.heure}`,
          ...evenement.en,
        },
        destination:
          versLesDemandes && gestion
            ? { espace: 'gestion', cle: 'demandes' }
            : peutOuvrir
              ? { espace: 'atelier', cle: 'production' }
              : null,
      };
    });
  return [...adaptees, ...evenements, ...pasEnDirect];
}

// ───────────────────────────── routes ─────────────────────────────

/**
 * Routes simulées de la production ; `undefined` quand l'appel n'est pas pour elles.
 * - GET  atelier/production/                         instantané (chef de production, gérant, propriétaire)
 * - POST atelier/production/plan/proposer|valider/   étapes du cycle (R4)
 * - POST atelier/production/ouvrir|cloturer/         ouverture et clôture (R5)
 * - PUT  atelier/production/realise|consommation/    saisie pendant la production
 * - POST atelier/production/justification/           écart de matières justifié, gérant informé (R10)
 * - POST atelier/production/supplement/              ajout au plan, ou demande au gérant après validation (R15)
 * - GET  atelier/production/fiches/                  fiches techniques
 * - PUT  atelier/production/fiches/<produit>/        le propriétaire modifie une fiche (nouvelle version)
 * - POST atelier/production/demo/etape/              place le cycle à une étape (démonstration)
 */
export function repondreProduction(
  methode: string,
  chemin: string,
  corps: Corps,
): Response | undefined {
  if (!chemin.startsWith(RACINE)) return undefined;
  if (!lireUtilisateurConnecte()) return probleme(403, 'non_authentifie', 'Connexion requise.');
  const a = acteur();
  if (!a) return probleme(403, 'droit_insuffisant', 'Votre profil ne voit pas la production.');
  sAbonner();
  const reste = chemin.slice(RACINE.length);
  const appel = `${methode} ${reste}`;

  switch (appel) {
    case 'GET ':
      return Response.json(instantane());
    case 'POST plan/proposer/':
      return avancer(a, 'proposer');
    case 'POST plan/valider/':
      return avancer(a, 'valider');
    case 'POST ouvrir/':
      return avancer(a, 'ouvrir');
    case 'PUT realise/':
      return saisir(a, corps, 'realise');
    case 'PUT consommation/':
      return saisir(a, corps, 'consommation');
    case 'POST justification/':
      return justifier(a, corps);
    case 'POST cloturer/':
      return cloturer(a, corps);
    case 'POST supplement/':
      return ajouterSupplement(a, corps);
    case 'GET fiches/':
      return Response.json(fiches());
    case 'POST demo/etape/': {
      if (!dans(ETAPES, corps.etape)) return probleme(400, 'etape_inconnue', 'Étape inconnue.');
      placerLeCycle(corps.etape);
      return reponse();
    }
    default: {
      const fiche = /^fiches\/([^/]+)\/$/.exec(reste);
      if (methode === 'PUT' && fiche) return modifierFiche(a, fiche[1]!, corps);
      return undefined;
    }
  }
}
