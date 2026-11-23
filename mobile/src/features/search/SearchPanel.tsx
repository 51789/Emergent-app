import { StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Search } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Banner } from '@/components/StateViews';
import { colors, spacing } from '@/theme';
import { formatDateTime, localeFor } from '@/utils/date';
import { getRunState } from '@/utils/searchStatus';

interface SearchPanelProps {
  search: Search;
  resultsCount: number;
  /** Present after a 429; `minutes` is the Retry-After in whole minutes, if known. */
  rateLimit: { minutes: number | null } | null;
  runPending: boolean;
  isReadingAll: boolean;
  onRun: () => void;
  onReadAll: () => void;
  onStopReading: () => void;
  onToggleActive: (isActive: boolean) => void;
}

/** Top of the results list: query, metadata, status banners and the run / read-all actions. */
export function SearchPanel({
  search,
  resultsCount,
  rateLimit,
  runPending,
  isReadingAll,
  onRun,
  onReadAll,
  onStopReading,
  onToggleActive,
}: SearchPanelProps) {
  const { t } = useTranslation();
  const locale = localeFor(search.language);
  const runState = getRunState(search.last_run_status);
  const busy = runState === 'running';

  return (
    <View style={styles.panel}>
      <AppText variant="title" style={styles.query}>
        {search.query}
      </AppText>

      <View style={styles.metaRow}>
        <Badge label={t(`categories.${search.category}`)} tone="primary" />
        <AppText variant="caption" color="textMuted">
          {t('search.resultsCount', { count: search.results_count })}
        </AppText>
      </View>
      <AppText variant="caption" color="textSubtle">
        {search.last_run_at
          ? t('search.lastRun', { date: formatDateTime(search.last_run_at, locale) })
          : t('search.neverRun')}
        {/* While a run is pending/running the API reports the lease expiry in next_run_at: not a schedule. */}
        {search.next_run_at && search.is_active && !busy
          ? `  ·  ${t('search.nextRun', { date: formatDateTime(search.next_run_at, locale) })}`
          : ''}
      </AppText>

      {search.summary ? (
        <View style={styles.summary}>
          <AppText variant="captionStrong" color="textMuted">
            {t('search.summary')}
          </AppText>
          <AppText variant="body">{search.summary}</AppText>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={busy ? t('search.running') : t('search.runNow')}
          icon="refresh"
          onPress={onRun}
          loading={runPending || busy}
          fullWidth={false}
          style={styles.action}
          testID="run-now"
        />
        {resultsCount > 0 ? (
          <Button
            label={isReadingAll ? t('speech.stopReading') : t('speech.readAll')}
            icon={isReadingAll ? 'stop-circle' : 'record-voice-over'}
            variant={isReadingAll ? 'dangerOutline' : 'secondary'}
            onPress={isReadingAll ? onStopReading : onReadAll}
            fullWidth={false}
            style={styles.action}
            testID="read-all"
          />
        ) : null}
      </View>

      <View style={styles.toggleRow}>
        <AppText variant="body" color="textMuted" style={styles.toggleLabel}>
          {search.is_active ? t('search.pause') : t('search.resume')}
        </AppText>
        <Switch
          value={search.is_active}
          onValueChange={onToggleActive}
          trackColor={{ true: colors.primary, false: colors.borderStrong }}
          thumbColor={colors.background}
          accessibilityLabel={t('manage.toggleA11y')}
        />
      </View>

      {busy ? <Banner tone="info" message={t('search.runningHint')} /> : null}
      {rateLimit ? (
        <Banner
          tone="warning"
          title={t('search.rateLimitedTitle')}
          message={
            rateLimit.minutes !== null
              ? t('search.rateLimitedRetryIn', { minutes: rateLimit.minutes })
              : t('search.rateLimitedMessage')
          }
        />
      ) : null}
      {runState === 'error' && !busy ? (
        <Banner
          tone="danger"
          title={t('search.errorTitle')}
          message={search.last_error || t('search.errorFallback')}
        />
      ) : null}
      {runState === 'no_provider' && resultsCount > 0 ? (
        <Banner tone="warning" title={t('search.noProviderTitle')} message={t('search.noProviderMessage')} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md, paddingBottom: spacing.sm },
  query: { marginTop: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summary: { gap: 2, backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 140 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { flex: 1 },
});
