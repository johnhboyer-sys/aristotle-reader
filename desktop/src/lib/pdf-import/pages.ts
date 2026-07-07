// pdf-import/pages.ts
// Splits pdftotext -layout raw output into pages on form-feed (\f).

export interface Page {
  index: number;
  lines: string[];
}

/**
 * Split raw pdftotext output into pages.
 *
 * - Pages are delimited by form-feed (\f) characters.
 * - Each page's text is split into lines on \n, with a trailing \r
 *   stripped from each line (tolerate CRLF sources).
 * - Doubled form feeds (an empty page between two \f\f) are preserved
 *   as a page rather than merged/dropped, so downstream flagging can
 *   see it. The natural result of splitting an empty string on \n is
 *   a single-element array containing an empty string (['']), and we
 *   keep that rather than normalizing to [] — an empty page therefore
 *   has `lines: ['']`, not `lines: []`.
 * - index is the 0-based ordinal of the page within the file.
 */
export function splitPages(raw: string): Page[] {
  return raw.split('\f').map((pageText, index) => ({
    index,
    lines: pageText.split('\n').map((line) =>
      line.endsWith('\r') ? line.slice(0, -1) : line
    ),
  }));
}
