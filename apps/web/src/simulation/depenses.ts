import {
  droitsDepenses,
  exigeValidation,
  numeroDepense,
  peutDecider,
  SEUIL_PAR_DEFAUT,
} from '@/espaces/comptoir/depenses/regles.ts';
import {
  CATEGORIES,
  MATIERES,
  MODES_DEPENSE,
  TYPES_RATTACHEMENT,
  type Categorie,
  type DemandeDepense,
  type Depense,
  type Fournisseur,
  type InstantaneDepenses,
  type LigneBudget,
  type ModeDepense,
  type Rattachement,
  type Semaine,
  type TypeRattachement,
} from '@/espaces/comptoir/depenses/types.ts';
import type { Profil } from '../profils.ts';

import { repercuterDepenseEnCaisse } from './caisses.ts';
import {
  abonnerChangementDeSession,
  dateDuJour,
  heureCourante,
  repercuterDepenseDeSession,
  sessionDeProduction,
} from './comptoir.ts';
import { prochainNumeroDemande } from './numerosDemandes.ts';
import { semaineCouranteSimulee } from './planning.ts';
import { lireUtilisateurConnecte } from './session.ts';
import { entrerEnStockDepuisDepense } from './stocks.ts';

/*
 * Faux serveur de « Comptoir › Dépenses » (US-168, récits US-110 à US-113) : les données et les
 * règles de la maquette « OptiBoul ERP v2 » (état `expenses`, `requests`, fonction `vDepenses`).
 * Tout vit en mémoire : un rechargement de la page remet les dépenses à leur état de départ.
 */

type Corps = Record<string, unknown>;

const RACINE = '/api/v1/simulation/comptoir/depenses/';

const probleme = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });

const refus = () => probleme(403, 'droit_insuffisant', 'Votre profil ne permet pas cette action.');

/** Budget mensuel de chaque catégorie et ce qui est déjà dépensé avant les dépenses ci-dessous. */
const BUDGETS: Record<Categorie, readonly [budget: number, deja: number]> = {
  matieres: [6_750_000, 2_980_000],
  salaires: [630_000, 0],
  electricite: [180_000, 0],
  eau: [45_000, 12_000],
  administration: [60_000, 15_000],
  technique: [90_000, 0],
  'petit-materiel': [45_000, 9_000],
  lait: [30_000, 12_000],
  extra: [30_000, 5_000],
};

/** La semaine courante suit les ouvertures et clôtures de l'écran des semaines (`planning.ts`). */
const semaineCourante = () => semaineCouranteSimulee().id;
const MOIS_DU_BUDGET = '2026-10';

/** Fonctions et non constantes : aucun appel au chargement du module, rien dans le paquet de production. */
const semaines = (): Semaine[] => [
  { id: 'S41', numero: 41, du: '2026-10-05', au: '2026-10-11' },
  { id: 'S42', numero: 42, du: '2026-10-12', au: '2026-10-18' },
  { id: 'S43', numero: 43, du: '2026-10-19', au: '2026-10-25' },
  { id: 'S44', numero: 44, du: '2026-10-26', au: '2026-11-01' },
];

const fournisseurs = (): Fournisseur[] => [
  { id: 'f1', nom: 'Grands Moulins du Centre', matieres: ['farine'] },
  { id: 'f2', nom: 'Mfoundi Levures & Sel', matieres: ['levure', 'sel', 'ameliorant'] },
  { id: 'f3', nom: 'Glacière d’Olembé', matieres: ['glace'] },
  { id: 'f4', nom: 'Bois Nkolondom', matieres: ['bois'] },
  { id: 'f5', nom: 'Huilerie Mvog-Mbi', matieres: ['huile'] },
];

const NUIT_14 = { type: 'nuit', date: '2026-10-14' } as const;

