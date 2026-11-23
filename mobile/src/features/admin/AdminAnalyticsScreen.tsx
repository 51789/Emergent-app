import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  useAnalyticsCategories,
  useAnalyticsOverview,
  useAnalyticsTimeseries,
} from '@/api/hooks';
import type { AnalyticsMetric, AnalyticsRangeKey, AnalyticsRangeParams } from '@/api/types';
import { AppText } from '@/components/AppText';
import { BrandHeader } from '@/components/BrandHeader';
import { LineChart } from '@/components/charts/LineChart';
import { Chip } from '@/components/Chip';
import { Screen, STACK_EDGES } from '@/components/Screen';
import { Banner, ErrorState, LoadingState } from '@/components/StateViews';
import { useErrorMessage } from '@/i18n/useErrorMessage';
import { colors, radius, spacing } from '@/theme';
import { endOfDayIso, localeFor, startOfDayIso } from '@/utils/date';
import { formatConversionRate, formatMoney, formatNumber } from '@/utils/format';

import { formatBucketLabel } from './chartLabels';
import { CategoryBreakdown } from './CategoryBreakdown';
import { KpiCard, KpiGrid } from './KpiCard';
import { PlanSplit } from './PlanSplit';
import { RangePicker, type CustomRange } from './RangePicker';

const METRICS: { key: AnalyticsMetric; color: string }[] = [
  { key: 'signups', color: colors.primary },
  { key: 'searches', color: colors.slate },
  { key: 'subscriptions', color: colors.success },
];

/** Time-range analytics: KPIs, a signups/searches/subscriptions line chart and a per-category bar chart. */
export function AdminAnalyticsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const locale = localeFor(i18n.language as Parameters<typeof localeFor>[0]);

  const [rangeKey, setRangeKey] = useState<AnalyticsRangeKey>('30d');
  const [custom, setCustom] = useState<CustomRange | null>(null);
  const [metric, setMetric] = useState<AnalyticsMetric>('signups');
  const [refreshing, setRefreshing] = useState(false);

  // A custom range only queries once the user pressed "Apply" with valid dates.
  const range: AnalyticsRangeParams | null =
    rangeKey === 'custom'
      ? custom
        ? { range: 'custom', from: startOfDayIso(custom.from), to: endOfDayIso(custom.to) }
        : null
      : { range: rangeKey };
  const queryRange = range ?? { range: '30d' as const };
  const enabled = range !== null;

  const overview = useAnalyticsOverview(queryRange, enabled);
  const series = useAnalyticsTimeseries(queryRange, metric, enabled);
  const categories = useAnalyticsCategories(queryRange, enabled);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([overview.refetch(), series.refetch(), categories.refetch()]);
    setRefreshing(false);
  };

  const metricColor = METRICS.find((item) => item.key === metric)?.color ?? colors.primary;
  const chartData = (series.data?.points ?? []).map((point) => ({
    label: formatBucketLabel(point.t, series.data?.bucket ?? 'day', locale),
    value: point.value,
  }));
  const data = overview.data;

  return (
    <Screen edges={STACK_EDGES}>
      <BrandHeader onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <View>
          <AppText variant="overline" color="warning">
            ADMIN
          </AppText>
          <AppText variant="title">{t('admin.analyticsLink')}</AppText>
        </View>

        <RangePicker value={rangeKey} onChange={setRangeKey} onApplyCustom={setCustom} />
        {rangeKey === 'realtime' ? (
          <Banner tone="info" message={t('admin.realtimeHint')} />
        ) : null}

        {enabled && overview.isPending ? <LoadingState style={styles.loading} /> : null}
        {overview.isError && !data ? (
          <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />
        ) : null}

        {data ? (
          <>
            <KpiGrid>
              <KpiCard
                icon="euro"
                label={t('admin.kpi.revenue')}
                value={formatMoney({ amount_cents: data.revenue_monthly_estimate_cents, currency: 'EUR' }, locale)}
                tint={colors.warning}
              />
              <KpiCard
                icon="verified"
                label={t('admin.kpi.activeSubscribers')}
                value={formatNumber(data.active_subscribers, locale)}
                tint={colors.success}
              />
              <KpiCard icon="person-add" label={t('admin.kpi.newSignups')} value={formatNumber(data.new_signups, locale)} />
              <KpiCard
                icon="trending-up"
                label={t('admin.kpi.conversion')}
                value={formatConversionRate(data.conversion_rate, locale)}
              />
            </KpiGrid>
            <PlanSplit split={data.plan_split} locale={locale} />
          </>
        ) : null}

        {enabled ? (
          <View style={styles.card}>
            <View style={styles.metrics}>
              {METRICS.map((item) => (
                <Chip
                  key={item.key}
                  label={t(`admin.metric.${item.key}`)}
                  selected={metric === item.key}
                  onPress={() => setMetric(item.key)}
                  testID={`metric-${item.key}`}
                />
              ))}
            </View>
            {series.isPending ? (
              <LoadingState style={styles.chartLoading} />
            ) : (
              <LineChart data={chartData} color={metricColor} emptyLabel={t('admin.noData')} />
            )}
          </View>
        ) : null}

        {enabled ? (
          <View style={styles.card}>
            <AppText variant="heading">{t('admin.categoriesChart')}</AppText>
            {categories.isPending ? (
              <LoadingState style={styles.chartLoading} />
            ) : (
              <CategoryBreakdown items={categories.data?.items ?? []} locale={locale} />
            )}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  loading: { minHeight: 120 },
  chartLoading: { minHeight: 140 },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
