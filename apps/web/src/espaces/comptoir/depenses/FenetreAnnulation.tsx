import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from '../caisses/Fenetres.module.css';

type Props = {
  /** Numéro et libellé de la dépense, déjà formatés : « DEP-0016 · Levure ». */
  depense: string;
  envoiEnCours: boolean;
  /** Renvoie vrai si le serveur a refusé (la fenêtre l'annonce). */
  onConfirmer: (motif: string) => Promise<boolean>;
  onFermer: () => void;
};

/** Annuler une dépense encore en attente : le motif est obligatoire et tracé. */
export function FenetreAnnulation({ depense, envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<'motif' | 'serveur' | null>(null);

  const envoyer = async (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!motif.trim()) return setErreur('motif');
    if (await onConfirmer(motif.trim())) setErreur('serveur');
  };

  return (
    <FenetreModale titre={t('comptoir.depenses.annulation.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={(e) => void envoyer(e)} noValidate>
        <div className={styles.creneauTitre}>{depense}</div>
        <label className={styles.champ}>
          {t('comptoir.depenses.annulation.motif')}
          <input
            className={`${styles.texte} ${erreur === 'motif' ? styles.erreurChamp : ''}`}
            value={motif}
            maxLength={500}
            aria-invalid={erreur === 'motif' ? true : undefined}
            onChange={(e) => {
              setMotif(e.target.value);
              setErreur(null);
            }}
          />
        </label>
        <div className={styles.discret}>{t('comptoir.depenses.annulation.note')}</div>
        {erreur && (
          <div className={styles.erreur} role="alert">
            {t(`comptoir.depenses.annulation.erreurs.${erreur}`)}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('comptoir.depenses.annulation.retour')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('comptoir.depenses.annulation.confirmer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
