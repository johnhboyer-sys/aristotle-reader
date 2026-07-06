// pdf-import/divisions.ts
//
// Phase 2: deterministic division detection & tagging ({book, chapter} +
// optional verbatim titles) on top of the Phase-1 gutter scanner.
//
// The model. A critical edition prints its structural divisions as CENTERED
// lines: a book heading ("Book 5", "BOOK FOUR", "BOOK IV"), a chapter
// heading (bare dotted "5.1", or keyworded "CHAPTER XII"), and, in some
// editions, a centered chapter title on the line below the b.c heading
// ("Sorts of Justice"). After `pdftotext -layout` these are just indented
// text lines, so the classifier works from two signals only:
//
//   1. SHAPE (stateless, shared with gutter.ts via line-shape.ts): the
//      line's residual — the line with any gutter-tic span blanked in place,
//      because a heading line can legitimately carry a tic ("Book 8  1155a1")
//      — must be nothing but the heading grammar, indented ≥ LEFT_MIN
//      columns past the page's body-left margin. Titles get a looser
//      geometric test: alpha-bearing, Bekkerless, width-bounded, and
//      center-aligned to their b.c heading within TITLE_CENTER_TOL columns
//      (a long title centers to a leftGap of only ~3, so centering — not a
//      leading-space floor — is the discriminator).
//
//   2. SEQUENCE (stateful, this module): books and chapters are audited
//      against the running DivisionState. The edition's numbering is
//      captured VERBATIM — the audit only ever flags (gaps, restarts,
//      corroboration mismatches); it never renumbers. A book heading is the
//      structural authority; the restated b of a dotted "b.c" is
//      corroboration only. A book heading that goes backward is a work seam
//      (e.g. Magna Moralia's Book 1 after NE Book 10): flagged, workOrdinal
//      bumped, never a crash. An Arabic digit run longer than 2 is a number
//      with a glued endnote marker ("Book 7300" = Book 7 + marker 300),
//      split by the shortest sequence-consistent prefix — a printed 2-digit
//      numeral is always read whole.
//
// Furniture (running head, folio, footnotes) is already fenced off by the
// Phase-1 PageScan; divisions never look at it. Body content before the
// work's first division raises the one-time doc flag `preamble-present`.
//
// classifyDivisions runs after scanPage for the same page, consuming its
// side, furniture boundaries, bodyLeft, and tic line positions; the caller
// threads one DivisionState across all pages of a single work slice.
// No I/O, no Tauri imports.

import type { Page } from './pages';
import type { PageScan, Side } from './gutter';
import {
  lineShape,
  ticSpanOnLine,
  parseHeadingResidual,
  ARABIC_MAX_DIGITS,
  TITLE_CENTER_TOL,
  type HeadingNum,
  type LineShapeResult,
} from './line-shape';

// ---------------------------------------------------------------------------
// Data structures (spec §1)
// ---------------------------------------------------------------------------

export interface Division {
  kind: 'book' | 'chapter';
  /** Resolved b — verbatim edition numbering, never renumbered. */
  book: number;
  /** c for chapter divisions; null for book divisions. */
  chapter: number | null;
  /** Captured verbatim (outer trim only), never fabricated. */
  title: string | null;
  /** Physical page index. */
  page: number;
  /** Line of the heading token itself. */
  lineIdx: number;
  titleLineIdx: number | null;
  flags: string[];
}

export interface DivisionState {
  /** Current book (last book heading, or b of a bare b.c). */
  book: number | null;
  /** Last chapter c within the current book. */
  lastChapter: number | null;
  /** A `Book N` heading has set `book` since the last reset. */
  bookHeadingGoverns: boolean;
  /** False until the work's first division → preamble detection. */
  sawFirstDivision: boolean;
  /** 1-based; increments on a book-sequence restart (work seam). */
  workOrdinal: number;
  /** Inherit the body-left measurement across body-less pages, per side. */
  lastBodyLeft: { recto: number | null; verso: number | null };
  /** Document-level division flags. */
  flags: string[];
  /**
   * Implementation detail (not in spec §1): the last emitted book division,
   * kept so §4.3 can retroactively flag `book-heading-suspect:no-chapter-1`
   * on it even when the offending chapter lands on a later page.
   */
  lastBookDivision: Division | null;
}

