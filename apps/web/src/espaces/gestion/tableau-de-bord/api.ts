import { ErreurApi } from '@/api';
import { useQuery } from '@tanstack/react-query';

import { lireTableauDeBordReel } from './reel.ts';

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleTableauDeBord = (utilisateur: string | undefined) =>
  ['ecran', 'gestion', 'tableau-de-bord', utilisateur] as const;

export function useTableauDeBord(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleTableauDeBord(utilisateur),
    queryFn: lireTableauDeBordReel,
    enabled: Boolean(utilisateur),
    // Les chiffres bougent depuis les autres écrans (session, dépenses, demandes…) : on relit à
    // chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
