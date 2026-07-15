/**
 * Stage 0 — normalize real Scrivener `.md` exports into the canonical
 * `ParsedImportFile` shape the import core (parseImportFile → plan → align)
 * already consumes. See workbench-design/d3a-stage0-scrivener-md.md (the
 * governing spec for THIS module) and d3-scrivener-import.md (frozen).
 *
 * The real exports (`.dev-corpus/scrivener-samples/`, gitignored) are NOT the
 * old 1:1 verse format. The Greek side is paragraph flow (3–5 lines carrying
 * ~60–75 Bekker lines) with inline Bekker markers every ~5 lines and print
 * soft-hyphens; the English side is many short content lines carrying the SAME
 * marker skeleton, plus Markdown footnotes and inline parenthetical Greek.
 *
 * This module owns everything that needs NO spine (marker harvest, hyphen
 * rejoin, artifact scrub, footnote import, inline-Greek marking, English
 * segmentation by markers). The two spine-dependent steps — token-level Greek
 * re-lineation and per-segment English distribution across spine-row ranges —
 * live in align.relineateGreek / plan.ts (§3/§4), which consume the typed
 * `ScrivenerNormalized` side-channel this module emits.
 *
 * Nothing is dropped silently (d3 Governing 4): every content-touching decision
 * records a `ScrivenerFlag` the dialog surfaces as a plain sentence.
 */

import type { ParsedImportFile, ImportFrontmatter } from './parseImportFile';

// ── entry-point form (the dialog form arrives in a later task) ────────────────

/** The small dialog form that recenters/labels a scrivener-md import (§1). */
export interface ScrivenerForm {
  work: string;
  book: number;
  chapter: number;
  /** Optional Bekker-start hint; frontmatter wins on disagreement (§2). */
  bekkerStart?: string;
}

// ── format detection (§1) ─────────────────────────────────────────────────────

export type ImportFormat = 'canonical' | 'scrivener-md' | 'unknown';

// ── markers (§2) ──────────────────────────────────────────────────────────────

/** A harvested Bekker marker. `kind` records which grammar form matched; a
 * `full` marker's `bekker` is the parenthesized address (a re-centering hint,
 * §2). Enum-suspect paren-line tokens are tagged so disambiguation can drop
 * them when the Greek side doesn't corroborate. */
export type MarkerKind = 'full' | 'paren-line' | 'unclosed' | 'tab-bare';

export interface Marker {
  raw: string;
  kind: MarkerKind;
  /** Character index into the (marker-bearing) source string. */
  charIndex: number;
  /** The parenthesized full Bekker address for a `full` marker (e.g. "1041a6"). */
  bekker?: string;
  /** The bare line number a paren-line / unclosed / tab-bare marker carries. */
  line?: number;
  /** True for a single-digit space-preceded paren-line token — an enum suspect (§2). */
  enumSuspect?: boolean;
}

// ── flags (honesty; §7 / Governing 4) ─────────────────────────────────────────

export type ScrivenerFlagKind =
  | 'uncertain-hyphen' // a line-break hyphen whose halves didn't form a plausible token
  | 'scrub' // a content-touching artifact scrub (e.g. trailing [[[[ junk)
  | 'enum-dropped' // a paren-line token dropped as a prose enumerator
  | 'orphan-footnote-ref' // [^fnN] ref with no body
  | 'orphan-footnote-body' // body with no [^fnN] ref in the text
  | 'inline-greek'; // a parenthetical re-marked as {grc:…}

export interface ScrivenerFlag {
  kind: ScrivenerFlagKind;
  /** Plain-language sentence the dialog shows (never a silent edit). */
  message: string;
}

// ── segments (§4) ─────────────────────────────────────────────────────────────

/**
 * A run of English text between two marker boundaries (§4a). `startBekker` is
 * the marker that opens the segment (the FIRST segment's is undefined — it runs
 * from the chapter start). Distribution across spine rows (§4b/c) happens in
 * plan.ts, which owns the spine index ranges.
 */
export interface EnglishSegment {
  /** The Bekker marker that opens this segment (`undefined` for the first). */
  startBekker?: Marker;
  /** The Bekker marker that closes it (`undefined` for the last). */
  endBekker?: Marker;
  /** The English text of the segment, already scrubbed / inline-Greek-marked. */
  text: string;
  /**
   * The segment's English PHYSICAL LINES (non-empty, in order). These are the
   * translator's own line breaks between markers — the unit the §4b 1:1 /
   * off-by-1 fast paths count against the segment's spine-row count (measured:
   * Meta is near-verse, one English line ≈ one Bekker line). Empty when the
   * segment is blank.
   */
  lines: string[];
}

// ── footnotes (§5) ────────────────────────────────────────────────────────────

/** A footnote imported from the English side, id remapped to chapter-local. */
export interface ScrivenerFootnote {
  /** Chapter-local id (first-appearance order, §5). */
  id: number;
  /** The original `[^fnN]` label (e.g. "fn6"). */
  sourceLabel: string;
  /** Multi-paragraph body (may be empty for an orphan ref). */
  body: string;
}

// ── the module's typed output ─────────────────────────────────────────────────

