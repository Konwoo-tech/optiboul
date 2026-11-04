import {
  calculerLivraison,
  chiffres,
  clientsSansCommande,
  FONDS_DE_CAISSE,
  lireEntier,
  planDeSacs,
  PLAFOND_PAR_DEFAUT,
  totauxDesLivraisons,
} from '@/espaces/comptoir/session/calculs.ts';
import {
  CLES_PRODUIT,
  MODES_PAIEMENT,
  TYPES_MOUVEMENT,
  type Client,
  type DemandePlafond,
  type InstantaneSession,
  type Livraison,
  type ModePaiement,
  type Quantites,
  type Saisies,
  type TypeMouvement,
} from '@/espaces/comptoir/session/types.ts';
import { creneauDe, formaterHeure, FUSEAU_BOULANGERIE, type Creneau } from '@/utils';

import { comptesActifs } from './comptes.ts';
import { CODE_DEMO } from './donnees.ts';
import type { NotificationSimulee } from './notifications.ts';
import { prochainNumeroDemande } from './numerosDemandes.ts';
import { lireUtilisateurConnecte } from './session.ts';

/*
 * Faux serveur de « Comptoir › Session en cours » (US-165) : les données et les règles de la
 * maquette « OptiBoul ERP v2 » (fonctions mk, calc, validateDelivery, requestAuth, vSession).
 * Tout vit en mémoire : un rechargement de la page remet la session à son état de départ.
 */

type Corps = Record<string, unknown>;

const RACINE = '/api/v1/simulation/comptoir/session/';

const probleme = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });

const TARIF_A: Quantites = { BAG: 100, KO: 70, GC: 160 };
const TARIF_B: Quantites = { BAG: 110, KO: 75, GC: 165 };

const client = (
  id: string,
  nom: string,
  type: string,
  lieu: string,
  telephone: string,
  prix: Quantites,
  solde: number,
): Client => ({ id, nom, type, lieu, telephone, prix, solde });

/** Fonctions et non constantes : aucun appel au chargement du module, donc rien dans le paquet de production. */
const clientsDeDepart = (): readonly Client[] => [
  client('alain', 'Alain', 'Client livreur', 'Marché Etoudi', '6 77 21 45 10', TARIF_B, -1250),
  client('alex', 'Alex', 'Client livreur', 'Carrefour Emana', '6 99 08 33 41', TARIF_A, 0),
  client('ebene', 'Ebène', 'Client livreur', 'Lycée d’Etoudi', '6 55 72 19 08', TARIF_A, -2350),
  client('white', 'White', 'Client livreur', 'Olembé', '6 78 40 12 66', TARIF_B, -500),
  client('ngono', 'Mama Ngono', 'Client livreur', 'Marché Etoudi', '6 94 15 70 22', TARIF_A, 0),
  client('junior', 'Junior', 'Client livreur', 'Messassi', '6 70 66 01 93', TARIF_A, -1900),
  client(
    'brice',
    'Brice',
    'Client livreur',
    'Nkolondom',
    '6 51 38 27 74',
    { BAG: 100, KO: 75, GC: 165 },
    -4200,
  ),
  client('clarisse', 'Clarisse', 'Client livreur', 'Emana', '6 97 82 64 05', TARIF_A, -300),
  client('herve', 'Hervé', 'Restaurant', 'Etoudi Château', '6 76 59 30 18', TARIF_B, 0),
  client('sandrine', 'Sandrine', 'Client livreur', 'Olembé', '6 93 24 81 57', TARIF_A, -2750),
  client('yannick', 'Yannick', 'Client livreur', 'Messassi', '6 58 11 96 42', TARIF_A, -800),
  client('aicha', 'Aïcha', 'Hôtel', 'Carrefour Emana', '6 90 47 05 36', TARIF_A, 0),
];

