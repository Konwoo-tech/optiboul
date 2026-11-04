import { useTranslation } from '@/i18n';
import { formaterNombre, type NiveauStatut } from '@/utils';

import { jourSemaine } from '../semaines/affichage.ts';
import { formaterMois, libelleDuStatut } from './affichage.ts';
import { Mot } from './Mot.tsx';
import styles from './Personnel.module.css';
import type { DroitsPaie } from './regles.ts';
import type { InstantanePaie, MoisDuCalendrier } from './types.ts';

type Props = {
  instantane: InstantanePaie;
  droits: DroitsPaie;
  occupe: boolean;
  onPlanifier: (mois: string, jour: string) => void;
};

const NIVEAUX: Record<'payee' | 'partielle' | 'planifiee', NiveauStatut> = {
  payee: 'ok',
  partielle: 'surveiller',
  planifiee: 'neutre',
};

/** Calendrier des paies passées et à venir ; le jour des paies à venir se choisit ici. */
export function CalendrierPaies({ instantane, droits, occupe, onPlanifier }: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;

  const mot = (m: MoisDuCalendrier): [NiveauStatut, string] =>
    m.statut === 'courante'
      ? ['surveiller', libelleDuStatut(t, instantane)] // couleur d'avertissement quel que soit l'état
      : [NIVEAUX[m.statut], t(`gestion.personnel.calendrier.statuts.${m.statut}`)];

  const extra = (m: MoisDuCalendrier) =>
    m.total === undefined
      ? ''
      : m.impayes
        ? t('gestion.personnel.calendrier.totalImpayes', {
            total: formaterNombre(m.total),
            impayes: formaterNombre(m.impayes),
          })
        : t('gestion.personnel.calendrier.total', { total: formaterNombre(m.total) });

  return (
    <section className={styles.calendrier} aria-labelledby="calendrier-paies">
      <h2 id="calendrier-paies" className={styles.calendrierTitre}>
        {t('gestion.personnel.calendrier.titre')}
      </h2>
      <ul className={styles.moisListe}>
        {instantane.calendrier.map((m) => {
          const [niveau, libelle] = mot(m);
          const nom = formaterMois(m.mois, langue);
          return (
            <li key={m.mois} className={styles.mois}>
              <span className={styles.moisNom}>{nom}</span>
              {m.jours && droits.preparer ? (
                <select
                  className={styles.choix}
                  value={m.jour}
                  aria-label={t('gestion.personnel.jourDePaieDe', { mois: nom })}
                  aria-disabled={occupe}
                  onChange={(e) => {
                    if (!occupe) onPlanifier(m.mois, e.target.value);
                  }}
                >
                  {m.jours.map((j) => (
                    <option key={j} value={j}>
                      {jourSemaine(j, langue)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={styles.moisJour}>{jourSemaine(m.jour, langue)}</span>
              )}
              <Mot niveau={niveau}>{libelle}</Mot>
              <span className={styles.moisExtra}>{extra(m)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
