import { formaterHeure } from '@/utils';

import {
  attenduDeCaisse,
  FONDS_PROPOSE,
  PLAFOND_CAISSE,
} from '../espaces/comptoir/caisses/regles.ts';
import type {
  DetailEspeces,
  Passage,
  Personne,
  ReponseCaisses,
  SessionCaisse,
  TypeSession,
} from '../espaces/comptoir/caisses/types.ts';
import type { Profil } from '../profils.ts';
import { COMPTES_SIMULES, type ContexteSimule } from './donnees.ts';
import { caissierePrevue } from './planning.ts';
import { lireUtilisateurConnecte } from './session.ts';

/*
 * Caisses simulées (Comptoir › Caisses, récits US-040 à US-044). Données et règles de la maquette
 * « OptiBoul ERP v2 » (état `caisses` et `session`) ; le vrai backend les remplacera.
 */

type Courante = {
  jour: string;
  type: TypeSession;
  caissiere: Personne;
  ouverture: Passage;
  fonds: number;
  especes: number;
  depenses: number;
  remises: number;
  recette: number;
  statut: 'ouverte' | 'cloturee';
  fermeture: Passage | null;
  compte: number | null;
};

type EntreeJournal = { heure: string; qui: string; profil: Profil; action: string };

const personne = (id: string): Personne => {
  const compte = COMPTES_SIMULES.find((c) => c.id === id);
  return { id, nom: compte?.nom ?? id };
};

// Calculés à l'appel, pas au chargement : aucun appel au niveau du module, pour que le paquet de
// production n'embarque aucune donnée de simulation.
const caissieres = (): Personne[] => [personne('davy'), personne('rachel')];
const receveurs = (): Personne[] =>
  COMPTES_SIMULES.filter((c) => c.profil === 'gerant').map((c) => personne(c.id));

/** Caisses fermées de la semaine 42 (maquette : `caisses`). */
const fermee = (
  jour: string,
  type: TypeSession,
  id: string,
  ouvre: string,
  ferme: string,
  attendu: number,
  compte: number,
  recette: number,
): SessionCaisse => {
  const caissiere = personne(id);
  return {
    id: `C-${jour}-${type}`,
    jour,
    type,
    caissiere,
    ouverture: { heure: ouvre, par: caissiere.nom },
    fermeture: { heure: ferme, par: caissiere.nom },
    fonds: 20_000,
    attendu,
    compte,
    recette,
    enCours: false,
  };
};

const ARCHIVES_INITIALES = (): SessionCaisse[] => [
  fermee('2026-10-12', 'jour', 'rachel', '06:00', '17:55', 158_400, 158_400, 186_200),
  fermee('2026-10-12', 'nuit', 'davy', '18:00', '05:48', 241_350, 240_850, 327_400),
  fermee('2026-10-13', 'jour', 'rachel', '06:02', '17:57', 149_900, 150_400, 171_300),
  fermee('2026-10-13', 'nuit', 'davy', '18:01', '05:52', 233_600, 233_600, 301_200),
  fermee('2026-10-14', 'jour', 'rachel', '06:01', '17:58', 162_750, 162_750, 192_500),
];

/**
 * Nuit du 14 octobre, ouverte par Davy à 18:02 : cinq livraisons (33 950 FCFA en espèces sur
 * 58 450 de recette) et 31 000 FCFA de dépenses payées en caisse.
 */
const COURANTE_INITIALE = (): Courante => ({
  jour: '2026-10-14',
  type: 'nuit',
  caissiere: personne('davy'),
  ouverture: { heure: '18:02', par: 'Davy' },
  fonds: 20_000,
  especes: 33_950,
  depenses: 31_000,
  remises: 0,
  recette: 58_450,
  statut: 'ouverte',
  fermeture: null,
  compte: null,
});

let archives = /* @__PURE__ */ ARCHIVES_INITIALES();
let courante = /* @__PURE__ */ COURANTE_INITIALE();
let journal: EntreeJournal[] = [];
/** Dernière réouverture de la caisse, effacée à l'ouverture suivante (passation, incidents). */
let reouverture: { par: string; heure: string } | null = null;

/** Remet les caisses à l'état de la maquette (tests). */
export function reinitialiserCaisses(): void {
  archives = ARCHIVES_INITIALES();
  courante = COURANTE_INITIALE();
  journal = [];
  reouverture = null;
}

