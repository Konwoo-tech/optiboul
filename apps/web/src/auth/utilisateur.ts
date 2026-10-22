import { estSansSession, useUsersMeRetrieve } from '@/api';

/**
 * Utilisateur connecté et son profil (cookie de session de même origine).
 * `utilisateur` est absent tant qu'il n'y a pas de session valide.
 * `injoignable` : le serveur ne répond pas (réseau, 5xx). On ne sait rien de la session,
 * donc on ne déconnecte pas.
 */
export function useUtilisateurCourant() {
  const requete = useUsersMeRetrieve({ query: { staleTime: 60_000 } });
  const sansSession = estSansSession(requete.error);
  return {
    utilisateur: sansSession ? undefined : requete.data?.data,
    chargement: requete.isPending,
    injoignable: requete.isError && !sansSession && !requete.data,
    reessayer: () => void requete.refetch(),
  };
}