/** Commande habituelle de chaque client : BAG, KO, GC. */
const HABITUELLES: Record<string, [number, number, number]> = {
  alain: [120, 80, 20],
  alex: [80, 60, 0],
  ebene: [100, 60, 20],
  white: [70, 40, 0],
  ngono: [100, 50, 20],
  junior: [90, 70, 30],
  brice: [60, 40, 0],
  clarisse: [80, 60, 20],
  herve: [60, 0, 30],
  sandrine: [70, 50, 20],
  yannick: [90, 70, 30],
  aicha: [50, 40, 0],
};

/** Clients qui n'ont pas encore commandé au départ : la relance a de quoi faire. */
const sansCommande = () => new Set(['brice', 'sandrine', 'yannick']);

const quantites = ([BAG, KO, GC]: readonly [number, number, number]): Quantites => ({
  BAG,
  KO,
  GC,
});

const livraisonDeDepart = (
  numero: number,
  clientId: string,
  quantitesLivrees: [number, number, number],
  recu: number,
  mode: ModePaiement,
  reference: string,
  heure: string,
): Livraison => {
  const cible = clientsDeDepart().find((c) => c.id === clientId)!;
  const livrees = quantites(quantitesLivrees);
  const du = CLES_PRODUIT.reduce((somme, cle) => somme + livrees[cle] * cible.prix[cle], 0);
  return {
    id: `d${numero}`,
    numero,
    clientId,
    nom: cible.nom,
    quantites: livrees,
    prix: { ...cible.prix },
    du,
    recu,
    mode,
    reference,
    reste: recu - du,
    soldeAvant: 0,
    soldeApres: recu - du,
    heure,
    par: 'Davy',
    autorisePar: '',
  };
};

type Journal = { heure: string; qui: string; quoi: string };

type Etat = InstantaneSession & { journal: Journal[] };

export const heureCourante = () => formaterHeure(new Date());

export const dateDuJour = () =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: FUSEAU_BOULANGERIE,
  }).format(new Date());

/** Lendemain d'un jour ISO. */
function lendemain(iso: string): string {
  const jour = new Date(`${iso}T12:00:00Z`);
  jour.setUTCDate(jour.getUTCDate() + 1);
  return jour.toISOString().slice(0, 10);
}

/** Dimanche de la semaine du jour donné : échéance des dettes de la semaine. */
function dimanche(iso: string): string {
  const jour = new Date(`${iso}T12:00:00Z`);
  jour.setUTCDate(jour.getUTCDate() + ((7 - jour.getUTCDay()) % 7));
  return jour.toISOString().slice(0, 10);
}

const commandesVides = (): Record<string, Saisies> =>
  Object.fromEntries(clientsDeDepart().map((c) => [c.id, { BAG: '', KO: '', GC: '' }]));

