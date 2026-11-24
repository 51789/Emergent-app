import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import type { LanguageCode } from '@/api/types';
import { AppText } from '@/components/AppText';
import { colors, fonts, radius, spacing, TOUCH_TARGET } from '@/theme';
import { webNoOutline } from '@/theme/web';

import { useVoiceInput } from './useVoiceInput';

interface SearchComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  language: LanguageCode;
  submitting: boolean;
}

const useNativeDriver = Platform.OS !== 'web';

/** Natural-language request box: text input, dictation (mic) button and submit button. */
export function SearchComposer({ value, onChangeText, onSubmit, language, submitting }: SearchComposerProps) {
  const { t } = useTranslation();
  // Text typed before dictation started: spoken words are appended to it.
  const [dictationBase, setDictationBase] = useState('');
  const voice = useVoiceInput({
    language,
    onTranscript: (transcript) =>
      onChangeText(dictationBase ? `${dictationBase.trimEnd()} ${transcript}` : transcript),
  });
  const [pulse] = useState(() => new Animated.Value(1));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!voice.listening) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver }),
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [voice.listening, pulse]);

  const canSubmit = value.trim().length > 0 && !submitting;

  const handleMic = () => {
    if (!voice.listening) setDictationBase(value);
    void voice.toggle();
  };

  return (
    <View style={styles.wrapper}>
      <View style={[styles.bar, focused && styles.barFocused, voice.listening && styles.barRecording]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={voice.listening ? t('category.recording') : t('category.insertRequest')}
          placeholderTextColor={voice.listening ? colors.alert : colors.textSubtle}
          editable={!submitting}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          returnKeyType="search"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={canSubmit ? onSubmit : undefined}
          accessibilityLabel={t('category.insertRequest')}
          style={styles.input}
          testID="search-input"
        />

        {voice.available ? (
          <Pressable
            onPress={handleMic}
            disabled={submitting}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={voice.listening ? t('category.stopVoice') : t('category.startVoice')}
            accessibilityState={{ selected: voice.listening }}
            style={styles.iconButton}
            testID="mic-button"
          >
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <MaterialIcons
                name={voice.listening ? 'mic' : 'mic-none'}
                size={26}
                color={voice.listening ? colors.alert : colors.textMuted}
              />
            </Animated.View>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t('category.startSearch')}
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
          style={[styles.submit, !canSubmit && styles.submitDisabled]}
          testID="submit-button"
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <MaterialIcons name="arrow-upward" size={22} color={colors.onPrimary} />
          )}
        </Pressable>
      </View>

      {voice.listening ? (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <View style={styles.dot} />
          <AppText variant="caption" color="alert">
            {t('category.recording')}
          </AppText>
        </View>
      ) : null}
      {voice.error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {voice.error === 'denied' ? t('category.voiceDenied') : t('category.voiceFailed')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 60,
  },
  /** Navy focus ring. */
  barFocused: { borderColor: colors.primary, backgroundColor: colors.background },
  barRecording: { borderColor: colors.alert, backgroundColor: colors.dangerSoft },
  input: {
    flex: 1,
    maxHeight: 120,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 8,
    ...webNoOutline,
  },
  iconButton: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  submit: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { backgroundColor: colors.borderStrong },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.alert },
});
