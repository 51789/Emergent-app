import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import type { IconName } from '@/constants/icons';
import { colors, radius } from '@/theme';

import { AppText } from './AppText';

interface ChipProps {
  label: string;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}

/** Pill used for filters and example keyword suggestions. */
export function Chip({ label, icon, selected = false, onPress, testID }: ChipProps) {
  const fg = selected ? colors.onPrimary : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.idle,
        pressed && styles.pressed,
      ]}
    >
      {icon ? <MaterialIcons name={icon} size={16} color={selected ? colors.onPrimary : colors.primary} /> : null}
      <AppText variant="captionStrong" style={{ color: fg }} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  idle: { backgroundColor: colors.background, borderColor: colors.borderStrong },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.7 },
});
