import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

interface FlagCircleProps {
  flag: string; // emoji flag e.g. '🇮🇹'
  size?: number;
}

/**
 * Compact circular flag badge.
 *
 * Uses OS-provided emoji flags (no external assets or fonts). On Android,
 * emoji flag glyphs are supported natively from API 24+. Wrapping in a
 * clipped circle keeps a consistent visual footprint across languages.
 */
export const FlagCircle: React.FC<FlagCircleProps> = ({ flag, size = 28 }) => {
  const borderRadius = size / 2;
  // Emojis need to be sized ~1.15x the circle to fill nicely
  const fontSize = Math.round(size * 1.15);
  // Adjust line height for Android where emojis render slightly higher
  const lineHeight = Platform.OS === 'android' ? size + 2 : fontSize;

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius }]}
    >
      <Text
        style={[
          styles.flag,
          { fontSize, lineHeight },
        ]}
        allowFontScaling={false}
      >
        {flag}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  circle: {
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  flag: {
    textAlign: 'center',
    // Cross-platform vertical centering
    includeFontPadding: false,
  },
});