/**
 * Everything spine-free normalization produced, for plan.ts to finish with the
 * spine window. `greekFlow` is the joined, hyphen-rejoined, scrubbed Greek with
 * markers STILL PRESENT as `{{MK:idx}}` sentinels at their re-anchored offsets
 * (so relineateGreek can demote them as seeds); `greekMarkers` are those
 * markers in order. `english` is the raw English body already carrying
 * `{grc:…}`/`{^id:phrase}` markup; `segments` slice it by marker.
 */
export interface ScrivenerNormalized {
  source: 'scrivener-md';
  frontmatter: ImportFrontmatter;
  /** Joined Greek flow with markers replaced by `{{MK:idx}}` anchor sentinels. */
  greekFlow: string;
  /** Markers found in the Greek flow, in order (index === sentinel idx). */
  greekMarkers: Marker[];
  /** English body (markup-bearing), segmented by its marker skeleton. */
  segments: EnglishSegment[];
  /** Markers found in the English body, in order. */
  englishMarkers: Marker[];
  /** Imported footnotes (chapter-local ids). */
  footnotes: ScrivenerFootnote[];
  /** Every non-silent decision, for the preview. */
  flags: ScrivenerFlag[];
}

/** The sentinel placed where a Greek marker was, so re-lineation can find it. */
export const MARKER_SENTINEL_RE = /\{\{MK:(\d+)\}\}/g;
function markerSentinel(idx: number): string {
  return `{{MK:${idx}}}`;
}

// ── §2 marker grammar ─────────────────────────────────────────────────────────

// Ordered forms (d3a §2). Longest / most specific first so a full-ref isn't
// mis-read as a paren-line. Applied over a working string; each is anchored on a
// capture so charIndex is exact.
//   FULL_REF      \((\d{1,4}[ab]\d{1,3})\)   (73a21) (1041b1)
//   PAREN_LINE    \((\d{1,3})\)              (25) (9)
//   UNCLOSED_REF  \((\d{1,3})(?=\s|$)        (16   → repaired closed
//   TAB_BARE      (?:\t| {2,})(\d{1,3})(?=\s|$)   \t14
const FULL_REF_RE = /\((\d{1,4}[ab]\d{1,3})\)/g;
const PAREN_LINE_RE = /\((\d{1,3})\)/g;
const UNCLOSED_REF_RE = /\((\d{1,3})(?=\s|$)/g;
const TAB_BARE_RE = /(?:\t| {2,})(\d{1,3})(?=\s|$)/g;

interface RawMarkerHit {
  start: number;
  end: number;
  raw: string;
  kind: MarkerKind;
  bekker?: string;
  line?: number;
  enumSuspect?: boolean;
}

/**
 * Harvest every marker hit from `text` in one left-to-right pass, longest-form
 * priority. Overlapping hits are resolved by preferring the form listed first
 * (full > paren-line > unclosed > tab-bare) and, within a form, the earliest
 * start. Returns hits sorted by start with no overlaps.
 */
function harvestRawMarkers(text: string): RawMarkerHit[] {
  const hits: RawMarkerHit[] = [];
  const collect = (
    re: RegExp,
    kind: MarkerKind,
    make: (m: RegExpExecArray) => Partial<RawMarkerHit>,
  ) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const digitOffset = m[0].indexOf(m[1]);
      const start = m.index;
      hits.push({ start, end: start + m[0].length, raw: m[0].trim(), kind, ...make(m) });
      // tab-bare's leading whitespace is part of m[0]; keep the real span so
      // overlap resolution sees the digits, not the tab.
      void digitOffset;
    }
  };

  collect(FULL_REF_RE, 'full', (m) => ({ bekker: m[1] }));
  collect(PAREN_LINE_RE, 'paren-line', (m) => ({ line: Number(m[1]) }));
  collect(UNCLOSED_REF_RE, 'unclosed', (m) => ({ line: Number(m[1]) }));
  collect(TAB_BARE_RE, 'tab-bare', (m) => ({ line: Number(m[1]) }));

  // Resolve overlaps: sort by start, then by form priority; drop any hit that
  // overlaps an already-accepted (higher-priority or earlier) one.
  const priority: Record<MarkerKind, number> = { full: 0, 'paren-line': 1, unclosed: 2, 'tab-bare': 3 };
  hits.sort((a, b) => a.start - b.start || priority[a.kind] - priority[b.kind] || a.end - b.end);
  const accepted: RawMarkerHit[] = [];
  let lastEnd = -1;
  for (const h of hits) {
    // A paren-line/unclosed hit that is really the tail of a full-ref (its digits
    // sit inside an accepted full-ref span) is skipped by the overlap test.
    if (h.start < lastEnd) continue;
    accepted.push(h);
    lastEnd = h.end;
  }
  return accepted;
}

/**
 * Flag single-digit, SPACE-preceded (not tab) paren-line tokens as enum
 * suspects (§2). `(1)`…`(4)` mid-prose (APo) are enumerators unless the Greek
 * side corroborates; a tab-preceded or multi-digit paren-line is always a
 * marker. Corroboration is applied later (Greek-side gate).
 */