function etatInitial(): Etat {
  const date = dateDuJour();
  const commandes = commandesVides();
  const sansCommandeDeDepart = sansCommande();
  for (const c of clientsDeDepart()) {
    const habituelle = HABITUELLES[c.id]!;
    if (sansCommandeDeDepart.has(c.id)) continue;
    commandes[c.id] = {
      BAG: String(habituelle[0]),
      KO: String(habituelle[1]),
      GC: String(habituelle[2]),
    };
  }
  return {
    session: {
      type: creneauDe(new Date()),
      date,
      statut: 'ouverte',
      ouverteA: heureCourante(),
      ouvertePar: 'Davy',
      clotureeA: '',
      cloturePar: '',
      especesComptees: '',
      fonds: FONDS_DE_CAISSE,
      rouvertePar: '',
      rouverteA: '',
    },
    plafond: PLAFOND_PAR_DEFAUT,
    clients: clientsDeDepart().map((c) => ({ ...c, prix: { ...c.prix } })),
    commandes,
    habituelles: Object.fromEntries(
      Object.entries(HABITUELLES).map(([id, valeurs]) => [id, quantites(valeurs)]),
    ),
    relances: {},
    livraisons: [
      livraisonDeDepart(146, 'aicha', [50, 40, 0], 7800, 'orange', 'OM241014.2141.A9', '21:41'),
      livraisonDeDepart(145, 'herve', [60, 0, 30], 11550, 'especes', '', '21:28'),
      livraisonDeDepart(144, 'ngono', [100, 50, 20], 16700, 'mtn', 'MP241014.2115.K3', '21:15'),
      livraisonDeDepart(143, 'white', [70, 40, 0], 10200, 'especes', '', '21:02'),
      livraisonDeDepart(142, 'alex', [80, 60, 0], 12200, 'especes', '', '20:51'),
    ],
    mouvements: [
      {
        id: 'm1',
        type: 'ration',
        produit: 'BAG',
        quantite: 12,
        motif: 'Ration de l’équipe de nuit',
        par: 'Davy',
        heure: '20:30',
      },
    ],
    autorisations: {},
    demandes: [],
    // Levure (25 000) et glace (6 000) payées en caisse pendant la session.
    depensesCaisse: 31000,
    dernierBon: null,
    numeroProchainBon: 147,
    echeanceDettes: dimanche(date),
    journal: [],
  };
}

let numeroMouvement = 1;
let numeroDemande = 0;
let courant: Etat | undefined;
const lireEtat = (): Etat => (courant ??= etatInitial());

/** Remet la session à son état de départ (tests). */
export function reinitialiserComptoir(): void {
  courant = undefined;
}

/** Actions tracées dans le journal, plus récentes en premier (tests). */
export function journalComptoir(): readonly Journal[] {
  return lireEtat().journal;
}

/** Écouteurs prévenus quand la session se clôture, se rouvre ou qu'une nouvelle s'ouvre. */
const surChangementDeSession: Array<() => void> = [];

export function abonnerChangementDeSession(ecouteur: () => void): void {
  surChangementDeSession.push(ecouteur);
}

const changementDeSession = () => surChangementDeSession.forEach((ecouteur) => ecouteur());

/**
 * Écouteurs prévenus quand une nouvelle session s'ouvre, avec la session qui se termine : la
 * production non clôturée de celle-ci est archivée.
 */
const surOuvertureDeSession: Array<(precedente: { type: Creneau; date: string }) => void> = [];

export function abonnerOuvertureDeSession(
  ecouteur: (precedente: { type: Creneau; date: string }) => void,
): void {
  surOuvertureDeSession.push(ecouteur);
}

/**
 * Ce que le plan de production lit des commandes de la session : pains commandés par produit,
 * pains habituels des clients qui n'ont pas encore commandé, et qui a commandé.
 */
export function commandesDeLaSession() {
  const { clients, commandes, habituelles, session } = lireEtat();
  const manquants = clientsSansCommande(clients, commandes, habituelles);
  const pains = planDeSacs(clients, commandes);
  const habituels = { BAG: 0, KO: 0, GC: 0 };
  for (const manquant of manquants) {
    for (const cle of CLES_PRODUIT) habituels[cle] += habituelles[manquant.id]?.[cle] ?? 0;
  }
  return {
    type: session.type,
    date: session.date,
    ouverte: session.statut === 'ouverte',
    caissiere: session.ouvertePar,
    pains: { BAG: pains.BAG.pains, KO: pains.KO.pains, GC: pains.GC.pains },
    habituelsSansCommande: habituels,
    clientsAyantCommande: clients.filter((c) =>
      CLES_PRODUIT.some((cle) => lireEntier(commandes[c.id]?.[cle]) > 0),
    ).length,
  };
}

/** Session de production courante (cible du rattachement des dépenses) et son état. */
export function sessionDeProduction(): { type: Creneau; date: string; ouverte: boolean } {
  const { type, date, statut } = lireEtat().session;
  return { type, date, ouverte: statut === 'ouverte' };
}

