/**
 * busse-paragraph — Phase 2 exercise scheme: proves the frozen CitationScheme
 * contract (workbench-design/d2-citation-schemes.md) accommodates a
 * NON-BEKKER scheme whose row unit is not a Bekker line.
 *
 * Modeled on the CAG page.line citation used for Porphyry's Isagoge (Busse,
 * Porphyrii Isagoge, CAG IV.1, 1887) on the reader site: addresses are
 * "<page>.<line>", e.g. "1.5", "12.3" — positive integers, page then line,
 * dot-separated. Unlike Bekker there is no page a/b side and no book
 * division; Isagoge is a single continuous work.
 *
 * This is a shape-check, not a product feature: no editor support, no
 * corpus, no UI wiring. See the Phase 2 exercise outcome addendum in
 * workbench-design/d2-citation-schemes.md for what this proved.
 */

import type { Address, CitationScheme, RefSpan, WorkMeta } from '../types';

const SCHEME_ID = 'busse-paragraph' as const;
const EN_DASH = '–';

/** A parsed Busse page.line address. Internal to this scheme file. */
interface BusseAddress {
  page: number;
  line: number;
}

const ADDRESS_RE = /^(\d+)\.(\d+)$/;

/**
 * Parse a strict "page.line" string. Both components must be positive
 * integers (no leading zeros beyond "0" itself, no signs, no whitespace).
 * Throws with a plain message on anything malformed.
 */
function parseBusse(raw: string): BusseAddress {
  const m = ADDRESS_RE.exec(raw);
  if (!m) {
    throw new Error(`not a Busse address (expected "page.line", e.g. "12.3"): ${JSON.stringify(raw)}`);
  }
  const page = Number(m[1]);
  const line = Number(m[2]);
  if (!Number.isInteger(page) || page <= 0) {
    throw new Error(`Busse address page must be a positive integer: ${JSON.stringify(raw)}`);
  }
  if (!Number.isInteger(line) || line <= 0) {
    throw new Error(`Busse address line must be a positive integer: ${JSON.stringify(raw)}`);
  }
  return { page, line };
}

function parseAddress(raw: string): Address {
  parseBusse(raw); // throws on malformed input
  return { scheme: SCHEME_ID, raw };
}

function compareAddress(a: Address, b: Address): number {
  const pa = parseBusse(a.raw);
  const pb = parseBusse(b.raw);
  if (pa.page !== pb.page) return pa.page - pb.page;
  return pa.line - pb.line;
}

/**
 * Isagoge-like works cited by this scheme have no books (a single
 * continuous text). Per the frozen contract, bookLabel still reads the
 * manifest first — a future busse-scheme work COULD declare books — but
 * the documented default for a bookless work is the empty string, not a
 * thrown error and not a Bekker-style numeral fallback (there is no
 * numbering convention to fall back to; Roman numerals would misrepresent
 * a text that has no books at all). See the Phase 2 addendum in
 * d2-citation-schemes.md for the discussion of whether this is Bekker-
 * shaped baggage in the contract.
 */
function bookLabel(bookIndex: number, work: WorkMeta): string {
  const entry = work.books[bookIndex - 1];
  return entry?.label ?? '';
}

/**
 * Own range logic — does NOT route through range.ts's formatBekkerRange,
 * whose page/side/line collapse semantics don't fit a schemeless-side
 * page.line address. Still uses the en dash per the shared house style.
 *
 *  - point ref (start === end)   → "1.5"
 *  - same page                   → "12.3–7"   (page omitted on the tail)
 *  - different page               → "12.3–13.2" (full ref both ends)
 */
function formatRange(span: RefSpan): string {
  const { start, end } = span;
  if (start.raw === end.raw) return start.raw;

  const s = parseBusse(start.raw);
  const e = parseBusse(end.raw);

  if (s.page === e.page) {
    return `${start.raw}${EN_DASH}${e.line}`;
  }
  return `${start.raw}${EN_DASH}${end.raw}`;
}

/**
 * "*Isagoge*, 1.5–2.3" style. Isagoge-like works are bookless and
 * chapterless in citation (chapters exist editorially but Busse citation
 * is by page.line only), so book/chapter parts are omitted whenever
 * absent — mirroring bekkerStandard's omission behavior for a point
 * reference with no book/chapter, but never emitting an empty book label.
 */
function formatCitation(span: RefSpan, work: WorkMeta): string {
  const parts: string[] = [];
  if (span.book !== undefined) {
    const label = busseParagraph.bookLabel(span.book, work);
    if (label) {
      parts.push(span.chapter !== undefined ? `${label}.${span.chapter}` : label);
    } else if (span.chapter !== undefined) {
      parts.push(`${span.chapter}`);
    }
  } else if (span.chapter !== undefined) {
    parts.push(`${span.chapter}`);
  }
  const range = busseParagraph.formatRange(span);
  const head = `*${work.title}*` + (parts.length ? ` ${parts.join('')}` : '');
  return `${head}, ${range}`;
}

export const busseParagraph: CitationScheme = {
  id: SCHEME_ID,
  parseAddress,
  compareAddress,
  bookLabel,
  formatRange,
  formatCitation,
  gutter: {
    rowUnit: 'paragraph',
    gutterMode: 'address',
  },
};
