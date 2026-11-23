import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, textVariants, type ColorToken, type TextVariant } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: ColorToken;
  align?: TextStyle['textAlign'];
}

/** Themed text: typography variant + colour token. Use this instead of raw `Text`. */
export function AppText({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[textVariants[variant], { color: colors[color] }, align ? { textAlign: align } : null, style]}
    />
  );
}
