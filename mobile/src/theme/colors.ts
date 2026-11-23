/**
 * Colour tokens, derived from the Consulens logo:
 * navy `#0C2038` ("Consu", the lens, the tagline), slate `#7C8994` ("Lens") and light grey `#D4D9DE`
 * (the lens highlight) on white. Navy is the primary colour; slate is for decoration and large elements.
 *
 * Contrast (WCAG): every text colour below reaches AA (4.5:1) on `background` and `surface`; this is
 * enforced by `src/theme/__tests__/contrast.test.ts`. `slate` (#7C8994, 3.6:1) is therefore decorative only:
 * small secondary text uses `textSubtle` (a darker slate).
 */
export const colors = {
  background: '#FFFFFF',
  /** Tiles, inputs, list rows. */
  surface: '#F3F5F7',
  surfaceAlt: '#F8F9FB',
  border: '#E3E7EB',
  borderStrong: '#CBD2D9',

  /** Main text: the logo navy. */
  text: '#0C2038',
  textMuted: '#44515E',
  /** Small secondary text (5.8:1 on white). */
  textSubtle: '#5B6773',
  /** Seller type is rendered in pure black by product requirement. */
  black: '#000000',
  onPrimary: '#FFFFFF',

  /** Brand navy: buttons, links, active tab, selected chips, focus ring, spinners. */
  primary: '#0C2038',
  primaryPressed: '#1B3553',
  /** Light navy tint: selected rows, selection bar. */
  primarySoft: '#E8EDF3',

  /** Logo "Lens" grey: decorative / large elements only (3.6:1 on white). */
  slate: '#7C8994',
  /** Logo lens highlight. */
  slateLight: '#D4D9DE',

  danger: '#B42318',
  dangerSoft: '#FDECEC',
  /** Alert red for unseen-notification badges and the bell (4.8:1 with white text). */
  alert: '#D92D20',

  success: '#1B5E20',
  successBorder: '#66BB6A',
  successSoft: '#E8F5E9',

  warning: '#8A6508',
  warningBorder: '#E8D9A8',
  warningSoft: '#FFF8E1',

  star: '#F5B301',
  overlay: 'rgba(12,32,56,0.45)',
} as const;

export type ColorToken = keyof typeof colors;
