import { useTranslation } from '@/i18n';

import { Fenetre } from './Fenetre.tsx';
import styles from './Fenetre.module.css';
import { ecartEnTexte, lignesDuRecapitulatif, motDeLEcart } from './recapitulatif.ts';
import type { InstantaneSession } from './types.ts';

type Props = {
  instantane: InstantaneSession;
  onFermer: () => void;
  onConfirmer: () => void;
};

/** Dernier regard sur le récapitulatif avant de verrouiller la session. */
export function ModaleCloture({ instantane, onFermer, onConfirmer }: Props) {
  const { t } = useTranslation();
  return (
    <Fenetre titre={t('comptoir.session.modales.cloture.titre')} onFermer={onFermer}>
      <div className={styles.recap}>
        {lignesDuRecapitulatif(instantane, t)
          .slice(0, 6)
          .map((ligne) => (
            <div className={styles.recapLigne} key={ligne.cle}>
              <span>{ligne.libelle}</span>
              <span className={styles.recapValeur} style={{ color: ligne.couleur }}>
                {ligne.valeur}
              </span>
            </div>
          ))}
      </div>
      <div className={styles.ecart}>
        {`${ecartEnTexte(instantane)} · ${motDeLEcart(instantane, t)}`}
      </div>
      <div className={styles.avertissement}>
        {t('comptoir.session.modales.cloture.avertissement')}
      </div>
      <div className={styles.boutons}>
        <button type="button" className={styles.annuler} onClick={onFermer}>
          {t('comptoir.session.modales.annuler')}
        </button>
        <button type="button" className={styles.confirmer} onClick={onConfirmer}>
          {t('comptoir.session.modales.cloture.confirmer')}
        </button>
      </div>
    </Fenetre>
  );
}
