import { connexionInvitationCreate, connexionNouveauMotDePasseCreate, ErreurApi } from '@/api';
import { amorcerLeJetonCsrf } from '@/auth/connexion.ts';
import { useTranslation } from '@/i18n';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Link, useSearchParams } from 'react-router';

import { ColonneSession } from './ColonneSession.tsx';
import styles from './Connexion.module.css';
import etapes from './Etapes.module.css';

const LONGUEUR_MINIMALE = 8;

type Props = {
  /** `invitation` : premier mot de passe d'un compte créé (lien `?uid=&jeton=`) ; `reinitialisation` : mot de passe oublié (lien `?jeton=`). */
  mode: 'invitation' | 'reinitialisation';
};

/**
 * Page ouverte depuis le lien reçu par e-mail : la personne choisit son mot de passe (US-020 pour
 * l'invitation, « mot de passe oublié » pour la réinitialisation). Les deux jetons sont à usage
 * unique et expirent : un lien périmé donne un message clair et renvoie à la connexion.
 */
export default function ChoixMotDePasse({ mode }: Props) {
  const { t } = useTranslation();
  const [parametres] = useSearchParams();
  const uid = parametres.get('uid') ?? '';
  const jeton = parametres.get('jeton') ?? '';
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState('');
  const [fait, setFait] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  // Le cookie CSRF est posé par le serveur au premier chargement de cette page.
  const amorce = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    amorce.current = amorcerLeJetonCsrf();
  }, []);
  const lienIncomplet = !jeton || (mode === 'invitation' && !uid);

  const envoyer = async (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (motDePasse.length < LONGUEUR_MINIMALE) {
      setErreur(t('connexion.nouveau.trop_court', { minimum: LONGUEUR_MINIMALE }));
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur(t('connexion.nouveau.different'));
      return;
    }
    setEnvoi(true);
    try {
      await amorce.current;
      if (mode === 'invitation') {
        await connexionInvitationCreate({ uid, jeton, motDePasse });
      } else {
        await connexionNouveauMotDePasseCreate({ jeton, motDePasse });
      }
      setFait(true);
    } catch (e) {
      const code = e instanceof ErreurApi ? e.code : undefined;
      if (code === 'mot_de_passe_faible' && e instanceof ErreurApi) {
        // Le serveur dit pourquoi (trop courant, trop proche de l'adresse…), en français.
        setErreur(e.message || t('connexion.nouveau.faible'));
      } else if (code === 'invitation_invalide' || code === 'lien_invalide') {
        setErreur(t('connexion.nouveau.lienInvalide'));
      } else {
        setErreur(t('connexion.nouveau.echec'));
      }
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className={styles.page}>
      <ColonneSession />
      <div className={styles.droite}>
        <div className={etapes.formulaireEmail}>
          <div>
            <h1 className={etapes.titre}>
              {t(
                mode === 'invitation'
                  ? 'connexion.nouveau.titreInvitation'
                  : 'connexion.nouveau.titre',
              )}
            </h1>
            <p className={etapes.sousTitre}>
              {t(
                mode === 'invitation'
                  ? 'connexion.nouveau.aideInvitation'
                  : 'connexion.nouveau.aide',
              )}
            </p>
          </div>
          {lienIncomplet ? (
            <div className={etapes.erreurChamp} role="alert">
              {t('connexion.nouveau.lienInvalide')}
            </div>
          ) : fait ? (
            <div className={etapes.formulaire}>
              <output>{t('connexion.nouveau.fait')}</output>
              <Link to="/connexion" className={etapes.boutonPrincipal}>
                {t('connexion.seConnecter')}
              </Link>
            </div>
          ) : (
            <form className={etapes.formulaire} onSubmit={(e) => void envoyer(e)} noValidate>
              <div className={etapes.champ}>
                <span className={etapes.champEntete}>
                  <label htmlFor="nouveau-mot-de-passe">{t('connexion.nouveau.champ')}</label>
                  <button
                    type="button"
                    className={etapes.lien}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? t('connexion.masquer') : t('connexion.afficher')}
                  </button>
                </span>
                <input
                  id="nouveau-mot-de-passe"
                  className={etapes.saisie}
                  type={visible ? 'text' : 'password'}
                  value={motDePasse}
                  autoComplete="new-password"
                  onChange={(e) => {
                    setMotDePasse(e.target.value);
                    setErreur('');
                  }}
                />
              </div>
              <div className={etapes.champ}>
                <label htmlFor="confirmation-mot-de-passe">
                  {t('connexion.nouveau.confirmation')}
                </label>
                <input
                  id="confirmation-mot-de-passe"
                  className={etapes.saisie}
                  type={visible ? 'text' : 'password'}
                  value={confirmation}
                  autoComplete="new-password"
                  onChange={(e) => {
                    setConfirmation(e.target.value);
                    setErreur('');
                  }}
                />
              </div>
              <div className={etapes.erreurChamp} role="alert">
                {erreur}
              </div>
              <button type="submit" className={etapes.boutonPrincipal} disabled={envoi}>
                {t('connexion.nouveau.enregistrer')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
