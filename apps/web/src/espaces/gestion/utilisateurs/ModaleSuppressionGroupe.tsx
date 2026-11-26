import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';

import styles from '../../comptoir/caisses/Fenetres.module.css';
import type { Groupe } from './types.ts';

type Props = {
  groupe: Groupe;
  envoiEnCours: boolean;
  onConfirmer: () => void;
  onFermer: () => void;
};

/** Confirme la suppression d'un groupe vide : elle ne se défait pas, le journal la garde. */
export function ModaleSuppressionGroupe({ groupe, envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  return (
    <FenetreModale titre={t('gestion.utilisateurs.groupes.supprimer.titre')} onFermer={onFermer}>
      <p>{t('gestion.utilisateurs.groupes.supprimer.question', { nom: groupe.nom })}</p>
      <div className={styles.discret}>{t('gestion.utilisateurs.groupes.supprimer.note')}</div>
      <div className={styles.actions}>
        <button type="button" className={styles.annuler} onClick={onFermer}>
          {t('gestion.utilisateurs.groupes.supprimer.annuler')}
        </button>
        <button
          type="button"
          className={styles.confirmer}
          disabled={envoiEnCours}
          onClick={onConfirmer}
        >
          {t('gestion.utilisateurs.groupes.supprimer.confirmer')}
        </button>
      </div>
    </FenetreModale>
  );
}