function tagEnumSuspects(text: string, hits: RawMarkerHit[]): void {
  for (const h of hits) {
    if (h.kind !== 'paren-line') continue;
    if (h.line === undefined || h.line > 9) continue; // multi-digit → real marker
    // Preceded by a tab or ≥2 spaces → a real marker (tab-bare-like); a single
    // space (or start) → enum suspect.
    const before = text.slice(Math.max(0, h.start - 2), h.start);
    const tabPreceded = /\t| {2}$/.test(before);
    if (!tabPreceded) h.enumSuspect = true;
  }
}

/** Convert accepted raw hits to public Markers (charIndex = hit.start). */
function toMarkers(hits: RawMarkerHit[]): Marker[] {
  return hits.map((h) => {
    const mk: Marker = { raw: h.raw, kind: h.kind, charIndex: h.start };
    if (h.bekker !== undefined) mk.bekker = h.bekker;
    if (h.line !== undefined) mk.line = h.line;
    if (h.enumSuspect) mk.enumSuspect = true;
    return mk;
  });
}

/**
 * Public marker harvest over an arbitrary text (Greek or English side).
 * Includes enum tagging. Corroboration-gated enum DROPPING happens in the
 * caller that has both sides (segmentEnglish), never here.
 */
export function harvestMarkers(text: string): Marker[] {
  const hits = harvestRawMarkers(text);
  tagEnumSuspects(text, hits);
  return toMarkers(hits);
}

// ── §7 artifact scrub ─────────────────────────────────────────────────────────

/** Trailing `[[[[`-style junk (Meta Greek EOF) and stray runs. Returns the
 * scrubbed text and whether anything was removed (→ a `scrub` flag). */
function scrubTrailingJunk(text: string): { text: string; scrubbed: boolean } {
  // Strip a trailing run of 2+ of the same bracket char (with surrounding ws).
  const m = /\s*([[\]{}])\1{1,}\s*$/.exec(text);
  if (m) return { text: text.slice(0, m.index), scrubbed: true };
  return { text, scrubbed: false };
}

// ── §3 scrubGreekFlow ─────────────────────────────────────────────────────────

/**
 * Join the Greek paragraph flow, harvest markers, rejoin both hyphen forms
 * (re-anchoring an interleaved marker to the join), strip provable junk, and
 * leave editorial `<…>` in place. Markers survive as `{{MK:idx}}` sentinels at
 * their re-anchored positions so relineateGreek can demote them as seeds (§3).
 *
 * Hyphen forms (measured):
 *   `ἐπι- στήμην`  (space or run of spaces after the hyphen)
 *   `διορί-\t(25) σωμεν`  (a marker sits between the halves)
 * Rejoin when the two halves form a plausible single token (both halves are
 * Greek-script letters); otherwise keep the hyphen and flag `uncertain-hyphen`
 * (a real dash between distinct words is never rejoined, §7).
 */
export function scrubGreekFlow(paragraphs: string[]): {
  greekFlow: string;
  markers: Marker[];
  flags: ScrivenerFlag[];
} {
  const flags: ScrivenerFlag[] = [];

  // 1. Join paragraphs into one flow (single space between).
  let flow = paragraphs.join(' ');

  // 2. Scrub trailing junk BEFORE marker harvest (it's never a marker).
  const junk = scrubTrailingJunk(flow);
  if (junk.scrubbed) {
    flow = junk.text;
    flags.push({
      kind: 'scrub',
      message:
        'We removed some stray bracket characters from the end of the Greek text — check the last line if it looks short.',
    });
  }

  // 3. Hyphen rejoin. Both forms: a `-` at a token's end followed (possibly
  //    across a marker) by the continuation. We work token-by-token so the
  //    marker between halves can be pulled to AFTER the join.
  const rejoined = rejoinHyphens(flow, flags);
  flow = rejoined;

  // 4. Harvest markers on the rejoined flow, then replace each with a sentinel
  //    (right-to-left so earlier charIndexes stay valid).
  const markers = harvestMarkers(flow);
  let out = flow;
  for (let i = markers.length - 1; i >= 0; i--) {
    const mk = markers[i];
    // The raw span in `out` may have leading whitespace (tab-bare); find the raw
    // token at charIndex and swap the whole matched marker for the sentinel.
    const span = markerSpan(out, mk);
    out = out.slice(0, span.start) + markerSentinel(i) + out.slice(span.end);
    mk.charIndex = span.start; // sentinel position (post-splice reference)
  }

  // 5. Collapse whitespace runs (AFTER marker harvest, §7) but keep sentinels.
  out = out.replace(/[ \t]+/g, ' ').trim();

  return { greekFlow: out, markers, flags };
}

/** Locate a marker's exact character span in `text` at/near its charIndex. */
function markerSpan(text: string, mk: Marker): { start: number; end: number } {
  // The public marker raw is trimmed; re-find it at/after charIndex allowing a
  // small drift from whitespace collapse. Prefer the exact charIndex.
  const at = text.indexOf(mk.raw, Math.max(0, mk.charIndex - 2));
  const start = at >= 0 ? at : mk.charIndex;
  return { start, end: start + mk.raw.length };
}

