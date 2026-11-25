import { useMantineColorScheme, VisuallyHidden } from '@mantine/core';
import { changerLangue, useTranslation, type Langue } from '@/i18n';

import styles from './BasculeApparence.module.css';

type Props = {
  /** `barre` : sur la colonne chocolat ; `page` : sur le fond clair ou sombre de l'écran. */
  sur?: 'barre' | 'page';
  /** Appelé à chaque choix : l'écran le mémorise pour la personne connectée. */
  onChoix?: (choix: { langue: Langue } | { theme: 'light' | 'dark' }) => void;
};

/** Langue (FR / EN) et thème (clair / sombre) : retenus par le navigateur, et par la personne connectée. */
export function BasculeApparence({ sur = 'page', onChoix }: Props) {
  const { t, i18n } = useTranslation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const langue: Langue = i18n.language === 'en' ? 'en' : 'fr';
  const theme = colorScheme === 'dark' ? 'dark' : 'light';

  return (
    <div className={`${styles.groupes} ${styles[sur]}`}>
      <fieldset className={styles.groupe}>
        <VisuallyHidden component="legend">{t('apparence.langue')}</VisuallyHidden>
        {(['fr', 'en'] as const).map((valeur) => (
          <button
            key={valeur}
            type="button"
            className={styles.bouton}
            aria-pressed={langue === valeur}
            onClick={() => {
              void changerLangue(valeur);
              onChoix?.({ langue: valeur });
            }}
          >
            {valeur.toUpperCase()}
          </button>
        ))}
      </fieldset>
      <fieldset className={styles.groupe}>
        <VisuallyHidden component="legend">{t('apparence.theme')}</VisuallyHidden>
        {(['light', 'dark'] as const).map((valeur) => (
          <button
            key={valeur}
            type="button"
            className={styles.bouton}
            aria-pressed={theme === valeur}
            onClick={() => {
              setColorScheme(valeur);
              onChoix?.({ theme: valeur });
            }}
          >
            {t(valeur === 'light' ? 'apparence.clair' : 'apparence.sombre')}
          </button>
        ))}
      </fieldset>
    </div>
  );
}
