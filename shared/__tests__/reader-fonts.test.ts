import { describe, expect, it } from 'vitest';
import { restoreReaderFonts } from '../lib/reader-fonts';

describe('restoreReaderFonts', () => {
  it.each([
    [null, null, 'gentium', 'gentium'],
    ['literata', 'literata', 'literata', 'literata'],
    ['didot', null, 'gentium', 'gentium'],
    ['gentium', 'gentium', 'gentium', 'gentium'],
    ['cardo', null, 'cardo', 'gentium'],
    [null, 'garamond', 'gentium', 'garamond'],
    ['junk', 'junk', 'gentium', 'gentium'],
    ['garamond', 'cardo', 'gentium', 'gentium'],
  ])('restores Greek %s and English %s as %s and %s', (greek, english, gfont, efont) => {
    expect(restoreReaderFonts(greek, english)).toEqual({ gfont, efont });
  });
});
