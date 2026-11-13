import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from './Depenses.module.css';
import { entierSaisi } from './regles.ts';

type Props<Cle extends string> = {
  titre: string;
  explication: string;
  /** Une ligne par clé : son libellé et sa valeur de départ (FCFA). */
  champs: { cle: Cle; libelle: string; valeur: number }[];
  erreur: string | null;
  envoiEnCours: boolean;
  onEnregistrer: (valeurs: Record<Cle, number>) => void;
  onFermer: () => void;
};

/** Fenêtre qui fixe un montant par ligne : le budget du mois par catégorie, ou les plafonds de la semaine. */
export function FenetreReglages<Cle extends string>({
  titre,
  explication,
  champs,
  erreur,
  envoiEnCours,
  onEnregistrer,
  onFermer,
}: Props<Cle>) {
  const { t } = useTranslation();
  const [saisies, setSaisies] = useState(() =>
    Object.fromEntries(champs.map((c) => [c.cle, String(c.valeur)])),
  );

  const envoyer = (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    onEnregistrer(
      Object.fromEntries(champs.map((c) => [c.cle, entierSaisi(saisies[c.cle] ?? '')])) as Record<
        Cle,
        number
      >,
    );
  };

  return (
    <FenetreModale titre={titre} onFermer={onFermer}>
      <form className={styles.reglages} onSubmit={envoyer} noValidate>
        <p className={styles.achatDetail}>{explication}</p>
        {champs.map((champ) => (
          <label className={styles.reglagesChamp} key={champ.cle}>
            {champ.libelle}
            <input
              className={`${styles.champ} ${styles.montant}`}
              inputMode="numeric"
              value={saisies[champ.cle]}
              onChange={(e) =>
                setSaisies((avant) => ({
                  ...avant,
                  [champ.cle]: e.target.value.replace(/\D/g, ''),
                }))
              }
            />
          </label>
        ))}
        {erreur && (
          <span className={styles.erreur} role="alert">
            {erreur}
          </span>
        )}
        <div className={styles.reglagesActions}>
          <button type="button" className={styles.reglage} onClick={onFermer}>
            {t('comptoir.depenses.reglages.annuler')}
          </button>
          <button type="submit" className={styles.enregistrer} disabled={envoiEnCours}>
            {t('comptoir.depenses.reglages.enregistrer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
