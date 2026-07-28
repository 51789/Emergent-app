import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BrandLogo } from './BrandLogo';

/**
 * Shared brand header shown at the top of every "function" screen.
 *
 * Layout (44pt-safe touch targets on the sides):
 *   [ left action ]       [ CONNECTa logo — centered ]       [ right action ]
 *
 * The logo is always centered regardless of what's on the sides thanks to
 * absolute-centered layout of the middle slot.
 */

interface BrandHeaderProps {
  onBack?: () => void;
  leftIcon?: keyof typeof MaterialIcons.glyphMap;
  onLeftPress?: () => void;
  rightIcon?: keyof typeof MaterialIcons.glyphMap;
  onRightPress?: () => void;
  right?: React.ReactNode; // Custom right slot (overrides rightIcon)
  left?: React.ReactNode; // Custom left slot (overrides back/leftIcon)
  logoSize?: number;
  style?: ViewStyle;
  testID?: string;
}

export const BrandHeader: React.FC<BrandHeaderProps> = ({
  onBack,
  leftIcon,
  onLeftPress,
  rightIcon,
  onRightPress,
  right,
  left,
  logoSize = 22,
  style,
  testID,
}) => {
  const showBack = !!onBack && !left;
  const showLeftIcon = !!leftIcon && !!onLeftPress && !left;

  return (
    <View style={[styles.container, style]} testID={testID ?? 'brand-header'}>
      {/* Left slot */}
      <View style={styles.side}>
        {left
          ? left
          : showBack
            ? (
              <TouchableOpacity
                onPress={onBack}
                style={styles.iconBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID="brand-header-back"
              >
                <MaterialIcons name="arrow-back" size={26} color="#333" />
              </TouchableOpacity>
            )
            : showLeftIcon
              ? (
                <TouchableOpacity
                  onPress={onLeftPress}
                  style={styles.iconBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons name={leftIcon!} size={26} color="#333" />
                </TouchableOpacity>
              )
              : null}
      </View>

      {/* Absolute-centered logo */}
      <View style={styles.centerWrap} pointerEvents="none">
        <BrandLogo size={logoSize} color="#2E2E2E" letterSpacing={1} />
      </View>

      {/* Right slot */}
      <View style={[styles.side, styles.sideRight]}>
        {right
          ? right
          : rightIcon && onRightPress
            ? (
              <TouchableOpacity
                onPress={onRightPress}
                style={styles.iconBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons name={rightIcon} size={26} color="#333" />
              </TouchableOpacity>
            )
            : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 52,
    paddingHorizontal: 8,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  side: {
    minWidth: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
