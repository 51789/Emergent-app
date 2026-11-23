import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Search } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { colors, radius, shadow, spacing } from '@/theme';
import { formatDateTime, localeFor } from '@/utils/date';
import { getRunState } from '@/utils/searchStatus';

interface SearchCardProps {
  search: Search;
  onPress?: (search: Search) => void;
  /** Shows the pause/resume switch. */
  onToggleActive?: (search: Search, isActive: boolean) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onLongPress?: (id: string) => void;
  /** Shows the category label (lists that mix categories). */
  showCategory?: boolean;
}

/** Row for one search: query, run state, counters and the pause/resume switch. */
export function SearchCard({
  search,
  onPress,
  onToggleActive,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onLongPress,
  showCategory = false,
}: SearchCardProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(search.language ?? (i18n.language as Search['language']));
  const runState = getRunState(search.last_run_status);

  const handlePress = () => {
    if (selectionMode) onToggleSelect?.(search.id);
    else onPress?.(search);
  };

  const lastRun = search.last_run_at
    ? t('search.lastRun', { date: formatDateTime(search.last_run_at, locale) })
    : t('search.neverRun');

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={() => onLongPress?.(search.id)}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityState={{ selected: selectionMode ? selected : undefined }}
      style={[styles.card, selected && styles.cardSelected, !search.is_active && styles.paused]}
      testID={`search-card-${search.id}`}
    >
      {selectionMode ? (
        <MaterialIcons
          name={selected ? 'check-circle' : 'radio-button-unchecked'}
          size={24}
          color={selected ? colors.primary : colors.borderStrong}
        />
      ) : null}

      <View style={styles.body}>
        {showCategory ? (
          <AppText variant="overline" color="primary" numberOfLines={1}>
            {t(`categories.${search.category}`)}
          </AppText>
        ) : null}
        <AppText variant="heading" numberOfLines={2}>
          {search.query}
        </AppText>

        <View style={styles.badges}>
          <Badge
            label={search.is_active ? t('search.active') : t('search.paused')}
            tone={search.is_active ? 'success' : 'neutral'}
            dot
          />
          {runState === 'running' ? (
            <View style={styles.running} accessibilityLabel={t('search.running')}>
              <ActivityIndicator size="small" color={colors.primary} />
              <AppText variant="caption" color="primary">
                {t('search.running')}
              </AppText>
            </View>
          ) : null}
          {runState === 'error' ? (
            <MaterialIcons name="error-outline" size={18} color={colors.danger} accessibilityLabel={t('search.errorTitle')} />
          ) : null}
          {runState === 'no_provider' ? (
            <MaterialIcons name="cloud-off" size={18} color={colors.warning} accessibilityLabel={t('search.noProviderTitle')} />
          ) : null}
          <AppText variant="caption" color="textMuted">
            {t('search.resultsCount', { count: search.results_count })}
          </AppText>
          {search.unseen_count > 0 ? (
            <Badge label={t('search.newCount', { count: search.unseen_count })} tone="alert" />
          ) : null}
        </View>

        <AppText variant="caption" color="textSubtle" numberOfLines={1}>
          {lastRun}
        </AppText>
      </View>

      {onToggleActive && !selectionMode ? (
        <Switch
          value={search.is_active}
          onValueChange={(value) => onToggleActive(search, value)}
          trackColor={{ true: colors.primary, false: colors.borderStrong }}
          thumbColor={colors.background}
          accessibilityLabel={`${t('manage.toggleA11y')}: ${search.query}`}
          testID={`search-toggle-${search.id}`}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  paused: { opacity: 0.8 },
  body: { flex: 1, gap: 6 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  running: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
