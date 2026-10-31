import { it, expect } from 'vitest';
import { contrastRatio, shellTheme } from './index';
it('checks standard luminance anchors and rejects malformed palette input', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
  expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
  expect(() => contrastRatio('red', '#ffffff')).toThrow();
});
it('keeps active text, muted text, selected controls and both suit inks at least 4.5:1', () => {
  for (const background of [shellTheme.background, shellTheme.surface])
    for (const ink of [shellTheme.text, shellTheme.muted, shellTheme.accent])
      expect(contrastRatio(ink, background)).toBeGreaterThanOrEqual(4.5);
  expect(
    contrastRatio(shellTheme.background, shellTheme.accent),
  ).toBeGreaterThanOrEqual(4.5);
  for (const ink of ['#172c38', '#a53543'])
    expect(contrastRatio(ink, '#fbf8ee')).toBeGreaterThanOrEqual(4.5);
});
