import { useState, type ReactElement } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { flattenPages } from '@/api/cache';
import { useResultList, useToggleFavorite } from '@/api/hooks';
import type { Result, ResultListParams } from '@/api/types';
import type { IconName } from '@/constants/icons';
import { EmptyState, ErrorState, ListFooter, LoadingState } from '@/components/StateViews';
import { useReadAloud } from '@/features/speech/useReadAloud';
import { useErrorMessage } from '@/i18n/useErrorMessage';
import { colors, spacing } from '@/theme';

import { ResultCard } from './ResultCard';

interface ResultFeedProps {
  params: Omit<ResultListParams, 'cursor' | 'limit'>;
  header?: ReactElement | null;
  emptyIcon: IconName;
  emptyTitle: string;
  emptyText: string;
  /** Tapping a card (e.g. open the parent search). */
  onPressResult?: (result: Result) => void;
}

/** Infinite, pull-to-refresh list of results across searches (favorites, notifications). */
export function ResultFeed({ params, header, emptyIcon, emptyTitle, emptyText, onPressResult }: ResultFeedProps) {
  const errorMessage = useErrorMessage();
  const feed = useResultList(params);
  const items = flattenPages(feed.data);
  const readAloud = useReadAloud(items);
  const toggleFavorite = useToggleFavorite();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await feed.refetch();
    setRefreshing(false);
  };

  return (
    <FlatList<Result>
      data={items}
      keyExtractor={(item) => item.id}
      extraData={readAloud.playingId}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={header ?? undefined}
      ListEmptyComponent={
        feed.isPending ? (
          <LoadingState style={styles.empty} />
        ) : feed.isError ? (
          <ErrorState message={errorMessage(feed.error)} onRetry={() => void feed.refetch()} style={styles.empty} />
        ) : (
          <EmptyState icon={emptyIcon} title={emptyTitle} text={emptyText} style={styles.empty} />
        )
      }
      ListFooterComponent={<ListFooter loading={feed.isFetchingNextPage} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      onEndReached={() => {
        if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
      renderItem={({ item }) => (
        <ResultCard
          result={item}
          showCategory
          isPlaying={readAloud.playingId === item.id}
          onTogglePlay={(result) => void readAloud.playOne(result)}
          onToggleFavorite={(result) => toggleFavorite.mutate({ id: result.id, isFavorite: !result.is_favorite })}
          onPress={onPressResult}
        />
      )}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  separator: { height: spacing.md },
  empty: { paddingTop: spacing.xxl },
});
