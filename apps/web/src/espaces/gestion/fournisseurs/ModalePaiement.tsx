import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { formaterNombre } from '@/utils';
import { useId, useRef, useState } from 'react';

import { libelleFacture } from './affichage.ts';
import styles from './Fournisseurs.module.css';
import { MODES_PAIEMENT, type Facture, type Fournisseur, type ModePaiement } from './types.ts';

type Props = {
  facture: Facture;
  fournisseur: Fournisseur | undefined;
  enCours: boolean;
  onFermer: () => void;
  onConfirmer: (mode: ModePaiement, reference: string) => Promise<string | null>;
};

/** Paiement d'une facture : espèces, banque ou mobile money ; crée une dépense rattachée au stock (US-103). */
export function ModalePaiement({ facture, fournisseur, enCours, onFermer, onConfirmer }: Props) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [reference, setReference] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const idErreur = useId();
  const champ = useRef<HTMLInputElement>(null);

  const valider = async () => {
    if (enCours) return;
    // R7 : le mobile money exige la référence de la transaction.
    if (mode === 'mobile' && !reference.trim()) {
      setErreur('reference_obligatoire');
      champ.current?.focus();
      return;
    }
    const refus = await onConfirmer(mode, reference.trim());
    if (refus) {
      setErreur(refus);
      champ.current?.focus();
    }
  };

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
            onClick={() => {
              setMode(cle);
              setErreur(null);
            }}
          >
            {t(`gestion.fournisseurs.modes.${cle}`)}
          </button>
        ))}
      </fieldset>
      {mode === 'mobile' && (
        <label className={styles.etiquette}>
          {t('gestion.fournisseurs.paiement.reference')}
          <input
            className={styles.champ}
            ref={champ}
            value={reference}
            maxLength={60}
            aria-invalid={Boolean(erreur)}
            aria-describedby={erreur ? idErreur : undefined}
            onChange={(e) => {
              setReference(e.target.value);
              setErreur(null);
            }}
          />
          {erreur && (
            <span className={styles.erreurModale} id={idErreur} role="alert">
              {t(
                erreur === 'reference_obligatoire'
                  ? 'gestion.fournisseurs.paiement.referenceObligatoire'
                  : 'gestion.fournisseurs.paiement.erreurs.defaut',
              )}
            </span>
          )}
        </label>
      )}
      <div className={styles.boutons}>
        <button type="button" className={styles.annuler} onClick={onFermer}>
          {t('gestion.fournisseurs.paiement.annuler')}
        </button>
        <button
          type="button"
          className={styles.confirmer}
          aria-disabled={enCours}
          onClick={() => void valider()}
        >
          {t('gestion.fournisseurs.paiement.valider')}
        </button>
      </div>
    </FenetreModale>
  );
}
