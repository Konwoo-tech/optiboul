import { effacerMessageConnexion, lireMessageConnexion, useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { cheminSuivant } from '@/utils';
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';

import { cheminAccueil } from '../../navigation.ts';
import { ColonneSession } from './ColonneSession.tsx';
import styles from './Connexion.module.css';
import EcransReels from './EcransReels.tsx';

/**
 * Connexion : identification (nom + code sur un poste de confiance, ou adresse e-mail), puis
 * vérification en deux étapes, sur le vrai serveur.
 */
export default function Connexion() {
  const { t } = useTranslation();
  const { utilisateur, injoignable, reessayer } = useUtilisateurCourant();
  const [parametres] = useSearchParams();
  const suivant = cheminSuivant(parametres.get('suivant'));
  const [message, setMessage] = useState(lireMessageConnexion);

  // Le message n'est montré qu'une fois : on le retire du stockage dès qu'il est affiché.
  useEffect(() => effacerMessageConnexion(), []);

  if (utilisateur?.profil) {
    return <Navigate to={suivant ?? cheminAccueil(utilisateur.profil)} replace />;
  }

  return (
    <div className={styles.page}>
      <ColonneSession />
      <div className={styles.droite}>
        {message && (
          <div className={styles.alerte} role="alert">
            {message}
          </div>
        )}
        {injoignable && (
          <div className={styles.alerte} role="alert">
            <strong>{t('erreur.injoignableTitre')}</strong> {t('erreur.injoignableConnexion')}{' '}
            <button type="button" className={styles.reessayer} onClick={reessayer}>
              {t('erreur.reessayer')}
            </button>
          </div>
        )}
        {utilisateur ? (
          <div className={styles.alerte} role="alert">
            {t('connexion.aucunProfil')}
          </div>
        ) : (
          <EcransReels onMessage={setMessage} />
        )}
      </div>
    </div>
  );
}
