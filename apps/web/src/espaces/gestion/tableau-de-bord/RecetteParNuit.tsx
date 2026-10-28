import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import { jourDuMois, jourOrdinal, nomDuMois } from './affichage.ts';
import { hauteurDeBarre } from './regles.ts';
import styles from './TableauDeBord.module.css';
import type { InstantaneTableauDeBord } from './types.ts';

/** Recette encaissée par nuit depuis le début du mois ; la dernière barre (jaune) est la session en cours. */
export function RecetteParNuit({ instantane }: { instantane: InstantaneTableauDeBord }) {
  const { t, i18n } = useTranslation();
  const { recettesParNuit } = instantane;
  const maximum = Math.max(...recettesParNuit.map((nuit) => nuit.montant));
  const courante = recettesParNuit[recettesParNuit.length - 1];

  return (
    <section
      className={`${styles.carte} ${styles.graphique}`}
      aria-labelledby="titre-recette-par-nuit"
    >
      <h2 className={styles.titre} id="titre-recette-par-nuit">
        {t('gestion.tableauDeBord.graphique.titre', {
          mois: nomDuMois(instantane.mois, i18n.language),
        })}
      </h2>
      <ul className={styles.barres}>
        {recettesParNuit.map((nuit, i) => {
          const montant = `${formaterNombre(nuit.montant)} FCFA`;
          const enCours = i === recettesParNuit.length - 1;
          return (
            <li
              className={styles.colonne}
              key={nuit.jour}
              title={montant}
              aria-label={t('gestion.tableauDeBord.graphique.barre', {
                jour: jourDuMois(nuit.jour),
                montant,
              })}
            >
              <div
                className={enCours ? `${styles.barre} ${styles.barreCourante}` : styles.barre}
                style={{ height: `${hauteurDeBarre(nuit.montant, maximum)}%` }}
              />
              <span className={styles.jour} aria-hidden>
                {jourDuMois(nuit.jour)}
              </span>
            </li>
          );
        })}
      </ul>
      {courante && (
        <div className={styles.note}>
          {t('gestion.tableauDeBord.graphique.note', {
            jour: jourOrdinal(jourDuMois(courante.jour), i18n.language),
            montant: formaterNombre(courante.montant),
          })}
        </div>
      )}
    </section>
  );
}
