import { Platform, type TextStyle } from 'react-native';

/**
 * Browsers draw their own focus outline on text inputs. Our inputs draw a navy focus ring on the
 * surrounding row instead, so the native outline is switched off on web (`none` is a CSS-only value,
 * hence the cast, and it is never applied on iOS/Android).
 */
export const webNoOutline: TextStyle = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : {};
