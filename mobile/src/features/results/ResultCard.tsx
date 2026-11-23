import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Result } from '@/api/types';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { getCategory } from '@/constants/categories';
import { colors, radius, shadow, spacing } from '@/theme';

import { ContactsBlock, ResultChips, SourceRow } from './ResultDetails';

export interface ResultCardProps {
  result: Result;
  isPlaying?: boolean;
  onTogglePlay?: (result: Result) => void;
  onToggleFavorite?: (result: Result) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onLongPress?: (id: string) => void;
  /** Tapping the card body (used by lists that navigate to the parent search). */
  onPress?: (result: Result) => void;
  /** Shows the category name above the title (cross-search lists). */
  showCategory?: boolean;
}

const useNativeDriver = Platform.OS !== 'web';

/** One announcement: title, summary, status, dates, source, contacts, favorite star and read-aloud. */
export function ResultCard({
  result,
  isPlaying = false,
  onTogglePlay,
  onToggleFavorite,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onLongPress,
  onPress,
  showCategory = false,
}: ResultCardProps) {
  const { t } = useTranslation();
  const [starScale] = useState(() => new Animated.Value(1));
  const category = getCategory(result.category);

  const bounceStar = () => {
    starScale.setValue(1);
    Animated.sequence([
      Animated.timing(starScale, { toValue: 1.4, duration: 130, easing: Easing.out(Easing.cubic), useNativeDriver }),
      Animated.timing(starScale, { toValue: 1, duration: 180, easing: Easing.out(Easing.back(2)), useNativeDriver }),
    ]).start();
  };

  const handleFavorite = () => {
    bounceStar();
    onToggleFavorite?.(result);
  };

  const handlePress = () => {
    if (selectionMode) onToggleSelect?.(result.id);
    else onPress?.(result);
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={() => onLongPress?.(result.id)}
      delayLongPress={350}
      disabled={!selectionMode && !onPress && !onLongPress}
      accessibilityState={{ selected: selectionMode ? selected : undefined }}
      style={[styles.card, selected && styles.cardSelected]}
      testID={`result-card-${result.id}`}
    >
      {selectionMode ? (
        <MaterialIcons
          name={selected ? 'check-circle' : 'radio-button-unchecked'}
          size={24}
          color={selected ? colors.primary : colors.borderStrong}
          style={styles.checkbox}
          accessibilityLabel={t('result.select')}
        />
      ) : null}

      <View style={styles.body}>
        {showCategory && category ? (
          <AppText variant="overline" color="primary" numberOfLines={1}>
            {t(`categories.${category.id}`)}
          </AppText>
        ) : null}

        <View style={styles.titleRow}>
          <View style={styles.titleCol}>
            {!result.seen ? <Badge label={t('result.new')} tone="alert" style={styles.newBadge} /> : null}
            <AppText variant="heading" numberOfLines={3}>
              {result.title}
            </AppText>
          </View>
          {!selectionMode ? (
            <View style={styles.actions}>
              {onTogglePlay ? (
                <Pressable
                  onPress={() => onTogglePlay(result)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? t('result.stop') : t('result.play')}
                  style={styles.actionButton}
                  testID={`play-button-${result.id}`}
                >
                  <MaterialIcons
                    name={isPlaying ? 'stop-circle' : 'play-circle-filled'}
                    size={28}
                    color={isPlaying ? colors.alert : colors.primary}
                  />
                </Pressable>
              ) : null}
              {onToggleFavorite ? (
                <Pressable
                  onPress={handleFavorite}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={result.is_favorite ? t('result.removeFavorite') : t('result.addFavorite')}
                  accessibilityState={{ selected: result.is_favorite }}
                  style={styles.actionButton}
                  testID={`favorite-button-${result.id}`}
                >
                  <Animated.View style={{ transform: [{ scale: starScale }] }}>
                    <MaterialIcons
                      name={result.is_favorite ? 'star' : 'star-border'}
                      size={28}
                      color={result.is_favorite ? colors.star : colors.borderStrong}
                    />
                  </Animated.View>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.summaryRow}>
          <AppText variant="body" color="textMuted" style={styles.summary}>
            {result.summary}
          </AppText>
          {result.image_url ? (
            <Image
              source={{ uri: result.image_url }}
              style={styles.thumbnail}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}
        </View>

        <ResultChips result={result} />
        <SourceRow result={result} />
        <ContactsBlock result={result} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  checkbox: { marginRight: spacing.md, marginTop: 2 },
  body: { flex: 1, gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  titleCol: { flex: 1, gap: 4 },
  newBadge: { alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: -2 },
  actionButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  summaryRow: { flexDirection: 'row', gap: spacing.md },
  summary: { flex: 1 },
  thumbnail: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surface },
});
