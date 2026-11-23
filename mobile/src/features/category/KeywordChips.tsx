import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { CategoryId, LanguageCode } from '@/api/types';
import { AppText } from '@/components/AppText';
import { CATEGORY_KEYWORDS } from '@/constants/keywords';
import { colors, radius, spacing } from '@/theme';
import { chipToSnippet } from '@/utils/keywordChip';

interface KeywordChipsProps {
  categoryId: CategoryId;
  language: LanguageCode;
  /** Called with the snippet to append to the request (e.g. `PREZZO: `). */
  onPick: (snippet: string) => void;
}

/** Example "what to include" chips for the category, in the current language. Tap = insert in the box. */
export function KeywordChips({ categoryId, language, onPick }: KeywordChipsProps) {
  const { t } = useTranslation();
  const chips = CATEGORY_KEYWORDS[categoryId]?.[language] ?? CATEGORY_KEYWORDS[categoryId]?.it ?? [];

  return (
    <View style={styles.section}>
      <AppText variant="subheading" style={styles.title} testID="keywords-title">
        {t('category.keywordsTitle')}
      </AppText>
      <View style={styles.list}>
        {chips.map((chip) => (
          <Pressable
            key={chip.text}
            onPress={() => onPick(chipToSnippet(chip.text))}
            accessibilityRole="button"
            accessibilityLabel={chip.text}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <MaterialIcons name={chip.icon} size={20} color={colors.primary} />
            </View>
            <AppText variant="captionStrong" style={styles.chipText}>
              {chip.text}
            </AppText>
          </Pressable>
        ))}
      </View>
      <View style={styles.hint}>
        <MaterialIcons name="info-outline" size={16} color={colors.textSubtle} />
        <AppText variant="caption" color="textSubtle" style={styles.hintText}>
          {t('category.keywordsHint')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  title: { letterSpacing: 0.5 },
  list: { gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pressed: { opacity: 0.65 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { flex: 1 },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  hintText: { flex: 1 },
});
