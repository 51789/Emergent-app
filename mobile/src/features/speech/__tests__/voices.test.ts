import { matchesGender, normalizeLanguageTag, pickVoiceIdentifier, type VoiceLike } from '../voices';

const voices: VoiceLike[] = [
  { identifier: 'en-alex', name: 'Alex', language: 'en-US', quality: 'Enhanced' },
  { identifier: 'it-alice', name: 'Alice', language: 'it-IT', quality: 'Default' },
  { identifier: 'it-luca', name: 'Luca', language: 'it_IT', quality: 'Default' },
  { identifier: 'it-luca-hq', name: 'Luca (Enhanced)', language: 'it-IT', quality: 'Enhanced' },
  { identifier: 'de-anna', name: 'Anna', language: 'de-DE', quality: 'Default' },
  { identifier: 'de-AT', name: 'Neutral', language: 'de-AT', quality: 'Default' },
];

describe('matchesGender', () => {
  it('matches whole words only', () => {
    expect(matchesGender('Samantha', 'female')).toBe(true);
    expect(matchesGender('Google UK English Male', 'male')).toBe(true);
    // "female" must not count as "male"; "German" must not count as "man".
    expect(matchesGender('Google UK English Female', 'male')).toBe(false);
    expect(matchesGender('Google Deutsch German', 'male')).toBe(false);
    expect(matchesGender(undefined, 'female')).toBe(false);
  });
});

describe('normalizeLanguageTag', () => {
  it('lower-cases and unifies separators', () => {
    expect(normalizeLanguageTag('it_IT')).toBe('it-it');
    expect(normalizeLanguageTag(undefined)).toBe('');
  });
});

describe('pickVoiceIdentifier', () => {
  it('picks a voice of the requested gender in the exact locale', () => {
    expect(pickVoiceIdentifier(voices, 'it-IT', 'female')).toBe('it-alice');
  });

  it('prefers enhanced quality among matching voices', () => {
    expect(pickVoiceIdentifier(voices, 'it-IT', 'male')).toBe('it-luca-hq');
  });

  it('falls back to any voice of the language when the gender is unknown', () => {
    expect(pickVoiceIdentifier(voices, 'de-DE', 'male')).toBe('de-anna');
  });

  it('uses another regional variant of the same language when the exact locale is missing', () => {
    expect(pickVoiceIdentifier([voices[5]], 'de-DE', 'female')).toBe('de-AT');
  });

  it('returns undefined instead of a voice in the wrong language', () => {
    expect(pickVoiceIdentifier(voices, 'fr-FR', 'female')).toBeUndefined();
    expect(pickVoiceIdentifier([], 'it-IT', 'female')).toBeUndefined();
  });
});
