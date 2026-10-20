import { Center, Loader } from '@mantine/core';
import { useUtilisateurCourant } from '@optiboul/auth';
import { Navigate, Outlet, useLocation } from 'react-router';

import { PROFILS, peutOuvrir, type Espace } from '../profils.ts';

/** Sans session, renvoie vers la connexion en gardant la page demandée. */
export function RequiertConnexion() {
  const { utilisateur, chargement } = useUtilisateurCourant();
  const { pathname } = useLocation();
  if (chargement) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!utilisateur) {
    return <Navigate to={`/connexion?suivant=${encodeURIComponent(pathname)}`} replace />;
  }
  return <Outlet />;
}

/** « / » mène à l'accueil du profil (O10). */
export function AccueilDuProfil() {
  const { utilisateur } = useUtilisateurCourant();
  if (!utilisateur?.profil) return <Navigate to="/connexion" replace />;
  return <Navigate to={PROFILS[utilisateur.profil].accueil} replace />;
}

/** Un espace non autorisé pour le profil renvoie à son accueil. */
export function EspaceAutorise({ espace }: { espace: Espace }) {
  const { utilisateur } = useUtilisateurCourant();
  if (!peutOuvrir(utilisateur?.profil, espace)) return <Navigate to="/" replace />;
  return <Outlet />;
}