/**
 * Rejoin both hyphen forms. A hyphen-terminated token whose continuation forms
 * a plausible single Greek word is joined; an interleaved marker is pulled out
 * to sit AFTER the joined word (so it still anchors the right spine boundary).
 */
function rejoinHyphens(flow: string, flags: ScrivenerFlag[]): string {
  // Tokenize on whitespace but keep it simple: operate on a token array.
  const tokens = flow.split(/\s+/).filter((t) => t.length > 0);
  const out: string[] = [];
  const isGreekLetters = (s: string) => /[Ͱ-Ͽἀ-῿]/.test(s) && !/[()\d]/.test(s);
  const isMarkerish = (s: string) => /^\(?\d/.test(s) || /^\(\d{1,4}[ab]/.test(s);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.endsWith('-') && t.length > 1) {
      // Find the next NON-marker token as the continuation; hold any markers
      // encountered between so they can be re-emitted AFTER the join.
      let j = i + 1;
      const held: string[] = [];
      while (j < tokens.length && isMarkerish(tokens[j])) {
        held.push(tokens[j]);
        j++;
      }
      const head = t.slice(0, -1);
      const cont = j < tokens.length ? tokens[j] : '';
      // Plausible join: head ends and cont begins with Greek letters.
      if (cont && isGreekLetters(head.slice(-1)) && isGreekLetters(cont[0])) {
        out.push(head + cont);
        // Re-anchor interleaved markers AFTER the joined word.
        for (const h of held) out.push(h);
        i = j; // consumed through cont
        continue;
      }
      // Not plausibly one word — keep the hyphen, flag it, emit held markers.
      out.push(t);
      for (const h of held) out.push(h);
      i = j - 1;
      flags.push({
        kind: 'uncertain-hyphen',
        message:
          'A word split across a line break didn’t look like one word when rejoined — we kept it as-is; check the break here.',
      });
      continue;
    }
    out.push(t);
  }
  return out.join(' ');
}

// ── §6 inline Greek marking ───────────────────────────────────────────────────

const GREEK_SCRIPT_RE = /[Ͱ-Ͽἀ-῿]/;

/** A token counts as Greek-script if it contains any Greek-block codepoint. */
function isGreekToken(tok: string): boolean {
  return GREEK_SCRIPT_RE.test(tok);
}

/**
 * Re-mark parentheticals whose content is ≥60% Greek-script tokens as
 * `{grc:…}` with the parens OUTSIDE the span (§6): `(τὸ καθόλου)` →
 * `({grc:τὸ καθόλου})`. Greek punctuation stays inside; pure-Latin and
 * <60%-Greek parentheticals are untouched. Detection is per token.
 *
 * A parenthetical that is exactly ONE footnote anchor over a Greek gloss —
 * `({^1:τὴν οὐσίαν})`, the ref-precedes-gloss import case — gets the greek
 * span INSIDE the anchor (`({^1:{grc:τὴν οὐσίαν}})`): both are marks over the
 * same phrase, and anchor-outside keeps the fnRef range intact. Any OTHER
 * parenthetical containing anchor markup is left untouched (never wrap `{grc:}`
 * AROUND part of an anchor).
 *
 * A count of how many were marked is returned so the caller can flag once.
 */
export function markInlineGreek(text: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(/\(([^()]*)\)/g, (whole, inner: string) => {
    // Exactly one whole footnote anchor → greek mark inside the anchor.
    const am = /^\{\^(\d+):([^{}]*)\}$/.exec(inner);
    if (am) {
      const glossTokens = am[2].split(/\s+/).filter((t) => t.length > 0);
      if (glossTokens.length > 0) {
        let g = 0;
        for (const t of glossTokens) if (isGreekToken(t)) g++;
        if (g / glossTokens.length >= 0.6) {
          count++;
          return `({^${am[1]}:{grc:${am[2].trim()}}})`;
        }
      }
      return whole;
    }
    // Any other anchor-bearing parenthetical: leave untouched (conservative).
    if (inner.includes('{^')) return whole;

    const tokens = inner.split(/\s+/).filter((t) => t.length > 0);
    if (tokens.length === 0) return whole;
    let greek = 0;
    for (const t of tokens) if (isGreekToken(t)) greek++;
    if (greek / tokens.length >= 0.6) {
      count++;
      return `({grc:${inner.trim()}})`;
    }
    return whole;
  });
  return { text: out, count };
}

// ── §5 footnotes ──────────────────────────────────────────────────────────────

const FN_REF_RE = /\[\^([A-Za-z0-9]+)\]/g;
const FN_BODY_RE = /^\[\^([A-Za-z0-9]+)\]:[ \t]?([\s\S]*)$/;

/**
 * Normalize a footnote body's whitespace (§7 scrub): Scrivener/OCR bodies carry
 * Unicode LINE/PARAGRAPH SEPARATORs (U+2028/U+2029) and tab-indented "soft"
 * paragraph breaks INSTEAD of real newlines — which the chapterfile serializer
 * can't represent (it splits bodies on `\n` only, so an embedded U+2028 leaves a
 * later `N:`-looking entry mid-line and the round-trip fails). We fold both
 * separators to a real paragraph break (`\n\n`), strip the leading tab that
 * abuts them, collapse intra-line whitespace runs, and trim. The body stays
 * multi-paragraph (blank-line-separated) and round-trips through
 * serializeChapterFile/parseChapterFile by construction.
 */
