import { journalList, type LigneJournal } from '@/api';

import { depuisLigneApi } from './mapping.ts';
import { repondAuxFiltres } from './regles.ts';
import { LIMITE_AFFICHEE, type FiltresJournal, type InstantaneJournal } from './types.ts';

/*
 * Lecture de « Gestion › Journal » sur le vrai serveur : `journal/` pagine par curseur et ne filtre
 * ni par nom d'auteur ni par famille d'action de l'écran. La période est envoyée au serveur ; l'auteur
 * et la famille se filtrent ici, sur les dernières actions lues (au plus `PAGES_MAX` pages), et le
 * total est celui des actions lues (voir E50).
 */

/** Nombre maximal de pages de curseur lues pour une recherche. */
export const PAGES_MAX = 10;

type PageCurseur = { data: { results?: LigneJournal[]; next?: string | null } };

/** Le curseur de la page suivante, tiré de l'adresse `next` renvoyée par le serveur. */
export function curseurDe(suivante: string | null | undefined): string | undefined {
  if (!suivante) return undefined;
  try {
    return new URL(suivante, 'http://localhost').searchParams.get('cursor') ?? undefined;
  } catch {
    return undefined;
  }
}

const jourDeYaounde = () =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Douala' }).format(new Date());

export async function lireJournalReel(filtres: FiltresJournal): Promise<InstantaneJournal> {
  const lignes: LigneJournal[] = [];
  let curseur: string | undefined;
  for (let page = 0; page < PAGES_MAX; page += 1) {
    const reponse = (await journalList({
      ...(filtres.du ? { du: filtres.du } : {}),
      ...(filtres.au ? { au: filtres.au } : {}),
      ...(curseur ? { cursor: curseur } : {}),
    })) as unknown as PageCurseur;
    lignes.push(...(reponse.data.results ?? []));
    curseur = curseurDe(reponse.data.next);
    if (!curseur) break;
  }
  const entrees = lignes.map(depuisLigneApi);
  const auteurs = [...new Set(entrees.map((e) => e.auteur).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
  const retenues = entrees.filter((e) => repondAuxFiltres(e, filtres));
  return {
    entrees: retenues.slice(0, LIMITE_AFFICHEE),
    total: retenues.length,
    auteurs,
    aujourdhui: jourDeYaounde(),
  };
}
