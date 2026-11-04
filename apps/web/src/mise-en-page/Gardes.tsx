import { useUtilisateurCourant } from '@/auth';
import { EcranChargement } from '@/ui';
import { Navigate, Outlet, useLocation } from 'react-router';

import { cheminAccueil } from '../navigation.ts';
import { peutOuvrir, type Espace } from '../profils.ts';

/**
 * Sans session, renvoie vers la connexion en gardant la page demandée.
 * Si le serveur ne répond pas et qu'aucune session n'est connue, on renvoie aussi vers la
 * connexion : elle s'affiche sans serveur et propose de réessayer (aucune session n'est perdue,
 * un utilisateur déjà chargé reste affiché malgré une panne passagère).
 */
export function RequiertConnexion() {
  const { utilisateur, chargement, injoignable } = useUtilisateurCourant();
  const { pathname, search, hash } = useLocation();
  if (chargement) return <EcranChargement />;
  if (!utilisateur || injoignable) {
    const suivant = encodeURIComponent(`${pathname}${search}${hash}`);
    return <Navigate to={`/connexion?suivant=${suivant}`} replace />;
  }
  return <Outlet />;
}

/** « / » mène à l'accueil du profil (O10). */
export function AccueilDuProfil() {
  const { utilisateur } = useUtilisateurCourant();
  if (!utilisateur?.profil) return <Navigate to="/connexion" replace />;
  return <Navigate to={cheminAccueil(utilisateur.profil)} replace />;
}

/** Un espace non autorisé pour le profil renvoie à son accueil. */
export function EspaceAutorise({ espace }: { espace: Espace }) {
  const { utilisateur } = useUtilisateurCourant();
  if (!peutOuvrir(utilisateur?.profil, espace)) return <Navigate to="/" replace />;
  return <Outlet />;
}