export function createDivisionState(): DivisionState {
  return {
    book: null,
    lastChapter: null,
    bookHeadingGoverns: false,
    sawFirstDivision: false,
    workOrdinal: 1,
    lastBodyLeft: { recto: null, verso: null },
    flags: [],
    lastBookDivision: null,
  };
}

// ---------------------------------------------------------------------------
// Glued endnote markers (spec §3.4)
// ---------------------------------------------------------------------------

export interface GluedResolution {
  value: number;
  marker: string | null;
  flags: string[];
}

/**
 * Split "number + glued endnote marker" digit runs. ≤2 digits are ALWAYS
 * read whole; only a ≥3-digit run is ever split, by the shortest
 * sequence-consistent prefix (expected first, then a same-number repeat);
 * with no consistent prefix, prefer the full 2-digit read and flag
 * ambiguity — never renumber.
 */
export function resolveGluedNumber(
  digits: string,
  expected: number | null,
  last: number | null
): GluedResolution {
  if (digits.length <= ARABIC_MAX_DIGITS) return { value: Number(digits), marker: null, flags: [] };
  for (const k of [1, 2]) {
    const p = Number(digits.slice(0, k));
    if (expected !== null && p === expected) {
      return { value: p, marker: digits.slice(k), flags: [`heading-glued-marker:${digits.slice(k)}`] };
    }
  }
  for (const k of [1, 2]) {
    const p = Number(digits.slice(0, k));
    if (last !== null && p === last) {
      return {
        value: p,
        marker: digits.slice(k),
        flags: [`heading-glued-marker:${digits.slice(k)}`, 'book-sequence:repeat'],
      };
    }
  }
  return {
    value: Number(digits.slice(0, 2)),
    marker: digits.slice(2),
    flags: ['heading-number-ambiguous', `heading-glued-marker:${digits.slice(2)}`],
  };
}

function resolveNum(num: HeadingNum, expected: number, last: number | null, flags: string[]): number {
  if (num.type === 'resolved') return num.value;
  const r = resolveGluedNumber(num.digits, expected, last);
  flags.push(...r.flags);
  return r.value;
}

// ---------------------------------------------------------------------------
// classifyDivisions (spec §2-§6)
// ---------------------------------------------------------------------------

