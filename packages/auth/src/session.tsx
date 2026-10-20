import { ErreurApi, useUsersMeRetrieve } from '@optiboul/api-client';
import { useEffect, type ReactNode } from 'react';

/** Utilisateur connecté, partagé par toutes les applications web (cookie de session de même origine). */
export function useUtilisateurCourant() {
  const requete = useUsersMeRetrieve({ query: { retry: false, staleTime: 60_000 } });
  const nonConnecte =
    requete.error instanceof ErreurApi && [401, 403].includes(requete.error.status);
  return {
    utilisateur: requete.data?.data,
    chargement: requete.isPending,
    nonConnecte,
  };
}

/** Garde : renvoie vers le portail (/) quand la session est absente ou expirée. */
export function RequiertConnexion({ children }: { children: ReactNode }) {
  const { nonConnecte, chargement } = useUtilisateurCourant();
  useEffect(() => {
    if (nonConnecte)
      window.location.assign(`/?suivant=${encodeURIComponent(window.location.pathname)}`);
  }, [nonConnecte]);
  if (chargement || nonConnecte) return null;
  return <>{children}</>;
}
