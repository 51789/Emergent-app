import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import type { IconName } from '@/constants/icons';
import { colors, radius, spacing } from '@/theme';

interface KpiCardProps {
  icon: IconName;
  label: string;
  value: string;
  tint?: string;
}

/** One headline metric of the admin dashboard. */
export function KpiCard({ icon, label, value, tint = colors.primary }: KpiCardProps) {
  return (
    <View style={styles.card} accessible accessibilityLabel={`${label}: ${value}`}>
      <MaterialIcons name={icon} size={22} color={tint} />
      <AppText variant="title" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      <AppText variant="caption" color="textMuted" numberOfLines={2}>
        {label}
      </AppText>
    </View>
  );
}

/** Two-column grid helper for KPI cards. */
export function KpiGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: 4,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
});
