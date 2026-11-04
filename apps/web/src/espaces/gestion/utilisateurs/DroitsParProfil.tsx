import { useTranslation } from '@/i18n';
import { useId } from 'react';

import { MATRICE_DES_DROITS } from './regles.ts';
import styles from './Utilisateurs.module.css';

const COLONNES = ['caissier', 'gerant', 'production', 'proprietaire', 'administrateur'] as const;

/** Tableau « Droits par profil » (cahier des charges §3.3), sous la liste des comptes. */
export function DroitsParProfil() {
  const { t } = useTranslation();
  const titre = useId();
  // Les lignes sont des grilles CSS (colonnes 2fr + 5 x 1fr, comme la maquette) : un vrai <table>
  // perdrait sa sémantique avec `display: grid`, les rôles ARIA la gardent.
  /* oxlint-disable jsx-a11y/prefer-tag-over-role */
  return (
    <div className={styles.defilement}>
      <div className={styles.droits}>
        <h2 id={titre} className={styles.droitsTitre}>
          {t('gestion.utilisateurs.droits.titre')}
        </h2>
        <div role="table" aria-labelledby={titre}>
          <div role="row" className={`${styles.droitsLigne} ${styles.droitsEntete}`}>
            <span role="columnheader">{t('gestion.utilisateurs.droits.fonction')}</span>
            {COLONNES.map((c) => (
              <span key={c} role="columnheader">
                {t(`gestion.utilisateurs.droits.${c}`)}
              </span>
            ))}
          </div>
          {MATRICE_DES_DROITS.map((ligne) => (
            <div key={ligne.cle} role="row" className={styles.droitsLigne}>
              <span role="rowheader" className={styles.droitsFonction}>
                {t(`gestion.utilisateurs.droits.lignes.${ligne.cle}`)}
              </span>
              {ligne.droits.map((d, rang) => (
                <span key={COLONNES[rang]} role="cell">
                  {t(`gestion.utilisateurs.droits.valeurs.${d}`)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
