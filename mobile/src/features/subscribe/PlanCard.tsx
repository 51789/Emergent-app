import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { BillingCycle, Plan } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { colors, radius, spacing } from '@/theme';
import { localeFor } from '@/utils/date';
import { formatMoney, yearlySavings } from '@/utils/format';

interface PlanCardProps {
  plan: Plan;
  cycle: BillingCycle;
  /** The user is already on this plan with this billing cycle. */
  isCurrent: boolean;
  /** Visually emphasised as the best offer. */
  highlighted: boolean;
  loading: boolean;
  disabled: boolean;
  onSubscribe: () => void;
}

/** One plan: name, price for the selected cycle, yearly savings, feature list and the subscribe button. */
export function PlanCard({ plan, cycle, isCurrent, highlighted, loading, disabled, onSubscribe }: PlanCardProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.language as Parameters<typeof localeFor>[0]);
  const price = plan.prices[cycle];
  const savings = cycle === 'yearly' ? yearlySavings(plan) : null;
  const isFree = plan.id === 'free' || !plan.prices.monthly;

  return (
    <View
      style={[styles.card, highlighted && styles.cardHighlighted, isCurrent && styles.cardCurrent]}
      testID={`plan-${plan.id}`}
    >
      {highlighted ? (
        <Badge label={t('subscribe.bestValue')} tone="warning" style={styles.badge} />
      ) : null}

      <AppText variant="title" style={highlighted ? styles.premiumName : undefined} testID={`plan-name-${plan.id}`}>
        {plan.name.toUpperCase()}
      </AppText>

      <View style={styles.priceRow}>
        <AppText variant="display">{price ? formatMoney(price, locale) : t('subscribe.freePlan')}</AppText>
        {price ? (
          <AppText variant="body" color="textMuted">
            {cycle === 'monthly' ? t('subscribe.perMonth') : t('subscribe.perYear')}
          </AppText>
        ) : null}
      </View>

      {savings ? (
        <AppText variant="captionStrong" color="success">
          {t('subscribe.saveYearly', {
            amount: formatMoney(savings.amount, locale),
            percent: savings.percent,
          })}
        </AppText>
      ) : null}

      <View style={styles.features}>
        {plan.features.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <MaterialIcons name="check-circle" size={18} color={colors.success} />
            <AppText variant="body" style={styles.featureText}>
              {feature}
            </AppText>
          </View>
        ))}
      </View>

      {isFree ? null : (
        <Button
          label={isCurrent ? t('subscribe.currentPlan') : t('subscribe.subscribe')}
          variant={isCurrent ? 'secondary' : 'primary'}
          disabled={isCurrent || disabled}
          loading={loading}
          onPress={onSubscribe}
          testID={`subscribe-${plan.id}`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  cardHighlighted: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  cardCurrent: { borderColor: colors.success },
  badge: { marginBottom: -4 },
  premiumName: { color: colors.warning },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  features: { gap: spacing.sm, paddingVertical: spacing.xs },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  featureText: { flex: 1 },
});
