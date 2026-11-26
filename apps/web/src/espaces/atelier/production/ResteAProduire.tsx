import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import { libelleProduit } from './affichage.ts';
import styles from './Production.module.css';
import { resteAProduire } from './regles.ts';
import { CLES_PRODUIT, type Plan, type Realise } from './types.ts';

type Props = {
  plan: Plan;
  realise: Realise;
  /** Présent quand la personne saisit le réalisé et n'est pas déjà sur son onglet. */
  onSaisir?: () => void;
};

/** « Reste à produire » : prévu moins réalisé par produit, pendant la production. */
export function ResteAProduire({ plan, realise, onSaisir }: Props) {
  const { t } = useTranslation();
  const reste = resteAProduire(plan, realise);

  return (
    <section className={styles.reste} aria-labelledby="titre-reste">
      <div className={styles.resteTexte}>
        <h2 className={styles.resteTitre} id="titre-reste">
          {t('atelier.production.reste.titre')}
        </h2>
        <span className={styles.resteSous}>{t('atelier.production.reste.sous')}</span>
      </div>
      {CLES_PRODUIT.map((cle) => (
        <div className={styles.resteItem} key={cle}>
          <span className={styles.resteLibelle}>{libelleProduit(cle)}</span>
          <span className={styles.resteValeur} aria-live="polite">
            {formaterNombre(reste[cle])}
          </span>
          <span className={styles.resteSur}>
            {t('atelier.production.reste.sur', { prevus: formaterNombre(plan.lignes[cle].prevus) })}
          </span>
        </div>
      ))}
      {onSaisir && (
        <button type="button" className={styles.principal} onClick={onSaisir}>
          {t('atelier.production.reste.saisir')}
        </button>
      )}
    </section>
  );
}
