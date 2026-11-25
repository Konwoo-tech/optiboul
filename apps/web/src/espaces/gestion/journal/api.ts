import { ErreurApi } from '@/api';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { lireJournalReel } from './reel.ts';
import type { FiltresJournal } from './types.ts';

/** La clé contient la personne connectée et les filtres : rien ne fuit d'un compte à l'autre. */
export const cleJournal = (utilisateur: string | undefined, filtres: FiltresJournal) =>
  ['simulation', 'gestion', 'journal', utilisateur, filtres] as const;

export function useJournal(
  utilisateur: string | undefined,
  filtres: FiltresJournal,
  actif: boolean,
) {
  return useQuery({
    queryKey: cleJournal(utilisateur, filtres),
    queryFn: () => lireJournalReel(filtres),
    enabled: Boolean(utilisateur) && actif,
    // Garde la liste affichée pendant qu'un filtre se recharge.
    placeholderData: keepPreviousData,
    // D'autres écrans consignent des actions : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
