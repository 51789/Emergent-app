import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { CategoryDefinition } from '@/constants/categories';
import { colors, radius, spacing } from '@/theme';
import { AppText } from '@/components/AppText';

interface CategoryTileProps {
  category: CategoryDefinition;
  /** Active searches in this category. */
  active: number;
  /** Results not yet seen by the user in this category. */
  unseen: number;
  onPress: () => void;
}

/** Home grid tile: icon, localised label, active-searches counter and a red "+N new results" badge. */
export function CategoryTile({ category, active, unseen, onPress }: CategoryTileProps) {
  const { t } = useTranslation();
  const label = t(`categories.${category.id}`);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('home.tileA11y', { label, active, unseen })}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      testID={`category-tile-${category.id}`}
    >
      {unseen > 0 ? (
        <View style={styles.newBadge} testID={`new-badge-${category.id}`}>
          <AppText variant="label" style={styles.newBadgeText}>
            +{unseen > 99 ? '99' : unseen}
          </AppText>
        </View>
      ) : null}
      <MaterialIcons name={category.icon} size={36} color={active > 0 ? colors.primary : colors.textMuted} />
      <AppText variant="captionStrong" align="center" style={styles.label} numberOfLines={3}>
        {label}
      </AppText>
      <AppText variant="caption" color={active > 0 ? 'primary' : 'textSubtle'} align="center" numberOfLines={1}>
        {active > 0 ? t('home.activeSearches', { count: active }) : ' '}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 132,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pressed: { opacity: 0.7 },
  label: { letterSpacing: 0.3 },
  newBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 26,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.alert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBadgeText: { color: colors.onPrimary, letterSpacing: 0 },
});
