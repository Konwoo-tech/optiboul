import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';

export type Langue = 'fr' | 'en';

export const ressources = { fr: { translation: fr }, en: { translation: en } } as const;

const CLE_LANGUE = 'optiboul-langue';

/** Langue choisie sur ce poste, si le navigateur permet de la mémoriser. */
function langueMemorisee(): Langue | null {
  try {
    const valeur = localStorage.getItem(CLE_LANGUE);
    return valeur === 'fr' || valeur === 'en' ? valeur : null;
  } catch {
    return null;
  }
}

/** Initialise i18next ; le français est la langue par défaut. */
export function initI18n(langue?: Langue) {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources: ressources,
      lng: langue ?? langueMemorisee() ?? 'fr',
      fallbackLng: 'fr',
      interpolation: { escapeValue: false },
    });
    // Les lecteurs d'écran choisissent la voix d'après <html lang>.
    const surLangue = (lng: string) => {
      document.documentElement.lang = lng;
    };
    surLangue(i18n.language);
    i18n.on('languageChanged', surLangue);
  }
  return i18n;
}

/** Change la langue de l'interface et la retient pour les prochaines ouvertures. */
export async function changerLangue(langue: Langue) {
  await i18n.changeLanguage(langue);
  try {
    localStorage.setItem(CLE_LANGUE, langue);
  } catch {
    // Mémorisation indisponible (navigation privée, stockage bloqué) : la langue reste active.
  }
}

export { i18n };
export { useTranslation } from 'react-i18next';
