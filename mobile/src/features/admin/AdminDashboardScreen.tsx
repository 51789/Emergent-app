import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnalyticsOverview } from '@/api/hooks';
import { AppText } from '@/components/AppText';
import { BrandHeader } from '@/components/BrandHeader';
import { Button } from '@/components/Button';
import { Screen, STACK_EDGES } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useErrorMessage } from '@/i18n/useErrorMessage';
import { colors, spacing } from '@/theme';
import { localeFor } from '@/utils/date';
import { formatConversionRate, formatMoney, formatNumber } from '@/utils/format';

import { KpiCard, KpiGrid } from './KpiCard';
import { PlanSplit } from './PlanSplit';

const OVERVIEW_RANGE = { range: '30d' } as const;

/** Admin landing page: headline KPIs for the last 30 days and shortcuts to users and analytics. */
export function AdminDashboardScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const locale = localeFor(i18n.language as Parameters<typeof localeFor>[0]);
  const overview = useAnalyticsOverview(OVERVIEW_RANGE);
  const [refreshing, setRefreshing] = useState(false);
  const data = overview.data;

  const refresh = async () => {
    setRefreshing(true);
    await overview.refetch();
    setRefreshing(false);
  };

  return (
    <Screen edges={STACK_EDGES}>
      <BrandHeader onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <View>
          <AppText variant="overline" color="warning">
            ADMIN
          </AppText>
          <AppText variant="title">{t('admin.dashboard')}</AppText>
          <AppText variant="caption" color="textMuted" style={styles.note}>
            {t('admin.dashboardRangeNote')}
          </AppText>
        </View>

        {overview.isPending ? <LoadingState style={styles.loading} /> : null}
        {overview.isError && !data ? (
          <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />
        ) : null}

        {data ? (
          <>
            <KpiGrid>
              <KpiCard icon="group" label={t('admin.kpi.totalUsers')} value={formatNumber(data.total_users, locale)} />
              <KpiCard
                icon="verified"
                label={t('admin.kpi.activeSubscribers')}
                value={formatNumber(data.active_subscribers, locale)}
                tint={colors.success}
              />
              <KpiCard
                icon="euro"
                label={t('admin.kpi.revenue')}
                value={formatMoney({ amount_cents: data.revenue_monthly_estimate_cents, currency: 'EUR' }, locale)}
                tint={colors.warning}
              />
              <KpiCard
                icon="person-add"
                label={t('admin.kpi.newSignups')}
                value={formatNumber(data.new_signups, locale)}
              />
              <KpiCard
                icon="trending-up"
                label={t('admin.kpi.conversion')}
                value={formatConversionRate(data.conversion_rate, locale)}
              />
              <KpiCard
                icon="manage-search"
                label={t('admin.kpi.totalSearches')}
                value={formatNumber(data.total_searches, locale)}
              />
            </KpiGrid>
            <PlanSplit split={data.plan_split} locale={locale} />
          </>
        ) : null}

        <View style={styles.links}>
          <Button label={t('admin.usersLink')} icon="group" onPress={() => router.push('/admin/users')} testID="admin-users-link" />
          <Button
            label={t('admin.analyticsLink')}
            icon="insights"
            variant="secondary"
            onPress={() => router.push('/admin/analytics')}
            testID="admin-analytics-link"
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  loading: { minHeight: 160 },
  links: { gap: spacing.md },
  note: { marginTop: spacing.xs },
});
