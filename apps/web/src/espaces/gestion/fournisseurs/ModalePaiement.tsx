import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { formaterNombre } from '@/utils';
import { useState } from 'react';

import { libelleFacture } from './affichage.ts';
import styles from './Fournisseurs.module.css';
import { MODES_PAIEMENT, type Facture, type Fournisseur, type ModePaiement } from './types.ts';

type Props = {
  facture: Facture;
  fournisseur: Fournisseur | undefined;
  enCours: boolean;
  onFermer: () => void;
  onConfirmer: (mode: ModePaiement) => void;
};

/** Paiement d'une facture : espèces, banque ou mobile money ; crée une dépense rattachée au stock (US-103). */
export function ModalePaiement({ facture, fournisseur, enCours, onFermer, onConfirmer }: Props) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<ModePaiement>('especes');

  return (
    <FenetreModale titre={t('gestion.fournisseurs.paiement.titre')} onFermer={onFermer}>
      <p className={styles.infoPaiement}>
        {t('gestion.fournisseurs.paiement.info', {
          numero: facture.numero,
          fournisseur: fournisseur?.nom ?? '',
          objet: libelleFacture(t, facture, i18n.language),
          montant: formaterNombre(facture.montant),
        })}
      </p>
      <fieldset className={styles.groupe}>
        <legend className={styles.legende}>{t('gestion.fournisseurs.paiement.mode')}</legend>
        {MODES_PAIEMENT.map((cle) => (
          <button
            type="button"
            key={cle}
            className={`${styles.puce} ${mode === cle ? styles.puceActive : ''}`}
            aria-pressed={mode === cle}
            onClick={() => setMode(cle)}
          >
            {t(`gestion.fournisseurs.modes.${cle}`)}
          </button>
        ))}
      </fieldset>
      <div className={styles.boutons}>
        <button type="button" className={styles.annuler} onClick={onFermer}>
          {t('gestion.fournisseurs.paiement.annuler')}
        </button>
        <button
          type="button"
          className={styles.confirmer}
          disabled={enCours}
          onClick={() => onConfirmer(mode)}
        >
          {t('gestion.fournisseurs.paiement.valider')}
        </button>
      </div>
    </FenetreModale>
  );
}
