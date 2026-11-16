export type GFont = 'literata' | 'gentium' | 'cardo';
export type EFont = 'gentium' | 'literata' | 'garamond';

/** Unknown or retired saved faces fall back to Gentium. */
export function restoreReaderFonts(greek: string | null, english: string | null): { gfont: GFont; efont: EFont } {
  return {
    gfont: greek === 'literata' || greek === 'cardo' ? greek : 'gentium',
    efont: english === 'literata' || english === 'garamond' ? english : 'gentium',
  };
}