function normalizeFootnoteBody(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    // U+2028 / U+2029 (+ any abutting tab/space) → a paragraph break.
    .replace(/[ \t]*[\u2028\u2029][ \t]*/g, '\n\n')
    // A tab used as an intra-line "soft" paragraph separator → paragraph break.
    .replace(/\t+/g, '\n\n')
    // Collapse 3+ newlines to a single blank-line paragraph break.
    .replace(/\n{3,}/g, '\n\n')
    // Collapse spaces on each line and trim the whole body.
    .split('\n')
    .map((l) => l.replace(/ {2,}/g, ' ').replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

/**
 * Import footnotes from the English body (§5): split the EOF body block from the
 * text, remap source labels to chapter-local ids in first-appearance order, and
 * rewrite each in-text `[^fnN]` ref as a `{^id:phrase}` anchor over the word
 * immediately preceding the ref — extended left over an abutting parenthetical
 * Greek gloss. Multi-paragraph bodies are preserved. Orphans (ref w/o body,
 * body w/o ref) are surfaced, never dropped.
 *
 * Returns the body text WITH refs rewritten as anchors and the body block
 * removed, plus the chapter-local footnote table and flags.
 */
export function importFootnotes(rawEnglish: string): {
  text: string;
  footnotes: ScrivenerFootnote[];
  flags: ScrivenerFlag[];
} {
  const flags: ScrivenerFlag[] = [];

  // 1. Separate the trailing footnote-body block from the running text. A body
  //    line starts with `[^label]:`; everything from the FIRST such line to EOF
  //    is the body block (bodies are multi-paragraph, so we can't stop early).
  const lines = rawEnglish.split('\n');
  let firstBodyLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\[\^[A-Za-z0-9]+\]:/.test(lines[i])) {
      firstBodyLine = i;
      break;
    }
  }
  const textPart = firstBodyLine >= 0 ? lines.slice(0, firstBodyLine).join('\n') : rawEnglish;
  const bodyPart = firstBodyLine >= 0 ? lines.slice(firstBodyLine).join('\n') : '';

  // 2. Parse body blocks: each starts at `^\[\^label\]:`; following lines
  //    (incl. blank) append until the next body header. Preserve multi-paragraph.
  const bodies = new Map<string, string>();
  if (bodyPart) {
    const bodyLines = bodyPart.split('\n');
    let curLabel: string | null = null;
    let curBuf: string[] = [];
    const flush = () => {
      if (curLabel !== null) bodies.set(curLabel, normalizeFootnoteBody(curBuf.join('\n')));
    };
    for (const ln of bodyLines) {
      const m = FN_BODY_RE.exec(ln);
      if (m) {
        flush();
        curLabel = m[1];
        curBuf = [m[2]];
      } else if (curLabel !== null) {
        curBuf.push(ln);
      }
    }
    flush();
  }

  // 3. Walk in-text refs in first-appearance order → chapter-local ids.
  const idByLabel = new Map<string, number>();
  const order: string[] = [];
  FN_REF_RE.lastIndex = 0;
  let mm: RegExpExecArray | null;
  while ((mm = FN_REF_RE.exec(textPart)) !== null) {
    const label = mm[1];
    if (!idByLabel.has(label)) {
      const id = order.length + 1;
      idByLabel.set(label, id);
      order.push(label);
    }
  }

  // 4. Rewrite refs as `{^id:phrase}` anchors (anchor selection below).
  const rewritten = rewriteFootnoteRefs(textPart, idByLabel);

  // 5. Build the footnote table (chapter-local, first-appearance order).
  const footnotes: ScrivenerFootnote[] = [];
  for (const label of order) {
    const body = bodies.get(label);
    if (body === undefined) {
      // Orphan ref: keep the anchor, empty body, non-blocking (§5).
      footnotes.push({ id: idByLabel.get(label)!, sourceLabel: label, body: '' });
      flags.push({
        kind: 'orphan-footnote-ref',
        message: `Footnote ${label} is referenced but has no text — it'll import empty; add the text later or remove the marker.`,
      });
    } else {
      footnotes.push({ id: idByLabel.get(label)!, sourceLabel: label, body });
    }
  }

  // 6. Bodies with no ref → cannot be anchored, surfaced (§5), NOT imported.
  for (const [label] of bodies) {
    if (!idByLabel.has(label)) {
      flags.push({
        kind: 'orphan-footnote-body',
        message: `There's a footnote with no place in the text (its marker is missing) — it can't be attached, so it's been left out; check footnote ${label}.`,
      });
    }
  }

  return { text: rewritten, footnotes, flags };
}

