/**
 * plain-line — D8 document-spine scheme for corpus-free line-segmented
 * imports (workbench-design/d8-view-modes.md §1). Addresses are bare
 * positive integers ("1", "2", …), one per source line. Like `paragraph`,
 * this scheme's rows ARE the document — there is no external corpus spine,
 * so `spineSource` is 'document'.
 */

import type { Address, CitationScheme, RefSpan, WorkMeta } from '../types';

const SCHEME_ID = 'plain-line' as const;
const EN_DASH = '–';

const ADDRESS_RE = /^(\d+)$/;

/** Parse a strict bare-integer string. Must be a positive integer, no
 * leading zeros beyond "0" itself, no signs, no whitespace. Throws with a
 * plain message on anything malformed. */
function parseLineNumber(raw: string): number {
  const m = ADDRESS_RE.exec(raw);
  if (!m) {
    throw new Error(`not a plain-line address (expected a bare integer, e.g. "3"): ${JSON.stringify(raw)}`);
  }
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`plain-line address must be a positive integer: ${JSON.stringify(raw)}`);
  }
  return n;
}

function parseAddress(raw: string): Address {
  parseLineNumber(raw); // throws on malformed input
  return { scheme: SCHEME_ID, raw };
}

function compareAddress(a: Address, b: Address): number {
  return parseLineNumber(a.raw) - parseLineNumber(b.raw);
}

/**
 * Plain-line-scheme works are bookless (single continuous document, D8 v1
 * scope). Follows the busse-paragraph / paragraph-scheme precedent: empty
 * string for a bookless work rather than a thrown error.
 */
function bookLabel(bookIndex: number, work: WorkMeta): string {
  const entry = work.books[bookIndex - 1];
  return entry?.label ?? '';
}

/**
 * Own range logic (does not delegate to range.ts's Bekker-shaped
 * formatBekkerRange). Still uses the en dash per the shared house style.
 *
 *  - point ref (start === end) → "5"
 *  - range                     → "3–7"
 */
function formatRange(span: RefSpan): string {
  const { start, end } = span;
  if (start.raw === end.raw) return start.raw;

  return `${start.raw}${EN_DASH}${end.raw}`;
}

/**
 * "*Title* 3–7" style — no book component (bookless work; see bookLabel).
 */
function formatCitation(span: RefSpan, work: WorkMeta): string {
  const range = plainLineScheme.formatRange(span);
  return `*${work.title}* ${range}`;
}

export const plainLineScheme: CitationScheme = {
  id: SCHEME_ID,
  parseAddress,
  compareAddress,
  bookLabel,
  formatRange,
  formatCitation,
  gutter: {
    rowUnit: 'plain-line',
    gutterMode: 'structural',
  },
  spineSource: 'document',
};
