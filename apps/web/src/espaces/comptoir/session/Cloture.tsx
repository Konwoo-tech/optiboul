import { useTranslation } from '@/i18n';

import type { ActionsSession } from './api.ts';
import { chiffres, ecartDeCaisse, formaterNombre } from './calculs.ts';
import styles from './Cloture.module.css';
import {
  ecartEnTexte,
  especesAttenduesDeLaSession,
  lignesDuRecapitulatif,
  motDeLEcart,
} from './recapitulatif.ts';
import type { InstantaneSession } from './types.ts';

type Props = {
  instantane: InstantaneSession;
  actions: ActionsSession;
  /** Le comptage est verrouillé quand la session est clôturée. */
  verrouille: boolean;
  /** Le bouton « Clôturer » existe tant que la session est ouverte. */
  peutCloturer: boolean;
  onDemanderCloture: () => void;
};

/** Onglet « Clôture » : récapitulatif, comptage des espèces, écart de caisse. */
export function Cloture({
  instantane,
  actions,
  verrouille,
  peutCloturer,
  onDemanderCloture,
}: Props) {
  const { t } = useTranslation();
  const comptees = instantane.session.especesComptees;
  const attendues = especesAttenduesDeLaSession(instantane);
  const { compte, niveau } = ecartDeCaisse(comptees, attendues);
  // Sans comptage, impossible de clôturer : le bouton reste grisé.
  const pret = compte;

  return (
    <div className={styles.page}>
      <section className={styles.recap} aria-labelledby="titre-recap">
        <div className={`${styles.titre} ${styles.recapTitre}`} id="titre-recap">
          {t('comptoir.session.cloture.recap')}
        </div>
        {lignesDuRecapitulatif(instantane, t).map((ligne) => (
          <div className={styles.ligne} key={ligne.cle}>
            <span className={styles.ligneLibelle}>{ligne.libelle}</span>
            <span className={styles.ligneValeur} style={{ color: ligne.couleur }}>
              {ligne.valeur} FCFA
            </span>
          </div>
        ))}
      </section>
      <section className={styles.comptage} aria-labelledby="titre-comptage">
        <div className={styles.titre} id="titre-comptage">
          {t('comptoir.session.cloture.comptage')}
        </div>
        <div>
          <div className={styles.attenduLibelle}>{t('comptoir.session.cloture.attendues')}</div>
          <div className={styles.attenduValeur}>{formaterNombre(attendues)} FCFA</div>
        </div>
        <label className={styles.etiquette}>
          {t('comptoir.session.cloture.comptees')}
          <input
            className={styles.comptees}
            value={comptees}
            onChange={(e) => actions.saisirComptage(chiffres(e.target.value))}
            disabled={verrouille}
            inputMode="numeric"
            placeholder="0"
          />
        </label>
        <div
          className={styles.ecart}
          style={{
            background: `var(--ob-${niveau}-fond)`,
            color: `var(--ob-${niveau}-texte)`,
          }}
        >
          <div>
            <div className={styles.ecartLibelle}>{t('comptoir.session.cloture.ecart')}</div>
            <div className={styles.ecartMot} id="mot-ecart">
              {motDeLEcart(instantane, t)}
            </div>
          </div>
          <div className={styles.ecartMontant}>{ecartEnTexte(instantane)}</div>
        </div>
        {peutCloturer && (
          <button
            type="button"
            className={`${styles.cloturer} ${pret ? styles.cloturerPret : ''}`}
            aria-disabled={!pret}
            aria-describedby={pret ? undefined : 'mot-ecart'}
            onClick={() => pret && onDemanderCloture()}
          >
            {t('comptoir.session.cloture.cloturer')}
          </button>
        )}
        <div className={styles.note}>{t('comptoir.session.cloture.note')}</div>
      </section>
    </div>
  );
}
