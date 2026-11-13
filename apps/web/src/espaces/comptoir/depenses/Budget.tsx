import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import { moisDuBudget } from './affichage.ts';
import styles from './Depenses.module.css';
import { niveauBudget, remplissage, totauxBudget } from './regles.ts';
import type { LigneBudget } from './types.ts';

/** Budget du mois par catégorie : OK, à surveiller (au-dessus de 85 %), dépassé (au-dessus de 100 %). */
export function Budget({
  lignes,
  mois,
  onFixer,
}: {
  lignes: LigneBudget[];
  mois: string;
  /** Présent pour le propriétaire : ouvre la fenêtre qui fixe le budget du mois. */
  onFixer?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const total = totauxBudget(lignes);

  return (
    <section className={styles.carte} aria-labelledby="titre-budget-depenses">
      <div className={styles.budgetEntete}>
        <h2 className={styles.titre} id="titre-budget-depenses">
          {t('comptoir.depenses.budget.titre', { mois: moisDuBudget(mois, i18n.language) })}
        </h2>
        <span className={styles.budgetLigne}>
          {t('comptoir.depenses.budget.ligne', {
            realise: formaterNombre(total.realise),
            budget: formaterNombre(total.budget),
            pourcent: total.pourcent,
          })}
        </span>
        {onFixer && (
          <button type="button" className={styles.reglage} onClick={onFixer}>
            {t('comptoir.depenses.budget.fixer')}
          </button>
        )}
      </div>
      <ul className={styles.categories}>
        {lignes.map((ligne) => {
          const niveau = niveauBudget(ligne.realise, ligne.budget);
          return (
            <li className={styles.categorie} key={ligne.categorie}>
              <span className={styles.categorieHaut}>
                <span className={styles.categorieNom}>
                  {t(`comptoir.depenses.categories.${ligne.categorie}`)}
                </span>
                <span
                  className={styles.mot}
                  style={{
                    background: `var(--ob-${niveau}-fond)`,
                    color: `var(--ob-${niveau}-texte)`,
                  }}
                >
                  {t(`comptoir.depenses.budget.niveaux.${niveau}`)}
                </span>
              </span>
              <span className={styles.piste} aria-hidden>
                <span
                  className={styles.remplissage}
                  style={{
                    width: `${remplissage(ligne.realise, ligne.budget)}%`,
                    background: `var(--ob-${niveau}-texte)`,
                  }}
                />
              </span>
              <span className={styles.categorieLigne}>
                {`${formaterNombre(ligne.realise)} / ${formaterNombre(ligne.budget)}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
