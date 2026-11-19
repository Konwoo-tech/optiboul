import { useTranslation } from '@/i18n';
import { useState, type SubmitEvent } from 'react';

import styles from './Personnel.module.css';
import type { Employe } from './types.ts';

type Props = {
  employe: Employe;
  occupe: boolean;
  onEnregistrer: (absences: number, avances: number) => void;
};

/** Absences (jours, au demi-jour) et avances à retenir : saisies tant que l'état est en brouillon. */
export function AbsencesAvances({ employe, occupe, onEnregistrer }: Props) {
  const { t } = useTranslation();
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
      <button type="submit" className={styles.principal} aria-disabled={occupe || !valide}>
        {t('gestion.personnel.retenues.enregistrer')}
      </button>
    </form>
  );
}