/**
 * Rewrite each in-text `[^label]` ref as a `{^id:phrase}` anchor (§5).
 *
 * Processing is ITERATIVE, always the RIGHTMOST remaining ref on the CURRENT
 * text: an anchor extension can reach LEFT past an earlier ref (fn2's
 * parenthetical extension in `is ([^fn1]τὴν οὐσίαν)[^fn2]` spans fn1), so
 * indices pre-collected in one pass go stale after such an edit and mangle the
 * text — the original BUG 1 ("is (" lost, literal "fn1]" residue). Re-scanning
 * after every edit keeps every offset fresh by construction.
 *
 * Anchor selection per ref:
 *   FORWARD (ref-precedes-gloss): the ref sits at the START of a parenthetical
 *     BEFORE the Greek gloss it annotates — `([^fn1]τὴν οὐσίαν)`. The ref is
 *     removed and the anchor is the gloss itself (`({^1:τὴν οὐσίαν})`); no
 *     character of the surrounding English is touched.
 *   BACKWARD (the §5 rule): the word immediately preceding the ref, extended
 *     left over an abutting parenthetical Greek gloss — UNLESS that gloss
 *     contains a raw ref or an existing anchor (an anchor nested inside another
 *     is unrepresentable in the editor's fnRef mark), in which case the anchor
 *     degrades to the word BEFORE the parenthetical group and the ref token is
 *     simply removed from its own position.
 */
function rewriteFootnoteRefs(text: string, idByLabel: Map<string, number>): string {
  let out = text;
  for (;;) {
    let last: { start: number; end: number; label: string } | null = null;
    FN_REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FN_REF_RE.exec(out)) !== null) {
      last = { start: m.index, end: m.index + m[0].length, label: m[1] };
    }
    if (!last) return out;
    out = rewriteOneRef(out, last.start, last.end, idByLabel.get(last.label)!);
  }
}

/** ≥60% of whitespace tokens contain Greek script (the §6 threshold reused). */
function isMostlyGreek(s: string): boolean {
  const tokens = s.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return false;
  let greek = 0;
  for (const t of tokens) if (isGreekToken(t)) greek++;
  return greek / tokens.length >= 0.6;
}

/** Wrap the word at [wStart,wEnd) as the anchor and DELETE the ref at
 * [refStart,refEnd) — two disjoint edits for the cases where the anchor word is
 * separated from the ref by a group the anchor must not swallow. */
function spliceSkipAnchor(
  text: string,
  wStart: number,
  wEnd: number,
  refStart: number,
  refEnd: number,
  id: number,
): string {
  return (
    text.slice(0, wStart) +
    `{^${id}:${text.slice(wStart, wEnd)}}` +
    text.slice(wEnd, refStart) +
    text.slice(refEnd)
  );
}

