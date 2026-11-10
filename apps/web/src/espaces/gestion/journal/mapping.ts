import type { JournalListParams, LigneJournal } from '@/api';

import { PROFILS } from '../../../profils.ts';
import type { Profil } from '../../../profils.ts';
import { TYPES_ACTION, type EntreeJournal, type FiltresJournal, type TypeAction } from './types.ts';

/*
 * Seule couche qui connaît le contrat de l'API réelle du journal (`LigneJournal`,
 * `JournalListParams`, `/api/v1/journal/`). Le faux serveur (`simulation/journal.ts`) parle le
 * modèle de l'écran (`EntreeJournal`, `FiltresJournal`) ; quand le backend sera branché, seul ce
 * fichier et `api.ts` changent, pas l'écran.
 *
 * ÉCARTS DE CONTRAT à lever au raccordement (le backend est gelé, rien n'est modifié côté API) :
 * - auteur : l'API filtre par identifiant numérique d'acteur (`auteur?: number`) et renvoie
 *   `acteur` (id) + `acteur_nom` ; le faux serveur filtre par nom. Il faudra une liste d'acteurs
 *   (id, nom) pour alimenter le filtre : `versParametresApi` reçoit la correspondance nom → id ;
 * - type : l'API filtre par « type d'objet (caisse…) ou préfixe d'action (connexion…) » et ne
 *   connaît pas les familles de l'écran (`TypeAction`) ; `typeDeLaLigne` les déduit du type
 *   d'objet et de l'action, au mieux (repli : `autre`) ;
 * - pagination : l'API pagine par curseur (`cursor`, `next`, `previous`), l'écran montre les 40
 *   dernières actions et le total ; le total n'existe pas côté API ;
 * - horodatage : l'API donne un instant (`horodatage`), l'écran affiche jour et heure à l'heure
 *   de la boulangerie (Africa/Douala) ;
 * - avant / après : `unknown` côté API (objets JSON), des textes courts côté écran ;
 * - texte de l'action : l'API sépare `entree` (connexion, comptoir…), `action` (code) et
 *   `objet_type` / `objet_id` ; le faux serveur donne une phrase française. Le libellé lisible
 *   (`texteDeLaLigne`) devra venir de textes traduits par code d'action ;
 * - poste : `poste_id` / `poste_nom` n'ont pas d'équivalent à l'écran (non affichés par la maquette).
 */

const FUSEAU = 'Africa/Douala';

const jourDe = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: FUSEAU,
  }).format(date);

const heureDe = (date: Date) =>
  new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: FUSEAU,
  }).format(date);

/** Texte affiché pour une valeur avant / après : « — » quand elle est vide ou absente. */
export function texteDeValeur(valeur: unknown): string {
  if (valeur === undefined || valeur === null || valeur === '') return '—';
  if (typeof valeur === 'string') return valeur;
  if (typeof valeur === 'number' || typeof valeur === 'boolean') return String(valeur);
  return JSON.stringify(valeur);
}

const estPresent = (valeur: unknown): boolean => valeur !== null && valeur !== undefined;

const estProfil = (valeur: string): valeur is Profil => valeur in PROFILS;

/**
 * Famille de l'écran d'une ligne de l'API, d'après son type d'objet puis le préfixe de son action.
 * Une ligne qu'aucune famille ne reconnaît est classée « autre » : jamais rangée à tort parmi les
 * décisions.
 */
export function typeDeLaLigne(ligne: Pick<LigneJournal, 'objet_type' | 'action'>): TypeAction {
  const objet = ligne.objet_type.toLowerCase();
  const action = ligne.action.toLowerCase();
  const candidat = TYPES_ACTION.find(
    (type) => objet.startsWith(type) || action.startsWith(type) || action.startsWith(`${type}.`),
  );
  return candidat ?? 'autre';
}

/** Une ligne de l'API en entrée de l'écran. */
export function depuisLigneApi(ligne: LigneJournal): EntreeJournal {
  const quand = new Date(ligne.horodatage);
  const profil = estProfil(ligne.profil) ? ligne.profil : null;
  return {
    id: String(ligne.id),
    quand: quand.toISOString(),
    jour: jourDe(quand),
    heure: heureDe(quand),
    auteur: ligne.acteur_nom,
    profil,
    type: typeDeLaLigne(ligne),
    texte: texteDeLaLigne(ligne),
    // Dès qu'une des deux valeurs existe (création : pas d'avant ; suppression : pas d'après),
    // l'autre s'affiche « — » ; `null` et `undefined` comptent comme absents.
    ...(estPresent(ligne.avant) || estPresent(ligne.apres)
      ? { avant: texteDeValeur(ligne.avant), apres: texteDeValeur(ligne.apres) }
      : {}),
  };
}

/** Provisoire : le code de l'action, tant que les libellés traduits n'existent pas. */
export const texteDeLaLigne = (ligne: Pick<LigneJournal, 'entree' | 'action'>): string =>
  ligne.action || ligne.entree;

/**
 * Filtres de l'écran en paramètres de l'API. `idsActeurs` donne l'identifiant de l'acteur d'un
 * nom (voir l'écart « auteur ») ; un auteur inconnu n'est pas envoyé.
 */
export function versParametresApi(
  filtres: FiltresJournal,
  idsActeurs: ReadonlyMap<string, number>,
): JournalListParams {
  const auteur = filtres.auteur ? idsActeurs.get(filtres.auteur) : undefined;
  return {
    ...(auteur !== undefined ? { auteur } : {}),
    ...(filtres.type ? { type: filtres.type } : {}),
    ...(filtres.du ? { du: filtres.du } : {}),
    ...(filtres.au ? { au: filtres.au } : {}),
  };
}
