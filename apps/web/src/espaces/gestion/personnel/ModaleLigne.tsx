import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from '../../comptoir/caisses/Fenetres.module.css';
import type { Ajustement } from './types.ts';

type Props = {
  ligne: Ajustement;
  envoiEnCours: boolean;
  onConfirmer: (libelle: string, montant: number) => void;
  onFermer: () => void;
};

/** Corrige le libellé et le montant d'un gain ou d'une pénalité, tant que l'état de paie est ouvert. */
export function ModaleLigne({ ligne, envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  const [libelle, setLibelle] = useState(ligne.libelle);
  const [montant, setMontant] = useState(String(ligne.montant));
  const [invalide, setInvalide] = useState(false);

  const envoyer = (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!libelle.trim() || !/^\d+$/.test(montant) || Number(montant) <= 0) {
      setInvalide(true);
      return;
    }
    onConfirmer(libelle.trim(), Number(montant));
  };

  return (
    <FenetreModale titre={t('gestion.personnel.ligne.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={envoyer} noValidate>
        <label className={styles.champ}>
          {t('gestion.personnel.ligne.libelle')}
          <input
            className={styles.texte}
            value={libelle}
            maxLength={255}
            onChange={(e) => {
              setLibelle(e.target.value);
              setInvalide(false);
            }}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.personnel.ligne.montant')}
          <input
            className={styles.texte}
            value={montant}
            inputMode="numeric"
            onChange={(e) => {
              setMontant(e.target.value.replace(/\D/g, ''));
              setInvalide(false);
            }}
          />
        </label>
        {invalide && (
          <div className={styles.erreur} role="alert">
            {t('gestion.personnel.ligne.invalide')}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('gestion.personnel.ligne.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('gestion.personnel.ligne.enregistrer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