/** Rewrite ONE ref (at [start,end) in `text`) into its anchor form. */
function rewriteOneRef(text: string, start: number, end: number, id: number): string {
  const before = text.slice(0, start);

  // ── FORWARD: ref at the start of a parenthetical, gloss follows ────────────
  if (before.endsWith('(')) {
    const close = text.indexOf(')', end);
    const nextOpen = text.indexOf('(', end);
    if (close > end && (nextOpen === -1 || nextOpen > close)) {
      const gloss = text.slice(end, close);
      if (isMostlyGreek(gloss)) {
        return text.slice(0, start) + `{^${id}:${gloss}}` + text.slice(close);
      }
    }
    // Ref opens a parenthetical whose content is NOT a Greek gloss — anchor the
    // word before the group, remove the ref in place.
    const preParen = before.slice(0, -1).replace(/[ \t]+$/, '');
    const wm = /(\S+)$/.exec(preParen);
    if (wm) {
      return spliceSkipAnchor(text, preParen.length - wm[1].length, preParen.length, start, end, id);
    }
    return text.slice(0, start) + text.slice(end); // nothing to anchor — drop the ref
  }

  // ── BACKWARD: word before the ref, extended over an abutting (…) gloss ─────
  const tail = before.replace(/[ \t]+$/, '');
  if (tail.endsWith(')')) {
    const openIdx = tail.lastIndexOf('(');
    if (openIdx >= 0) {
      const group = tail.slice(openIdx);
      const preGroup = tail.slice(0, openIdx).replace(/[ \t]+$/, '');
      const wm = /(\S+)$/.exec(preGroup);
      if (!/\{\^|\[\^/.test(group)) {
        // Clean gloss → the existing rule: word + parenthetical as one anchor.
        const wStart = wm ? preGroup.length - wm[1].length : openIdx;
        return (
          text.slice(0, wStart) +
          `{^${id}:${text.slice(wStart, tail.length)}}` +
          text.slice(tail.length, start) +
          text.slice(end)
        );
      }
      // The gloss already carries (or still contains) another footnote — a
      // nested anchor is unrepresentable, so anchor the word before the group.
      if (wm) {
        return spliceSkipAnchor(text, preGroup.length - wm[1].length, preGroup.length, start, end, id);
      }
    }
  }

  // ── Simple: the word run immediately before the ref ────────────────────────
  const wm = /(\S+)$/.exec(tail);
  if (!wm) {
    // Ref at the very start of the text — nothing to anchor; drop the ref.
    return text.slice(0, start) + text.slice(end);
  }
  const wStart = tail.length - wm[1].length;
  return (
    text.slice(0, wStart) +
    `{^${id}:${text.slice(wStart, tail.length)}}` +
    text.slice(tail.length, start) +
    text.slice(end)
  );
}

// ── §4a English segmentation by markers ───────────────────────────────────────

/**
 * Segment the (already footnote/inline-Greek processed) English body by its
 * marker skeleton (§4a), collapsing consecutive duplicate boundaries (the
 * samples double them: "(9) …(9)"). Enum-suspect markers are dropped UNLESS the
 * Greek side corroborates a boundary at the aligned position (§2) — corroboration
 * is passed in as the set of line-numbers the Greek markers carry.
 *
 * Returns the segments (marker-bounded runs) and the surviving English markers.
 */
export function segmentEnglish(
  englishBody: string,
  greekLineNumbers: Set<number>,
): { segments: EnglishSegment[]; markers: Marker[]; flags: ScrivenerFlag[] } {
  const flags: ScrivenerFlag[] = [];
  const raw = harvestRawMarkers(englishBody);
  tagEnumSuspects(englishBody, raw);

  // Drop enum suspects the Greek side does not corroborate (§2). A suspect is
  // corroborated iff its line number is one the Greek markers also carry.
  const kept: RawMarkerHit[] = [];
  for (const h of raw) {
    if (h.enumSuspect && h.line !== undefined && !greekLineNumbers.has(h.line)) {
      flags.push({
        kind: 'enum-dropped',
        message: `We treated “(${h.line})” in the English as a list number, not a line number — it isn't in the Greek. If it's a line number, add it back.`,
      });
      continue;
    }
    kept.push(h);
  }

  const markers = toMarkers(kept);

  // Strip EVERY kept marker instance from the body text (BUG-2 fix): blanking
  // is LENGTH-PRESERVING (span → spaces) so every charIndex stays valid. This
  // covers both halves of a doubled boundary — collapse (below) keeps only ONE
  // of the pair as the boundary, and without blanking the other's raw "(9)"
  // leaked into the joined segment text. Enum-dropped tokens are prose
  // enumerators, NOT markers, and are deliberately left in the text.
  let cleanBody = englishBody;
  if (kept.length > 0) {
    const chars = englishBody.split('');
    for (const h of kept) {
      for (let i = h.start; i < h.end; i++) if (chars[i] !== '\n') chars[i] = ' ';
    }
    cleanBody = chars.join('');
  }

  // Collapse consecutive duplicate boundaries (§4a): the Scrivener convention
  // tags each English line with its Bekker line at the line's END, so a single
  // Bekker line spanning two English lines prints its number TWICE in a row
  // ("(9) …(9)"). Two consecutive markers with the SAME value are one boundary;
  // the text between them belongs to that boundary's segment (kept, not lost).
  const collapsed: Marker[] = [];
  for (const mk of markers) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && sameBoundary(prev, mk)) {
      // Same-valued consecutive marker → keep the LATER position as the boundary
      // (so the intervening text folds into this line's segment), drop the prior.
      collapsed[collapsed.length - 1] = mk;
      continue;
    }
    collapsed.push(mk);
  }

  // Build segments: text runs [prevMarkerEnd, thisMarkerStart) over the
  // marker-blanked body. The first segment runs from body start; the last from
  // the final marker to EOF. Each segment keeps the translator's PHYSICAL LINES
  // (newline-split) as the §4b fast-path unit, and a whitespace-joined `text`
  // for the §4c pre-split.
  const makeSegment = (open: Marker | undefined, close: Marker | undefined, raw: string): EnglishSegment => {
    // Treat EVERY break the translator used as a physical-line boundary: a hard
    // paragraph return (\n), a soft line break (Scrivener exports ↵ as U+2028
    // LSEP / U+2029 PSEP), and CR are all equivalent (John 2026-07-14). Splitting
    // on \n alone under-counted lines when the translator used soft breaks, so
    // the §4b 1:1 fast path never fired and every span fell to distribution
    // guessing (spurious "split" flags).
    const lines = raw
      .split(/[\r\n\u2028\u2029]/)
      .map((l) => collapseInline(l))
      .filter((l) => l.length > 0);
    return { startBekker: open, endBekker: close, text: lines.join(' '), lines };
  };

  const segments: EnglishSegment[] = [];
  let cursor = 0;
  let openMarker: Marker | undefined;
  for (const mk of collapsed) {
    segments.push(makeSegment(openMarker, mk, cleanBody.slice(cursor, mk.charIndex)));
    cursor = mk.charIndex + mk.raw.length;
    openMarker = mk;
  }
  segments.push(makeSegment(openMarker, undefined, cleanBody.slice(cursor)));

  return { segments, markers: collapsed, flags };
}

/** Collapse intra-line whitespace runs (tabs from marker removal, double
 * spaces) to single spaces and trim — WITHOUT touching newlines. */
function collapseInline(line: string): string {
  return line.replace(/[ \t]+/g, ' ').trim();
}

/** Two markers denote the same boundary iff they carry the same address/line. */
function sameBoundary(a: Marker, b: Marker): boolean {
  if (a.bekker !== undefined || b.bekker !== undefined) return a.bekker === b.bekker;
  return a.line !== undefined && a.line === b.line;
}

