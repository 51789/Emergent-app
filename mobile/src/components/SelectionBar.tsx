import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, spacing } from '@/theme';

import { AppText } from './AppText';

interface SelectionBarProps {
  count: number;
  total: number;
  onCancel: () => void;
  onToggleAll: () => void;
  /** Bulk action buttons (delete, activate, ...). */
  actions: ReactNode;
}

/** Bar shown while multi-selecting: close, "N selected", select all, and the bulk actions. */
export function SelectionBar({ count, total, onCancel, onToggleAll, actions }: SelectionBarProps) {
  const { t } = useTranslation();
  const allSelected = count === total && total > 0;

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onCancel}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('search.cancelSelection')}
      >
        <MaterialIcons name="close" size={24} color={colors.text} />
      </Pressable>
      <AppText variant="bodyStrong" style={styles.count}>
        {t('search.selected', { count })}
      </AppText>
      <Pressable onPress={onToggleAll} hitSlop={8} accessibilityRole="button">
        <AppText variant="bodyStrong" color="primary">
          {allSelected ? t('common.deselectAll') : t('common.selectAll')}
        </AppText>
      </Pressable>
      <View style={styles.actions}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primarySoft,
  },
  count: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
