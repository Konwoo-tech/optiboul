import { useUsersMeRetrieve } from '@/api';

/**
 * Utilisateur connecté et son profil (cookie de session de même origine).
 * `utilisateur` est absent tant qu'il n'y a pas de session valide.
 */
export function useUtilisateurCourant() {
  const requete = useUsersMeRetrieve({ query: { retry: false, staleTime: 60_000 } });
  return {
    utilisateur: requete.data?.data,
    chargement: requete.isPending,
  };
}