const depense = (
  numero: number,
  id: string,
  date: string,
  semaine: string,
  categorie: Categorie,
  libelle: string,
  montant: number,
  par: string,
  parProfil: Profil,
  statut: Depense['statut'],
  photo: boolean,
  mode: ModeDepense,
  rattachement: Rattachement,
): Depense => ({
  id,
  numero,
  date,
  semaine,
  categorie,
  libelle,
  montant,
  mode,
  par,
  parProfil,
  statut,
  photo,
  rattachement,
});

/** Les huit dépenses de la maquette, de la plus récente à la plus ancienne (DEP-0016 à DEP-0009). */
const depensesDeDepart = (): Depense[] => [
  depense(
    16,
    'e1',
    '2026-10-14',
    'S42',
    'matieres',
    'Levure – 1 carton',
    25_000,
    'Davy',
    'caissier',
    'validee',
    true,
    'caisse',
    {
      type: 'stock',
      matiere: 'levure',
      quantite: 5,
      session: NUIT_14,
    },
  ),
  depense(
    15,
    'e2',
    '2026-10-14',
    'S42',
    'matieres',
    'Glace – 6 sachets',
    6_000,
    'Davy',
    'caissier',
    'validee',
    true,
    'caisse',
    {
      type: 'production',
      session: NUIT_14,
    },
  ),
  depense(
    14,
    'e3',
    '2026-10-13',
    'S42',
    'technique',
    'Réparation du pétrin',
    65_000,
    'Willy',
    'gerant',
    'en-attente',
    true,
    'caisse',
    {
      type: 'semaine',
    },
  ),
  depense(
    13,
    'e4',
    '2026-10-12',
    'S42',
    'matieres',
    'Bois – 1 chargement',
    20_000,
    'Rachel',
    'caissier',
    'validee',
    true,
    'caisse',
    {
      type: 'stock',
      matiere: 'bois',
      quantite: 1,
      session: { type: 'nuit', date: '2026-10-12' },
    },
  ),
  depense(
    12,
    'e5',
    '2026-10-11',
    'S41',
    'electricite',
    'Facture ENEO de septembre',
    148_500,
    'Willy',
    'gerant',
    'validee',
    true,
    'banque',
    {
      type: 'semaine',
    },
  ),
  depense(
    11,
    'e6',
    '2026-10-10',
    'S41',
    'technique',
    'Tôles (retrait banque)',
    47_000,
    'Willy',
    'gerant',
    'validee',
    true,
    'banque',
    {
      type: 'semaine',
    },
  ),
  depense(
    10,
    'e7',
    '2026-10-08',
    'S41',
    'technique',
    'Soudure de la porte du four',
    52_000,
    'Patrick',
    'gerant',
    'validee',
    false,
    'caisse',
    {
      type: 'semaine',
    },
  ),
  depense(
    9,
    'e8',
    '2026-10-07',
    'S41',
    'petit-materiel',
    'Bacs de façonnage',
    18_000,
    'Patrick',
    'gerant',
    'validee',
    true,
    'caisse',
    {
      type: 'semaine',
    },
  ),
];

const demandesDeDepart = (): DemandeDepense[] => [
  {
    id: 'q1',
    numero: 21,
    depenseId: 'e3',
    par: 'Willy',
    parProfil: 'gerant',
    statut: 'en-attente',
    emiseA: '16:40',
    decideePar: '',
    decideeLe: '',
    decideeA: '',
  },
];

type Journal = { heure: string; qui: string; quoi: string };

type Etat = {
  depenses: Depense[];
  demandes: DemandeDepense[];
  journal: Journal[];
  /** Dépenses déjà répercutées sur la caisse de la session (pour annuler un refus). */
  enCaisse: Set<string>;
};

const etatInitial = (): Etat => ({
  depenses: depensesDeDepart(),
  demandes: demandesDeDepart(),
  journal: [],
  // La levure et la glace de la maquette sont déjà dans les 31 000 FCFA de dépenses de la session.
  enCaisse: new Set(['e1', 'e2']),
});

/*
 * Clôturer, rouvrir ou ouvrir la session fige les dépenses déjà payées en caisse : un refus
 * ultérieur ne doit plus retirer d'argent d'une caisse qui a été comptée.
 */
