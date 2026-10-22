import {
  calculerLivraison,
  chiffres,
  clientsSansCommande,
  FONDS_DE_CAISSE,
  PLAFOND_PAR_DEFAUT,
} from '@/espaces/comptoir/session/calculs.ts';
import {
  CLES_PRODUIT,
  MODES_PAIEMENT,
  TYPES_MOUVEMENT,
  type Client,
  type InstantaneSession,
  type Livraison,
  type ModePaiement,
  type Quantites,
  type Saisies,
  type TypeMouvement,
} from '@/espaces/comptoir/session/types.ts';
import { creneauDe, formaterHeure, FUSEAU_BOULANGERIE } from '@/utils';

import { CODE_DEMO, COMPTES_SIMULES } from './donnees.ts';
import type { NotificationSimulee } from './notifications.ts';
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

const A: Quantites = { BAG: 100, KO: 70, GC: 160 };
const B: Quantites = { BAG: 110, KO: 75, GC: 165 };

const client = (
  id: string,
  nom: string,
  type: string,
  lieu: string,
  telephone: string,
  prix: Quantites,
  solde: number,
): Client => ({ id, nom, type, lieu, telephone, prix, solde });

const CLIENTS: readonly Client[] = [
  client('alain', 'Alain', 'Client livreur', 'Marché Etoudi', '6 77 21 45 10', B, -1250),
  client('alex', 'Alex', 'Client livreur', 'Carrefour Emana', '6 99 08 33 41', A, 0),
  client('ebene', 'Ebène', 'Client livreur', 'Lycée d’Etoudi', '6 55 72 19 08', A, -2350),
  client('white', 'White', 'Client livreur', 'Olembé', '6 78 40 12 66', B, -500),
  client('ngono', 'Mama Ngono', 'Client livreur', 'Marché Etoudi', '6 94 15 70 22', A, 0),
  client('junior', 'Junior', 'Client livreur', 'Messassi', '6 70 66 01 93', A, -1900),
  client(
    'brice',
    'Brice',
    'Client livreur',
    'Nkolondom',
    '6 51 38 27 74',
    { BAG: 100, KO: 75, GC: 165 },
    -4200,
  ),
  client('clarisse', 'Clarisse', 'Client livreur', 'Emana', '6 97 82 64 05', A, -300),
  client('herve', 'Hervé', 'Restaurant', 'Etoudi Château', '6 76 59 30 18', B, 0),
  client('sandrine', 'Sandrine', 'Client livreur', 'Olembé', '6 93 24 81 57', A, -2750),
  client('yannick', 'Yannick', 'Client livreur', 'Messassi', '6 58 11 96 42', A, -800),
  client('aicha', 'Aïcha', 'Hôtel', 'Carrefour Emana', '6 90 47 05 36', A, 0),
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
const SANS_COMMANDE = new Set(['brice', 'sandrine', 'yannick']);

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
  const cible = CLIENTS.find((c) => c.id === clientId)!;
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

const heureCourante = () => formaterHeure(new Date());

const dateDuJour = () =>
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
  Object.fromEntries(CLIENTS.map((c) => [c.id, { BAG: '', KO: '', GC: '' }]));

function etatInitial(): Etat {
  const date = dateDuJour();
  const commandes = commandesVides();
  for (const c of CLIENTS) {
    const habituelle = HABITUELLES[c.id]!;
    if (SANS_COMMANDE.has(c.id)) continue;
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
    clients: CLIENTS.map((c) => ({ ...c, prix: { ...c.prix } })),
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

let etat: Etat = etatInitial();

/** Remet la session à son état de départ (tests). */
export function reinitialiserComptoir(): void {
  etat = etatInitial();
}

/** Actions tracées dans le journal, plus récentes en premier (tests). */
export function journalComptoir(): readonly Journal[] {
  return etat.journal;
}

const instantane = (): InstantaneSession => {
  const { journal: _journal, ...reste } = etat;
  return structuredClone(reste);
};

const reponse = (extra: object = {}) => Response.json({ instantane: instantane(), ...extra });

function tracer(qui: string, quoi: string) {
  etat.journal = [{ heure: heureCourante(), qui, quoi }, ...etat.journal];
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

const ouverte = () => etat.session.statut === 'ouverte';
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
  const cible = etat.clients.find((c) => c.id === corps.clientId);
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
  const autorisation = etat.autorisations[cible.id];
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
    plafond: etat.plafond,
    autorise: Boolean(autorisation),
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
    id: `d${etat.numeroProchainBon}`,
    numero: etat.numeroProchainBon,
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
  etat.livraisons = [livraison, ...etat.livraisons];
  etat.numeroProchainBon += 1;
  cible.solde = calcul.soldeApres;
  delete etat.autorisations[cible.id];
  etat.dernierBon = livraison.id;
  tracer(
    a.nom,
    `Livraison ${livraison.nom} – ${livraison.du} FCFA dû, ${livraison.recu} reçu` +
      (livraison.autorisePar ? ` (autorisée par ${livraison.autorisePar})` : ''),
  );
  return reponse({ livraison });
}

function demanderAutorisation(a: Acteur, corps: Corps): Response {
  if (!peutSaisir(a)) return ouverte() ? refus() : verrouillee();
  const cible = etat.clients.find((c) => c.id === corps.clientId);
  if (!cible) return probleme(404, 'client_inconnu', 'Client inconnu.');
  const soldeApres = corps.soldeApres;
  if (typeof soldeApres !== 'number' || !Number.isInteger(soldeApres)) {
    return probleme(400, 'solde_invalide', 'Solde après livraison invalide.');
  }
  if (estDirection(a)) {
    etat.autorisations[cible.id] = { par: a.nom, heure: heureCourante() };
    tracer(a.nom, `Autorisation de dépassement du plafond : ${cible.nom} (${soldeApres} FCFA)`);
    return reponse({ autorise: true });
  }
  const existante = etat.demandes.find((d) => d.clientId === cible.id && d.statut === 'en-attente');
  if (existante) return reponse({ demande: existante });
  const demande = {
    id: `q${Date.now()}`,
    clientId: cible.id,
    clientNom: cible.nom,
    soldeApres,
    plafond: etat.plafond,
    par: a.nom,
    heure: heureCourante(),
    statut: 'en-attente' as const,
  };
  etat.demandes = [demande, ...etat.demandes];
  tracer(a.nom, `Demande d’autorisation : ${cible.nom}`);
  return reponse({ demande });
}

function deciderAutorisation(corps: Corps): Response {
  const demande = etat.demandes.find((d) => d.id === corps.demandeId);
  if (!demande || demande.statut !== 'en-attente') {
    return probleme(404, 'demande_inconnue', 'Aucune demande en attente.');
  }
  // Le code est celui du gérant de la semaine ou du propriétaire, saisi sur ce poste.
  const decideur = COMPTES_SIMULES.find(
    (c) => (c.profil === 'gerant' || c.profil === 'proprietaire') && corps.code === CODE_DEMO,
  );
  if (!decideur) {
    return probleme(
      400,
      'code_incorrect',
      'Code incorrect : seul le gérant ou le propriétaire peut décider.',
    );
  }
  const accord = corps.accord === true;
  demande.statut = accord ? 'acceptee' : 'refusee';
  if (accord) etat.autorisations[demande.clientId] = { par: decideur.nom, heure: heureCourante() };
  tracer(
    decideur.nom,
    `${accord ? 'Accord' : 'Refus'} – Livraison au-delà du plafond : ${demande.clientNom}`,
  );
  return reponse({ demande, decideur: decideur.nom });
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
  etat.mouvements = [
    { type, produit, quantite, motif, par: a.nom, heure: heureCourante() },
    ...etat.mouvements,
  ];
  tracer(a.nom, `Mouvement interne : ${type} ${quantite} ${produit}`);
  return reponse();
}

function prochaineSession() {
  const type = etat.session.type === 'nuit' ? 'jour' : 'nuit';
  const date = etat.session.type === 'nuit' ? lendemain(etat.session.date) : etat.session.date;
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
      const saisies = etat.commandes[String(corps.clientId)];
      const cle = corps.produit as (typeof CLES_PRODUIT)[number];
      if (!saisies || !CLES_PRODUIT.includes(cle)) {
        return probleme(400, 'commande_invalide', 'Client ou produit inconnu.');
      }
      saisies[cle] = chiffres(String(corps.valeur ?? ''));
      return reponse();
    }

    case 'POST commandes/habituelle/': {
      if (!ouverte()) return verrouillee();
      const cible = etat.clients.find((c) => c.id === corps.clientId);
      const habituelle = cible ? etat.habituelles[cible.id] : undefined;
      if (!cible || !habituelle) return probleme(404, 'client_inconnu', 'Client inconnu.');
      etat.commandes[cible.id] = {
        BAG: habituelle.BAG ? String(habituelle.BAG) : '',
        KO: habituelle.KO ? String(habituelle.KO) : '',
        GC: habituelle.GC ? String(habituelle.GC) : '',
      };
      tracer(a.nom, `Commande habituelle reprise pour ${cible.nom}`);
      return reponse();
    }

    case 'POST relances/': {
      if (!ouverte()) return verrouillee();
      const ids = Array.isArray(corps.clientIds) ? corps.clientIds.map(String) : [];
      const cibles = etat.clients.filter((c) => ids.includes(c.id));
      if (cibles.length === 0) return probleme(400, 'relance_vide', 'Aucun client à relancer.');
      const heure = heureCourante();
      for (const cible of cibles) etat.relances[cible.id] = heure;
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
      if (!ouverte()) return verrouillee();
      etat.session.especesComptees = chiffres(String(corps.especes ?? ''));
      return reponse();
    }

    case 'POST cloturer/': {
      if (!ouverte()) return verrouillee();
      if (etat.session.especesComptees === '') {
        return probleme(409, 'comptage_requis', 'Saisissez les espèces comptées.');
      }
      etat.session.statut = 'cloturee';
      etat.session.clotureeA = heureCourante();
      etat.session.cloturePar = a.nom;
      tracer(a.nom, `Clôture de la session de ${etat.session.type} du ${etat.session.date}`);
      return reponse();
    }

    case 'POST rouvrir/': {
      if (!estDirection(a)) return refus();
      if (ouverte()) return probleme(409, 'session_ouverte', 'La session est déjà ouverte.');
      etat.session.statut = 'ouverte';
      etat.session.rouvertePar = a.nom;
      etat.session.rouverteA = heureCourante();
      tracer(
        a.nom,
        `Réouverture de la session de ${etat.session.type} du ${etat.session.date} (correction après clôture)`,
      );
      return reponse();
    }

    case 'POST ouvrir-suivante/': {
      if (a.profil === 'proprietaire') return refus();
      if (ouverte()) return probleme(409, 'session_ouverte', 'La session est déjà ouverte.');
      const { type, date } = prochaineSession();
      etat.session = {
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
      etat.livraisons = [];
      etat.mouvements = [];
      etat.dernierBon = null;
      etat.commandes = commandesVides();
      etat.relances = {};
      etat.autorisations = {};
      etat.depensesCaisse = 0;
      etat.echeanceDettes = dimanche(date);
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
    ? clientsSansCommande(etat.clients, etat.commandes, etat.habituelles)
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