/** La session du comptoir quand elle est ouverte : créneau, jour, qui l'a ouverte et à quelle heure. */
export function sessionOuverteDuComptoir(): {
  type: Creneau;
  jour: string;
  par: string;
  heure: string;
} | null {
  const { type, date, statut, ouvertePar, ouverteA } = lireEtat().session;
  return statut === 'ouverte' ? { type, jour: date, par: ouvertePar, heure: ouverteA } : null;
}

/** Dernière réouverture de la session après clôture, s'il y en a une (passation de la semaine). */
export function reouvertureDeSession(): { par: string; heure: string } | null {
  const { rouvertePar, rouverteA } = lireEtat().session;
  return rouvertePar ? { par: rouvertePar, heure: rouverteA } : null;
}

/**
 * Ce que le tableau de bord lit de la session (US-130 à US-134) : son jour, sa recette et ce qui
 * était dû. Lecture seule : la session reste la seule source de ces chiffres.
 */
export function syntheseDeSession(): { jour: string; du: number; recu: number } {
  const etat = lireEtat();
  const { du, recu } = totauxDesLivraisons(etat.livraisons);
  return { jour: etat.session.date, du, recu };
}

/**
 * Solde de chaque client dans la session (négatif : le client doit de l'argent). Une livraison à
 * crédit ou un règlement le change : l'écran « Clients et dettes » le lit ici (`clients.ts`).
 */
export function soldesDesClientsDeSession(): Record<string, number> {
  return Object.fromEntries(lireEtat().clients.map((c) => [c.id, c.solde]));
}

/**
 * Dépense payée en caisse par la caissière pendant la session : elle entre dans la clôture
 * (« Dépenses payées en caisse »). Un montant négatif annule une dépense refusée.
 */
export function repercuterDepenseDeSession(montant: number): void {
  const etat = lireEtat();
  etat.depensesCaisse = Math.max(0, etat.depensesCaisse + montant);
}

const instantane = (): InstantaneSession => {
  const { journal: _journal, ...reste } = lireEtat();
  return structuredClone(reste);
};

const reponse = (extra: object = {}) => Response.json({ instantane: instantane(), ...extra });

function tracer(qui: string, quoi: string) {
  lireEtat().journal = [{ heure: heureCourante(), qui, quoi }, ...lireEtat().journal];
}

/** Personne connectée : seuls le caissier, le gérant et le propriétaire voient la session. */
type Acteur = { nom: string; profil: 'caissier' | 'gerant' | 'proprietaire' };

function acteur(): Acteur | undefined {
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur) return undefined;
  const { profil, nom } = utilisateur;
  if (profil === 'caissier' || profil === 'gerant' || profil === 'proprietaire') {
    return { nom, profil };
  }
  return undefined;
}

const ouverte = () => lireEtat().session.statut === 'ouverte';
const peutSaisir = (a: Acteur) => (a.profil === 'caissier' || a.profil === 'gerant') && ouverte();
const estDirection = (a: Acteur) => a.profil === 'gerant' || a.profil === 'proprietaire';

const refus = () => probleme(403, 'droit_insuffisant', 'Votre profil ne permet pas cette action.');
const verrouillee = () =>
  probleme(409, 'session_cloturee', 'La session est clôturée : la saisie est verrouillée.');

function lireQuantites(brut: unknown): Quantites | undefined {
  if (typeof brut !== 'object' || brut === null) return undefined;
  const lues = {} as Quantites;
  for (const cle of CLES_PRODUIT) {
    const valeur = (brut as Record<string, unknown>)[cle];
    if (valeur === undefined) {
      lues[cle] = 0;
    } else if (typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 0) {
      lues[cle] = valeur;
    } else {
      return undefined;
    }
  }
  return lues;
}

