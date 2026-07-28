import React from 'react';
import { View, Text, StyleSheet, Platform, TextStyle } from 'react-native';

/**
 * CONNECTa brand wordmark.
 *
 * Renders "CONNECT" (uppercase, Questrial) + a lowercase italic "a".
 * The trailing lowercase italic 'a' is the distinctive brand mark.
 *
 * Font: **Questrial** — a clean geometric sans-serif loaded via expo-font in
 * `_layout.tsx` from `assets/fonts/Questrial-Regular.ttf`.
 *
 * Usage:
 *   <BrandLogo size={64} color="#2E2E2E" />
 */

interface BrandLogoProps {
  size?: number;
  color?: string;
  /** Letter spacing for the uppercase "CONNECT". Defaults to a subtle 1.5. */
  letterSpacing?: number;
  style?: TextStyle;
  testID?: string;
}

// Questrial is a single-weight font. We rely on OS/RN italic synthesis for the
// trailing lowercase "a" — this produces a natural cursive slant on web and
// works cross-platform.
const QUESTRIAL_FAMILY = Platform.select({
  ios: 'Questrial',
  android: 'Questrial',
  default: 'Questrial, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 32,
  color = '#2E2E2E',
  letterSpacing = 1.5,
  style,
  testID,
}) => {
  const baseStyle: TextStyle = {
    fontFamily: QUESTRIAL_FAMILY,
    fontSize: size,
    // Questrial has only Regular; force weight to normal so RN Web doesn't
    // synthesise a bold that would break the geometric look.
    fontWeight: '400',
    color,
    letterSpacing,
    // Baseline alignment inside the row
    includeFontPadding: false,
    // Prevent line-height inflation on Android
    lineHeight: size * 1.1,
    ...style,
  };

  return (
    <View style={styles.row} testID={testID ?? 'brand-logo'}>
      <Text style={baseStyle} allowFontScaling={false}>
        CONNECT
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          baseStyle,
          {
            fontStyle: 'italic',
            // Tighten spacing between the T and the italic 'a'
            letterSpacing: 0,
            marginLeft: 0,
          },
        ]}
      >
        a
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
});
