import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { flattenPages } from '@/api/cache';
import { useBulkSearches, useSearchList, useToggleSearchActive } from '@/api/hooks';
import type { CategoryId, Search, SearchBulkAction } from '@/api/types';
import { AppText } from '@/components/AppText';
import { BrandHeader } from '@/components/BrandHeader';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { dialog } from '@/components/dialog/dialog';
import { IconButton } from '@/components/IconButton';
import { Screen, STACK_EDGES } from '@/components/Screen';
import { SelectionBar } from '@/components/SelectionBar';
import { EmptyState, ErrorState, ListFooter, LoadingState } from '@/components/StateViews';
import { CATEGORIES } from '@/constants/categories';
import { SearchCard } from '@/features/search/SearchCard';
import { useSelection } from '@/hooks/useSelection';
import { useErrorMessage } from '@/i18n/useErrorMessage';
import { colors, spacing } from '@/theme';

/** All searches in one place: pause/resume, filter by category, bulk activate / deactivate / delete. */
export function ManageScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const errorMessage = useErrorMessage();

  const [category, setCategory] = useState<CategoryId | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const searches = useSearchList({ category });
  const items = flattenPages(searches.data);

  const toggleActive = useToggleSearchActive();
  const bulk = useBulkSearches();
  const selection = useSelection();

  const runBulk = async (action: SearchBulkAction) => {
    const ids = [...selection.ids];
    if (ids.length === 0) return;
    if (action === 'delete') {
      const confirmed = await dialog.confirm({
        title: t('manage.deleteTitle'),
        message: t('manage.deleteMessage', { count: ids.length }),
        confirmLabel: t('common.delete'),
        destructive: true,
      });
      if (!confirmed) return;
    }
    try {
      await bulk.mutateAsync({ ids, action });
      selection.exit();
    } catch (error) {
      void dialog.alert(t('common.retry'), errorMessage(error));
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await searches.refetch();
    setRefreshing(false);
  };

  const hasSelection = selection.ids.size > 0;

  return (
    <Screen edges={STACK_EDGES}>
      <BrandHeader
        onBack={() => router.back()}
        right={
          !selection.active && items.length > 0 ? (
            <IconButton icon="checklist" onPress={() => selection.start()} accessibilityLabel={t('search.select')} />
          ) : null
        }
      />

      {selection.active ? (
        <SelectionBar
          count={selection.ids.size}
          total={items.length}
          onCancel={selection.exit}
          onToggleAll={() => selection.toggleAll(items.map((item) => item.id))}
          actions={
            <>
              <IconButton
                icon="play-circle-outline"
                color={colors.success}
                disabled={!hasSelection || bulk.isPending}
                onPress={() => void runBulk('activate')}
                accessibilityLabel={t('manage.activate')}
              />
              <IconButton
                icon="pause-circle-outline"
                color={colors.warning}
                disabled={!hasSelection || bulk.isPending}
                onPress={() => void runBulk('deactivate')}
                accessibilityLabel={t('manage.deactivate')}
              />
              <IconButton
                icon="delete-outline"
                color={colors.danger}
                disabled={!hasSelection || bulk.isPending}
                onPress={() => void runBulk('delete')}
                accessibilityLabel={t('common.delete')}
              />
            </>
          }
        />
      ) : null}

      <FlatList<Search>
        data={items}
        keyExtractor={(item) => item.id}
        extraData={[selection.ids, selection.active]}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppText variant="title">{t('manage.title')}</AppText>
            <AppText variant="body" color="textMuted">
              {t('manage.hint')}
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              <Chip label={t('manage.filterAll')} selected={!category} onPress={() => setCategory(undefined)} />
              {CATEGORIES.map(({ id, icon }) => (
                <Chip
                  key={id}
                  icon={icon}
                  label={t(`categories.${id}`)}
                  selected={category === id}
                  onPress={() => setCategory(id)}
                />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          searches.isPending ? (
            <LoadingState style={styles.empty} />
          ) : searches.isError ? (
            <ErrorState message={errorMessage(searches.error)} onRetry={() => void searches.refetch()} style={styles.empty} />
          ) : (
            <EmptyState
              icon="manage-search"
              title={t('manage.emptyTitle')}
              text={t('manage.emptyText')}
              style={styles.empty}
              action={<Button label={t('manage.goHome')} onPress={() => router.navigate('/')} fullWidth={false} />}
            />
          )
        }
        ListFooterComponent={<ListFooter loading={searches.isFetchingNextPage} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        onEndReached={() => {
          if (searches.hasNextPage && !searches.isFetchingNextPage) void searches.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <SearchCard
            search={item}
            showCategory
            onPress={() => router.push({ pathname: '/search/[id]', params: { id: item.id } })}
            onToggleActive={(search, isActive) => toggleActive.mutate({ id: search.id, isActive })}
            selectionMode={selection.active}
            selected={selection.isSelected(item.id)}
            onToggleSelect={selection.toggle}
            onLongPress={selection.start}
          />
        )}
      />
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, flexGrow: 1 },
  header: { gap: spacing.md, paddingBottom: spacing.lg },
  filters: { gap: spacing.sm, paddingVertical: spacing.xs },
  separator: { height: spacing.md },
  empty: { paddingTop: spacing.xxl },
});