function enregistrerLivraison(a: Acteur, corps: Corps): Response {
  if (!peutSaisir(a)) return ouverte() ? refus() : verrouillee();
  const cible = lireEtat().clients.find((c) => c.id === corps.clientId);
  const livrees = lireQuantites(corps.quantites);
  const mode = corps.mode as ModePaiement;
  const recu = corps.recu;
  if (!cible) return probleme(404, 'client_inconnu', 'Client inconnu.');
  if (!livrees || !MODES_PAIEMENT.includes(mode) || typeof recu !== 'number') {
    return probleme(400, 'livraison_invalide', 'Quantités, mode ou montant reçu invalides.');
  }
  if (!Number.isInteger(recu) || recu < 0) {
    return probleme(400, 'livraison_invalide', 'Le montant reçu doit être un entier positif.');
  }
  const reference = typeof corps.reference === 'string' ? corps.reference.trim() : '';
  const autorisation = lireEtat().autorisations[cible.id];
  const calcul = calculerLivraison({
    client: cible,
    saisies: {
      BAG: String(livrees.BAG),
      KO: String(livrees.KO),
      GC: String(livrees.GC),
    },
    recu: String(recu),
    mode,
    reference,
    plafond: lireEtat().plafond,
    soldeAutorise: autorisation ? autorisation.soldeApres : null,
    peutSaisir: true,
  });
  if (calcul.du === 0) return probleme(400, 'montant_nul', 'Aucun pain à livrer.');
  if (calcul.referenceManquante) {
    return probleme(400, 'reference_obligatoire', 'Référence obligatoire pour le mobile money.');
  }
  if (calcul.bloquee) {
    return probleme(409, 'plafond_depasse', 'Le plafond de dette du client est dépassé.');
  }
  const livraison: Livraison = {
    id: `d${lireEtat().numeroProchainBon}`,
    numero: lireEtat().numeroProchainBon,
    clientId: cible.id,
    nom: cible.nom,
    quantites: livrees,
    prix: { ...cible.prix },
    du: calcul.du,
    recu,
    mode,
    reference,
    reste: calcul.reste,
    soldeAvant: cible.solde,
    soldeApres: calcul.soldeApres,
    heure: heureCourante(),
    par: a.nom,
    autorisePar: calcul.depasse && autorisation ? autorisation.par : '',
  };
  lireEtat().livraisons = [livraison, ...lireEtat().livraisons];
  lireEtat().numeroProchainBon += 1;
  cible.solde = calcul.soldeApres;
  delete lireEtat().autorisations[cible.id];
  lireEtat().dernierBon = livraison.id;
  tracer(
    a.nom,
    `Livraison ${livraison.nom} – ${livraison.du} FCFA dû, ${livraison.recu} reçu` +
      (livraison.autorisePar ? ` (autorisée par ${livraison.autorisePar})` : ''),
  );
  return reponse({ livraison });
}

function demanderAutorisation(a: Acteur, corps: Corps): Response {
  if (!peutSaisir(a)) return ouverte() ? refus() : verrouillee();
  const cible = lireEtat().clients.find((c) => c.id === corps.clientId);
  if (!cible) return probleme(404, 'client_inconnu', 'Client inconnu.');
  const soldeApres = corps.soldeApres;
  if (typeof soldeApres !== 'number' || !Number.isInteger(soldeApres)) {
    return probleme(400, 'solde_invalide', 'Solde après livraison invalide.');
  }
  // Seul un client réellement en dépassement a besoin d'une autorisation.
  if (soldeApres >= -lireEtat().plafond) {
    return probleme(400, 'pas_de_depassement', 'Ce client ne dépasse pas le plafond.');
  }
  if (estDirection(a)) {
    lireEtat().autorisations[cible.id] = { par: a.nom, heure: heureCourante(), soldeApres };
    tracer(a.nom, `Autorisation de dépassement du plafond : ${cible.nom} (${soldeApres} FCFA)`);
    return reponse({ autorise: true });
  }
  const existante = lireEtat().demandes.find(
    (d) => d.clientId === cible.id && d.statut === 'en-attente',
  );
  if (existante) return reponse({ demande: existante });
  const demande = {
    id: `pl${Date.now()}-${++numeroDemande}`,
    numero: prochainNumeroDemande(),
    clientId: cible.id,
    clientNom: cible.nom,
    soldeApres,
    plafond: lireEtat().plafond,
    par: a.nom,
    jour: dateDuJour(),
    heure: heureCourante(),
    statut: 'en-attente' as const,
  };
  lireEtat().demandes = [demande, ...lireEtat().demandes];
  tracer(a.nom, `Demande d’autorisation : ${cible.nom}`);
  return reponse({ demande });
}