abonnerChangementDeSession(() => courant?.enCaisse.clear());

let courant: Etat | undefined;
const lireEtat = (): Etat => (courant ??= etatInitial());

let sequence = 0;

/** Remet les dépenses à leur état de départ (tests). */
export function reinitialiserDepenses(): void {
  courant = undefined;
  sequence = 0;
}

/** Actions tracées dans le journal, plus récentes en premier (tests). */
export function journalDepenses(): readonly Journal[] {
  return lireEtat().journal;
}

function tracer(qui: string, quoi: string) {
  lireEtat().journal = [{ heure: heureCourante(), qui, quoi }, ...lireEtat().journal];
}

/**
 * Entrée de stock d'une dépense rattachée au stock. Le stock est tenu par `simulation/stocks.ts` :
 * l'entrée y est créée avec le numéro de la dépense, au moment où la dépense est validée.
 */
function entrerEnStock(depense: Depense) {
  const { rattachement } = depense;
  if (rattachement.type !== 'stock') return;
  entrerEnStockDepuisDepense({
    matiere: rattachement.matiere,
    quantite: rattachement.quantite,
    code: numeroDepense(depense.numero),
    fournisseur: depense.fournisseur
      ? (fournisseurs().find((f) => f.id === depense.fournisseur)?.nom ?? null)
      : null,
    par: depense.par,
  });
}

const budget = (): LigneBudget[] =>
  CATEGORIES.map((categorie) => {
    const [plafond, deja] = BUDGETS[categorie];
    const validees = lireEtat()
      .depenses.filter((d) => d.categorie === categorie && d.statut === 'validee')
      .reduce((somme, d) => somme + d.montant, 0);
    return { categorie, budget: plafond, realise: deja + validees };
  });

/** Budget du mois par catégorie, tel que l'écran « Dépenses » le montre (tableau de bord). */
export function budgetDuMois(): { mois: string; lignes: LigneBudget[] } {
  return { mois: MOIS_DU_BUDGET, lignes: budget() };
}

function instantane(): InstantaneDepenses {
  const toutes = semaines();
  const courante = toutes.find((s) => s.id === semaineCourante())!;
  const { type, date } = sessionDeProduction();
  return structuredClone({
    mois: MOIS_DU_BUDGET,
    seuil: SEUIL_PAR_DEFAUT,
    semaineCourante: courante,
    semaines: toutes,
    gerantDeLaSemaine: semaineCouranteSimulee().gerant?.nom ?? '—',
    session: { type, date },
    budget: budget(),
    depenses: lireEtat().depenses,
    demandes: lireEtat().demandes,
    fournisseurs: fournisseurs(),
  });
}

export type Acteur = { nom: string; profil: 'caissier' | 'gerant' | 'proprietaire' };

function acteur(): Acteur | undefined {
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur) return undefined;
  const { profil, nom } = utilisateur;
  if (profil === 'caissier' || profil === 'gerant' || profil === 'proprietaire') {
    return { nom, profil };
  }
  return undefined;
}

const dans = <T extends string>(valeurs: readonly T[], valeur: unknown): valeur is T =>
  typeof valeur === 'string' && (valeurs as readonly string[]).includes(valeur);

