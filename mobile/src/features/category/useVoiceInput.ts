import { useCallback, useEffect, useRef, useState } from 'react';

import type { LanguageCode } from '@/api/types';
import { env } from '@/config/env';
import { localeFor } from '@/utils/date';

type SpeechRecognitionModule = typeof import('expo-speech-recognition');
type RecognizerModule = SpeechRecognitionModule['ExpoSpeechRecognitionModule'];

let moduleCache: RecognizerModule | null | undefined;

/**
 * expo-speech-recognition is native code (it needs a development/production build, not Expo Go),
 * so it is required lazily: if it is missing the microphone button is simply hidden.
 * On web it falls back to the browser's Web Speech API (Chrome / Safari).
 */
function getRecognizer(): RecognizerModule | null {
  if (!env.voiceInputEnabled) return null;
  if (moduleCache !== undefined) return moduleCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition') as SpeechRecognitionModule;
    moduleCache = ExpoSpeechRecognitionModule.isRecognitionAvailable() ? ExpoSpeechRecognitionModule : null;
  } catch {
    moduleCache = null;
  }
  return moduleCache;
}

export type VoiceError = 'denied' | 'failed' | null;

interface UseVoiceInputOptions {
  language: LanguageCode;
  /** Receives the full transcript so far (partial results included). */
  onTranscript: (transcript: string) => void;
}

export interface VoiceInput {
  /** False when the feature flag is off or speech recognition is unavailable in this build. */
  available: boolean;
  listening: boolean;
  error: VoiceError;
  toggle: () => Promise<void>;
  stop: () => void;
}

/** Dictation for the search box (mic button). */
export function useVoiceInput({ language, onTranscript }: UseVoiceInputOptions): VoiceInput {
  const [recognizer] = useState(getRecognizer);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<VoiceError>(null);

  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    if (!recognizer) return;
    const subscriptions = [
      recognizer.addListener('start', () => setListening(true)),
      recognizer.addListener('end', () => setListening(false)),
      recognizer.addListener('result', (event) => {
        const transcript = event.results[0]?.transcript;
        if (transcript) onTranscriptRef.current(transcript);
      }),
      recognizer.addListener('error', (event) => {
        setListening(false);
        if (event.error === 'not-allowed') setError('denied');
        else if (event.error !== 'aborted' && event.error !== 'no-speech') setError('failed');
      }),
    ];
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      recognizer.abort();
    };
  }, [recognizer]);

  const stop = useCallback(() => recognizer?.stop(), [recognizer]);

  const toggle = useCallback(async () => {
    if (!recognizer) return;
    if (listening) {
      recognizer.stop();
      return;
    }
    setError(null);
    const permission = await recognizer.requestPermissionsAsync();
    if (!permission.granted) {
      setError('denied');
      return;
    }
    recognizer.start({ lang: localeFor(language), interimResults: true, continuous: false });
  }, [language, listening, recognizer]);

  return { available: !!recognizer, listening, error, toggle, stop };
}
