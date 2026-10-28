import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import { nomDuMois } from './affichage.ts';
import { largeurDeBarre } from './regles.ts';
import styles from './TableauDeBord.module.css';
import type { InstantaneTableauDeBord } from './types.ts';

/** Pains produits depuis le début du mois, une barre par produit, la plus grande pleine. */
export function ProductionParProduit({ instantane }: { instantane: InstantaneTableauDeBord }) {
  const { t, i18n } = useTranslation();
  const { production } = instantane;
  // Le plus grand total sert d'échelle (la maquette prend le premier produit, le plus produit).
  const maximum = Math.max(...production.map((p) => p.pains));

  return (
    <section className={`${styles.carte} ${styles.production}`} aria-labelledby="titre-production">
      <h2 className={styles.titre} id="titre-production">
        {t('gestion.tableauDeBord.productionTitre', {
          mois: nomDuMois(instantane.mois, i18n.language),
        })}
      </h2>
      <ul className={styles.produits}>
        {production.map((ligne) => (
          <li className={styles.produit} key={ligne.produit}>
            <span className={styles.produitNom}>{ligne.produit}</span>
            <div className={styles.piste} aria-hidden>
              <div
                className={styles.remplissage}
                style={{ width: `${largeurDeBarre(ligne.pains, maximum)}%` }}
              />
            </div>
            <span className={styles.produitValeur}>{formaterNombre(ligne.pains)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
