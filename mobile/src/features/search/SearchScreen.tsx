import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { flattenPages } from '@/api/cache';
import { isApiError } from '@/api/client';
import {
  useBulkResults,
  useDeleteSearch,
  useRunSearch,
  useSearch,
  useSearchResults,
  useToggleFavorite,
  useToggleSearchActive,
} from '@/api/hooks';
import type { Result } from '@/api/types';
import { BrandHeader } from '@/components/BrandHeader';
import { Button } from '@/components/Button';
import { dialog } from '@/components/dialog/dialog';
import { IconButton } from '@/components/IconButton';
import { Screen, STACK_EDGES } from '@/components/Screen';
import { SelectionBar } from '@/components/SelectionBar';
import { EmptyState, ErrorState, ListFooter, LoadingState } from '@/components/StateViews';
import { ResultCard } from '@/features/results/ResultCard';
import { ContinueModal } from '@/features/speech/ContinueModal';
import { useReadAloud } from '@/features/speech/useReadAloud';
import { useSelection } from '@/hooks/useSelection';
import { useErrorMessage } from '@/i18n/useErrorMessage';
import { colors, spacing } from '@/theme';
import { getRetryAfterMinutes, isRateLimitError } from '@/utils/errors';
import { getRunState } from '@/utils/searchStatus';

import { SearchPanel } from './SearchPanel';
import { useSearchLifecycle } from './useSearchLifecycle';