/**
 * Ce que l'écran des semaines lit des caisses : les caisses fermées puis la caisse ouverte, et la
 * dernière réouverture. Lecture seule : les caisses restent tenues ici.
 */
export function lectureCaisses(): {
  sessions: SessionCaisse[];
  ouverte: boolean;
  reouverture: { par: string; heure: string } | null;
} {
  const ouverte = courante.statut === 'ouverte';
  return {
    sessions: structuredClone([...archives, ...(ouverte ? [enSession(courante)] : [])]),
    ouverte,
    reouverture,
  };
}

/** Ce que la coque sait de la session : elle suit l'état de la caisse (ouverture, fermeture). */
export function contexteCaisses(): Pick<
  ContexteSimule,
  'caissierDeSession' | 'sessionOuverteDepuis' | 'sessionType' | 'sessionOuverte'
> {
  return {
    caissierDeSession: courante.ouverture.par,
    sessionOuverteDepuis: courante.ouverture.heure,
    sessionType: courante.type,
    sessionOuverte: courante.statut === 'ouverte',
  };
}

const probleme = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });
const sansContenu = () => new Response(null, { status: 204 });

const detailDe = (c: Courante): DetailEspeces => ({
  fonds: c.fonds,
  especes: c.especes,
  depenses: c.depenses,
  remises: c.remises,
  attendu: attenduDeCaisse(c),
});

const enSession = (c: Courante): SessionCaisse => ({
  id: 'en-cours',
  jour: c.jour,
  type: c.type,
  caissiere: c.caissiere,
  ouverture: c.ouverture,
  fermeture: null,
  fonds: c.fonds,
  attendu: attenduDeCaisse(c),
  compte: null,
  recette: c.recette,
  enCours: true,
});

