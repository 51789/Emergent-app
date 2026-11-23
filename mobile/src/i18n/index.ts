import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { usePrefs } from '@/store/prefs';

import { DEFAULT_LANGUAGE } from './languages';
import de from './locales/de';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import it from './locales/it';

// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources: {
    it: { translation: it },
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
  },
  lng: usePrefs.getState().language,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
  initAsync: false,
});

// Keep i18n in sync with the persisted preference (also fires once storage hydrates).
usePrefs.subscribe((state, previous) => {
  if (state.language !== previous.language && state.language !== i18n.language) {
    // eslint-disable-next-line import/no-named-as-default-member
    void i18n.changeLanguage(state.language);
  }
});

export default i18n;
