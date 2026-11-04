import {
  erreurDeFiltre,
  peutVoirJournal,
  repondAuxFiltres,
  typeDeLAction,
} from '@/espaces/gestion/journal/regles.ts';
import {
  LIMITE_AFFICHEE,
  TYPES_ACTION,
  type EntreeJournal,
  type InstantaneJournal,
  type TypeAction,
} from '@/espaces/gestion/journal/types.ts';
import { formaterHeure, FUSEAU_BOULANGERIE } from '@/utils';

import { COMPTES_SIMULES } from './donnees.ts';
import { lireUtilisateurConnecte } from './session.ts';

/*
 * Registre unique des actions (US-175, récit US-024) : « qui a fait quoi et quand ». Chaque faux
 * serveur (caisses, session, dépenses, stocks, production, semaines, paie, connexions) y consigne
 * ses actions par `consigner`, en plus de sa trace locale ; l'écran « Gestion › Journal » ne lit
 * que ce registre. En AJOUT SEUL (cahier des charges : « journal non modifiable ») : le module
 * n'exporte aucune fonction qui modifie, supprime ou réordonne une entrée, les entrées sont
 * gelées, et l'API refuse toute méthode autre que GET (405). Seule `reinitialiserJournal` remet
 * le registre à zéro, pour les tests.
 *
 * Données de départ : les dix lignes du journal de la maquette « OptiBoul ERP v2 » (état `journal`).
 */

type Corps = Record<string, unknown>;

const RACINE = '/api/v1/simulation/gestion/journal/';

const probleme = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });

const jourDe = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: FUSEAU_BOULANGERIE,
  }).format(date);

/** Yaoundé est à UTC+1 toute l'année : « jour + heure » donne l'instant sans ambiguïté. */
const instantDe = (jour: string, heure: string) => new Date(`${jour}T${heure}:00+01:00`);

function profilDe(auteur: string) {
  return COMPTES_SIMULES.find((c) => c.nom === auteur)?.profil ?? null;
}

let entrees: readonly EntreeJournal[] | undefined;

function entreeDe(
  id: string,
  quand: Date,
  auteur: string,
  type: TypeAction,
  texte: string,
  changement?: { avant: string; apres: string },
): EntreeJournal {
  return Object.freeze({
    id,
    quand: quand.toISOString(),
    jour: jourDe(quand),
    heure: formaterHeure(quand),
    auteur,
    profil: profilDe(auteur),
    type,
    texte,
    ...(changement ?? {}),
  });
}

/** Les dix lignes de la maquette : neuf de la session du jour, une de la veille. */
function depart(): EntreeJournal[] {
  const aujourdhui = new Date();
  const jour = jourDe(aujourdhui);
  const veille = jourDe(new Date(aujourdhui.getTime() - 86_400_000));
  const lignes: ReadonlyArray<readonly [string, string, string, TypeAction, string]> = [
    [
      jour,
      '21:41',
      'Davy',
      'session',
      'Livraison Aïcha – 7 800 FCFA dû, 7 800 reçu (Orange Money)',
    ],
    [jour, '21:28', 'Davy', 'session', 'Livraison Hervé – 11 550 FCFA dû, 11 550 reçu'],
    [
      jour,
      '21:15',
      'Davy',
      'session',
      'Livraison Mama Ngono – 16 700 FCFA dû, 16 700 reçu (MTN MoMo)',
    ],
    [jour, '21:02', 'Davy', 'session', 'Livraison White – 10 700 FCFA dû, 10 200 reçu'],
    [jour, '20:51', 'Davy', 'session', 'Livraison Alex – 12 200 FCFA dû, 12 200 reçu'],
    [jour, '20:30', 'Davy', 'session', 'Mouvement interne : ration 12 BAG'],
    [jour, '19:10', 'Davy', 'depense', 'Dépense : Levure – 25 000 FCFA'],
    [jour, '18:02', 'Davy', 'session', 'Ouverture de la session de nuit du 14 oct.'],
    [jour, '17:55', 'Serge', 'connexion', 'Connexion'],
    [veille, '16:40', 'Willy', 'depense', 'Dépense soumise : Réparation du pétrin – 65 000 FCFA'],
  ];
  return lignes.map(([j, heure, auteur, type, texte], rang) =>
    entreeDe(`J-${rang + 1}`, instantDe(j, heure), auteur, type, texte),
  );
}

