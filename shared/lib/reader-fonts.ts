export type GFont = 'literata' | 'gentium' | 'cardo';
export type EFont = 'literata' | 'garamond';

/** Unknown or retired saved faces fall back to Literata. */
export function restoreReaderFonts(greek: string | null, english: string | null): { gfont: GFont; efont: EFont } {
  return {
    gfont: greek === 'gentium' || greek === 'cardo' ? greek : 'literata',
    efont: english === 'garamond' ? english : 'literata',
  };
}