function deciderAutorisation(corps: Corps): Response {
  const demande = lireEtat().demandes.find((d) => d.id === corps.demandeId);
  if (!demande || demande.statut !== 'en-attente') {
    return probleme(404, 'demande_inconnue', 'Aucune demande en attente.');
  }
  // Le code est celui du gérant de la semaine ou du propriétaire, saisi sur ce poste.
  const decideur = comptesActifs().find(
    (c) => (c.profil === 'gerant' || c.profil === 'proprietaire') && corps.code === CODE_DEMO,
  );
  if (!decideur) {
    return probleme(
      400,
      'code_incorrect',
      'Code incorrect : seul le gérant ou le propriétaire peut décider.',
    );
  }
  appliquerDecisionPlafond(demande, corps.accord === true, decideur.nom);
  return reponse({ demande, decideur: decideur.nom });
}

function appliquerDecisionPlafond(demande: DemandePlafond, accord: boolean, decideur: string) {
  demande.statut = accord ? 'acceptee' : 'refusee';
  demande.decidePar = decideur;
  demande.decideA = heureCourante();
  if (accord) {
    lireEtat().autorisations[demande.clientId] = {
      par: decideur,
      heure: demande.decideA,
      soldeApres: demande.soldeApres,
    };
  }
  tracer(
    decideur,
    `${accord ? 'Accord' : 'Refus'} – Livraison au-delà du plafond : ${demande.clientNom}`,
  );
}

/**
 * Demandes d'autorisation de dépassement du plafond, plus récentes d'abord, avec le solde actuel
 * du client : l'écran « Demandes » les range avec les autres demandes de validation.
 */
export function demandesDePlafond(): ReadonlyArray<DemandePlafond & { soldeClient: number }> {
  const clients = lireEtat().clients;
  return lireEtat().demandes.map((d) => ({
    ...d,
    soldeClient: clients.find((c) => c.id === d.clientId)?.solde ?? 0,
  }));
}

/** Le gérant ou le propriétaire tranche depuis l'écran « Demandes » (sans code : il est connecté). */
export function trancherDemandeDePlafond(
  id: string,
  accord: boolean,
  decideur: string,
): DemandePlafond | undefined {
  const demande = lireEtat().demandes.find((d) => d.id === id);
  if (!demande || demande.statut !== 'en-attente') return undefined;
  appliquerDecisionPlafond(demande, accord, decideur);
  return structuredClone(demande);
}

function ajouterMouvement(a: Acteur, corps: Corps): Response {
  if (!peutSaisir(a)) return ouverte() ? refus() : verrouillee();
  const type = corps.type as TypeMouvement;
  const produit = corps.produit as (typeof CLES_PRODUIT)[number];
  const quantite = corps.quantite;
  const motif = typeof corps.motif === 'string' ? corps.motif.trim() : '';
  if (!TYPES_MOUVEMENT.includes(type) || !CLES_PRODUIT.includes(produit)) {
    return probleme(400, 'mouvement_invalide', 'Type ou produit inconnu.');
  }
  if (typeof quantite !== 'number' || !Number.isInteger(quantite) || quantite <= 0) {
    return probleme(400, 'quantite_obligatoire', 'Indiquez une quantité.');
  }
  if (!motif) {
    return probleme(
      400,
      'motif_obligatoire',
      'Motif obligatoire : précisez la raison du mouvement.',
    );
  }
  lireEtat().mouvements = [
    {
      id: `m${++numeroMouvement}`,
      type,
      produit,
      quantite,
      motif,
      par: a.nom,
      heure: heureCourante(),
    },
    ...lireEtat().mouvements,
  ];
  tracer(a.nom, `Mouvement interne : ${type} ${quantite} ${produit}`);
  return reponse();
}

