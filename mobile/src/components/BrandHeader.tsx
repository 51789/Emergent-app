import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { colors, TOUCH_TARGET } from '@/theme';

import { BrandLogo } from './BrandLogo';
import { IconButton } from './IconButton';

interface BrandHeaderProps {
  /** Shows a back arrow on the left. Ignored if `left` is provided. */
  onBack?: () => void;
  left?: ReactNode;
  right?: ReactNode;
  /** Logo height in dp. */
  logoHeight?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Header shown on top of every functional screen:
 * `[left action]  Consulens (always centred)  [right action]`.
 * The logo is absolutely centred so it stays centred whatever the side slots contain.
 */
export function BrandHeader({ onBack, left, right, logoHeight = 32, style }: BrandHeaderProps) {
  const { t } = useTranslation();

  return (
    <View style={[styles.container, style]}>
      <View style={styles.side}>
        {left ??
          (onBack ? (
            <IconButton icon="arrow-back" onPress={onBack} accessibilityLabel={t('common.back')} />
          ) : null)}
      </View>
      <View style={styles.center} pointerEvents="none">
        <BrandLogo height={logoHeight} />
      </View>
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 52,
    paddingHorizontal: 4,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  side: { minWidth: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center' },
  sideRight: { justifyContent: 'flex-end' },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
