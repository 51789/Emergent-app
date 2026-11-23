import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { PlanId } from '@/api/types';
import { AppText } from '@/components/AppText';
import { colors, radius, spacing } from '@/theme';
import { formatNumber } from '@/utils/format';

const PLAN_COLORS: Record<PlanId, string> = {
  free: colors.borderStrong,
  pro: colors.primary,
  premium: colors.warning,
};

interface PlanSplitProps {
  split: Record<PlanId, number>;
  locale: string;
}

/** Free / Pro / Premium user distribution as proportional horizontal bars. */
export function PlanSplit({ split, locale }: PlanSplitProps) {
  const { t } = useTranslation();
  const plans: PlanId[] = ['free', 'pro', 'premium'];
  const total = plans.reduce((sum, plan) => sum + (split[plan] ?? 0), 0);

  return (
    <View style={styles.card}>
      <AppText variant="heading">{t('admin.kpi.planSplit')}</AppText>
      {plans.map((plan) => {
        const value = split[plan] ?? 0;
        const share = total > 0 ? value / total : 0;
        return (
          <View key={plan} style={styles.row}>
            <AppText variant="captionStrong" style={styles.name}>
              {plan.toUpperCase()}
            </AppText>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(share * 100, value > 0 ? 3 : 0)}%`, backgroundColor: PLAN_COLORS[plan] }]} />
            </View>
            <AppText variant="captionStrong" style={styles.value}>
              {formatNumber(value, locale)}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { width: 68 },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.background, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  value: { width: 44, textAlign: 'right' },
});