function prochaineSession() {
  const type = lireEtat().session.type === 'nuit' ? 'jour' : 'nuit';
  const date =
    lireEtat().session.type === 'nuit'
      ? lendemain(lireEtat().session.date)
      : lireEtat().session.date;
  return { type, date } as const;
}

/**
 * Réponses de « Comptoir › Session en cours ». Renvoie `undefined` pour une route qui n'est pas
 * la sienne : le routeur général répond alors « pas encore simulé ».
 */
export function repondreComptoir(url: URL, methode: string, corps: Corps): Response | undefined {
  if (!url.pathname.startsWith(RACINE)) return undefined;
  const chemin = url.pathname.slice(RACINE.length);
  const appel = `${methode} ${chemin}`;

  const a = acteur();
  if (!lireUtilisateurConnecte()) return probleme(403, 'non_authentifie', 'Connexion requise.');
  if (!a) return refus();

  switch (appel) {
    case 'GET ':
      return Response.json(instantane());

    case 'PUT commandes/': {
      if (!peutSaisir(a)) return ouverte() ? refus() : verrouillee();
      const saisies = lireEtat().commandes[String(corps.clientId)];
      const cle = corps.produit as (typeof CLES_PRODUIT)[number];
      if (!saisies || !CLES_PRODUIT.includes(cle)) {
        return probleme(400, 'commande_invalide', 'Client ou produit inconnu.');
      }
      saisies[cle] = chiffres(String(corps.valeur ?? ''));
      return reponse();
    }

    case 'POST commandes/habituelle/': {
      if (!peutSaisir(a)) return ouverte() ? refus() : verrouillee();
      const cible = lireEtat().clients.find((c) => c.id === corps.clientId);
      const habituelle = cible ? lireEtat().habituelles[cible.id] : undefined;
      if (!cible || !habituelle) return probleme(404, 'client_inconnu', 'Client inconnu.');
      lireEtat().commandes[cible.id] = {
        BAG: habituelle.BAG ? String(habituelle.BAG) : '',
        KO: habituelle.KO ? String(habituelle.KO) : '',
        GC: habituelle.GC ? String(habituelle.GC) : '',
      };
      tracer(a.nom, `Commande habituelle reprise pour ${cible.nom}`);
      return reponse();
    }

    case 'POST relances/': {
      if (!peutSaisir(a)) return ouverte() ? refus() : verrouillee();
      const ids = Array.isArray(corps.clientIds) ? corps.clientIds.map(String) : [];
      const cibles = lireEtat().clients.filter((c) => ids.includes(c.id));
      if (cibles.length === 0) return probleme(400, 'relance_vide', 'Aucun client à relancer.');
      const heure = heureCourante();
      for (const cible of cibles) lireEtat().relances[cible.id] = heure;
      tracer(a.nom, `Relance commande WhatsApp : ${cibles.map((c) => c.nom).join(', ')}`);
      return reponse({ relances: cibles.map((c) => c.nom) });
    }

    case 'POST livraisons/':
      return enregistrerLivraison(a, corps);

    case 'POST autorisations/':
      return demanderAutorisation(a, corps);

    case 'POST autorisations/decider/':
      return deciderAutorisation(corps);

    case 'POST mouvements/':
      return ajouterMouvement(a, corps);

    case 'PUT comptage/': {
      if (!peutSaisir(a)) return ouverte() ? refus() : verrouillee();
      lireEtat().session.especesComptees = chiffres(String(corps.especes ?? ''));
      return reponse();
    }

    case 'POST cloturer/': {
      if (!peutSaisir(a)) return ouverte() ? refus() : verrouillee();
      if (lireEtat().session.especesComptees === '') {
        return probleme(409, 'comptage_requis', 'Saisissez les espèces comptées.');
      }
      changementDeSession();
      lireEtat().session.statut = 'cloturee';
      lireEtat().session.clotureeA = heureCourante();
      lireEtat().session.cloturePar = a.nom;
      tracer(
        a.nom,
        `Clôture de la session de ${lireEtat().session.type} du ${lireEtat().session.date}`,
      );
      return reponse();
    }

    case 'POST rouvrir/': {
      if (!estDirection(a)) return refus();
      if (ouverte()) return probleme(409, 'session_ouverte', 'La session est déjà ouverte.');
      changementDeSession();
      lireEtat().session.statut = 'ouverte';
      lireEtat().session.rouvertePar = a.nom;
      lireEtat().session.rouverteA = heureCourante();
      tracer(
        a.nom,
        `Réouverture de la session de ${lireEtat().session.type} du ${lireEtat().session.date} (correction après clôture)`,
      );
      return reponse();
    }

    case 'POST ouvrir-suivante/': {
      if (a.profil === 'proprietaire') return refus();
      if (ouverte()) return probleme(409, 'session_ouverte', 'La session est déjà ouverte.');
      const { type, date } = prochaineSession();
      const precedente = { type: lireEtat().session.type, date: lireEtat().session.date };
      surOuvertureDeSession.forEach((ecouteur) => ecouteur(precedente));
      lireEtat().session = {
        type,
        date,
        statut: 'ouverte',
        ouverteA: heureCourante(),
        ouvertePar: a.nom,
        clotureeA: '',
        cloturePar: '',
        especesComptees: '',
        fonds: FONDS_DE_CAISSE,
        rouvertePar: '',
        rouverteA: '',
      };
      lireEtat().livraisons = [];
      lireEtat().mouvements = [];
      lireEtat().dernierBon = null;
      lireEtat().commandes = commandesVides();
      lireEtat().relances = {};
      lireEtat().autorisations = {};
      lireEtat().depensesCaisse = 0;
      changementDeSession();
      lireEtat().echeanceDettes = dimanche(date);
      tracer(a.nom, `Ouverture de la session de ${type} du ${date}`);
      return reponse();
    }

    default:
      return undefined;
  }
}

/**
 * La notification « clients habituels sans commande » suit la session : elle disparaît quand tous
 * ont commandé ou que la session est clôturée, et son texte compte les clients qui manquent.
 */
export function adapterNotificationsAuComptoir(
  notifications: readonly NotificationSimulee[],
): NotificationSimulee[] {
  const manquants = ouverte()
    ? clientsSansCommande(lireEtat().clients, lireEtat().commandes, lireEtat().habituelles)
    : [];
  return notifications.flatMap((notification) => {
    if (!notification.enDirect || notification.fr.type !== 'Commandes') return [notification];
    if (manquants.length === 0) return [];
    const noms = manquants.map((c) => c.nom).join(', ');
    return [
      {
        ...notification,
        // Un nouvel identifiant quand la liste change : la notification redevient non lue.
        id: `${notification.id}-${manquants.map((c) => c.id).join('.')}`,
        fr: {
          ...notification.fr,
          titre: `${manquants.length} clients habituels sans commande`,
          detail: `${noms}. Relancez-les depuis Session → Commandes.`,
        },
        en: {
          ...notification.en,
          titre: `${manquants.length} regular customers have not ordered`,
          detail: `${noms}. Remind them from Session → Orders.`,
        },
      },
    ];
  });
}
