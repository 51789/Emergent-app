import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSearchCounts, useUnseenCount } from '@/api/hooks';
import { AppText } from '@/components/AppText';
import { BrandHeader } from '@/components/BrandHeader';
import { LanguageModal } from '@/components/LanguageModal';
import { NotificationBell } from '@/components/NotificationBell';
import { Screen } from '@/components/Screen';
import { CATEGORIES } from '@/constants/categories';
import { useChangeLanguage } from '@/features/settings/usePreferenceSync';
import { getLanguageOption } from '@/i18n/languages';
import { usePrefs } from '@/store/prefs';
import { colors, radius, spacing } from '@/theme';

import { CategoryTile } from './CategoryTile';

const COLUMNS = 2;

/** Home: category grid with per-category badges, notification bell and "Gestisci ricerche". */
export function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const language = usePrefs((state) => state.language);
  const changeLanguage = useChangeLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const counts = useSearchCounts();
  const unseen = useUnseenCount();
  const totalActive = CATEGORIES.reduce((sum, { id }) => sum + (counts.data?.[id]?.active ?? 0), 0);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([counts.refetch(), unseen.refetch()]);
    setRefreshing(false);
  };

  const rows = Array.from({ length: Math.ceil(CATEGORIES.length / COLUMNS) }, (_, index) =>
    CATEGORIES.slice(index * COLUMNS, (index + 1) * COLUMNS),
  );

  return (
    <Screen>
      <BrandHeader
        left={
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('home.changeLanguage')}
            style={styles.language}
            hitSlop={6}
            testID="language-button"
          >
            <AppText style={styles.flag}>{getLanguageOption(language).flag}</AppText>
            <MaterialIcons name="arrow-drop-down" size={20} color={colors.textMuted} />
          </Pressable>
        }
        right={<NotificationBell count={unseen.data ?? 0} onPress={() => router.navigate('/notifications')} />}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <AppText variant="title" align="center" style={styles.question}>
          {t('home.title')}
        </AppText>

        <View style={styles.grid}>
          {rows.map((row) => (
            <View key={row[0].id} style={styles.row}>
              {row.map((category) => (
                <CategoryTile
                  key={category.id}
                  category={category}
                  active={counts.data?.[category.id]?.active ?? 0}
                  unseen={counts.data?.[category.id]?.unseen ?? 0}
                  onPress={() => router.push({ pathname: '/category/[id]', params: { id: category.id } })}
                />
              ))}
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => router.push('/manage')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.manage, pressed && styles.pressed]}
          testID="manage-searches-button"
        >
          <MaterialIcons name="tune" size={24} color={colors.primary} />
          <View style={styles.manageText}>
            <AppText variant="bodyStrong">{t('home.manageSearches')}</AppText>
            <AppText variant="caption" color="textMuted">
              {t('home.activeSearches', { count: totalActive })}
            </AppText>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.textSubtle} />
        </Pressable>
      </ScrollView>

      <LanguageModal
        visible={pickerOpen}
        selected={language}
        onSelect={changeLanguage}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  question: { marginVertical: spacing.sm },
  grid: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  language: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.sm, minHeight: 44 },
  flag: { fontSize: 22, lineHeight: 28 },
  manage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  manageText: { flex: 1 },
  pressed: { opacity: 0.7 },
});
