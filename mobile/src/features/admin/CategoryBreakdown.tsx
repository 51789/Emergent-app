import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { AnalyticsCategories } from '@/api/types';
import { AppText } from '@/components/AppText';
import { BarChart } from '@/components/charts/BarChart';
import { getCategory } from '@/constants/categories';
import { colors, spacing } from '@/theme';
import { formatNumber } from '@/utils/format';

interface CategoryBreakdownProps {
  items: AnalyticsCategories['items'];
  locale: string;
}

/** Searches per category as a bar chart (x-axis = legend index) plus a legend with searches / results. */
export function CategoryBreakdown({ items, locale }: CategoryBreakdownProps) {
  const { t } = useTranslation();
  const data = items.map((item, index) => ({ label: String(index + 1), value: item.searches }));

  return (
    <View style={styles.wrapper}>
      <BarChart data={data} color={colors.primary} showValues emptyLabel={t('admin.noData')} />
      <View style={styles.legend}>
        {items.map((item, index) => {
          const category = getCategory(item.category);
          return (
            <View key={item.category} style={styles.row}>
              <AppText variant="captionStrong" color="textSubtle" style={styles.index}>
                {index + 1}
              </AppText>
              {category ? <MaterialIcons name={category.icon} size={18} color={colors.primary} /> : null}
              <AppText variant="caption" style={styles.label} numberOfLines={1}>
                {t(`categories.${item.category}`)}
              </AppText>
              <AppText variant="captionStrong">{formatNumber(item.searches, locale)}</AppText>
              <AppText variant="caption" color="textSubtle" style={styles.results}>
                {t('admin.results')}: {formatNumber(item.results, locale)}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.md },
  legend: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  index: { width: 16 },
  label: { flex: 1 },
  results: { minWidth: 96, textAlign: 'right' },
});
