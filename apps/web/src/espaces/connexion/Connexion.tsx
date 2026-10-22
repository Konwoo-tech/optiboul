import { effacerMessageConnexion, lireMessageConnexion, useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import {
  annulerIdentification,
  configurationSimulee,
  identifier,
  SIMULATION,
  type Identification,
} from '@/simulation';
import { cheminSuivant } from '@/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';

import { cheminAccueil } from '../../navigation.ts';
import { ChoixCompteGoogle } from './ChoixCompteGoogle.tsx';
import { ChoixUtilisateur } from './ChoixUtilisateur.tsx';
import { ColonneSession } from './ColonneSession.tsx';
import styles from './Connexion.module.css';
import { FormulaireEmail } from './FormulaireEmail.tsx';
import { VerificationDeuxEtapes, type EnAttente } from './VerificationDeuxEtapes.tsx';

/**
 * Connexion. En attendant les écrans dédiés (US-010 code à 4 chiffres, US-011 double
 * authentification), le bouton ouvre la connexion django-allauth sur la même origine.
 * En simulation, le parcours de la maquette est joué sur de fausses données : identification
 * (Google, e-mail ou nom + code), puis vérification en deux étapes par SMS ou WhatsApp.
 */
export default function Connexion() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { utilisateur } = useUtilisateurCourant();
  const [parametres] = useSearchParams();
  const suivant = cheminSuivant(parametres.get('suivant'));
  const configuration = configurationSimulee();
  const [message, setMessage] = useState(lireMessageConnexion);
  const [googleOuvert, setGoogleOuvert] = useState(false);
  const [attente, setAttente] = useState<EnAttente | null>(null);

  // Le message n'est montré qu'une fois : on le retire du stockage dès qu'il est affiché.
  useEffect(() => effacerMessageConnexion(), []);

  if (utilisateur?.profil) {
    return <Navigate to={suivant ?? cheminAccueil(utilisateur.profil)} replace />;
  }

  /** Première étape. Une erreur (code ou mot de passe faux) remonte à l'écran qui l'a demandée. */
  const identifierEtSuivre = async (identification: Identification) => {
    const reponse = await identifier(identification, configuration.deuxFacteurs);
    setMessage('');
    if (reponse.deuxFacteurs) {
      setGoogleOuvert(false);
      setAttente(reponse);
    } else {
      await client.invalidateQueries();
    }
  };

  const revenirDeLaVerification = () => {
    void annulerIdentification();
    setAttente(null);
  };

  return (
    <div className={styles.page}>
      <ColonneSession />
      <div className={styles.droite}>
        {message && <div className={styles.alerte}>{message}</div>}
        {utilisateur ? (
          <div className={styles.alerte}>{t('connexion.aucunProfil')}</div>
        ) : !SIMULATION ? (
          <div className={styles.allauth}>
            <h1 className={styles.titre}>{t('connexion.titre')}</h1>
            <a
              className={styles.boutonAllauth}
              href={`/accounts/login/?next=${encodeURIComponent(suivant ?? '/')}`}
            >
              {t('connexion.seConnecter')}
            </a>
          </div>
        ) : attente ? (
          <VerificationDeuxEtapes
            attente={attente}
            onRetour={revenirDeLaVerification}
            onTermine={() => void client.invalidateQueries()}
          />
        ) : configuration.mode === 'code' ? (
          <ChoixUtilisateur identifier={identifierEtSuivre} onChoisi={() => setMessage('')} />
        ) : googleOuvert ? (
          <ChoixCompteGoogle
            onChoisir={(email) => void identifierEtSuivre({ methode: 'google', email })}
            onAnnuler={() => setGoogleOuvert(false)}
          />
        ) : (
          <FormulaireEmail
            identifier={identifierEtSuivre}
            onGoogle={() => {
              setMessage('');
              setGoogleOuvert(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
