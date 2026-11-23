import { useCallback } from 'react';

import type { LanguageCode, VoiceGender } from '@/api/types';
import { updateProfile } from '@/features/auth/session';
import { usePrefs } from '@/store/prefs';

/**
 * Language and voice gender are applied locally right away (instant UI feedback) and then saved
 * on the server so they follow the user across devices. A failed save is silent: the local
 * choice still wins until the next sign-in.
 */
export function useChangeLanguage(): (language: LanguageCode) => void {
  const setLanguage = usePrefs((state) => state.setLanguage);
  return useCallback(
    (language) => {
      setLanguage(language);
      void updateProfile({ language }).catch(() => undefined);
    },
    [setLanguage],
  );
}

export function useChangeVoiceGender(): (gender: VoiceGender) => void {
  const setVoiceGender = usePrefs((state) => state.setVoiceGender);
  return useCallback(
    (gender) => {
      setVoiceGender(gender);
      void updateProfile({ voice_gender: gender }).catch(() => undefined);
    },
    [setVoiceGender],
  );
}
