import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import type { IconName } from '@/constants/icons';
import { colors, radius, spacing } from '@/theme';

interface SettingsSectionProps {
  title?: string;
  children: ReactNode;
}

/** Titled group of rows with a light card background. */
export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View style={styles.section}>
      {title ? (
        <AppText variant="label" color="textSubtle" style={styles.sectionTitle}>
          {title.toUpperCase()}
        </AppText>
      ) : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

interface SettingsRowProps {
  icon: IconName;
  label: string;
  value?: string;
  /** Replaces the value / chevron (e.g. a Segmented control). */
  accessory?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  testID?: string;
}

export function SettingsRow({ icon, label, value, accessory, onPress, destructive = false, testID }: SettingsRowProps) {
  const tint = destructive ? colors.danger : colors.primary;
  const content = (
    <>
      <MaterialIcons name={icon} size={22} color={tint} />
      <View style={styles.text}>
        <AppText variant="subheading" style={destructive ? { color: colors.danger } : undefined}>
          {label}
        </AppText>
        {value ? (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {value}
          </AppText>
        ) : null}
      </View>
      {accessory ?? (onPress ? <MaterialIcons name="chevron-right" size={22} color={colors.textSubtle} /> : null)}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionTitle: { paddingHorizontal: spacing.xs },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { backgroundColor: colors.border },
  text: { flex: 1 },
});
