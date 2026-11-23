export { colors, type ColorToken } from './colors';
export { radius, spacing, TOUCH_TARGET } from './spacing';
export { fonts, textVariants, type TextVariant } from './typography';

/** Shared elevation used by cards. Kept subtle: the UI is flat and white, borders do most of the work. */
export const shadow = {
  card: {
    shadowColor: '#0C2038',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
} as const;
