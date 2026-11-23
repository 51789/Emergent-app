import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { BillingMe } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { colors, radius, spacing } from '@/theme';
import { formatDateOnly, localeFor } from '@/utils/date';

interface CurrentPlanBannerProps {
  billing: BillingMe;
  onManage: () => void;
  managing: boolean;
}

/** "Piano attuale: PRO - Attivo, si rinnova il ..." with the "Gestisci abbonamento" button. */
export function CurrentPlanBanner({ billing, onManage, managing }: CurrentPlanBannerProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.language as Parameters<typeof localeFor>[0]);
  const end = billing.current_period_end ? formatDateOnly(billing.current_period_end.slice(0, 10), locale) : '';

  let dateLine = '';
  if (end) {
    if (billing.cancel_at_period_end) dateLine = t('subscribe.cancelsOn', { date: end });
    else if (billing.status === 'active') dateLine = t('subscribe.renewsOn', { date: end });
    else dateLine = t('subscribe.endsOn', { date: end });
  }

  const statusLabel = t(`subscribe.status.${billing.status}`);
  const warn = billing.status === 'past_due';

  return (
    <View style={[styles.banner, warn && styles.bannerWarn]}>
      <View style={styles.row}>
        <MaterialIcons
          name={warn ? 'warning-amber' : 'verified'}
          size={24}
          color={warn ? colors.warning : colors.success}
        />
        <View style={styles.text}>
          <AppText variant="bodyStrong">
            {t('subscribe.currentPlanValue', { plan: billing.plan.toUpperCase() })}
            {statusLabel ? ` · ${statusLabel}` : ''}
          </AppText>
          {dateLine ? (
            <AppText variant="caption" color="textMuted">
              {dateLine}
            </AppText>
          ) : null}
        </View>
      </View>
      <Button
        label={t('subscribe.manage')}
        variant="secondary"
        loading={managing}
        onPress={onManage}
        testID="manage-subscription"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  bannerWarn: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
});
