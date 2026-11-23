import { getLocales } from 'expo-localization';

import { LANGUAGE_CODES, type LanguageCode } from '@/api/types';

export interface LanguageOption {
  code: LanguageCode;
  nativeLabel: string;
  flag: string;
}

export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'it', nativeLabel: 'Italiano', flag: '🇮🇹' },
  { code: 'en', nativeLabel: 'English', flag: '🇬🇧' },
  { code: 'es', nativeLabel: 'Español', flag: '🇪🇸' },
  { code: 'fr', nativeLabel: 'Français', flag: '🇫🇷' },
  { code: 'de', nativeLabel: 'Deutsch', flag: '🇩🇪' },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'it';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGE_CODES as readonly string[]).includes(value);
}

export function getLanguageOption(code: LanguageCode): LanguageOption {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0];
}

/** Device language if supported by the app, otherwise Italian. */
export function detectDeviceLanguage(): LanguageCode {
  try {
    const code = getLocales()[0]?.languageCode;
    return isLanguageCode(code) ? code : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
