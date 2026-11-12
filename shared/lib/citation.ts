// Citation-scheme contract — the frontend twin of the pipeline's
// pipeline/plato_pipeline/scheme.py. A *citation scheme* is the reference
// system a work is cited by: Bekker pages for Aristotle ("1094a15"), Busse/CAG
// pages for Porphyry's Isagoge ("1a5" — synthetic single-side pages), or
// Stephanus pages for Plato ("17a"). Every scheme-conditional in the reader
// should dispatch on the `CitationScheme` returned by `schemeFor(work)`
// instead of scattering `=== 'busse'` / `=== 'stephanus'` string tests.
//
// Two distinct grammars matter, and this module deliberately keeps them
// separate:
//
//   * a CITATION string — the form a scholar writes/copies: column and line
//     run together with no separator ("1097a15"), or just the column when the
//     scheme has no user-facing lines ("17a"). `formatCitation` produces this;
//     it's what the scroll-spy hash, copy-citation, and resume storage show.
//   * a LOCATION string — the `?loc=` query grammar: a column, optionally
//     followed by `:` and a line ("1097a:15" or "17a:12"). This is a routing
//     detail, not something a reader is meant to read as a citation, so it
//     keeps the line internally (DOM anchors still need it to scroll to an
//     exact Greek line) even for a lineless scheme. `parseLocation` reads
//     this grammar; nothing in this module composes it with a line for a
//     lineless scheme, because nothing upstream can ever hand one a line for
//     one (see `hasUserFacingLines` below).
//
// The known reader bug this replaces: splitting `?loc=` on ':' unconditionally
// produced `L17a-undefined` for a column-only value. `parseLocation` always
// returns a `line` of `null` rather than `NaN`/`undefined` when none is given,
// so a caller can branch on `line == null` to target the column-level anchor
// instead of a garbled line-level one.

import { citeLabel } from './data';
import { getWork } from './works';

export type SchemeId = 'bekker' | 'busse' | 'stephanus';

export interface ParsedLocation {
  column: string;
  line: number | null;
}

export interface CitationScheme {
  readonly id: SchemeId;
  // Bare-column token grammar shared by every scheme (mirrors scheme.py's
  // `_COLUMN_RE` — Bekker's real sides are a/b and Busse's is a-only, but the
  // grammar itself accepts a-e for all three so one regex serves them all;
  // real membership is enforced by the columns.json lookup, not this regex).
  readonly columnRegex: RegExp;
  // Whether individual line numbers within a column are meaningful,
  // user-facing citation targets. False only for stephanus — Plato is cited
  // page+letter only; lines exist in the underlying TEI but are editorial.
  readonly hasUserFacingLines: boolean;
  // Placeholder text for a citation-jump input box.
  readonly jumpPlaceholder: string;
  // Human label for the jump box / error copy ("Bekker citation", "Stephanus page").
  readonly label: string;
  // Parse + normalize a bare column token ("34b", "1097A" -> "1097a"). Returns
  // null if it doesn't match this scheme's column grammar.
  parseColumnToken(raw: string): string | null;
  // Parse a `?loc=` value: a bare column, or column + line joined by ':' or
  // (for backward compatibility with hand-typed Bekker citations) run
  // together with an optional space/dot separator ("1097a15", "1097a.15").
  // A line component on a scheme with no user-facing lines is invalid input
  // (there is no such thing as "line 12 of Stephanus page 34b"), not a value
  // to silently drop — this rejects rather than truncates it.
  parseLocation(raw: string): ParsedLocation | null;
  // Render the citation string a reader sees: "1097a15" (line given, scheme
  // has lines), "1097a" (no line, or a lineless scheme where `line` is
  // ignored regardless of what's passed).
  formatCitation(column: string, line?: number | null): string;
}

// Shared column/ref grammar (mirrors scheme.py's `_COLUMN_RE` / `_REF_RE`):
// digits + a single letter a-e, optionally followed by a line number.
const COLUMN_RE = /^(\d+)([a-e])$/;
const REF_RE = /^(\d+)([a-e])\.?(\d+)$/;

function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

