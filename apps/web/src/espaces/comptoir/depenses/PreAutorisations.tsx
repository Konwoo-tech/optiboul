import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import styles from './Depenses.module.css';
import type { PreAutorisation } from './types.ts';

/** Achats courants (bois, levure…) pré-autorisés pour la semaine : plafond, déjà engagé, reste (O7). */
export function PreAutorisations({
  lignes,
  onFixer,
}: {
  lignes: PreAutorisation[];
  /** Présent pour le gérant et le propriétaire : ouvre la fenêtre des plafonds. */
  onFixer?: () => void;
}) {
  const { t } = useTranslation();
  const fixees = lignes.filter((l) => l.plafond > 0);
  if (fixees.length === 0 && !onFixer) return null;

  return (
    <section className={styles.carte} aria-labelledby="titre-pre-autorisations">
      <div className={styles.budgetEntete}>
        <h2 className={styles.titre} id="titre-pre-autorisations">
          {t('comptoir.depenses.preAutorisations.titre')}
        </h2>
        {onFixer && (
          <button type="button" className={styles.reglage} onClick={onFixer}>
            {t('comptoir.depenses.preAutorisations.fixer')}
          </button>
        )}
      </div>
      {fixees.length === 0 ? (
        <p className={styles.achatDetail}>{t('comptoir.depenses.preAutorisations.aucune')}</p>
      ) : (
        <ul className={styles.achats}>
          {fixees.map((ligne) => (
            <li className={styles.achat} key={ligne.achat}>
              <span className={styles.achatNom}>
                {t(`comptoir.depenses.matieres.${ligne.achat}.nom`)}
              </span>
              <span className={styles.achatValeur}>{`${formaterNombre(ligne.reste)} FCFA`}</span>
              <span className={styles.achatDetail}>
                {t('comptoir.depenses.preAutorisations.detail', {
                  engage: formaterNombre(ligne.engage),
                  plafond: formaterNombre(ligne.plafond),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
