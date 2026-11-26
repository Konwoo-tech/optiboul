import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from '../caisses/Fenetres.module.css';
import { CATEGORIES, type Categorie, type Depense } from './types.ts';

export type CorrectionDepense = { categorie: Categorie; libelle: string; montant: number };

type Props = {
  depense: Depense;
  envoiEnCours: boolean;
  /** Renvoie le message du refus du serveur, ou `null` quand la dépense est corrigée. */
  onConfirmer: (correction: CorrectionDepense) => Promise<string | null>;
  onFermer: () => void;
};

/** Corriger une dépense encore en attente : catégorie, libellé et montant (auteur ou direction). */
export function FenetreCorrection({ depense, envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  const [categorie, setCategorie] = useState<Categorie>(depense.categorie);
  const [libelle, setLibelle] = useState(depense.libelle);
  const [montant, setMontant] = useState(String(depense.montant));
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!libelle.trim() || !/^\d+$/.test(montant) || Number(montant) <= 0) {
      return setErreur(t('comptoir.depenses.correction.erreurs.invalide'));
    }
    const refus = await onConfirmer({
      categorie,
      libelle: libelle.trim(),
      montant: Number(montant),
    });
    if (refus) setErreur(refus);
  };

  return (
    <FenetreModale titre={t('comptoir.depenses.correction.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={(e) => void envoyer(e)} noValidate>
        <div className={styles.creneauTitre}>
          {`DEP-${String(depense.numero).padStart(4, '0')}`}
        </div>
        <label className={styles.champ}>
          {t('comptoir.depenses.correction.categorie')}
          <select
            className={styles.texte}
            value={categorie}
            onChange={(e) => setCategorie(e.target.value as Categorie)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`comptoir.depenses.categories.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.champ}>
          {t('comptoir.depenses.correction.libelle')}
          <input
            className={styles.texte}
            value={libelle}
            maxLength={200}
            onChange={(e) => {
              setLibelle(e.target.value);
              setErreur(null);
            }}
          />
        </label>
        <label className={styles.champ}>
          {t('comptoir.depenses.correction.montant')}
          <input
            className={styles.texte}
            value={montant}
            inputMode="numeric"
            onChange={(e) => {
              setMontant(e.target.value.replace(/\D/g, ''));
              setErreur(null);
            }}
          />
        </label>
        <div className={styles.discret}>{t('comptoir.depenses.correction.note')}</div>
        {erreur && (
          <div className={styles.erreur} role="alert">
            {erreur}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('comptoir.depenses.correction.retour')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('comptoir.depenses.correction.enregistrer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
