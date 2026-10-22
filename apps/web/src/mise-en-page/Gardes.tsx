import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { EcranChargement, EcranErreur } from '@/ui';
import { Navigate, Outlet, useLocation } from 'react-router';

import { PROFILS, peutOuvrir, type Espace } from '../profils.ts';

/**
 * Sans session, renvoie vers la connexion en gardant la page demandée.
 * Si le serveur ne répond pas, on ne sait rien de la session : on propose de réessayer
 * au lieu de déconnecter.
 */
export function RequiertConnexion() {
  const { t } = useTranslation();
  const { utilisateur, chargement, injoignable, reessayer } = useUtilisateurCourant();
  const { pathname, search, hash } = useLocation();
  if (chargement) return <EcranChargement />;
  if (injoignable) {
    return (
      <EcranErreur
        titre={t('erreur.injoignableTitre')}
        message={t('erreur.injoignable')}
        libelleAction={t('erreur.reessayer')}
        onAction={reessayer}
      />
    );
  }
  if (!utilisateur) {
    const suivant = encodeURIComponent(`${pathname}${search}${hash}`);
    return <Navigate to={`/connexion?suivant=${suivant}`} replace />;
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
