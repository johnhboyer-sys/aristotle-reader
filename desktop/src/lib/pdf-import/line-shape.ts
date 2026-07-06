// pdf-import/line-shape.ts
//
// Shared, pure, STATELESS line-shape predicate (Phase 2 spec §7a), plus the
// low-level tic-token grammar/position primitives it shares with gutter.ts.
//
// Both gutter.ts (anchor binding — "is this tic sitting on a heading line?")
// and divisions.ts (division classification) need to answer the same
// question about a single line: given the page's body-left margin and side,
// does this line's residual (the line with its gutter-tic span blanked in
// place) look like a centered division heading, a centered title, or body
// prose? Factoring that answer into one dependency-free module avoids a
// phase inversion: gutter.ts never learns about numbering or sequence, and
// divisions.ts never re-implements tic geometry.
//
// No numbering resolution, no sequence audit, no state lives here — just
// shape. Number VALUES (glued endnote markers, sequence checks) are resolved
// by divisions.ts, which has the DivisionState; this module only validates
// stateless grammar (Roman canonicality, spelled-out vocabulary).

// ---------------------------------------------------------------------------
// Shared base types (gutter.ts re-exports these)
// ---------------------------------------------------------------------------

export type Side = 'recto' | 'verso';
export type BekkerCol = 'a' | 'b';

// ---------------------------------------------------------------------------
// Phase-1 tic grammar + positional gates (moved here from gutter.ts so that
// ticSpanOnLine and gutter's candidate extraction share one implementation)
// ---------------------------------------------------------------------------

// A1: page is 1-4 digits, column letter mandatory, line 0-2 digits.
// A single internal space ("1098 b1") is tolerated during recognition only.
export const FULLFORM_BODY_RE = /^(\d{1,4})\s?([ab])(\d{1,2})?$/;

// A2: bare tics are 1-2 digits, value 1-99 (layered defense, no numeric cap).
export const BARE_BODY_RE = /^(\d{1,2})$/;

export const RANGE_DASH_RE = /[–—]/; // – —

// A3: recto candidates are gated by position, not an absolute column floor.
export const RECTO_MIN_START_COL = 40;
export const RECTO_MIN_GAP = 4;
export const VERSO_START_CEIL = 1;

export interface TicTokenGrammar {
  kind: 'full' | 'bare';
  fullPage?: number;
  fullCol?: BekkerCol;
  fullLine?: number; // present only when the printed form carries a line number
  bareValue?: number;
}

// Pure grammar test for a single token: full-form Bekker tic, bare line tic,
// or neither.
export function classifyTicToken(raw: string): TicTokenGrammar | null {
  const full = FULLFORM_BODY_RE.exec(raw);
  if (full) {
    return {
      kind: 'full',
      fullPage: Number(full[1]),
      fullCol: full[2] as BekkerCol,
      fullLine: full[3] !== undefined ? Number(full[3]) : undefined,
    };
  }
  const bare = BARE_BODY_RE.exec(raw);
  if (bare) {
    const value = Number(bare[1]);
    if (value >= 1 && value <= 99) return { kind: 'bare', bareValue: value };
  }
  return null;
}

export function findTrailingToken(line: string): { raw: string; startCol: number; endCol: number } | null {
  const trimmed = line.replace(/\s+$/, '');
  if (trimmed.length === 0) return null;
  const m = /(\d{1,4}\s?[ab]\d{0,2}|\d{1,2})$/.exec(trimmed);
  if (!m) return null;
  return { raw: m[1], startCol: m.index, endCol: trimmed.length };
}

export function findLeadingToken(line: string): { raw: string; startCol: number; endCol: number } | null {
  const m = /^(\s*)(\d{1,4}\s?[ab]\d{0,2}|\d{1,2})/.exec(line);
  if (!m) return null;
  const startCol = m[1].length;
  const raw = m[2];
  return { raw, startCol, endCol: startCol + raw.length };
}

function charBefore(line: string, col: number): string {
  return col > 0 ? line[col - 1] : '';
}

function gapBefore(line: string, col: number): number {
  let i = col - 1;
  let n = 0;
  while (i >= 0 && line[i] === ' ') {
    n++;
    i--;
  }
  return n;
}

/**
 * Side-aware span of a Phase-1-shaped gutter tic on this line, or null.
 * Recto: trailing digit token (last token, ≥4-space gap, start col ≥ 40);
 * verso: leading digit token (col ≤ 1, followed by space + text). Applies
 * exactly the positional + grammar gates gutter.ts uses for candidate
 * extraction — one implementation, two callers.
 */
