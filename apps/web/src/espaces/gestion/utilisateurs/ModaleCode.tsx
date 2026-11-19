import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from '../../comptoir/caisses/Fenetres.module.css';

type Props = {
  nom: string;
  envoiEnCours: boolean;
  onConfirmer: (code: string) => void;
  onFermer: () => void;
};

/** L'administrateur définit le code à 4 chiffres du comptoir d'une personne (le serveur ne l'envoie pas). */
export function ModaleCode({ nom, envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [manquant, setManquant] = useState(false);

  const envoyer = (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!/^\d{4}$/.test(code)) {
      setManquant(true);
      return;
    }
    onConfirmer(code);
  };

  return (
    <FenetreModale titre={t('gestion.utilisateurs.code.titre', { nom })} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={envoyer} noValidate>
        <label className={styles.champ}>
          {t('gestion.utilisateurs.code.champ')}
          <input
            className={`${styles.texte} ${manquant ? styles.erreurChamp : ''}`}
            value={code}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            aria-invalid={manquant ? true : undefined}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 4));
              setManquant(false);
            }}
          />
        </label>
        <div className={styles.discret}>{t('gestion.utilisateurs.code.note')}</div>
        {manquant && (
          <div className={styles.erreur} role="alert">
            {t('gestion.utilisateurs.code.erreur')}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('gestion.utilisateurs.code.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('gestion.utilisateurs.code.confirmer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
