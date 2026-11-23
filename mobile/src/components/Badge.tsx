import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { IconName } from '@/constants/icons';

import { colors, radius } from '@/theme';

import { AppText } from './AppText';

export type BadgeTone =
  | 'success'
  | 'danger'
  | 'warning'
  | 'neutral'
  | 'primary'
  | 'alert'
  /** Solid brand navy (verified). */
  | 'navy'
  /** Navy outline on white (official source). */
  | 'outline'
  /** Subtle slate (not verified). */
  | 'slate';

const tones: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  success: { bg: colors.successSoft, fg: colors.success, border: colors.successBorder },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.danger },
  warning: { bg: colors.warningSoft, fg: colors.warning, border: colors.warningBorder },
  neutral: { bg: colors.surface, fg: colors.textMuted, border: colors.border },
  primary: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
  alert: { bg: colors.alert, fg: colors.onPrimary, border: colors.alert },
  navy: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  outline: { bg: colors.background, fg: colors.primary, border: colors.primary },
  slate: { bg: colors.surface, fg: colors.textSubtle, border: colors.slateLight },
};

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Adds a leading dot (used by the ATTIVO status). */
  dot?: boolean;
  /** Leading icon (e.g. the check of the verified badge). */
  icon?: IconName;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Small uppercase status pill. */
export function Badge({ label, tone = 'neutral', dot = false, icon, accessibilityHint, style, testID }: BadgeProps) {
  const { bg, fg, border } = tones[tone];
  return (
    <View
      style={[styles.badge, { backgroundColor: bg, borderColor: border }, style]}
      testID={testID}
      accessible={!!accessibilityHint}
      accessibilityLabel={accessibilityHint ? label : undefined}
      accessibilityHint={accessibilityHint}
    >
      {icon ? <MaterialIcons name={icon} size={12} color={fg} /> : null}
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      <AppText variant="label" style={{ color: fg }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
