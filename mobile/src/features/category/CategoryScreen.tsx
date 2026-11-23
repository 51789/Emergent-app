import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { flattenPages } from '@/api/cache';
import { useCreateSearch, useSearchList } from '@/api/hooks';
import { AppText } from '@/components/AppText';
import { BrandHeader } from '@/components/BrandHeader';
import { Button } from '@/components/Button';
import { dialog } from '@/components/dialog/dialog';
import { Screen, STACK_EDGES } from '@/components/Screen';
import { EmptyState } from '@/components/StateViews';
import { getCategory, isCategoryId } from '@/constants/categories';
import { SearchCard } from '@/features/search/SearchCard';
import { useErrorMessage } from '@/i18n/useErrorMessage';
import { usePrefs } from '@/store/prefs';
import { spacing } from '@/theme';
import { isPlanLimitError } from '@/utils/errors';
import { appendSnippet } from '@/utils/keywordChip';

import { KeywordChips } from './KeywordChips';
import { SearchComposer } from './SearchComposer';

/** Category page: describe what you want (typing or voice), pick example keywords, see your searches. */
export function CategoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const language = usePrefs((state) => state.language);
  const category = isCategoryId(id) ? getCategory(id) : undefined;

  const [query, setQuery] = useState('');
  const createSearch = useCreateSearch();
  const searches = useSearchList({ category: category?.id });
  const items = flattenPages(searches.data);

  if (!category) {
    return (
      <Screen edges={STACK_EDGES}>
        <BrandHeader onBack={() => router.back()} />
        <EmptyState icon="search-off" title={t('category.notFound')} />
      </Screen>
    );
  }

  const submit = async () => {
    const text = query.trim();
    if (!text || createSearch.isPending) return;
    try {
      const created = await createSearch.mutateAsync({ query: text, category: category.id, language });
      setQuery('');
      router.push({ pathname: '/search/[id]', params: { id: created.id } });
    } catch (error) {
      if (isPlanLimitError(error)) {
        const upgrade = await dialog.prompt({
          title: t('category.planLimitTitle'),
          message: t('category.planLimitMessage'),
          actionLabel: t('category.seePlans'),
        });
        if (upgrade) router.push('/subscribe');
      } else {
        void dialog.alert(t('common.retry'), errorMessage(error));
      }
    }
  };

  return (
    <Screen edges={STACK_EDGES}>
      <BrandHeader onBack={() => router.back()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="title" align="center" testID="category-title">
            {t(`categories.${category.id}`)}
          </AppText>

          <SearchComposer
            value={query}
            onChangeText={setQuery}
            onSubmit={submit}
            language={language}
            submitting={createSearch.isPending}
          />

          <KeywordChips
            categoryId={category.id}
            language={language}
            onPick={(snippet) => setQuery((current) => appendSnippet(current, snippet))}
          />

          <View style={styles.searches}>
            <AppText variant="heading">{t('category.yourSearches')}</AppText>
            {items.length === 0 && !searches.isLoading ? (
              <AppText variant="body" color="textMuted">
                {t('category.noSearches')}
              </AppText>
            ) : null}
            {items.map((search) => (
              <SearchCard
                key={search.id}
                search={search}
                onPress={() => router.push({ pathname: '/search/[id]', params: { id: search.id } })}
              />
            ))}
            {searches.hasNextPage ? (
              <Button
                label={t('common.loadMore')}
                variant="secondary"
                loading={searches.isFetchingNextPage}
                onPress={() => void searches.fetchNextPage()}
              />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.xl },
  searches: { gap: spacing.md },
});