export function ticSpanOnLine(line: string, side: Side): [number, number] | null {
  if (side === 'recto') {
    const trailing = findTrailingToken(line);
    if (!trailing) return null;
    const { raw, startCol, endCol } = trailing;
    if (endCol < line.length && /[^\s]/.test(line.slice(endCol))) return null;
    if (!classifyTicToken(raw)) return null;
    if (startCol < RECTO_MIN_START_COL) return null;
    const beforeTrimmed = line.slice(0, startCol).replace(/\s+$/, '');
    if (beforeTrimmed.length === 0) return null; // lone-integer line: folio furniture
    if (RANGE_DASH_RE.test(charBefore(line, startCol)) || RANGE_DASH_RE.test(line.slice(endCol, endCol + 1))) {
      return null;
    }
    if (gapBefore(line, startCol) < RECTO_MIN_GAP) return null;
    return [startCol, endCol];
  }
  const leading = findLeadingToken(line);
  if (!leading) return null;
  const { raw, startCol, endCol } = leading;
  if (startCol > VERSO_START_CEIL) return null;
  const rest = line.slice(endCol);
  if (!/^\s/.test(rest)) return null; // must be followed by whitespace, not '.', not glued text
  if (rest.trim().length === 0) return null; // lone-integer line: furniture
  if (RANGE_DASH_RE.test(rest.slice(0, 1))) return null;
  if (!classifyTicToken(raw)) return null;
  return [startCol, endCol];
}

// ---------------------------------------------------------------------------
// Phase-2 constants (spec §0)
// ---------------------------------------------------------------------------

// Centering floor for a primary heading token (leftGap = startCol − bodyLeft).
// Measured: min heading leftGap 32; body 0, paragraph indent +4, quote ≤ +11.
export const LEFT_MIN = 15;
// Titles can be wide, so they get a low left-indent floor (measured min 3).
export const TITLE_LEFT_MIN = 3;
// Title midpoint must sit within this many cols of its b.c heading midpoint
// (measured max 2.0 over all 117 Reeve titles; 4 adds rounding safety).
export const TITLE_CENTER_TOL = 4;
// Longest measured title = 66 chars; guards against a justified body line.
export const TITLE_MAX_WIDTH = 70;
// A clean Arabic book/chapter number is 1-2 digits; longer = glued marker.
export const ARABIC_MAX_DIGITS = 2;
export const ROMAN_MAX = 60;
export const SPELLED_MAX = 60;

// ---------------------------------------------------------------------------
// Heading-number grammar (spec §3.5, stateless part)
// ---------------------------------------------------------------------------

export type HeadingNum =
  | { type: 'arabic'; digits: string } // glued-marker resolution deferred to divisions.ts
  | { type: 'resolved'; value: number }; // Roman / spelled-out, already validated

const ROMAN_CHAR_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };

function toRoman(n: number): string {
  const pairs: [number, string][] = [
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  let rest = n;
  for (const [v, s] of pairs) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out;
}

function parseRoman(token: string): number | null {
  const up = token.toUpperCase();
  let total = 0;
  for (let i = 0; i < up.length; i++) {
    const v = ROMAN_CHAR_VALUES[up[i]];
    const next = i + 1 < up.length ? ROMAN_CHAR_VALUES[up[i + 1]] : 0;
    total += v < next ? -v : v;
  }
  // Accept only canonical numerals within range ("IIII", "VX" are not numbers).
  if (total < 1 || total > ROMAN_MAX) return null;
  if (toRoman(total) !== up) return null;
  return total;
}

const SPELLED_UNITS: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9,
};
const SPELLED_TEENS: Record<string, number> = {
  TEN: 10, ELEVEN: 11, TWELVE: 12, THIRTEEN: 13, FOURTEEN: 14, FIFTEEN: 15,
  SIXTEEN: 16, SEVENTEEN: 17, EIGHTEEN: 18, NINETEEN: 19,
};
const SPELLED_TENS: Record<string, number> = { TWENTY: 20, THIRTY: 30, FORTY: 40, FIFTY: 50, SIXTY: 60 };

function parseSpelled(token: string): number | null {
  const up = token.toUpperCase();
  if (up in SPELLED_UNITS) return SPELLED_UNITS[up];
  if (up in SPELLED_TEENS) return SPELLED_TEENS[up];
  if (up in SPELLED_TENS) return SPELLED_TENS[up];
  const m = /^([A-Z]+)[-\s]([A-Z]+)$/.exec(up);
  if (m && m[1] in SPELLED_TENS && m[2] in SPELLED_UNITS) {
    const v = SPELLED_TENS[m[1]] + SPELLED_UNITS[m[2]];
    return v <= SPELLED_MAX ? v : null;
  }
  return null;
}

