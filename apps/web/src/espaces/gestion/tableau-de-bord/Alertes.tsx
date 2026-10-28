import { useTranslation } from '@/i18n';
import { Link } from 'react-router';

import { cheminAlerte, texteAlerte } from './affichage.ts';
import styles from './TableauDeBord.module.css';
import type { Alerte } from './types.ts';

/**
 * Alertes à traiter, les urgentes (rouges) d'abord : chacune ouvre l'écran qui montre le détail
 * (US-132). Le mot « Urgent » ou « À voir » est écrit : la couleur ne porte jamais seule le sens.
 */
export function Alertes({ alertes }: { alertes: Alerte[] }) {
  const { t, i18n } = useTranslation();

  return (
    <section className={`${styles.carte} ${styles.alertes}`} aria-labelledby="titre-alertes">
      <h2 className={`${styles.titre} ${styles.alertesTitre}`} id="titre-alertes">
        {t('gestion.tableauDeBord.alertes.titre')}
      </h2>
      {alertes.length === 0 ? (
        <p className={styles.aucuneAlerte}>{t('gestion.tableauDeBord.alertes.aucune')}</p>
      ) : (
        <ul className={styles.listeAlertes}>
          {alertes.map((alerte) => (
            <li key={alerte.id}>
              <Link className={styles.alerte} to={cheminAlerte(alerte.destination)}>
                <span
                  className={styles.mot}
                  style={{
                    background: `var(--ob-${alerte.niveau}-fond)`,
                    color: `var(--ob-${alerte.niveau}-texte)`,
                  }}
                >
                  {t(
                    alerte.niveau === 'bloquant'
                      ? 'gestion.tableauDeBord.alertes.urgent'
                      : 'gestion.tableauDeBord.alertes.aVoir',
                  )}
                </span>
                <span className={styles.alerteTexte}>{texteAlerte(t, alerte, i18n.language)}</span>
                <span className={styles.chevron} aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