// ── format detection (§1) ─────────────────────────────────────────────────────

const CANONICAL_HEADER_RE = /(^|\n)\[(GREEK|ENGLISH)\]\s*(\n|$)/;
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---/;

/**
 * Detect the format of a file (§1). Canonical = YAML frontmatter AND
 * [GREEK]/[ENGLISH] headers. scrivener-md = no section headers, ≥3 harvested
 * markers, Greek-script content. Otherwise unknown.
 *
 * NOTE: scrivener detection runs per FILE, but a scrivener export is a Greek
 * file OR an English file (the pair is selected in the dialog). Either side of
 * a real pair yields ≥3 markers and (the Greek side always, the English side
 * usually) Greek-script content, so this returns scrivener-md for both.
 */
export function detectFormat(raw: string): ImportFormat {
  const hasFrontmatter = FRONTMATTER_RE.test(raw);
  const hasSectionHeaders = CANONICAL_HEADER_RE.test(raw);
  if (hasFrontmatter && hasSectionHeaders) return 'canonical';
  if (hasSectionHeaders) return 'canonical'; // headers present but no fm → still the canonical parser's job (it'll error clearly)

  const markers = harvestMarkers(raw);
  const hasGreek = GREEK_SCRIPT_RE.test(raw);
  if (markers.length >= 3 && hasGreek) return 'scrivener-md';
  return 'unknown';
}

// ── the top-level entry point (§8 signature) ──────────────────────────────────

/**
 * Normalize a Scrivener Greek+English pair into the `ScrivenerNormalized`
 * side-channel plan.ts consumes. Frontmatter comes from the dialog form (the
 * form itself arrives in a later task). This function does everything spine-free
 * (§2–§7); the spine-dependent re-lineation (§3) and distribution (§4b/c) run in
 * align.relineateGreek / plan.ts.
 *
 * `greekRaw` / `englishRaw` are the two file bodies (already read). The Greek is
 * treated as paragraph flow (one paragraph per physical line, as the samples
 * are); the English is the running body with its marker skeleton + footnotes.
 */
export function normalizeScrivenerPair(
  greekRaw: string,
  englishRaw: string,
  form: ScrivenerForm,
): ScrivenerNormalized {
  const flags: ScrivenerFlag[] = [];

  const frontmatter: ImportFrontmatter = {
    work: form.work,
    book: form.book,
    chapter: form.chapter,
  };
  if (form.bekkerStart !== undefined) frontmatter.bekkerStart = form.bekkerStart;

  // ── Greek side: scrub + rejoin + harvest, markers → sentinels ──────────────
  const greekParagraphs = greekRaw
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0);
  const greek = scrubGreekFlow(greekParagraphs);
  flags.push(...greek.flags);

  // The set of Bekker line numbers the Greek side carries as BARE-LINE markers
  // — the corroboration signal for English enum disambiguation (§2). A full-ref
  // tail is NOT corroboration: an enumerator "(1)" mid-prose must not be rescued
  // just because a full address like "74a1" ends in 1. Only a Greek paren-line /
  // tab-bare / unclosed marker of the same value corroborates a same-value
  // English paren-line as a real boundary.
  const greekLineNumbers = new Set<number>();
  for (const mk of greek.markers) {
    if (mk.kind !== 'full' && mk.line !== undefined) greekLineNumbers.add(mk.line);
  }

  // ── English side: footnotes → inline Greek → segment by markers ────────────
  const fn = importFootnotes(englishRaw);
  flags.push(...fn.flags);

  const ig = markInlineGreek(fn.text);
  if (ig.count > 0) {
    flags.push({
      kind: 'inline-greek',
      message:
        ig.count === 1
          ? 'We marked one Greek phrase in parentheses as Greek text — check the styling on that word.'
          : `We marked ${ig.count} Greek phrases in parentheses as Greek text — check the styling on those words.`,
    });
  }

  const seg = segmentEnglish(ig.text, greekLineNumbers);
  flags.push(...seg.flags);

  return {
    source: 'scrivener-md',
    frontmatter,
    greekFlow: greek.greekFlow,
    greekMarkers: greek.markers,
    segments: seg.segments,
    englishMarkers: seg.markers,
    footnotes: fn.footnotes,
    flags,
  };
}

/**
 * Build the canonical `ParsedImportFile` view of a normalized pair for callers
 * that only need the greek/english arrays PRE-relineation (e.g. detection tests,
 * or a fallback path). The greek side is the single joined flow (one element);
 * the english side is the segment texts. plan.ts uses the richer
 * `ScrivenerNormalized` instead — this is a convenience/compat shim and does NOT
 * satisfy the 1:1 guard, so it's never fed to parseImportFile's guards.
 */
export function toParsedImportFile(n: ScrivenerNormalized): ParsedImportFile & {
  scrivener: ScrivenerNormalized;
} {
  return {
    frontmatter: n.frontmatter,
    greek: [n.greekFlow.replace(MARKER_SENTINEL_RE, '').replace(/\s+/g, ' ').trim()],
    english: n.segments.map((s) => s.text),
    scrivener: n,
  };
}
