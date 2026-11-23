import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { LanguageCode, VoiceGender } from '@/api/types';
import { detectDeviceLanguage } from '@/i18n/languages';

interface PrefsState {
  language: LanguageCode;
  voiceGender: VoiceGender;
  /** Expo push token registered on this device, kept to unregister it on sign-out. */
  pushToken: string | null;
  setLanguage: (language: LanguageCode) => void;
  setVoiceGender: (gender: VoiceGender) => void;
  setPushToken: (token: string | null) => void;
}

/** Local preferences, persisted in AsyncStorage (localStorage on web). */
export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      language: detectDeviceLanguage(),
      voiceGender: 'female',
      pushToken: null,
      setLanguage: (language) => set({ language }),
      setVoiceGender: (voiceGender) => set({ voiceGender }),
      setPushToken: (pushToken) => set({ pushToken }),
    }),
    {
      name: 'consulens.prefs',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);

/** True once the persisted preferences were read from storage (avoids a flash of the default language). */
export function usePrefsHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => usePrefs.persist.onFinishHydration(onChange),
    () => usePrefs.persist.hasHydrated(),
    () => false,
  );
}
