import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from '../caisses/Fenetres.module.css';

type Props = {
  /** Code et titre de la demande refusée, déjà formatés : « DEM-013 · Dépense au-dessus du seuil ». */
  demande: string;
  envoiEnCours: boolean;
  onConfirmer: (motif: string) => void;
  onFermer: () => void;
};

/** Refuser une demande : le motif est obligatoire, tracé, et connu de la personne qui l'a émise. */
export function FenetreRefus({ demande, envoiEnCours, onConfirmer, onFermer }: Props) {
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
    <FenetreModale titre={t('demandes.refus.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={envoyer}>
        <div className={styles.creneauTitre}>{demande}</div>
        <label className={styles.champ}>
          {t('demandes.refus.motif')}
          <input
            className={`${styles.texte} ${manquant ? styles.erreurChamp : ''}`}
            value={motif}
            onChange={(e) => {
              setMotif(e.target.value);
              setManquant(false);
            }}
            maxLength={500}
            aria-invalid={manquant ? true : undefined}
          />
        </label>
        <div className={styles.discret}>{t('demandes.refus.note')}</div>
        {manquant && (
          <div className={styles.erreur} role="alert">
            {t('demandes.refus.obligatoire')}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('demandes.refus.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('demandes.refus.confirmer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
