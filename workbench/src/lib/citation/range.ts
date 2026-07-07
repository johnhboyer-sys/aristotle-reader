/**
 * formatBekkerRange — THE one shared en-dash range collapser for Bekker
 * addresses. Every display site (citations, chapter library, export
 * headers, Phase 2 copy-as-citation) goes through this. See
 * workbench-design/d2-citation-schemes.md §"Range formatting".
 */

import { parseRef } from './bekker';

const EN_DASH = '–';

/**
 * Format a Bekker range from raw address strings (e.g. "1041a5", "1041a20").
 *
 * Collapse rules:
 *  - point ref (start === end)         → "1041a6"
 *  - same page, same column            → "1041a5–20"
 *  - same page, column a→b             → "1041a31–b5"
 *  - different page                    → "1041b25–1042a5"
 */
export function formatBekkerRange(start: string, end: string): string {
  if (start === end) return start;

  const s = parseRef(start);
  const e = parseRef(end);

  if (s.page === e.page && s.side === e.side) {
    return `${start}${EN_DASH}${e.line}`;
  }
  if (s.page === e.page) {
    return `${start}${EN_DASH}${e.side}${e.line}`;
  }
  return `${start}${EN_DASH}${end}`;
}
