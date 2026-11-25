import {
  journalActeursList,
  journalList,
  type Acteur,
  type PaginatedLigneJournalList,
} from '@/api';

import { depuisLigneApi, versParametresApi } from './mapping.ts';
import { LIMITE_AFFICHEE, type FiltresJournal, type InstantaneJournal } from './types.ts';

/*
 * Lecture de « Gestion › Journal » sur le vrai serveur (P7, #361) : `journal/` filtre par période,
 * auteur (identifiant tiré de `journal/acteurs/`) et famille, rend le `total` des lignes filtrées et
 * le libellé lisible de chaque action. Une seule page de `LIMITE_AFFICHEE` lignes est lue.
 */

const jourDeYaounde = () =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Douala' }).format(new Date());

export async function lireJournalReel(filtres: FiltresJournal): Promise<InstantaneJournal> {
  const acteurs = await journalActeursList()
    .then((r) => (Array.isArray(r.data) ? (r.data as Acteur[]) : []))
    .catch(() => [] as Acteur[]);
  const ids = new Map(acteurs.map((a) => [a.nom, a.id] as const));
  const reponse = (await journalList({
    ...versParametresApi(filtres, ids),
    page_size: LIMITE_AFFICHEE,
  })) as unknown as { data: PaginatedLigneJournalList };
  return {
    entrees: reponse.data.results.map(depuisLigneApi),
    total: reponse.data.total,
    auteurs: [...new Set(acteurs.map((a) => a.nom))].sort((x, y) => x.localeCompare(y, 'fr')),
    aujourdhui: jourDeYaounde(),
  };
}
