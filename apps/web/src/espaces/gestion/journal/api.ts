import { ErreurApi, optiboulFetch } from '@/api';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { FiltresJournal, InstantaneJournal } from './types.ts';

// Le backend n'a pas encore cette route dans le modèle de l'écran : l'écran lit le faux serveur
// (`simulation/journal.ts`). Au raccordement, ce fichier appellera `/api/v1/journal/` et passera
// par `mapping.ts` (`depuisLigneApi`, `versParametresApi`), qui documente les écarts de contrat.
const RACINE = '/api/v1/simulation/gestion/journal/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée et les filtres : rien ne fuit d'un compte à l'autre. */
export const cleJournal = (utilisateur: string | undefined, filtres: FiltresJournal) =>
  ['simulation', 'gestion', 'journal', utilisateur, filtres] as const;

function adresse(filtres: FiltresJournal): string {
  const parametres = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) if (valeur) parametres.set(cle, valeur);
  const requete = parametres.toString();
  return requete ? `${RACINE}?${requete}` : RACINE;
}

export function useJournal(
  utilisateur: string | undefined,
  filtres: FiltresJournal,
  actif: boolean,
) {
  return useQuery({
    queryKey: cleJournal(utilisateur, filtres),
    queryFn: async () => (await optiboulFetch<Reponse<InstantaneJournal>>(adresse(filtres))).data,
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
