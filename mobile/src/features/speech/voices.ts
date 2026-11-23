import type { VoiceGender } from '@/api/types';

export interface VoiceLike {
  identifier: string;
  name?: string;
  /** BCP 47-ish tag as reported by the OS: `it-IT`, `it_IT`, `ita-ITA`... */
  language?: string;
  quality?: string;
}

// Platforms rarely expose gender, so we recognise common first names / labels of system voices.
// Matching is per word, so "female" never matches the "male" list (and "German" never matches "man").
const FEMALE_NAMES = new Set([
  'female', 'woman', 'samantha', 'alice', 'zosia', 'karen', 'moira', 'tessa', 'victoria', 'susan',
  'monica', 'paulina', 'luciana', 'amelie', 'aurelie', 'anna', 'petra', 'marlene', 'yelda', 'nora',
  'ellen', 'kate', 'serena', 'joana', 'catherine', 'audrey', 'chantal', 'julie', 'celine', 'marie',
  'elsa', 'federica', 'carmela', 'paola', 'sara', 'helena', 'laura', 'marisol', 'amelia', 'katja',
]);

const MALE_NAMES = new Set([
  'male', 'man', 'daniel', 'thomas', 'aaron', 'alex', 'fred', 'oliver', 'diego', 'jorge', 'markus',
  'stefan', 'yannick', 'luca', 'paolo', 'giorgio', 'martin', 'nicolas', 'benjamin', 'hans', 'cosimo',
  'juan', 'carlos', 'enrique', 'reed', 'lee', 'rishi', 'conrad', 'jacques',
]);

export function normalizeLanguageTag(tag: string | undefined): string {
  return (tag ?? '').replace(/_/g, '-').toLowerCase();
}

export function matchesGender(name: string | undefined, gender: VoiceGender): boolean {
  if (!name) return false;
  const words = name.toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
  const names = gender === 'female' ? FEMALE_NAMES : MALE_NAMES;
  return words.some((word) => names.has(word));
}

const isEnhanced = (voice: VoiceLike) => voice.quality?.toLowerCase() === 'enhanced';

/**
 * Chooses the best system voice for a locale and gender preference.
 *
 * Priority: voices of the exact locale, then of the same language; inside that pool a voice of the
 * requested gender, preferring "Enhanced" quality. The wrong language sounds far worse than the
 * wrong gender, so when the language has no voice at all we return `undefined` and let the OS pick
 * its default for `language`.
 */
export function pickVoiceIdentifier(
  voices: readonly VoiceLike[],
  locale: string,
  gender: VoiceGender,
): string | undefined {
  const wanted = normalizeLanguageTag(locale);
  const wantedLanguage = wanted.split('-')[0];

  const exact = voices.filter((voice) => normalizeLanguageTag(voice.language) === wanted);
  const sameLanguage = voices.filter((voice) =>
    normalizeLanguageTag(voice.language).startsWith(wantedLanguage),
  );
  const pool = exact.length > 0 ? exact : sameLanguage;
  if (pool.length === 0) return undefined;

  const byQuality = (list: readonly VoiceLike[]) => list.find(isEnhanced) ?? list[0];
  const gendered = pool.filter((voice) => matchesGender(voice.name, gender));
  return (gendered.length > 0 ? byQuality(gendered) : byQuality(pool)).identifier;
}