function makeScheme(
  id: SchemeId,
  hasUserFacingLines: boolean,
  jumpPlaceholder: string,
  label: string,
): CitationScheme {
  function parseColumnToken(raw: string): string | null {
    const norm = normalize(raw);
    return COLUMN_RE.test(norm) ? norm : null;
  }

  function parseLocation(raw: string): ParsedLocation | null {
    const norm = normalize(raw);
    if (!norm) return null;

    // Bare column, e.g. "17a" or "1097a" — valid for every scheme.
    if (COLUMN_RE.test(norm)) return { column: norm, line: null };

    // "{column}:{line}" — the `?loc=` query grammar.
    const colon = norm.indexOf(':');
    if (colon !== -1) {
      const colPart = norm.slice(0, colon);
      const linePart = norm.slice(colon + 1);
      if (!COLUMN_RE.test(colPart) || !/^\d+$/.test(linePart)) return null;
      if (!hasUserFacingLines) return null; // no such thing as a lineless-scheme line
      return { column: colPart, line: Number(linePart) };
    }

    // Legacy concatenated citation form, e.g. "1097a15" / "1097a.15" — only
    // meaningful for a scheme with user-facing lines. For a lineless scheme
    // this is exactly the malformed "34b12" input that must be rejected, not
    // reinterpreted.
    if (!hasUserFacingLines) return null;
    const m = REF_RE.exec(norm);
    if (!m) return null;
    return { column: m[1] + m[2], line: Number(m[3]) };
  }

  function formatCitation(column: string, line?: number | null): string {
    if (hasUserFacingLines && line != null) return `${column}${line}`;
    return column;
  }

  return { id, columnRegex: COLUMN_RE, hasUserFacingLines, jumpPlaceholder, label, parseColumnToken, parseLocation, formatCitation };
}

const SCHEMES: Record<SchemeId, CitationScheme> = {
  bekker: makeScheme('bekker', true, 'e.g. 1097a15', 'Bekker citation'),
  busse: makeScheme('busse', true, 'e.g. 1a5', 'CAG citation'),
  stephanus: makeScheme('stephanus', false, 'e.g. 34b', 'Stephanus page'),
};

// The scheme for a scheme id; unknown/omitted defaults to bekker (matching
// scheme.py's `get(name)`).
export function scheme(id: SchemeId | string | null | undefined): CitationScheme {
  return (id && id in SCHEMES ? SCHEMES[id as SchemeId] : SCHEMES.bekker);
}

// The scheme a work is cited by — reads works.ts's `citation?.scheme`
// (default bekker), the same default the pipeline's `for_manifest` applies.
export function schemeFor(work: string): CitationScheme {
  return scheme(getWork(work)?.citation?.scheme);
}

// ── Convenience composers ──────────────────────────────────────────────────
// These aren't part of the per-scheme contract itself, but wrap it for the
// call sites that compose a citation/location string for a specific work
// (the scroll-spy hash, resume storage, copy-citation, and Search jump URLs).
// Reader.svelte and Search.svelte don't call these yet (that wiring is a
// later task) — they're here, exported and tested, for that task to use.

// The scroll-spy/resume/copy-citation string for a work's column (+ line):
// "1097a15" (bekker), "17a" (stephanus — line, if given, is dropped).
export function formatCite(work: string, column: string, line?: number | null, sub?: string): string {
  return citeLabel(getWork(work), column, line == null ? undefined : String(line) + (sub ?? ''));
}

// The `#`-prefixed hash for `history.replaceState` / a shareable link.
export function formatHash(work: string, column: string, line?: number | null): string {
  return `#${formatCite(work, column, line)}`;
}

// The `loc=` query VALUE (not URL-encoded) for a jump-in link: "1097a:15" when
// the scheme has user-facing lines and a line is given, otherwise the bare
// column — so a stephanus Search-result link reads as a clean "?loc=17a"
// rather than a line-level citation a Plato reader never sees elsewhere.
export function formatLocValue(work: string, column: string, line?: number | null): string {
  const s = schemeFor(work);
  return s.hasUserFacingLines && line != null ? `${column}:${line}` : column;
}