function creerDepense(a: Acteur, corps: Corps): Response {
  if (!droitsDepenses(a.profil).saisir) return refus();

  const categorie = corps.categorie;
  const mode = corps.mode;
  const type = corps.rattachement;
  const libelle = typeof corps.libelle === 'string' ? corps.libelle.trim() : '';
  const montant = corps.montant;
  if (!dans(CATEGORIES, categorie)) {
    return probleme(400, 'categorie_inconnue', 'Catégorie inconnue.');
  }
  if (!dans(MODES_DEPENSE, mode)) {
    return probleme(400, 'mode_inconnu', 'Mode de paiement inconnu.');
  }
  if (!dans(TYPES_RATTACHEMENT, type)) {
    return probleme(
      400,
      'rattachement_obligatoire',
      'Le rattachement de la dépense est obligatoire.',
    );
  }
  if (!libelle) return probleme(400, 'libelle_obligatoire', 'Indiquez le libellé de la dépense.');
  if (typeof montant !== 'number' || !Number.isInteger(montant) || montant <= 0) {
    return probleme(400, 'montant_invalide', 'Indiquez un montant en FCFA.');
  }

  const { type: creneau, date: jourSession } = sessionDeProduction();
  const session = { type: creneau, date: jourSession };
  let rattachement: Rattachement;
  let fournisseur: string | undefined;
  if (type === 'stock') {
    const matiere = corps.matiere;
    const quantite = corps.quantite;
    if (!dans(MATIERES, matiere)) {
      return probleme(400, 'matiere_inconnue', 'Choisissez la matière entrée en stock.');
    }
    if (typeof quantite !== 'number' || !Number.isFinite(quantite) || quantite <= 0) {
      return probleme(400, 'quantite_obligatoire', 'Indiquez la quantité entrée en stock.');
    }
    if (typeof corps.fournisseur === 'string' && corps.fournisseur !== '') {
      const vendeur = fournisseurs().find((f) => f.id === corps.fournisseur);
      if (!vendeur?.matieres.includes(matiere)) {
        return probleme(400, 'fournisseur_invalide', 'Ce fournisseur ne vend pas cette matière.');
      }
      fournisseur = vendeur.id;
    }
    rattachement = { type: 'stock', matiere, quantite, session };
  } else if (type === 'production') {
    rattachement = { type: 'production', session };
  } else {
    rattachement = { type: 'semaine' };
  }

  const etat = lireEtat();
  const numero = Math.max(0, ...etat.depenses.map((d) => d.numero)) + 1;
  const attend = exigeValidation(montant, SEUIL_PAR_DEFAUT, a.profil);
  const creee: Depense = {
    id: `e${Date.now()}-${++sequence}`,
    numero,
    date: dateDuJour(),
    semaine: semaineCourante(),
    categorie,
    libelle,
    montant,
    mode,
    par: a.nom,
    parProfil: a.profil,
    statut: attend ? 'en-attente' : 'validee',
    photo: corps.photo === true,
    rattachement,
    ...(fournisseur ? { fournisseur } : {}),
  };
  etat.depenses = [creee, ...etat.depenses];

  let demande: DemandeDepense | undefined;
  if (attend) {
    demande = {
      id: `q${Date.now()}-${sequence}`,
      numero: prochainNumeroDemande(),
      depenseId: creee.id,
      par: a.nom,
      parProfil: a.profil,
      statut: 'en-attente',
      emiseA: heureCourante(),
      decideePar: '',
      decideeLe: '',
      decideeA: '',
    };
    etat.demandes = [demande, ...etat.demandes];
  }

  // Comme la maquette, seule la caissière dépense « dans » sa session : la dépense payée en caisse
  // entre dans la clôture et dans les espèces attendues de la caisse.
  if (mode === 'caisse' && a.profil === 'caissier' && sessionDeProduction().ouverte) {
    etat.enCaisse.add(creee.id);
    repercuterDepenseDeSession(montant);
    repercuterDepenseEnCaisse(montant);
  }
  // Une dépense qui attend une validation n'entre en stock qu'à l'accord (jamais de contre-passation).
  if (!attend) entrerEnStock(creee);

  tracer(
    a.nom,
    `Dépense ${numeroDepense(numero)} : ${libelle} – ${montant} FCFA, rattachée à ${
      rattachement.type === 'stock'
        ? `stock (${rattachement.matiere} +${rattachement.quantite})`
        : rattachement.type === 'production'
          ? `la production ${creneau} du ${jourSession}`
          : `la semaine ${semaineCourante()}`
    }${attend ? ` · demande de validation au ${a.profil === 'caissier' ? 'gérant' : 'propriétaire'}` : ''}`,
  );
  return Response.json({ instantane: instantane(), depense: creee, demande });
}

