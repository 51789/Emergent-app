import React from 'react';
import { Text, StyleSheet, Platform } from 'react-native';

interface FlagCircleProps {
  flag: string; // emoji flag e.g. '🇮🇹'
  size?: number;
}

/**
 * Renders an emoji flag as-is, without a background circle, so the natural
 * shape and colours of the flag are fully visible.
 *
 * The `size` prop controls the rendered font size. We keep the component
 * name for backwards compatibility with existing call sites.
 */
export const FlagCircle: React.FC<FlagCircleProps> = ({ flag, size = 26 }) => {
  const fontSize = size;
  // On Android, emojis render slightly higher — pad the line height a touch.
  const lineHeight = Platform.OS === 'android' ? size + 4 : size + 2;

  return (
    <Text
      style={[styles.flag, { fontSize, lineHeight, width: size + 4 }]}
      allowFontScaling={false}
    >
      {flag}
    </Text>
  );
};

const styles = StyleSheet.create({
  flag: {
    textAlign: 'center',
    includeFontPadding: false,
  },
});
