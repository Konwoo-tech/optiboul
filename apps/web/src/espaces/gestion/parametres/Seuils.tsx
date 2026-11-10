import { useTranslation } from '@/i18n';
import { useId } from 'react';

import { libelleDe } from './affichage.ts';
import { ChampTexte, type Enregistrer } from './Champs.tsx';
import styles from './Parametres.module.css';
import type { Parametre } from './types.ts';

/** « Seuils et règles » : les trois seuils de la maquette, enregistrés à la saisie. */
export function Seuils({
  parametres,
  lecture,
  enregistrer,
}: {
  parametres: Parametre[];
  lecture: boolean;
  enregistrer: Enregistrer;
}) {
  const { t } = useTranslation();
  const titre = useId();
  return (
    <section className={styles.carte} aria-labelledby={titre}>
      <h2 id={titre} className={styles.titre}>
        {t('gestion.parametres.seuils.titre')}
      </h2>
      <div className={styles.seuils}>
        {parametres.map((p) => (
          <Seuil key={p.cle} parametre={p} lecture={lecture} enregistrer={enregistrer} />
        ))}
      </div>
    </section>
  );
}

function Seuil({
  parametre,
  lecture,
  enregistrer,
}: {
  parametre: Parametre;
  lecture: boolean;
  enregistrer: Enregistrer;
}) {
  const { t } = useTranslation();
  const etiquette = useId();
  return (
    <div className={styles.etiquette}>
      <span id={etiquette}>{libelleDe(t, parametre)}</span>
      <ChampTexte
        parametre={parametre}
        lecture={lecture}
        enregistrer={enregistrer}
        etiquetteId={etiquette}
      />
    </div>
  );
}
