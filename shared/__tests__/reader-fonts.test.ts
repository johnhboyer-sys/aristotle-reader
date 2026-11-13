import { describe, expect, it } from 'vitest';
import { restoreReaderFonts } from '../lib/reader-fonts';

describe('restoreReaderFonts', () => {
  it.each([
    [null, null, 'literata', 'literata'],
    ['literata', 'literata', 'literata', 'literata'],
    ['didot', null, 'literata', 'literata'],
    ['gentium', null, 'gentium', 'literata'],
    ['cardo', null, 'cardo', 'literata'],
    [null, 'garamond', 'literata', 'garamond'],
    ['junk', 'junk', 'literata', 'literata'],
    ['garamond', 'cardo', 'literata', 'literata'],
  ])('restores Greek %s and English %s as %s and %s', (greek, english, gfont, efont) => {
    expect(restoreReaderFonts(greek, english)).toEqual({ gfont, efont });
  });
});
