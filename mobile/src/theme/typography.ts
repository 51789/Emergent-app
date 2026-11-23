import { type TextStyle } from 'react-native';

/**
 * Montserrat (the geometric sans of the Consulens logo) for the whole UI. The four weights are
 * registered in `app/_layout.tsx` from `@expo-google-fonts/montserrat`. Each weight is a separate
 * font file, so pick the family here instead of relying on `fontWeight` (inconsistent with custom fonts).
 */
export const fonts = {
  regular: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  semibold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
} as const;

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'captionStrong'
  | 'label'
  | 'overline'
  | 'tagline';

export const textVariants: Record<TextVariant, TextStyle> = {
  display: { fontFamily: fonts.semibold, fontSize: 26, lineHeight: 32 },
  title: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 27 },
  heading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  subheading: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 21 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  captionStrong: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17 },
  label: { fontFamily: fonts.bold, fontSize: 10.5, lineHeight: 14, letterSpacing: 0.6 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, letterSpacing: 1.2 },
  /** The logo tagline: regular, wide tracking. */
  tagline: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, letterSpacing: 2 },
};
