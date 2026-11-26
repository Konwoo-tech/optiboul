import { useTranslation } from '@/i18n';
import { useState, type SubmitEvent } from 'react';

import styles from './Personnel.module.css';
import type { Employe } from './types.ts';

type Props = {
  employe: Employe;
  occupe: boolean;
  onEnregistrer: (absences: number, avances: number) => void;
  /** Jours de caisse prévus et non ouverts : proposés comme absences, à confirmer. */
  joursProposes?: readonly string[];
};

/** Absences (jours, au demi-jour) et avances à retenir : saisies tant que l'état est en brouillon. */
export function AbsencesAvances({ employe, occupe, onEnregistrer, joursProposes = [] }: Props) {
  const { t, i18n } = useTranslation();
  const [absences, setAbsences] = useState(String(employe.absences));
  const [avances, setAvances] = useState(String(employe.avances));
  const valide = /^\d{1,2}([.,]5|[.,]0)?$/.test(absences) && /^\d+$/.test(avances);

  const envoyer = (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (occupe || !valide) return;
    onEnregistrer(Number(absences.replace(',', '.')), Number(avances));
  };

  return (
    <form className={styles.saisie} noValidate onSubmit={envoyer}>
      <label className={styles.etiquette}>
        {t('gestion.personnel.retenues.absences')}
        <input
          className={styles.champ}
          value={absences}
          inputMode="decimal"
          aria-invalid={!/^\d{1,2}([.,]5|[.,]0)?$/.test(absences)}
          onChange={(e) => setAbsences(e.target.value.replace(/[^\d.,]/g, ''))}
        />
      </label>
      <label className={styles.etiquette}>
        {t('gestion.personnel.retenues.avances')}
        <input
          className={styles.champ}
          value={avances}
          inputMode="numeric"
          aria-invalid={!/^\d+$/.test(avances)}
          onChange={(e) => setAvances(e.target.value.replace(/\D/g, ''))}
        />
      </label>
      {joursProposes.length > 0 && Number(absences.replace(',', '.')) !== joursProposes.length && (
        <div className={styles.proposition}>
          <span>
            {t('gestion.personnel.retenues.proposees', {
              count: joursProposes.length,
              jours: joursProposes
                .map((j) =>
                  new Intl.DateTimeFormat(i18n.language, {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  }).format(new Date(`${j}T00:00:00Z`)),
                )
                .join(', '),
            })}
          </span>
          <button
            type="button"
            className={styles.modifierFiche}
            onClick={() => setAbsences(String(joursProposes.length))}
          >
            {t('gestion.personnel.retenues.reprendre')}
          </button>
        </div>
      )}
      <button type="submit" className={styles.principal} aria-disabled={occupe || !valide}>
        {t('gestion.personnel.retenues.enregistrer')}
      </button>
    </form>
  );
}
