import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from '../../comptoir/caisses/Fenetres.module.css';

type Props = {
  /** « Semaine 46 · 9 nov. → 15 nov. », déjà formatée. */
  semaine: string;
  envoiEnCours: boolean;
  onConfirmer: (motif: string) => void;
  onFermer: () => void;
};

/**
 * Le propriétaire force la clôture d'une semaine malgré des contrôles bloquants : le motif est
 * obligatoire et tracé, les sessions restées ouvertes sont archivées « non clôturées » (US-035, O8).
 */
export function ModaleForcee({ semaine, envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  const [motif, setMotif] = useState('');
  const [manquant, setManquant] = useState(false);

  const envoyer = (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!motif.trim()) {
      setManquant(true);
      return;
    }
    onConfirmer(motif.trim());
  };

  return (
    <FenetreModale titre={t('gestion.semaines.forcee.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={envoyer}>
        <div className={styles.creneauTitre}>{semaine}</div>
        <label className={styles.champ}>
          {t('gestion.semaines.forcee.motif')}
          <input
            className={`${styles.texte} ${manquant ? styles.erreurChamp : ''}`}
            value={motif}
            maxLength={500}
            onChange={(e) => {
              setMotif(e.target.value);
              setManquant(false);
            }}
            aria-invalid={manquant ? true : undefined}
          />
        </label>
        <div className={styles.discret}>{t('gestion.semaines.forcee.note')}</div>
        {manquant && (
          <div className={styles.erreur} role="alert">
            {t('gestion.semaines.forcee.obligatoire')}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('gestion.semaines.forcee.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('gestion.semaines.forcee.confirmer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