/** Dépenses rattachées à une semaine, hors refusées (indicateurs de l'écran des semaines). */
export function depensesDeSemaine(semaine: string): { nombre: number; montant: number } {
  const retenues = lireEtat().depenses.filter(
    (d) => d.semaine === semaine && d.statut !== 'refusee',
  );
  return { nombre: retenues.length, montant: retenues.reduce((somme, d) => somme + d.montant, 0) };
}

export type ResultatDecision = 'ok' | 'inconnue' | 'interdit' | 'deja-decidee';

/** Demandes de validation de dépense avec leur dépense, plus récentes d'abord (écran « Demandes »). */
export function demandesDeDepense(): ReadonlyArray<{ demande: DemandeDepense; depense: Depense }> {
  const etat = lireEtat();
  return etat.demandes.flatMap((demande) => {
    const depense = etat.depenses.find((d) => d.id === demande.depenseId);
    return depense ? [structuredClone({ demande, depense })] : [];
  });
}

/**
 * Accord ou refus d'une demande de dépense : statut de la dépense, budget (seules les dépenses
 * validées comptent), clôture et caisse de la session (une dépense refusée en sort).
 * Appelé par la route de décision d'ici et par l'écran « Demandes ».
 */
export function trancherDemandeDeDepense(a: Acteur, id: string, accord: boolean): ResultatDecision {
  const etat = lireEtat();
  const demande = etat.demandes.find((d) => d.id === id);
  if (!demande) return 'inconnue';
  if (!peutDecider(a.profil, demande.parProfil)) return 'interdit';
  if (demande.statut !== 'en-attente') return 'deja-decidee';
  demande.statut = accord ? 'acceptee' : 'refusee';
  demande.decideePar = a.nom;
  demande.decideeLe = dateDuJour();
  demande.decideeA = heureCourante();
  const cible = etat.depenses.find((d) => d.id === demande.depenseId);
  if (cible) {
    cible.statut = accord ? 'validee' : 'refusee';
    // Une dépense refusée sort de la caisse de la session.
    if (!accord && etat.enCaisse.delete(cible.id)) {
      repercuterDepenseDeSession(-cible.montant);
      repercuterDepenseEnCaisse(-cible.montant);
    }
    // Accordée, la dépense rattachée au stock fait enfin entrer la matière ; refusée, rien n'entre.
    if (accord) entrerEnStock(cible);
  }
  tracer(
    a.nom,
    `${accord ? 'Accord' : 'Refus'} – Dépense ${cible ? numeroDepense(cible.numero) : demande.depenseId}`,
  );
  return 'ok';
}

/** Accord ou refus d'une demande de dépense (appelé par l'écran des demandes). */
function deciderDemande(a: Acteur, corps: Corps): Response {
  const resultat = trancherDemandeDeDepense(a, String(corps.demandeId), corps.accord === true);
  if (resultat === 'inconnue') return probleme(404, 'demande_inconnue', 'Demande inconnue.');
  if (resultat === 'interdit') return refus();
  if (resultat === 'deja-decidee') {
    return probleme(409, 'demande_deja_decidee', 'Cette demande a déjà reçu une réponse.');
  }
  const demande = lireEtat().demandes.find((d) => d.id === corps.demandeId);
  return Response.json({ instantane: instantane(), demande });
}

/**
 * Réponses de « Comptoir › Dépenses ». Renvoie `undefined` pour une route qui n'est pas la sienne :
 * le routeur général répond alors « pas encore simulé ».
 */
export function repondreDepenses(url: URL, methode: string, corps: Corps): Response | undefined {
  if (!url.pathname.startsWith(RACINE)) return undefined;
  const appel = `${methode} ${url.pathname.slice(RACINE.length)}`;

  if (!lireUtilisateurConnecte()) return probleme(403, 'non_authentifie', 'Connexion requise.');
  const a = acteur();
  if (!a) return refus();

  switch (appel) {
    case 'GET ':
      return Response.json(instantane());
    case 'POST ':
      return creerDepense(a, corps);
    case 'POST decision/':
      return deciderDemande(a, corps);
    default:
      return undefined;
  }
}

export type { TypeRattachement };
