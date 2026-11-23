import { Fragment } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, textVariants } from '@/theme';
import { splitTagline } from '@/utils/tagline';

interface BrandTaglineProps {
  size?: number;
  style?: StyleProp<TextStyle>;
}

/**
 * The logo tagline ("Report • Analisi • Ricerche", localised): Montserrat Regular, navy, wide letter
 * spacing, with the bullets in the logo's slate grey.
 */
export function BrandTagline({ size = 12, style }: BrandTaglineProps) {
  const { t } = useTranslation();
  const tagline = t('brand.tagline');
  const words = splitTagline(tagline);

  return (
    <Text
      accessibilityLabel={tagline}
      style={[
        textVariants.tagline,
        { color: colors.text, fontSize: size, lineHeight: size * 1.6, textAlign: 'center' },
        style,
      ]}
    >
      {words.map((word, index) => (
        <Fragment key={word}>
          {index > 0 ? <Text style={{ color: colors.slate }}>{'  •  '}</Text> : null}
          {word}
        </Fragment>
      ))}
    </Text>
  );
}