function parseHeadingNum(token: string): HeadingNum | null {
  const t = token.trim();
  if (/^\d+$/.test(t)) return { type: 'arabic', digits: t }; // any length: glued split is divisions' call
  if (/^[IVXLCivxlc]+$/.test(t)) {
    const v = parseRoman(t);
    return v === null ? null : { type: 'resolved', value: v };
  }
  const v = parseSpelled(t);
  return v === null ? null : { type: 'resolved', value: v };
}

export type HeadingParse =
  | { kind: 'book'; num: HeadingNum }
  | { kind: 'chapter'; restatedBook: number | null; num: HeadingNum };

/**
 * Grammar for a trimmed heading residual (spec §3.1-§3.2, §3.5):
 * "BOOK <num>" / "CHAPTER <num>" (keyworded, case-insensitive) or bare
 * dotted "b.c" (each 1-2 Arabic digits). Returns null when the residual is
 * not heading-shaped (including non-canonical Roman / unknown spelled-out).
 */
export function parseHeadingResidual(trimmed: string): HeadingParse | null {
  const kw = /^(BOOK|CHAPTER)\s+(\S+(?:[ -]\S+)?)$/i.exec(trimmed);
  if (kw) {
    const num = parseHeadingNum(kw[2]);
    if (num === null) return null;
    return kw[1].toUpperCase() === 'BOOK' ? { kind: 'book', num } : { kind: 'chapter', restatedBook: null, num };
  }
  const dotted = /^(\d{1,2})\.(\d{1,2})$/.exec(trimmed);
  if (dotted) {
    return { kind: 'chapter', restatedBook: Number(dotted[1]), num: { type: 'arabic', digits: dotted[2] } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// lineShape (spec §7a / §3)
// ---------------------------------------------------------------------------

export type LineShape = 'book' | 'chapter' | 'title-candidate' | 'body';

export interface LineShapeResult {
  shape: LineShape;
  /** The line with its tic span (if any) blanked in place — positions preserved. */
  residual: string;
  startCol: number;
  endCol: number; // exclusive
  mid: number;
}

/**
 * Pure shape test: "does this line's residual look like a centered division
 * heading or title, given the page's body-left margin and side?" The tic
 * span, when the caller knows the line carries one, is blanked in place
 * (spaces, positions preserved) before measuring. `side` is part of the
 * shared-signature contract (the caller derives ticSpan side-awareness);
 * the shape decision itself is side-neutral once bodyLeft is given.
 */
export function lineShape(
  line: string,
  bodyLeft: number,
  _side: Side,
  ticSpan: [number, number] | null
): LineShapeResult {
  const residual = ticSpan
    ? line.slice(0, ticSpan[0]) + ' '.repeat(ticSpan[1] - ticSpan[0]) + line.slice(ticSpan[1])
    : line;
  const first = /\S/.exec(residual);
  if (!first) return { shape: 'body', residual, startCol: 0, endCol: 0, mid: 0 };
  const startCol = first.index;
  const endCol = residual.replace(/\s+$/, '').length;
  const mid = (startCol + endCol) / 2;
  const trimmed = residual.slice(startCol, endCol);
  const leftGap = startCol - bodyLeft;

  // §3.1-§3.2: primary heading = grammar-standalone residual + leftGap ≥ 15.
  const parsed = parseHeadingResidual(trimmed);
  if (parsed && leftGap >= LEFT_MIN) {
    return { shape: parsed.kind, residual, startCol, endCol, mid };
  }

  // §3.3: title candidacy — alpha-bearing, non-numeric, Bekkerless (no tic
  // on the line), modest left indent, bounded width.
  const width = endCol - startCol;
  if (
    ticSpan === null &&
    /[A-Za-z]/.test(trimmed) &&
    !/^[\d.\s]+$/.test(trimmed) &&
    leftGap >= TITLE_LEFT_MIN &&
    width <= TITLE_MAX_WIDTH
  ) {
    return { shape: 'title-candidate', residual, startCol, endCol, mid };
  }

  return { shape: 'body', residual, startCol, endCol, mid };
}

/** True iff the line's shape is book, chapter, or title-candidate (§7a). */
export function isHeadingClassLine(
  line: string,
  bodyLeft: number,
  side: Side,
  ticSpan: [number, number] | null
): boolean {
  return lineShape(line, bodyLeft, side, ticSpan).shape !== 'body';
}
