import { useTranslation } from '@/i18n';

import { jourEtHeure } from './affichage.ts';
import { Mot } from './Mot.tsx';
import { niveauDuStatut } from './regles.ts';
import styles from './Semaines.module.css';
import { libelleSemaine } from './textes.ts';
import type { Semaine } from './types.ts';

type Props = { semaines: readonly Semaine[]; choisie: string; onChoisir: (id: string) => void };

/** Historique des semaines : toutes, de la plus ancienne à la plus récente ; un clic les ouvre. */
export function Historique({ semaines, choisie, onChoisir }: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  return (
    <section className={`${styles.carte} ${styles.carteHistorique}`}>
      <h2 className={styles.titreHistorique}>{t('gestion.semaines.historique.titre')}</h2>
      {semaines.map((semaine) => (
        <button
          type="button"
          key={semaine.id}
          className={styles.semaineHistorique}
          aria-pressed={semaine.id === choisie}
          onClick={() => onChoisir(semaine.id)}
        >
          <Mot niveau={niveauDuStatut(semaine.statut)}>
            {t(`gestion.semaines.statuts.${semaine.statut}`)}
          </Mot>
          <div className={styles.historiqueTexte}>
            <div className={styles.historiqueTitre}>{libelleSemaine(t, semaine, langue)}</div>
            <div className={styles.historiqueEquipe}>
              {t('gestion.semaines.historique.equipe', {
                gerant: semaine.gerant?.nom ?? '—',
                production: semaine.production?.nom ?? '—',
              })}
            </div>
          </div>
          <div className={styles.historiqueDates}>
            <div>
              {semaine.ouverture
                ? t('gestion.semaines.historique.ouvertePar', {
                    par: semaine.ouverture.par,
                    quand: jourEtHeure(semaine.ouverture.jour, semaine.ouverture.heure, langue),
                  })
                : t('gestion.semaines.historique.pasOuverte')}
            </div>
            <div>
              {semaine.cloture
                ? t('gestion.semaines.historique.cloturePar', {
                    par: semaine.cloture.par,
                    quand: jourEtHeure(semaine.cloture.jour, semaine.cloture.heure, langue),
                  })
                : ''}
            </div>
          </div>
        </button>
      ))}
    </section>
  );
}
