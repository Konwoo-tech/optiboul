import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';

export type Langue = 'fr' | 'en';

export const ressources = { fr: { translation: fr }, en: { translation: en } } as const;

/** Initialise i18next ; le français est la langue par défaut. */
export function initI18n(langue: Langue = 'fr') {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources: ressources,
      lng: langue,
      fallbackLng: 'fr',
      interpolation: { escapeValue: false },
    });
  }
  return i18n;
}

export { i18n };
export { useTranslation } from 'react-i18next';
