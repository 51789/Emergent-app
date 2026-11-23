import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { CategoryId } from '@/api/types';
import { AppText } from '@/components/AppText';
import { BrandHeader } from '@/components/BrandHeader';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { CATEGORIES } from '@/constants/categories';
import { ResultFeed } from '@/features/results/ResultFeed';
import { spacing } from '@/theme';

/** Starred results from every search, optionally filtered by category. */
export function FavoritesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [category, setCategory] = useState<CategoryId | undefined>(undefined);

  return (
    <Screen>
      <BrandHeader />
      <ResultFeed
        params={{ favorite: true, category }}
        emptyIcon="star-border"
        emptyTitle={t('favorites.emptyTitle')}
        emptyText={t('favorites.emptyText')}
        onPressResult={(result) => router.push({ pathname: '/search/[id]', params: { id: result.search_id } })}
        header={
          <View style={styles.header}>
            <AppText variant="title">{t('favorites.title')}</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              <Chip label={t('common.all')} selected={!category} onPress={() => setCategory(undefined)} />
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
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingBottom: spacing.lg },
  filters: { gap: spacing.sm, paddingVertical: spacing.xs },
});