const registre = (): readonly EntreeJournal[] => (entrees ??= depart());

/** Remet le registre à son état de départ (tests uniquement : aucune route ne l'appelle). */
export function reinitialiserJournal(): void {
  entrees = undefined;
}

/**
 * Consigne une action à l'instant présent. `type` est celui de l'écran appelant ; les décisions et
 * demandes (« Accord – », « Refus – », « Demande… », « Autorisation… ») sont rangées à part.
 */
export function consigner(action: {
  auteur: string;
  type: TypeAction;
  texte: string;
  /** Valeurs avant / après, pour une action qui modifie une donnée. */
  avant?: string;
  apres?: string;
}): void {
  const { auteur, texte, avant, apres } = action;
  const courant = registre();
  entrees = [
    entreeDe(
      `J-${courant.length + 1}`,
      new Date(),
      auteur,
      typeDeLAction(action.type, texte),
      texte,
      avant !== undefined && apres !== undefined ? { avant, apres } : undefined,
    ),
    ...courant,
  ];
}

/** Toutes les entrées, les plus récentes d'abord. Copie : le registre reste intact. */
export function lireJournal(): readonly EntreeJournal[] {
  return [...registre()];
}

function lister(url: URL): Response {
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur) return probleme(403, 'non_authentifie', 'Connexion requise.');
  if (!peutVoirJournal(utilisateur.profil)) {
    return probleme(403, 'droit_insuffisant', 'Votre profil ne consulte pas le journal.');
  }
  const type = url.searchParams.get('type') ?? '';
  if (type && !TYPES_ACTION.includes(type as TypeAction)) {
    return probleme(400, 'type_inconnu', 'Ce type d’action n’existe pas.');
  }
  const filtres = {
    auteur: url.searchParams.get('auteur') ?? '',
    type: type as TypeAction | '',
    du: url.searchParams.get('du') ?? '',
    au: url.searchParams.get('au') ?? '',
  };
  const erreur = erreurDeFiltre(filtres);
  if (erreur === 'periode-invalide') {
    return probleme(400, 'periode_invalide', 'Les dates doivent être au format AAAA-MM-JJ.');
  }
  if (erreur === 'periode-inversee') {
    return probleme(400, 'periode_inversee', 'Le premier jour doit précéder le dernier.');
  }
  const toutes = registre();
  const retenues = toutes.filter((e) => repondAuxFiltres(e, filtres));
  const instantane: InstantaneJournal = {
    entrees: retenues.slice(0, LIMITE_AFFICHEE).map((e) => ({ ...e })),
    total: retenues.length,
    auteurs: [...new Set(toutes.map((e) => e.auteur))].sort((a, b) => a.localeCompare(b, 'fr')),
    aujourdhui: jourDe(new Date()),
  };
  return Response.json(instantane);
}

/**
 * Routes simulées de « Gestion › Journal » ; `undefined` quand l'appel n'est pas pour elles.
 * - GET /api/v1/simulation/gestion/journal/?auteur=&type=&du=&au=   gérant, propriétaire, administrateur
 * Toute autre méthode : 405, le journal n'est pas modifiable.
 */
export function repondreJournal(url: URL, methode: string, _corps: Corps): Response | undefined {
  if (url.pathname !== RACINE) return undefined;
  if (methode !== 'GET') {
    return Response.json(
      { detail: 'Le journal n’est pas modifiable.', code: 'journal_non_modifiable' },
      { status: 405, headers: { Allow: 'GET' } },
    );
  }
  return lister(url);
}