/** Results of one search: list, run-now, polling while running, read-aloud and bulk delete. */
export function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const { id } = useLocalSearchParams<{ id: string }>();

  const searchQuery = useSearch(id);
  const resultsQuery = useSearchResults(id);
  const results = flattenPages(resultsQuery.data);
  const search = searchQuery.data;

  const readAloud = useReadAloud(results);
  const selection = useSelection();
  const runSearch = useRunSearch();
  const toggleActive = useToggleSearchActive();
  const deleteSearch = useDeleteSearch();
  const bulkResults = useBulkResults();
  const toggleFavorite = useToggleFavorite();
  /** Set after a 429: `minutes` comes from Retry-After (null if the server did not send it). */
  const [rateLimit, setRateLimit] = useState<{ minutes: number | null } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useSearchLifecycle(search, resultsQuery.isSuccess);

  const handleRun = async () => {
    setRateLimit(null);
    try {
      await runSearch.mutateAsync(id);
    } catch (error) {
      if (isRateLimitError(error)) setRateLimit({ minutes: getRetryAfterMinutes(error) });
      else void dialog.alert(t('search.runFailed'), errorMessage(error));
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([searchQuery.refetch(), resultsQuery.refetch()]);
    setRefreshing(false);
  };

  const handleDeleteSelected = async () => {
    const ids = [...selection.ids];
    if (ids.length === 0) return;
    const confirmed = await dialog.confirm({
      title: t('search.removeResultsTitle'),
      message: t('search.removeResultsMessage', { count: ids.length }),
      confirmLabel: t('search.removeResults'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await bulkResults.mutateAsync({ ids, action: 'delete' });
      selection.exit();
    } catch (error) {
      void dialog.alert(t('common.retry'), errorMessage(error));
    }
  };

  const handleDeleteSearch = async () => {
    const confirmed = await dialog.confirm({
      title: t('search.deleteSearch'),
      message: t('search.deleteSearchMessage'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteSearch.mutateAsync(id);
      router.back();
    } catch (error) {
      void dialog.alert(t('common.retry'), errorMessage(error));
    }
  };

  const goBack = () => router.back();

  if (searchQuery.isPending) {
    return (
      <Screen edges={STACK_EDGES}>
        <BrandHeader onBack={goBack} />
        <LoadingState />
      </Screen>
    );
  }

  if (!search) {
    const notFound = isApiError(searchQuery.error) && searchQuery.error.status === 404;
    return (
      <Screen edges={STACK_EDGES}>
        <BrandHeader onBack={goBack} />
        {notFound ? (
          <EmptyState icon="search-off" title={t('search.notFound')} />
        ) : (
          <ErrorState message={errorMessage(searchQuery.error)} onRetry={() => void searchQuery.refetch()} />
        )}
      </Screen>
    );
  }

  const runState = getRunState(search.last_run_status);

  const renderEmpty = () => {
    if (resultsQuery.isPending) return <LoadingState style={styles.empty} />;
    if (resultsQuery.isError) {
      return <ErrorState message={errorMessage(resultsQuery.error)} onRetry={() => void resultsQuery.refetch()} style={styles.empty} />;
    }
    if (runState === 'running') return null;
    if (runState === 'no_provider') {
      return (
        <EmptyState
          icon="cloud-off"
          title={t('search.noProviderTitle')}
          text={t('search.noProviderMessage')}
          style={styles.empty}
        />
      );
    }
    return (
      <EmptyState
        icon="inbox"
        title={t(search.category === 'immobili' ? 'search.noVerifiedListings' : 'search.noResultsTitle')}
        text={t(search.category === 'immobili' ? 'search.propertyVerificationHint' : 'search.noResultsHint')}
        style={styles.empty}
      />
    );
  };

  return (
    <Screen edges={STACK_EDGES}>
      <BrandHeader
        onBack={goBack}
        right={
          selection.active ? null : (
            <View style={styles.headerActions}>
              {results.length > 0 ? (
                <IconButton icon="checklist" onPress={() => selection.start()} accessibilityLabel={t('search.select')} />
              ) : null}
              <IconButton
                icon="delete-outline"
                color={colors.danger}
                onPress={handleDeleteSearch}
                accessibilityLabel={t('search.deleteSearch')}
              />
            </View>
          )
        }
      />

      {selection.active ? (
        <SelectionBar
          count={selection.ids.size}
          total={results.length}
          onCancel={selection.exit}
          onToggleAll={() => selection.toggleAll(results.map((result) => result.id))}
          actions={
            <Button
              label={t('search.removeResults')}
              icon="visibility-off"
              variant="danger"
              fullWidth={false}
              disabled={selection.ids.size === 0}
              loading={bulkResults.isPending}
              onPress={handleDeleteSelected}
              testID="delete-selected"
            />
          }
        />
      ) : null}

      <FlatList<Result>
        data={results}
        keyExtractor={(item) => item.id}
        extraData={[selection.ids, selection.active, readAloud.playingId]}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <SearchPanel
            search={search}
            resultsCount={results.length}
            rateLimit={rateLimit}
            runPending={runSearch.isPending}
            isReadingAll={readAloud.readingIndex !== null}
            onRun={handleRun}
            onReadAll={() => void readAloud.readAll()}
            onStopReading={readAloud.stop}
            onToggleActive={(isActive) => toggleActive.mutate({ id: search.id, isActive })}
          />
        }
        ListEmptyComponent={renderEmpty() ?? undefined}
        ListFooterComponent={<ListFooter loading={resultsQuery.isFetchingNextPage} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        onEndReached={() => {
          if (resultsQuery.hasNextPage && !resultsQuery.isFetchingNextPage) void resultsQuery.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ResultCard
            result={item}
            isPlaying={readAloud.playingId === item.id}
            onTogglePlay={(result) => void readAloud.playOne(result)}
            onToggleFavorite={(result) =>
              toggleFavorite.mutate({ id: result.id, isFavorite: !result.is_favorite })
            }
            selectionMode={selection.active}
            selected={selection.isSelected(item.id)}
            onToggleSelect={selection.toggle}
            onLongPress={selection.start}
          />
        )}
      />

      <ContinueModal
        visible={readAloud.askContinue}
        index={readAloud.readingIndex}
        total={results.length}
        onAnswer={readAloud.answerContinue}
      />
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, flexGrow: 1 },
  separator: { height: spacing.md },
  empty: { paddingTop: spacing.xxl },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
});
