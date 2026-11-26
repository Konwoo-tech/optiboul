import { useTranslation } from '@/i18n';
import { CLES_PRODUIT } from './types.ts';
import { FenetreModale } from '@/ui';
import { formaterNombre } from '@/utils';

import { uniteMatiere } from '../stocks/affichage.ts';
import { nomDeMatiere } from './affichage.ts';
import styles from './Production.module.css';
import { sortiesDeStock } from './regles.ts';
import type { Consommation, InstantaneProduction, Realise } from './types.ts';

type Props = {
  instantane: InstantaneProduction;
  realise: Realise;
  consommation: Consommation;
  occupe: boolean;
  onFermer: () => void;
  onConfirmer: () => void;
};

/** Dernier regard avant de clôturer : le réalisé et les sorties de stock que la clôture génère. */
export function ModaleCloture({
  instantane,
  realise,
  consommation,
  occupe,
  onFermer,
  onConfirmer,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const total = CLES_PRODUIT.reduce((somme, cle) => somme + (realise[cle] ?? 0), 0);
  const virgule = (valeur: number) => String(valeur).replace('.', langue === 'en' ? '.' : ',');

  return (
    <FenetreModale titre={t('atelier.production.cloture.titre')} onFermer={onFermer}>
      <p className={styles.ligneModale}>
        {t('atelier.production.cloture.ligne', {
          realise: formaterNombre(total),
          prevus: formaterNombre(instantane.plan.prevus),
        })}
      </p>
      <p className={styles.titreModale}>{t('atelier.production.cloture.sorties')}</p>
      <ul className={styles.sorties}>
        {sortiesDeStock(consommation).map((sortie) => {
          const disponible = instantane.stock[sortie.matiere];
          const insuffisant = sortie.quantite > disponible;
          // Le stock ne descend jamais sous zéro : on le dit plutôt que d'afficher un reste négatif.
          const restant = Math.max(0, Math.round((disponible - sortie.quantite) * 100) / 100);
          return (
            <li className={styles.sortie} key={sortie.matiere}>
              <span>{nomDeMatiere(t, sortie.matiere)}</span>
              <span className={styles.sortieValeur}>
                {`−${virgule(sortie.quantite)} ${uniteMatiere(t, sortie.matiere)}`}{' '}
                <span className={styles.sortieReste}>
                  · {t('atelier.production.cloture.reste', { stock: virgule(restant) })}
                  {insuffisant && (
                    <>
                      {' · '}
                      <span style={{ color: 'var(--ob-bloquant-texte)' }}>
                        {t('atelier.production.cloture.insuffisant')}
                      </span>
                    </>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className={styles.boutons}>
        <button type="button" className={styles.annuler} onClick={onFermer}>
          {t('atelier.production.cloture.annuler')}
        </button>
        <button type="button" className={styles.confirmer} disabled={occupe} onClick={onConfirmer}>
          {t('atelier.production.cloture.confirmer')}
        </button>
      </div>
    </FenetreModale>
  );
}
