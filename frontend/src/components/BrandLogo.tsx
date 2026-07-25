import React from 'react';
import { View, Text, StyleSheet, Platform, TextStyle } from 'react-native';

/**
 * CONNECTA brand wordmark.
 *
 * Renders the word "CONNECT" followed by a **rotated 'A'** (180°).
 * The rotation is applied only to the last letter so the rest of the
 * wordmark stays perfectly readable — it's the brand's distinctive mark.
 *
 * Usage:
 *   <BrandLogo size={64} color="#0A0A0A" />
 */

interface BrandLogoProps {
  size?: number;
  color?: string;
  letterSpacing?: number;
  style?: TextStyle;
  testID?: string;
}

const FONT_BOLD = Platform.select({
  ios: 'Inter-ExtraBold',
  android: 'Inter-ExtraBold',
  default: 'Inter-ExtraBold, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 32,
  color = '#0A0A0A',
  letterSpacing = 2,
  style,
  testID,
}) => {
  const baseStyle: TextStyle = {
    fontFamily: FONT_BOLD,
    fontSize: size,
    fontWeight: '800',
    color,
    letterSpacing,
    ...style,
  };

  return (
    <View style={styles.row} testID={testID ?? 'brand-logo'}>
      <Text style={baseStyle}>CONNECT</Text>
      <Text
        style={[
          baseStyle,
          {
            // Rotate the last "A" 180° — the distinctive brand mark.
            transform: [{ rotate: '180deg' }],
            // With rotation the visual optical spacing feels off — nudge slightly.
            marginLeft: letterSpacing,
            // Slightly bump down so the rotated A sits on the baseline nicely.
            lineHeight: size,
          },
        ]}
      >
        A
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
