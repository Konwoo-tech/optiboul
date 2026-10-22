import { useTranslation } from '@/i18n';
import {
  MOT_DE_PASSE_DEMO,
  texteDemo,
  useUtilisateursSimules,
  type Identification,
} from '@/simulation';
import { AvatarUtilisateur, LogoGoogle, useToast } from '@/ui';
import { useState, type FormEvent } from 'react';

import styles from './Etapes.module.css';

type Props = {
  onGoogle: () => void;
  identifier: (identification: Identification) => Promise<void>;
};

/** Connexion par Google, ou par e-mail et mot de passe (maquette, lignes 64-86). */
export function FormulaireEmail({ onGoogle, identifier }: Props) {
  const { t, i18n } = useTranslation();
  const afficherToast = useToast();
  const { data: comptes } = useUtilisateursSimules();
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

  const adresseSaisie = email.trim().toLowerCase();

  return (
    <div className={styles.formulaireEmail}>
      <div>
        <h1 className={styles.titre}>{t('connexion.titre')}</h1>
        <p className={styles.sousTitre}>{t('connexion.sousTitreEmail')}</p>
      </div>
      <button type="button" className={styles.boutonGoogle} onClick={onGoogle}>
        <LogoGoogle />
        <span>{t('connexion.google')}</span>
      </button>
      <div className={styles.separateur}>{t('connexion.ou')}</div>
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
            <button
              type="button"
              className={styles.lien}
              onClick={() =>
                afficherToast(
                  t('connexion.toastReinit', {
                    email: email.trim() || t('connexion.votreAdresse'),
                  }),
                )
              }
            >
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
      <div className={styles.demoProfils}>
        <div className={styles.demoEntete}>
          <span className={styles.demoTitre}>{t('connexion.demoTitre')}</span>
          <span className={styles.demoAstuce}>{t('connexion.demoAstuce')}</span>
        </div>
        <div className={styles.demoGrille}>
          {comptes?.map((compte) => (
            <button
              key={compte.id}
              type="button"
              className={styles.demoCarte}
              aria-pressed={adresseSaisie === compte.email}
              onClick={() => {
                setEmail(compte.email);
                setMotDePasse(MOT_DE_PASSE_DEMO);
                setErreur('');
              }}
            >
              <AvatarUtilisateur nom={compte.nom} profil={compte.profil} taille={34} />
              <span className={styles.demoTextes}>
                <span className={styles.demoNom}>
                  {compte.nom}
                  {' · '}
                  <span className={styles.demoRole}>{t(`profils.${compte.profil}`)}</span>
                </span>
                <span className={styles.demoEmail}>{compte.email}</span>
              </span>
            </button>
          ))}
        </div>
        <div className={styles.demoIdentifiants}>
          {texteDemo('demoIdentifiants', i18n.language)}
        </div>
      </div>
    </div>
  );
}
