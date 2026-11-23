import { contrastRatio } from '@/utils/contrast';

import { colors } from '../colors';

const AA_TEXT = 4.5;
const AA_GRAPHICS = 3;

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // The logo slate on white is below AA for text: that is why it is decorative only.
    expect(contrastRatio('#7C8994', '#FFFFFF')).toBeLessThan(AA_TEXT);
  });
});

describe('palette accessibility', () => {
  const textOnLight: [string, string, string][] = [
    ['text', colors.text, colors.background],
    ['text', colors.text, colors.surface],
    ['text', colors.text, colors.surfaceAlt],
    ['text', colors.text, colors.primarySoft],
    ['textMuted', colors.textMuted, colors.background],
    ['textMuted', colors.textMuted, colors.surface],
    ['textSubtle', colors.textSubtle, colors.background],
    ['textSubtle', colors.textSubtle, colors.surface],
    ['textSubtle', colors.textSubtle, colors.primarySoft],
    ['primary (links, selected text)', colors.primary, colors.background],
    ['primary', colors.primary, colors.surface],
    ['primary', colors.primary, colors.primarySoft],
    ['danger', colors.danger, colors.background],
    ['danger', colors.danger, colors.dangerSoft],
    ['success', colors.success, colors.background],
    ['success', colors.success, colors.successSoft],
    ['warning', colors.warning, colors.background],
    ['warning', colors.warning, colors.warningSoft],
    ['black (seller type)', colors.black, colors.background],
  ];

  it.each(textOnLight)('%s text reaches AA (4.5:1) on its background', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('keeps white text readable on the filled colours (buttons, badges)', () => {
    expect(contrastRatio(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(colors.onPrimary, colors.primaryPressed)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(colors.onPrimary, colors.danger)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(colors.onPrimary, colors.alert)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('keeps decorative slate visible enough for icons and chart lines (3:1)', () => {
    expect(contrastRatio(colors.slate, colors.background)).toBeGreaterThanOrEqual(AA_GRAPHICS);
    expect(contrastRatio(colors.slate, colors.surface)).toBeGreaterThanOrEqual(AA_GRAPHICS);
  });
});
