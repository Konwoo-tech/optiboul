import {
  cloudEnRetard,
  libelleDeCopie,
  peutGererLesSauvegardes,
  SEUIL_ALERTE_CLOUD_HEURES,
} from '@/espaces/gestion/sauvegardes/regles.ts';
import {
  CONTROLES_RESTAURATION,
  type Copie,
  type Declencheur,
  type GenreCopie,
  type InstantaneSauvegardes,
  type Restauration,
} from '@/espaces/gestion/sauvegardes/types.ts';

import { consigner } from './journal.ts';
import { lireUtilisateurConnecte } from './session.ts';

/*
 * Faux serveur de « Gestion › Sauvegardes » (US-142, US-143) : état des copies locale et cloud,
 * sauvegarde manuelle, restauration guidée. Tout vit en mémoire. Les copies sont en AJOUT SEUL :
 * aucune route ne supprime ni ne modifie une copie. Chaque action est consignée une seule fois
 * dans le registre unique du journal (`consigner`).
 *
 * Données de départ : les quatre copies de la maquette « OptiBoul ERP v2 » (état `backups`), dans
 * le scénario figé du 14 octobre 2026 ; la copie cloud du 12 oct. 17:52 a alors plus de 48 h.
 */

type Corps = Record<string, unknown>;

const RACINE = '/api/v1/simulation/gestion/sauvegardes/';

const probleme = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });

/** Yaoundé est à UTC+1 toute l'année : « jour + heure » donne l'instant sans ambiguïté. */
const instantDe = (jour: string, heure: string) =>
  new Date(`${jour}T${heure}:00+01:00`).toISOString();

const DEPART: ReadonlyArray<readonly [GenreCopie, Declencheur, string, string]> = [
  ['locale', 'cloture', '2026-10-14', '21:30'],
  ['locale', 'planifiee', '2026-10-14', '13:30'],
  ['locale', 'cloture', '2026-10-13', '21:30'],
  ['cloud', 'planifiee', '2026-10-12', '17:52'],
];

let copies: readonly Copie[] | undefined;
let sequence = 0;

const registre = (): readonly Copie[] =>
  (copies ??= DEPART.map(([genre, declencheur, jour, heure], rang) =>
    Object.freeze({
      id: `C-${rang + 1}`,
      genre,
      declencheur,
      instant: instantDe(jour, heure),
    }),
  ));

/** Remet les copies à leur état de départ (tests uniquement : aucune route ne l'appelle). */
export function reinitialiserSauvegardes(): void {
  copies = undefined;
  sequence = 0;
}

/** Copies, la plus récemment faite d'abord (tests). */
export const lesCopies = (): readonly Copie[] => registre();

function ajouter(genre: GenreCopie, declencheur: Declencheur): Copie {
  const courantes = registre();
  sequence += 1;
  const copie: Copie = Object.freeze({
    id: `C-${DEPART.length + sequence}`,
    genre,
    declencheur,
    instant: new Date().toISOString(),
  });
  copies = [copie, ...courantes];
  return copie;
}

const derniere = (genre: GenreCopie): string | null =>
  registre().find((c) => c.genre === genre)?.instant ?? null;

function instantane(): InstantaneSauvegardes {
  const derniereCloud = derniere('cloud');
  return {
    copies: registre().map((c) => ({ ...c })),
    derniereLocale: derniere('locale'),
    derniereCloud,
    cloudEnRetard: cloudEnRetard(derniereCloud, new Date()),
    seuilAlerteHeures: SEUIL_ALERTE_CLOUD_HEURES,
  };
}

type Acteur = { nom: string };

function sauvegarder(a: Acteur, genre: GenreCopie): Response {
  const copie = ajouter(genre, 'manuelle');
  consigner({
    auteur: a.nom,
    type: 'sauvegarde',
    texte: genre === 'locale' ? 'Sauvegarde locale' : 'Sauvegarde cloud',
  });
  return Response.json({ copie: { ...copie }, instantane: instantane() }, { status: 201 });
}

function restaurer(a: Acteur, id: string): Response {
  const cible = registre().find((c) => c.id === id);
  if (!cible) return probleme(404, 'copie_inconnue', 'Cette copie n’existe pas.');
  // Étape 1 de la restauration guidée : l'état actuel est copié avant d'être remplacé.
  const avant = ajouter('locale', 'avant_restauration');
  const restauration: Restauration = {
    copie: { ...cible },
    copieAvant: { ...avant },
    controles: CONTROLES_RESTAURATION.map((cle) => ({ cle, ok: true })),
  };
  consigner({
    auteur: a.nom,
    type: 'sauvegarde',
    texte: `Restauration de la copie du ${libelleDeCopie(cible.instant)}`,
  });
  return Response.json({ restauration, instantane: instantane() });
}

/**
 * Routes simulées de « Gestion › Sauvegardes » ; `undefined` quand l'appel n'est pas pour elles.
 * Toutes réservées à l'administrateur (403 sinon).
 * - GET  /api/v1/simulation/gestion/sauvegardes/                 état et copies disponibles
 * - POST /api/v1/simulation/gestion/sauvegardes/locale/          sauvegarde locale maintenant
 * - POST /api/v1/simulation/gestion/sauvegardes/cloud/           sauvegarde cloud maintenant
 * - POST /api/v1/simulation/gestion/sauvegardes/{id}/restaurer/  restauration guidée
 */
export function repondreSauvegardes(
  url: URL,
  methode: string,
  _corps: Corps,
): Response | undefined {
  if (!url.pathname.startsWith(RACINE)) return undefined;
  const appel = `${methode} ${url.pathname.slice(RACINE.length)}`;

  const connecte = lireUtilisateurConnecte();
  if (!connecte) return probleme(403, 'non_authentifie', 'Connexion requise.');
  if (!peutGererLesSauvegardes(connecte.profil)) {
    return probleme(403, 'droit_insuffisant', 'Votre profil ne permet pas cette action.');
  }
  const a: Acteur = { nom: connecte.nom };

  const sur = /^POST ([^/]+)\/restaurer\/$/.exec(appel);
  if (sur) return restaurer(a, sur[1]!);

  switch (appel) {
    case 'GET ':
      return Response.json(instantane());
    case 'POST locale/':
      return sauvegarder(a, 'locale');
    case 'POST cloud/':
      return sauvegarder(a, 'cloud');
    default:
      return undefined;
  }
}
