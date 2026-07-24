import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import type { LanguageCode } from '../constants/categories';

/**
 * Speech service for JARVIS.
 *
 * Wraps `expo-speech` to:
 *   - Pick the best available voice for a language + gender preference
 *   - Speak text and return a Promise that resolves when done
 *   - Provide a small queue helper for reading a list of announcements
 *
 * `expo-speech` is TTS-only. Speech-to-Text (STT) is not included here — the
 * announcement loop uses on-screen buttons ("Continua" / "Ferma") to confirm
 * whether to move to the next announcement, which works on Expo Go, native
 * builds, and web preview.
 */

export type VoiceGender = 'female' | 'male';

// Language code -> Speech locale mapping (IETF BCP 47).
const LANG_TO_LOCALE: Record<LanguageCode, string> = {
  it: 'it-IT',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
};

// Heuristics for guessing voice gender when the platform doesn't expose it.
// We keep these small and pragmatic — a fallback is always used if no match.
const FEMALE_HINTS = [
  'female',
  'woman',
  // Common iOS / Android / Web voice names commonly associated with female voices
  'samantha', 'alice', 'zosia', 'karen', 'moira', 'tessa', 'victoria', 'susan',
  'siri_female', 'siri female', 'monica', 'paulina', 'luciana', 'amelie', 'aurelie',
  'anna', 'petra', 'marlene', 'yelda', 'nora', 'ellen', 'kate', 'serena',
  'joana', 'catherine', 'audrey', 'chantal', 'julie', 'celine', 'marie',
  'google italiano', 'google español', 'google français', 'google deutsch',
  'google us english', 'google uk english female',
];

const MALE_HINTS = [
  'male',
  'man',
  'daniel', 'thomas', 'aaron', 'alex', 'fred', 'oliver', 'diego', 'jorge',
  'markus', 'stefan', 'yannick', 'luca', 'paolo', 'giorgio', 'martin',
  'siri_male', 'siri male', 'nicolas', 'thomas', 'benjamin', 'hans',
  'google uk english male',
];

// Cache voices so we don't refetch on every announcement.
let cachedVoices: Speech.Voice[] | null = null;

async function getVoices(): Promise<Speech.Voice[]> {
  if (cachedVoices) return cachedVoices;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    cachedVoices = voices || [];
  } catch {
    cachedVoices = [];
  }
  return cachedVoices;
}

function matchGender(name: string | undefined, gender: VoiceGender): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  const hints = gender === 'female' ? FEMALE_HINTS : MALE_HINTS;
  return hints.some((h) => lower.includes(h));
}

/**
 * Pick the best available voice identifier for a language + gender preference.
 * Falls back to any voice for that language, then to `undefined` (system default).
 */
export async function pickVoice(
  lang: LanguageCode,
  gender: VoiceGender
): Promise<string | undefined> {
  const locale = LANG_TO_LOCALE[lang];
  const voices = await getVoices();
  if (!voices.length) return undefined;

  // Voices matching this exact locale
  const sameLocale = voices.filter(
    (v) => v.language && v.language.toLowerCase().startsWith(locale.toLowerCase().slice(0, 2))
  );
  const pool = sameLocale.length > 0 ? sameLocale : voices;

  // Try exact locale + gender first
  const exactMatch = sameLocale.find((v) => matchGender(v.name, gender));
  if (exactMatch) return exactMatch.identifier;

  // Try any-locale gender match if exact locale had no gendered voice
  const anyLocaleGender = voices.find((v) => matchGender(v.name, gender));
  // Prefer same-locale-any-gender over off-locale-gendered voice, since the
  // wrong language sounds much worse than the wrong gender.
  if (sameLocale.length > 0) return sameLocale[0].identifier;
  if (anyLocaleGender) return anyLocaleGender.identifier;

  // Absolute fallback
  return pool[0]?.identifier;
}

/**
 * Speak a piece of text. Resolves when the utterance is done (or errors).
 * Automatically stops any prior utterance.
 */
export function speak(
  text: string,
  opts: { language: LanguageCode; gender: VoiceGender; rate?: number; pitch?: number } &
    Partial<{ voice: string }>
): Promise<void> {
  return new Promise(async (resolve) => {
    try {
      // Stop anything currently speaking to avoid overlap.
      Speech.stop();

      const voice = opts.voice ?? (await pickVoice(opts.language, opts.gender));
      const locale = LANG_TO_LOCALE[opts.language];

      const cleaned = (text || '').trim();
      if (!cleaned) return resolve();

      Speech.speak(cleaned, {
        language: locale,
        voice,
        // Small pitch tweak to nudge male/female timbre when the platform
        // doesn't offer a truly gendered voice.
        pitch:
          opts.pitch ??
          (opts.gender === 'female' ? 1.05 : 0.9),
        rate: opts.rate ?? (Platform.OS === 'ios' ? 0.5 : 1.0),
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    } catch {
      resolve();
    }
  });
}

/**
 * Stop any ongoing speech.
 */
export function stopSpeaking(): void {
  try {
    Speech.stop();
  } catch {
    // ignore
  }
}

/**
 * True while the OS is currently reading something out loud.
 */
export async function isSpeakingNow(): Promise<boolean> {
  try {
    return await Speech.isSpeakingAsync();
  } catch {
    return false;
  }
}
