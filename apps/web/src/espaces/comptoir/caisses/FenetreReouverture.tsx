import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from './Fenetres.module.css';

type Props = {
  /** « Caisse de la session de nuit du 14 oct. », déjà formatée. */
  caisse: string;
  erreur: string | null;
  envoiEnCours: boolean;
  onConfirmer: (motif: string) => void;
  onFermer: () => void;
};

/** Rouvrir une caisse fermée : le motif est obligatoire, tracé, et le propriétaire est informé (US-043). */
export function FenetreReouverture({ caisse, erreur, envoiEnCours, onConfirmer, onFermer }: Props) {
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

  const message = manquant ? t('comptoir.caisses.reouverture.obligatoire') : erreur;

  return (
    <FenetreModale titre={t('comptoir.caisses.reouverture.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={envoyer}>
        <div className={styles.creneauTitre}>{caisse}</div>
        <label className={styles.champ}>
          {t('comptoir.caisses.reouverture.motif')}
          <input
            className={`${styles.texte} ${message ? styles.erreurChamp : ''}`}
            value={motif}
            onChange={(e) => {
              setMotif(e.target.value);
              setManquant(false);
            }}
            aria-invalid={message ? true : undefined}
          />
        </label>
        <div className={styles.discret}>{t('comptoir.caisses.reouverture.note')}</div>
        {message && (
          <div className={styles.erreur} role="alert">
            {message}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('comptoir.caisses.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('comptoir.caisses.reouverture.confirmer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
