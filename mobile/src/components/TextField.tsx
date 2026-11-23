import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, fonts, radius, TOUCH_TARGET } from '@/theme';
import { webNoOutline } from '@/theme/web';

import { AppText } from './AppText';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
}

/** Labelled text input with inline error and, for passwords, a show/hide toggle. */
export function TextField({
  label,
  error,
  hint,
  secureTextEntry,
  style,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isPassword = !!secureTextEntry;

  return (
    <View style={styles.wrapper}>
      <AppText variant="captionStrong" color="textMuted" style={styles.label}>
        {label}
      </AppText>
      <View style={[styles.inputRow, focused && styles.inputRowFocused, error ? styles.inputRowError : null]}>
        <TextInput
          {...rest}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          accessibilityLabel={label}
          placeholderTextColor={colors.textSubtle}
          secureTextEntry={isPassword && !revealed}
          style={[styles.input, style]}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            hitSlop={8}
            style={styles.reveal}
          >
            <MaterialIcons
              name={revealed ? 'visibility-off' : 'visibility'}
              size={22}
              color={colors.textSubtle}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" style={styles.below} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textSubtle" style={styles.below}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignSelf: 'stretch' },
  label: { marginBottom: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    minHeight: TOUCH_TARGET + 6,
  },
  /** Navy focus ring. */
  inputRowFocused: { borderColor: colors.primary, backgroundColor: colors.background },
  inputRowError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 10,
    // The row draws the navy focus ring; hide the browser outline on web.
    ...webNoOutline,
  },
  reveal: { paddingLeft: 8 },
  below: { marginTop: 4 },
});