function pushDocFlag(state: DivisionState, flag: string): void {
  state.flags.push(flag);
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

// §4.1: audit + adopt a new book number (from a heading, or from a bare b.c
// restating a new book with c==1 when no heading was seen).
function auditAndAdoptBook(state: DivisionState, N: number): void {
  const expected = (state.book ?? 0) + 1;
  if (state.book !== null && N <= state.book) {
    // Restart/seam (e.g. MM Book 1 after NE Book 10): flag, bump, never crash.
    state.workOrdinal += 1;
    pushDocFlag(state, `book-sequence:restart:${N}`);
  } else if (N > expected) {
    pushDocFlag(state, `book-sequence:gap:${state.book ?? 0}->${N}`);
  }
  state.book = N;
  state.lastChapter = 0; // chapter counter resets at a book boundary
}

export function classifyDivisions(page: Page, scan: PageScan, state: DivisionState): Division[] {
  const out: Division[] = [];
  const side: Side | null = scan.side;
  if (side === null) return out; // empty page

  // §2 step 0: bodyLeft with cross-page inheritance.
  const bodyLeft = scan.bodyLeft ?? state.lastBodyLeft[side] ?? 0;
  if (scan.bodyLeft !== null) state.lastBodyLeft[side] = scan.bodyLeft;

  const lines = page.lines;
  const ticLines = new Set(scan.tics.map((t) => t.lineIdx));
  const scannable = (i: number): boolean =>
    i !== scan.headerLineIdx &&
    (scan.bottomFurnitureStartIdx === null || i < scan.bottomFurnitureStartIdx);
  const shapeOf = (i: number): LineShapeResult =>
    lineShape(lines[i], bodyLeft, side, ticLines.has(i) ? ticSpanOnLine(lines[i], side) : null);

  const consumed = new Set<number>(); // captured title lines

  for (let i = 0; i < lines.length; i++) {
    if (!scannable(i) || isBlank(lines[i]) || consumed.has(i)) continue;
    const shape = shapeOf(i);

    if (shape.shape === 'body') {
      // §6: body content before the work's first division = preamble.
      if (!state.sawFirstDivision && !state.flags.includes('preamble-present')) {
        pushDocFlag(state, 'preamble-present');
      }
      continue;
    }
    if (shape.shape === 'title-candidate') continue; // free-floating: ignored

    const parsed = parseHeadingResidual(shape.residual.trim());
    if (!parsed) continue; // unreachable: shape book/chapter implies grammar

    if (parsed.kind === 'book') {
      const flags: string[] = [];
      const N = resolveNum(parsed.num, (state.book ?? 0) + 1, state.book, flags);
      auditAndAdoptBook(state, N);
      state.bookHeadingGoverns = true;
      state.sawFirstDivision = true;
      const div: Division = {
        kind: 'book',
        book: N,
        chapter: null,
        title: null, // book divisions never take titles (§5)
        page: page.index,
        lineIdx: i,
        titleLineIdx: null,
        flags,
      };
      state.lastBookDivision = div;
      out.push(div);
      continue;
    }

    // Chapter division. Chapter number first (its glued resolution needs
    // only lastChapter), then b per §4.2.
    const flags: string[] = [];
    const justAfterBookHeading = state.bookHeadingGoverns && state.lastChapter === 0;
    const c = resolveNum(parsed.num, (state.lastChapter ?? 0) + 1, state.lastChapter, flags);
    const restated = parsed.restatedBook;

    let b: number;
    if (state.bookHeadingGoverns && state.book !== null) {
      // The book heading is the structural authority; restated b is
      // corroboration only.
      b = state.book;
      if (restated !== null && restated !== state.book) {
        flags.push(`book-corroboration-mismatch:book-heading=${state.book},restated=${restated}`);
      }
    } else if (restated !== null) {
      if (state.book !== null && restated === state.book) {
        b = restated;
      } else if (state.book === null || c === 1) {
        // Unannounced book change (or no book context at all): adopt it.
        flags.push(`book-heading-missing:${restated}`);
        auditAndAdoptBook(state, restated);
        b = restated;
      } else {
        flags.push(`book-restated-jump:${state.book}->${restated}`);
        b = state.book;
      }
    } else {
      // Keyworded chapter with neither a governing heading nor a restated
      // digit: no book evidence at all. Conservative: b = 0, flagged.
      b = state.book ?? 0;
      if (state.book === null) flags.push('book-heading-missing:unknown');
    }

    // §4.3 chapter sequence.
    const expectedC = (state.lastChapter ?? 0) + 1;
    if (c !== expectedC) {
      if (justAfterBookHeading) {
        flags.push(`chapter-sequence:expected-1-got-${c}`);
        state.lastBookDivision?.flags.push('book-heading-suspect:no-chapter-1');
      } else {
        flags.push(`chapter-sequence:gap-or-repeat:${state.lastChapter ?? 0}->${c}`);
      }
    }
    state.lastChapter = c;
    state.sawFirstDivision = true;

    // §5 title capture: first non-blank line below, title-shaped and
    // center-aligned to the heading mid within TITLE_CENTER_TOL.
    let title: string | null = null;
    let titleLineIdx: number | null = null;
    for (let j = i + 1; j < lines.length && scannable(j); j++) {
      if (isBlank(lines[j])) continue;
      const tShape = shapeOf(j);
      if (tShape.shape === 'title-candidate' && Math.abs(tShape.mid - shape.mid) <= TITLE_CENTER_TOL) {
        title = tShape.residual.trim(); // outer trim only — internal spacing verbatim
        titleLineIdx = j;
        consumed.add(j);
        // Multi-line titles: capture the first line only; flag a suspect
        // continuation (the literal next line also title-shaped + aligned).
        const k = j + 1;
        if (k < lines.length && scannable(k) && !isBlank(lines[k])) {
          const kShape = shapeOf(k);
          if (kShape.shape === 'title-candidate' && Math.abs(kShape.mid - shape.mid) <= TITLE_CENTER_TOL) {
            flags.push('title-multiline-suspect');
          }
        }
      }
      break; // the first non-blank line decides, captured or not
    }

    out.push({
      kind: 'chapter',
      book: b,
      chapter: c,
      title,
      page: page.index,
      lineIdx: i,
      titleLineIdx,
      flags,
    });
  }

  return out;
}
