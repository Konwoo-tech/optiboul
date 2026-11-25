import type { Identification } from '@/auth/connexion.ts';
import { useTranslation } from '@/i18n';
import { useToast } from '@/ui';
import { useState, type FormEvent, type ReactNode } from 'react';

import styles from './Etapes.module.css';

type Props = {
  /** Le bouton Google Identity Services ; absent : pas de connexion par Google. */
  boutonGoogle?: ReactNode;
  identifier: (identification: Identification) => Promise<void>;
  /** Demande le lien de réinitialisation (vrai serveur). Absent : l'envoi est simplement annoncé. */
  onOublie?: (email: string) => Promise<void>;
};

/** Connexion par Google, ou par e-mail et mot de passe (maquette, lignes 64-86). */
export function FormulaireEmail({ boutonGoogle, identifier, onOublie }: Props) {
  const { t } = useTranslation();
  const afficherToast = useToast();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState('');

  const envoyer = async (evenement: FormEvent) => {
    evenement.preventDefault();
    if (!email.trim() || !motDePasse) {
      setErreur(t('connexion.erreurChamps'));
      return;
    }
    try {
      await identifier({ methode: 'email', email, motDePasse });
    } catch {
      setErreur(t('connexion.erreurIdentifiants'));
      setMotDePasse('');
    }
  };

  const oublie = async () => {
    if (onOublie) {
      if (!email.trim()) {
        setErreur(t('connexion.erreurAdresse'));
        return;
      }
      try {
        await onOublie(email.trim());
      } catch {
        setErreur(t('connexion.erreurOublie'));
        return;
      }
    }
    afficherToast(
      t('connexion.toastReinit', { email: email.trim() || t('connexion.votreAdresse') }),
    );
  };

  return (
    <div className={styles.formulaireEmail}>
      <div>
        <h1 className={styles.titre}>{t('connexion.titre')}</h1>
        <p className={styles.sousTitre}>{t('connexion.sousTitreEmail')}</p>
      </div>
      {boutonGoogle && (
        <>
          {boutonGoogle}
          <div className={styles.separateur}>{t('connexion.ou')}</div>
        </>
      )}
      <form className={styles.formulaire} onSubmit={(e) => void envoyer(e)}>
        <label className={styles.champ}>
          {t('connexion.email')}
          <input
            className={styles.saisie}
            type="email"
            value={email}
            autoComplete="email"
            placeholder="nom@gmail.com"
            onChange={(e) => {
              setEmail(e.target.value);
              setErreur('');
            }}
          />
        </label>
        {/* Pas de <label> englobant : « Mot de passe oublié ? » est un bouton, il volerait l'étiquette. */}
        <div className={styles.champ}>
          <span className={styles.champEntete}>
            <label htmlFor="mot-de-passe">{t('connexion.motDePasse')}</label>
            <button type="button" className={styles.lien} onClick={() => void oublie()}>
              {t('connexion.oublie')}
            </button>
          </span>
          <span className={styles.ligneMotDePasse}>
            <input
              id="mot-de-passe"
              className={`${styles.saisie} ${styles.saisieMotDePasse}`}
              type={visible ? 'text' : 'password'}
              value={motDePasse}
              autoComplete="current-password"
              onChange={(e) => {
                setMotDePasse(e.target.value);
                setErreur('');
              }}
            />
            <button
              type="button"
              className={styles.basculeMotDePasse}
              onClick={() => setVisible(!visible)}
            >
              {visible ? t('connexion.masquer') : t('connexion.afficher')}
            </button>
          </span>
        </div>
        <div className={styles.erreurChamp} role="alert">
          {erreur}
        </div>
        <button type="submit" className={styles.boutonPrincipal}>
          {t('connexion.seConnecter')}
        </button>
      </form>
    </div>
  );
}
