/**
 * paragraph — D8 document-spine scheme for corpus-free paragraph-segmented
 * imports (workbench-design/d8-view-modes.md §1). Addresses are "¶N", N a
 * positive integer paragraph ordinal. Unlike busse-paragraph (an external
 * CAG page.line corpus spine), this scheme's rows ARE the document: there is
 * no external spine, so `spineSource` is 'document' — the user may create
 * and destroy rows (paragraph split/merge), unlike the corpus-owned schemes.
 *
 * Addresses for document-spine works are always derived from row ordinal
 * and never persisted as chapter-file spans in their own right (see d8 §1);
 * this scheme still implements the full parse/compare/format contract so
 * general code (citations, gutter, contract tests) needs no special case.
 */

import type { Address, CitationScheme, RefSpan, WorkMeta } from '../types';

const SCHEME_ID = 'paragraph' as const;
const EN_DASH = '–';

const ADDRESS_RE = /^¶(\d+)$/;

/** Parse a strict "¶N" string. N must be a positive integer. Throws with a
 * plain message on anything malformed. */
function parseParagraphNumber(raw: string): number {
  const m = ADDRESS_RE.exec(raw);
  if (!m) {
    throw new Error(`not a paragraph address (expected "¶N", e.g. "¶3"): ${JSON.stringify(raw)}`);
  }
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`paragraph address must be a positive integer: ${JSON.stringify(raw)}`);
  }
  return n;
}

function parseAddress(raw: string): Address {
  parseParagraphNumber(raw); // throws on malformed input
  return { scheme: SCHEME_ID, raw };
}

function compareAddress(a: Address, b: Address): number {
  return parseParagraphNumber(a.raw) - parseParagraphNumber(b.raw);
}

/**
 * Paragraph-scheme works are bookless (a single continuous document under
 * the D8 v1 scope — see d8-view-modes.md "Deliberately NOT doing": no
 * multi-chapter free documents). Follows the busse-paragraph precedent:
 * empty string for a bookless work rather than a thrown error or an
 * invented numbering fallback.
 */
function bookLabel(bookIndex: number, work: WorkMeta): string {
  const entry = work.books[bookIndex - 1];
  return entry?.label ?? '';
}

/**
 * Own range logic (does not delegate to range.ts's Bekker-shaped
 * formatBekkerRange — see the d2 Phase 2 friction note about busse-paragraph
 * doing the same). Still uses the en dash per the shared house style.
 *
 *  - point ref (start === end) → "¶5"
 *  - range                     → "¶3–7" (leading "¶" omitted on the tail)
 */
function formatRange(span: RefSpan): string {
  const { start, end } = span;
  if (start.raw === end.raw) return start.raw;

  const e = parseParagraphNumber(end.raw);
  return `${start.raw}${EN_DASH}${e}`;
}

/**
 * "*Title* ¶3–7" style — no book component (bookless work; see bookLabel).
 */
function formatCitation(span: RefSpan, work: WorkMeta): string {
  const range = paragraphScheme.formatRange(span);
  return `*${work.title}* ${range}`;
}

export const paragraphScheme: CitationScheme = {
  id: SCHEME_ID,
  parseAddress,
  compareAddress,
  bookLabel,
  formatRange,
  formatCitation,
  gutter: {
    rowUnit: 'paragraph',
    gutterMode: 'structural',
  },
  spineSource: 'document',
};
