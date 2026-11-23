import * as Speech from 'expo-speech';

import type { LanguageCode, VoiceGender } from '@/api/types';
import { localeFor } from '@/utils/date';

import { pickVoiceIdentifier } from './voices';

/** Slightly slower than normal: announcements are dense and read better a touch slowly. */
const SPEECH_RATE = 0.95;

let voicesCache: Speech.Voice[] | null = null;

async function getVoices(): Promise<Speech.Voice[]> {
  if (voicesCache && voicesCache.length > 0) return voicesCache;
  try {
    voicesCache = await Speech.getAvailableVoicesAsync();
  } catch {
    voicesCache = [];
  }
  return voicesCache;
}

export interface SpeakOptions {
  language: LanguageCode;
  gender: VoiceGender;
}

/**
 * Reads `text` aloud with a voice matching the language and gender preference.
 * Stops anything already playing first. The promise resolves when speech finishes,
 * is stopped, or fails: callers decide what to do next by checking their own state.
 */
export async function speak(text: string, { language, gender }: SpeakOptions): Promise<void> {
  const cleaned = text.trim();
  if (!cleaned) return;

  try {
    await Speech.stop();
    const locale = localeFor(language);
    const voice = pickVoiceIdentifier(await getVoices(), locale, gender);

    await new Promise<void>((resolve) => {
      Speech.speak(cleaned, {
        language: locale,
        voice,
        // Nudges timbre when the platform has no truly gendered voice.
        pitch: gender === 'female' ? 1.05 : 0.9,
        rate: SPEECH_RATE,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  } catch {
    // Speech is a progressive enhancement: never surface TTS failures to the user.
  }
}

export function stopSpeaking(): void {
  void Speech.stop().catch(() => undefined);
}