const ajouterUnJour = (jour: string): string => {
  const date = new Date(`${jour}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

/** Créneau suivant : après le jour, la nuit du même jour ; après la nuit, le jour du lendemain. */
function creneauSuivant(c: Courante): { type: TypeSession; jour: string } {
  return c.type === 'jour'
    ? { type: 'nuit', jour: c.jour }
    : { type: 'jour', jour: ajouterUnJour(c.jour) };
}

/**
 * Caissière que le planning des semaines (`planning.ts`, écran Gestion › Semaines) a prévue sur
 * un créneau ; `null` quand personne n'est affecté.
 */
function planifieePour(jour: string, type: TypeSession): Personne | null {
  const id = caissierePrevue(jour, type);
  return id ? personne(id) : null;
}

const maintenant = () => formaterHeure(new Date());

function tracer(qui: { nom: string; profil: Profil }, action: string): void {
  journal = [{ heure: maintenant(), qui: qui.nom, profil: qui.profil, action }, ...journal];
}

type Acteur = { id: string; nom: string; profil: Profil };

const estDirection = (a: Acteur) => a.profil === 'gerant' || a.profil === 'proprietaire';
/** Cahier des charges §3.3 : le propriétaire consulte (et rouvre), il ne ferme pas et ne fait pas de remise. */
const peutAgir = (a: Acteur) =>
  a.profil === 'gerant' || (a.profil === 'caissier' && estSaCaisse(a));
const estSaCaisse = (a: Acteur) => courante.caissiere.id === a.id;

/** Le gérant et le propriétaire voient tout ; la caissière ne voit que ses caisses (US-044). */
function reponseCaisses(acteur: Acteur): ReponseCaisses {
  const direction = estDirection(acteur);
  const voit = (s: SessionCaisse) => direction || s.caissiere.id === acteur.id;
  const ouverte = courante.statut === 'ouverte';
  const suivant = creneauSuivant(courante);
  const sessions = [...archives, ...(ouverte ? [enSession(courante)] : [])].filter(voit);
  return {
    moi: acteur.id,
    caissieres: direction ? caissieres() : caissieres().filter((c) => c.id === acteur.id),
    sessions,
    caisseOuverte: ouverte
      ? {
          jour: courante.jour,
          type: courante.type,
          caissiere: courante.caissiere,
          ouverture: courante.ouverture,
        }
      : null,
    detail: ouverte && (direction || estSaCaisse(acteur)) ? detailDe(courante) : null,
    prochaine: { ...suivant, planifiee: planifieePour(suivant.jour, suivant.type) },
    rouvrable: !ouverte && direction,
    plafond: PLAFOND_CAISSE,
    receveurs: receveurs(),
  };
}

type Corps = Record<string, unknown>;

const entier = (valeur: unknown): number | null =>
  typeof valeur === 'number' && Number.isInteger(valeur) ? valeur : null;

function ouvrir(acteur: Acteur, corps: Corps): Response {
  if (acteur.profil !== 'caissier' && acteur.profil !== 'gerant') {
    return probleme(403, 'interdit', 'Seules la caissière et le gérant ouvrent une caisse.');
  }
  if (courante.statut === 'ouverte') {
    return probleme(409, 'caisse_deja_ouverte', 'Une caisse est déjà ouverte.');
  }
  const fonds = entier(corps.fonds ?? FONDS_PROPOSE);
  if (fonds === null || fonds < 0) {
    return probleme(400, 'fonds_invalide', 'Le fonds de caisse est un montant entier en FCFA.');
  }
  const suivant = creneauSuivant(courante);
  const planifiee = planifieePour(suivant.jour, suivant.type);
  courante = {
    ...suivant,
    caissiere: personne(acteur.id),
    ouverture: { heure: maintenant(), par: acteur.nom },
    fonds,
    especes: 0,
    depenses: 0,
    remises: 0,
    recette: 0,
    statut: 'ouverte',
    fermeture: null,
    compte: null,
  };
  reouverture = null;
  const hors = planifiee && planifiee.id !== acteur.id ? ` (planifiée : ${planifiee.nom})` : '';
  tracer(
    acteur,
    `Ouverture de caisse · session de ${suivant.type === 'nuit' ? 'nuit' : 'jour'} du ${suivant.jour} · fonds ${fonds} FCFA${hors}`,
  );
  return sansContenu();
}

function fermer(acteur: Acteur, corps: Corps): Response {
  if (courante.statut !== 'ouverte') {
    return probleme(409, 'caisse_fermee', 'Aucune caisse n’est ouverte.');
  }
  if (!peutAgir(acteur)) {
    return probleme(403, 'interdit', 'Seule la caissière de cette caisse ou le gérant la ferme.');
  }
  const compte = entier(corps.compte);
  if (compte === null || compte < 0) {
    return probleme(400, 'comptage_invalide', 'Saisissez les espèces comptées (montant entier).');
  }
  const attendu = attenduDeCaisse(courante);
  const fermeture = { heure: maintenant(), par: acteur.nom };
  const enregistree: SessionCaisse = {
    id: `C-${courante.jour}-${courante.type}`,
    jour: courante.jour,
    type: courante.type,
    caissiere: courante.caissiere,
    ouverture: courante.ouverture,
    fermeture,
    fonds: courante.fonds,
    attendu,
    compte,
    recette: courante.recette,
    enCours: false,
  };
  // Une caisse rouverte puis refermée remplace sa ligne précédente (même jour, même créneau).
  archives = [
    ...archives.filter((s) => !(s.jour === courante.jour && s.type === courante.type)),
    enregistree,
  ];
  courante = { ...courante, statut: 'cloturee', fermeture, compte };
  tracer(acteur, `Fermeture de caisse · écart ${compte - attendu} FCFA`);
  return sansContenu();
}

function rouvrir(acteur: Acteur, corps: Corps): Response {
  if (!estDirection(acteur)) {
    return probleme(403, 'interdit', 'Seuls le gérant et le propriétaire rouvrent une caisse.');
  }
  if (courante.statut !== 'cloturee') {
    return probleme(409, 'caisse_ouverte', 'La caisse est déjà ouverte.');
  }
  const motif = typeof corps.motif === 'string' ? corps.motif.trim() : '';
  if (!motif)
    return probleme(400, 'motif_obligatoire', 'Le motif de la réouverture est obligatoire.');
  courante = { ...courante, statut: 'ouverte', fermeture: null, compte: null };
  reouverture = { par: acteur.nom, heure: maintenant() };
  tracer(
    acteur,
    `Réouverture de la caisse du ${courante.jour} (${courante.type}) · motif : ${motif} · propriétaire informé`,
  );
  return sansContenu();
}

function remettre(acteur: Acteur, corps: Corps): Response {
  if (courante.statut !== 'ouverte') {
    return probleme(409, 'caisse_fermee', 'Aucune caisse n’est ouverte.');
  }
  if (!peutAgir(acteur)) {
    return probleme(
      403,
      'interdit',
      'Seule la caissière de cette caisse ou le gérant fait une remise.',
    );
  }
  const montant = entier(corps.montant);
  const attendu = attenduDeCaisse(courante);
  if (montant === null || montant <= 0 || montant > attendu) {
    return probleme(
      400,
      'montant_invalide',
      'Le montant remis doit être positif et ne pas dépasser les espèces en caisse.',
    );
  }
  const receveur = receveurs().find((r) => r.id === corps.receveur);
  if (!receveur)
    return probleme(400, 'receveur_inconnu', 'Choisissez le gérant ou le propriétaire qui reçoit.');
  const heure = maintenant();
  courante = { ...courante, remises: courante.remises + montant };
  tracer(acteur, `Remise au coffre de ${montant} FCFA, reçue par ${receveur.nom} à ${heure}`);
  return Response.json({ attendu: attenduDeCaisse(courante), receveur: receveur.nom, heure });
}

/** Caisses fermées avec moins d'espèces que prévu, dans l'ordre de l'historique (tableau de bord). */
export function manquesDeCaisse(): Array<{
  jour: string;
  type: TypeSession;
  caissiere: string;
  ecart: number;
}> {
  return archives.flatMap((s) => {
    const ecart = s.compte === null ? 0 : s.compte - s.attendu;
    return ecart < 0 ? [{ jour: s.jour, type: s.type, caissiere: s.caissiere.nom, ecart }] : [];
  });
}

/**
 * Dépense payée en caisse depuis « Comptoir › Dépenses » : elle diminue les espèces attendues de
 * la caisse ouverte (un montant négatif annule une dépense refusée). Sans caisse ouverte, rien.
 */
export function repercuterDepenseEnCaisse(montant: number): void {
  if (courante.statut !== 'ouverte') return;
  courante = { ...courante, depenses: Math.max(0, courante.depenses + montant) };
}

/** Aide de démonstration : ajoute des espèces, des dépenses ou de la recette à la caisse ouverte. */
function encaisser(corps: Corps): Response {
  if (courante.statut !== 'ouverte') {
    return probleme(409, 'caisse_fermee', 'Aucune caisse n’est ouverte.');
  }
  const ajout = (valeur: unknown) => Math.max(0, entier(valeur) ?? 0);
  const especes = ajout(corps.especes);
  courante = {
    ...courante,
    especes: courante.especes + especes,
    depenses: courante.depenses + ajout(corps.depenses),
    recette: courante.recette + (corps.recette === undefined ? especes : ajout(corps.recette)),
  };
  return sansContenu();
}

/**
 * Routes simulées des caisses. Renvoie `null` quand l'appel n'est pas pour elles, pour que le
 * routeur continue sa recherche.
 */
export function repondreCaisses(chemin: string, methode: string, corps: Corps): Response | null {
  const PREFIXE = '/api/v1/simulation/caisses/';
  if (!chemin.startsWith(PREFIXE)) return null;
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur) return probleme(403, 'non_authentifie', 'Connexion requise.');
  const acteur: Acteur = { id: utilisateur.id, nom: utilisateur.nom, profil: utilisateur.profil };
  if (!['caissier', 'gerant', 'proprietaire'].includes(acteur.profil)) {
    return probleme(403, 'interdit', 'Cet écran n’est pas ouvert à votre profil.');
  }
  const appel = `${methode} ${chemin.slice(PREFIXE.length)}`;
  switch (appel) {
    case 'GET ':
      return Response.json(reponseCaisses(acteur));
    case 'GET journal/':
      return Response.json(journal);
    case 'POST ouvrir/':
      return ouvrir(acteur, corps);
    case 'POST fermer/':
      return fermer(acteur, corps);
    case 'POST rouvrir/':
      return rouvrir(acteur, corps);
    case 'POST remettre/':
      return remettre(acteur, corps);
    case 'POST encaissements/':
      return encaisser(corps);
    default:
      return null;
  }
}
