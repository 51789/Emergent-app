import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Result } from '@/api/types';
import { usePrefs } from '@/store/prefs';

import { speak, stopSpeaking } from './speech';

/** Text read for one announcement: title, summary and contacts. */
export function buildSpokenText(result: Result, t: TFunction): string {
  const parts = [result.title, result.summary].filter(Boolean);
  if (result.contacts.length > 0) {
    parts.push(`${t('speech.contacts')}: ${result.contacts.join(', ')}`);
  }
  return parts.join('. ');
}

export interface ReadAloud {
  /** Result currently read by its own play button. */
  playingId: string | null;
  /** Zero-based index while "Leggi tutti" is running, otherwise null. */
  readingIndex: number | null;
  /** True while the "continue with the next one?" question is waiting for an answer. */
  askContinue: boolean;
  playOne: (result: Result) => Promise<void>;
  readAll: () => Promise<void>;
  stop: () => void;
  answerContinue: (yes: boolean) => void;
}

/**
 * Text-to-speech controller for a list of results:
 * - per-card play/stop;
 * - "read all": announcements are read one after another and, after each (except the last),
 *   the assistant asks "should I continue with the next one?" and waits for a Yes/No answer.
 *
 * Every run gets a token; `stop()` (or starting something else) invalidates it, so superseded
 * loops exit silently instead of racing with the new playback.
 */
export function useReadAloud(results: readonly Result[]): ReadAloud {
  const { t } = useTranslation();
  const language = usePrefs((state) => state.language);
  const gender = usePrefs((state) => state.voiceGender);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [readingIndex, setReadingIndex] = useState<number | null>(null);
  const [askContinue, setAskContinue] = useState(false);

  const runToken = useRef(0);
  const playingIdRef = useRef<string | null>(null);
  const pendingAnswer = useRef<((yes: boolean) => void) | null>(null);
  const latestResults = useRef(results);

  useEffect(() => {
    latestResults.current = results;
  }, [results]);

  const stop = useCallback(() => {
    runToken.current += 1;
    pendingAnswer.current?.(false);
    pendingAnswer.current = null;
    playingIdRef.current = null;
    stopSpeaking();
    setPlayingId(null);
    setReadingIndex(null);
    setAskContinue(false);
  }, []);

  // Never keep talking after the screen is gone.
  useEffect(
    () => () => {
      runToken.current += 1;
      pendingAnswer.current?.(false);
      stopSpeaking();
    },
    [],
  );

  const playOne = useCallback(
    async (result: Result) => {
      const wasPlayingThis = playingIdRef.current === result.id;
      stop();
      if (wasPlayingThis) return;

      const token = runToken.current;
      playingIdRef.current = result.id;
      setPlayingId(result.id);
      await speak(buildSpokenText(result, t), { language, gender });
      if (runToken.current === token) {
        playingIdRef.current = null;
        setPlayingId(null);
      }
    },
    [gender, language, stop, t],
  );

  const readAll = useCallback(async () => {
    const list = latestResults.current;
    if (list.length === 0) return;
    stop();
    const token = runToken.current;
    const options = { language, gender };

    for (let index = 0; index < list.length; index += 1) {
      setReadingIndex(index);
      const intro = t('speech.intro', { current: index + 1, total: list.length });
      await speak(`${intro} ${buildSpokenText(list[index], t)}`, options);
      if (runToken.current !== token) return;
      if (index === list.length - 1) break;

      // Ask whether to go on; the spoken question and the on-screen modal run together.
      const answer = new Promise<boolean>((resolve) => {
        pendingAnswer.current = resolve;
      });
      setAskContinue(true);
      void speak(t('speech.outro'), options);
      const shouldContinue = await answer;
      stopSpeaking();
      if (runToken.current !== token) return;
      setAskContinue(false);
      if (!shouldContinue) {
        stop();
        return;
      }
    }

    setReadingIndex(null);
    setAskContinue(false);
    await speak(t('speech.final'), options);
  }, [gender, language, stop, t]);

  const answerContinue = useCallback((yes: boolean) => {
    const resolve = pendingAnswer.current;
    pendingAnswer.current = null;
    resolve?.(yes);
  }, []);

  return { playingId, readingIndex, askContinue, playOne, readAll, stop, answerContinue };
}
