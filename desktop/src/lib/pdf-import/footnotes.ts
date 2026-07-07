// pdf-import/footnotes.ts
//
// Phase 3: footnote separation, marker<->note pairing, and scope
// autodetection on top of the Phase-1 gutter scanner and Phase-2 division
// tagger.
//
// The model. A critical edition prints footnotes in a block at the bottom of
// the page, below a blank-line gap from the body: numbered notes ("1. Reading
// ...") and/or a starred translator note ("* Translated by ..."). The SAME
// digit-dot grammar a footnote uses can also appear as a body section number
// (Magna Moralia's "1. Since ...", flush left, ABOVE the gap) — so footnote
// parsing is confined to the bottom-furniture region, never a whole-page
// grep. In the body, a footnote MARKER is glued directly to the preceding
// word/punctuation with no space ("sciences,1", "great-souled\"63") — this is
// what distinguishes it from an ordinary in-text number, and from the
// gutter's own tic grammar (which requires either a leading position or a
// wide gap before a trailing token — see line-shape.ts's ticSpanOnLine).
//
// A note can wrap across several printed lines. AM1 (the competing design's
// superior piece, grafted into this synthesis) distinguishes prose
// continuations (joined with a single space) from DISPLAY lines — a diagram
// row like "A    E   D   C    B" has too few letters or too much internal
// spacing to be prose, and must be kept on its own line, spacing intact, or a
// diagram note gets flattened into gibberish.
//
// Scope (does note numbering run continuously for the whole work, restart
// per book, or restart per chapter?) is inferred, never assumed: each
// transition between consecutive printed note numbers is scored against all
// three hypotheses using the division boundaries crossed between them, and
// hypotheses that mispredict die until one is left (or none — conflict,
// fallback to continuous, the reading that can never merge two distinct
// notes under one number).
//
// extractFootnotes runs AFTER scanPage and classifyDivisions for the same
// page (consuming scan.side/scan.tics and this page's Division[]), mutating
// a threaded FootnoteState. Per spec: "reset on the book-sequence:restart
// seam — NE and MM scored independently" — the established convention in
// this codebase (see gutter.ts's DocContext / divisions.ts's DivisionState
// notes) is that the CALLER starts a fresh state per work slice; this module
// does not self-detect a work seam from divisions (it would need the
// DivisionState, which isn't part of this signature) — see
// implementation-notes.md.
//
// footnotes.ts computes its OWN note-block bounds from `page.lines`
// (computeNoteBlockStart) rather than trusting scan.bottomFurnitureStartIdx —
// deliberately defensive per the coordinated Phase-1 amendment (see
// gutter.ts and implementation-notes.md): correct even if that amendment
// lands late or is imperfect elsewhere.
//
// No I/O, no Tauri imports.

import type { Page } from './pages';
import type { PageScan } from './gutter';
import type { Division } from './divisions';
import { ticSpanOnLine, RECTO_MIN_START_COL, isDisplayShapedLine, stripLikelyTicEnds } from './line-shape';

// ---------------------------------------------------------------------------
// Constants (spec §A0)
// ---------------------------------------------------------------------------

// NOTE_RE / STAR_RE / FOLIO_RE are implemented as matchNote/matchStar/matchFolio
// below (need capture of the remainder text, not just a boolean test).

// A2: glued marker grammar. Glued (?<=\S): abuts word/punctuation. Not
// followed by '.', digit, or a/b — excludes chapter refs (1.1), Bekker
// refs/column tokens (1094a/985b29), multi-digit runs.
export const MARKER_RE = /(?<=\S)(\d{1,3}|[*†])(?![.\dab])/g;

// §A1's NOTE_BLOCK_MIN_GAP (>=1 fully-blank line separates the footnote
// block from the body; observed: 2 in the Reeve slice) is enforced directly
// by computeNoteBlockStart's `sawGap` check below rather than as a named
// constant — there is no second call site to share it with.

// §A4: verdict after this many DISCRIMINATING (boundary-crossing) observations agree.
const SCOPE_DECIDE_N = 3;

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

export interface FootnoteNote {
  /** Stable identity as printed: "1".."222", or "*"/"†". */
  label: string;
  /** Numeric value for a numbered note; null for star/dagger. */
  printed: number | null;
  kind: 'numbered' | 'star';
  /** Assembled note text (AM1: prose continuations space-joined, display lines newline-preserved). */
  text: string;
  /** Verbatim per content line (starter prefix stripped from line 1), outer-trimmed. */
  rawLines: string[];
  /** Line index of the note's own opening line. */
  lineIdx: number;
  flags: string[];
}

export interface BodyMarker {
  /** "1".."999"-ish numeric string, or "*"/"†". */
  label: string;
  kind: 'numbered' | 'star';
  /** -1 for a marker glued to the running-head title (no body line). */
  lineIdx: number;
  col: number;
  raw: string;
  flags: string[];
}

export interface FootnotePair {
  label: string;
  marker: BodyMarker;
  note: FootnoteNote;
}

export interface PageFootnotes {
  /** This page's notes, in document order. */
  notes: FootnoteNote[];
  /** This page's body markers (glued in-text citations), in document order. */
  markers: BodyMarker[];
  /** This page's same-page marker<->note pairs. */
  pairs: FootnotePair[];
  unmatchedMarkers: BodyMarker[];
  unmatchedNotes: FootnoteNote[];
  /** Star/dagger notes attached via a running-head-glued marker (§A3: work-level, key `[^*]`/`[^†]`). */
  workLevelNotes: FootnoteNote[];
  /** Page-level flags (footnote-preamble-line, footnote-tic-ambiguous, footnote-marker-unmatched, etc.). */
  flags: string[];
}

export type ScopeKind = 'continuous' | 'per-book' | 'per-chapter';

export interface FootnoteState {
  /** Current division position, threaded across pages (like DivisionState). */
  currentBook: number | null;
  currentChapter: number | null;
  scopesAlive: { continuous: boolean; perBook: boolean; perChapter: boolean };
  lastNoteNumber: number | null;
  lastPos: { book: number | null; chapter: number | null } | null;
  discriminatingObs: number;
  /** null until §A4 step 5 fires (or a conflict forces the safe fallback). */
  verdict: ScopeKind | null;
  /** Document-level flags (footnote-scope:*, footnote-scope-conflict, footnote-number-gap:*). */
  flags: string[];
  /** All work-level (running-head-glued) star/dagger notes seen so far, in document order. */
  workLevelNotes: FootnoteNote[];
}

export function createFootnoteState(): FootnoteState {
  return {
    currentBook: null,
    currentChapter: null,
    scopesAlive: { continuous: true, perBook: true, perChapter: true },
    lastNoteNumber: null,
    lastPos: null,
    discriminatingObs: 0,
    verdict: null,
    flags: [],
    workLevelNotes: [],
  };
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function matchNote(line: string): { num: number; rest: string } | null {
  const m = /^\s*(\d{1,3})\.\s+(\S[\s\S]*)$/.exec(line);
  if (!m) return null;
  return { num: Number(m[1]), rest: m[2] };
}

function matchStar(line: string): { glyph: '*' | '†'; rest: string } | null {
  const m = /^\s*([*†])\s+(\S[\s\S]*)$/.exec(line);
  if (!m) return null;
  return { glyph: m[1] as '*' | '†', rest: m[2] };
}

function matchFolio(line: string): boolean {
  return /^\s*\d{1,4}\s*$/.test(line);
}

function isNoteStarterLine(line: string): boolean {
  return matchNote(line) !== null || matchStar(line) !== null;
}

// ---------------------------------------------------------------------------
// §A1 block bounds (defensively re-derived — see module header)
// ---------------------------------------------------------------------------

/**
 * The maximal trailing run of lines that (a) is separated from the last body
 * line by >=1 blank line and (b) contains >=1 note-starter line, including an
 * optional trailing folio and every interleaved continuation (prose or
 * display) line.
 *
 * Coordinated with gutter.ts's Phase-1 §4 amendment: a continuation is
 * encountered BEFORE its own note-opening line when walking upward from the
 * bottom, so the walk can't require every absorbed line to itself be
 * note-shaped — once >=1 note-starter has been seen, it keeps absorbing
 * non-blank lines regardless of shape. The hard part is telling apart a
 * TERMINAL blank gap (real gaps observed in the slice run 1-4 lines — there
 * is no safe universal length threshold) from an INTERIOR blank gap around a
 * display block (AM1: e.g. note 77's proportion diagram has a single blank
 * line between its diagram rows and the prose that follows). Resolved by
 * peeking across a blank run: if the next non-blank line above it is
 * display-shaped (AM1's isDisplayShapedLine — the diagram/label lines a
 * genuine interior note gap always brackets), the gap is interior — absorb
 * through it and keep climbing; otherwise it's the terminal body/footnote
 * gap — stop there. (An earlier version of this walk used "blank run length
 * >= 2" as the terminal signal; that over-absorbed real body content on
 * pages whose terminal gap happens to be exactly one blank line — see
 * implementation-notes.md.)
 *
 * The display-shape peek test does NOT require sawNoteLine to already be
 * true: because continuations are climbed in reverse (bottom-up), a note's
 * OWN opener is only discovered strictly above its continuations, so a
 * display-block's interior blank can be reached before any note-starter has
 * been seen yet. The `sawNoteLine` gate matters only for the final commit —
 * a trailing run with no note-starter anywhere in it is left as before
 * (folio-only boundary, or none), no matter how far the display-shape peek
 * climbed. (This was also a real bug in an earlier version — gating the
 * peek on sawNoteLine truncated the walk right at a genuine display block's
 * interior gap, e.g. note 77's diagram, before its opener was ever reached.)
 */
export function computeNoteBlockStart(lines: string[]): number | null {
  let firstNonBlank = -1;
  let lastNonBlank = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!isBlank(lines[i])) {
      if (firstNonBlank === -1) firstNonBlank = i;
      lastNonBlank = i;
    }
  }
  if (firstNonBlank === -1) return null;

  let i = lastNonBlank;
  let boundary: number | null = null;

  if (matchFolio(lines[i])) {
    boundary = i;
    i--;
    while (i >= 0 && isBlank(lines[i])) i--;
  }

  let sawNoteLine = false;
  // Phase 5 fix (2026-07-06, logged in implementation-notes.md): the block's
  // start is the TOPMOST note-starter line actually reached — never
  // `tentative` (the outermost position the climb happened to reach). A
  // display-shaped bridge can legitimately cross an INTERIOR gap inside a
  // note (AM1's diagram case: the diagram is reached before its own note's
  // "N. " opener, climbing bottom-up, so nothing above the topmost
  // note-starter is ever excluded by this). But the same bridge can also
  // over-absorb a genuine BODY display block (a table) that happens to sit
  // directly above the footnote block with only one blank-line gap — with
  // nothing note-shaped above it at all. Nothing legitimate can precede a
  // footnote block's own first note, so anchoring on the topmost
  // note-starter (rather than however far the climb was able to bridge)
  // is correct in both cases and excludes the false one.
  let topmostNoteStarter: number | null = null;
  while (i >= 0) {
    if (isBlank(lines[i])) {
      let k = i;
      while (k >= 0 && isBlank(lines[k])) k--;
      if (k < 0) break; // ran out of page
      if (isDisplayShapedLine(stripLikelyTicEnds(lines[k]).trim())) {
        i = k; // interior gap around a display line — absorb through it
        continue;
      }
      break; // terminal body/footnote gap
    }
    if (isNoteStarterLine(lines[i])) {
      sawNoteLine = true;
      topmostNoteStarter = i;
    }
    i--;
  }
  if (sawNoteLine) boundary = topmostNoteStarter;
  if (boundary === null) return null;

  let j = boundary - 1;
  let sawGap = false;
  while (j >= 0 && isBlank(lines[j])) {
    sawGap = true;
    j--;
  }
  if (!sawGap) return null;

  const extent = lastNonBlank - firstNonBlank;
  if (extent > 0 && boundary < firstNonBlank + 0.6 * extent) return null;
  return boundary;
}

// ---------------------------------------------------------------------------
// AM1: display-line classification + note-text assembly
// ---------------------------------------------------------------------------

// isDisplayShapedLine (line-shape.ts) implements AM1's display-line test:
// preserved on its own line, spacing intact, rather than flattened into prose.
const isDisplayLine = isDisplayShapedLine;

interface ContentLine {
  text: string; // outer-trimmed
  blankBefore: boolean;
}

/**
 * AM1 assembly: prose continuations join with a single space; a display line
 * is always newline-joined relative to its neighbours (its own line); a
 * blank line from the source is preserved as an extra line break only when
 * adjacent to a display line, dropped when it separated two prose lines.
 */
function assembleNoteText(contentLines: ContentLine[]): string {
  if (!contentLines.length) return '';
  let out = contentLines[0].text;
  let prevDisplay = isDisplayLine(contentLines[0].text);
  for (let k = 1; k < contentLines.length; k++) {
    const cur = contentLines[k];
    const curDisplay = isDisplayLine(cur.text);
    let sep: string;
    if (curDisplay || prevDisplay) {
      sep = cur.blankBefore ? '\n\n' : '\n';
    } else {
      sep = ' '; // blank (if any) dropped between two prose lines
    }
    out += sep + cur.text;
    prevDisplay = curDisplay;
  }
  return out;
}

// ---------------------------------------------------------------------------
// §A1 line-by-line block parse
// ---------------------------------------------------------------------------

interface OpenNote {
  label: string;
  printed: number | null;
  kind: 'numbered' | 'star';
  lineIdx: number;
  flags: string[];
  contentLines: ContentLine[];
}

function parseNoteBlock(lines: string[], start: number, pageFlags: string[]): FootnoteNote[] {
  const notes: FootnoteNote[] = [];
  let current: OpenNote | null = null;
  let prevNoteNum: number | null = null;
  let pendingBlank = false;

  const closeCurrent = () => {
    if (!current) return;
    notes.push({
      label: current.label,
      printed: current.printed,
      kind: current.kind,
      text: assembleNoteText(current.contentLines),
      rawLines: current.contentLines.map((c) => c.text),
      lineIdx: current.lineIdx,
      flags: current.flags,
    });
    current = null;
  };

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (isBlank(line)) {
      pendingBlank = true;
      continue;
    }

    if (matchFolio(line)) {
      closeCurrent();
      break; // §A1 rule 3: folio ends accumulation
    }

    const star = matchStar(line);
    if (star) {
      closeCurrent();
      current = { label: star.glyph, printed: null, kind: 'star', lineIdx: i, flags: [], contentLines: [] };
      current.contentLines.push({ text: star.rest.trim(), blankBefore: false });
      pendingBlank = false;
      continue;
    }

    const note = matchNote(line);
    if (note) {
      const isNew = prevNoteNum === null || note.num === prevNoteNum + 1 || note.num === 1;
      if (isNew) {
        closeCurrent();
        current = { label: String(note.num), printed: note.num, kind: 'numbered', lineIdx: i, flags: [], contentLines: [] };
        current.contentLines.push({ text: note.rest.trim(), blankBefore: false });
        prevNoteNum = note.num;
        pendingBlank = false;
        continue;
      }
      // §A1 rule 2 (else branch): continuation of the OPEN note, flagged.
      if (current) {
        current.flags.push(`footnote-continuation-numberlike:${note.num}`);
        current.contentLines.push({ text: line.trim(), blankBefore: pendingBlank });
      } else {
        pageFlags.push('footnote-preamble-line');
      }
      pendingBlank = false;
      continue;
    }

    // §A1 rule 4: ordinary continuation of the open note (AM1 display/prose).
    if (current) {
      current.contentLines.push({ text: line.trim(), blankBefore: pendingBlank });
    } else {
      pageFlags.push('footnote-preamble-line');
    }
    pendingBlank = false;
  }
  closeCurrent();
  return notes;
}

// ---------------------------------------------------------------------------
// §A2 body-marker detection
// ---------------------------------------------------------------------------

function blankTicSpan(line: string, scan: PageScan, lineIdx: number): string {
  if (scan.side === null) return line;
  const hasPromotedTic = scan.tics.some((t) => t.lineIdx === lineIdx);
  if (!hasPromotedTic) return line;
  const span = ticSpanOnLine(line, scan.side);
  if (!span) return line;
  return line.slice(0, span[0]) + ' '.repeat(span[1] - span[0]) + line.slice(span[1]);
}

/**
 * §A2 recto tic collision: a marker sitting where a tic would sit (last on
 * the line, at/after the recto gutter start column), whose numeric value is
 * ALSO a plausible next cadence step (delta 4 or 5) from the page's last
 * promoted recto tic, is genuinely ambiguous — a real tic whose customary
 * >=4-space gap collapsed during extraction is indistinguishable from a
 * footnote marker at face value. Withheld (flagged, not emitted) rather than
 * guessed; an off-band/off-cadence value survives as an ordinary marker.
 */
function isRectoCadencePlausible(value: number, scan: PageScan): boolean {
  const priorRectoTics = scan.tics.filter((t) => t.side === 'recto' && t.line !== null);
  if (!priorRectoTics.length) return false;
  const last = priorRectoTics[priorRectoTics.length - 1];
  const delta = value - (last.line ?? 0);
  return delta === 4 || delta === 5;
}

function scanBodyMarkers(
  page: Page,
  scan: PageScan,
  noteBlockStart: number | null,
  headingLines: Set<number>,
  pageFlags: string[]
): BodyMarker[] {
  const out: BodyMarker[] = [];
  const lines = page.lines;
  const limit = noteBlockStart ?? lines.length;
  for (let i = 0; i < limit; i++) {
    if (i === scan.headerLineIdx) continue;
    // §A2 runs over BODY lines only — a division heading's own dotted "b.c"
    // (or a captured title line) is not body prose, and a trailing digit
    // after its dot ("5.1") would otherwise look exactly like a glued
    // footnote marker to MARKER_RE. divisions.ts has already decided which
    // lines are heading-class for this page; reuse that instead of
    // re-deriving shape here.
    if (headingLines.has(i)) continue;
    const blanked = blankTicSpan(lines[i], scan, i);
    if (isBlank(blanked)) continue;
    const trimmedEnd = blanked.replace(/\s+$/, '').length;
    for (const m of blanked.matchAll(MARKER_RE)) {
      const raw = m[1];
      const startCol = m.index!;
      const isLastOnLine = startCol + raw.length >= trimmedEnd;
      if (scan.side === 'recto' && isLastOnLine && /^\d+$/.test(raw) && startCol >= RECTO_MIN_START_COL) {
        if (isRectoCadencePlausible(Number(raw), scan)) {
          pageFlags.push(`footnote-tic-ambiguous:${raw}`);
          continue; // withheld — never guessed
        }
      }
      out.push({
        label: raw,
        kind: raw === '*' || raw === '†' ? 'star' : 'numbered',
        lineIdx: i,
        col: startCol,
        raw,
        flags: [],
      });
    }
  }
  return out;
}

/**
 * §A2/§A3: a `*`/`†` glued to the running-head title (e.g. "Nicomachean
 * Ethics*", "†Magna Moralia*") is a WORK-LEVEL marker candidate, detected
 * separately from the body scan (the header line is furniture, never
 * scanned by scanBodyMarkers). "Glued" here means the glyph touches a letter
 * on either side with no space — a leading dagger decorating the title
 * itself (with no matching note anywhere, per AM3) is filtered out later, in
 * pairing, not here (this function only finds candidates).
 */
function headerGluedMarkers(page: Page, scan: PageScan): { glyph: '*' | '†'; col: number }[] {
  if (scan.headerLineIdx === null) return [];
  const line = page.lines[scan.headerLineIdx];
  const out: { glyph: '*' | '†'; col: number }[] = [];
  const re = /[*†]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const idx = m.index;
    const before = idx > 0 ? line[idx - 1] : '';
    const after = idx + 1 < line.length ? line[idx + 1] : '';
    if (/[A-Za-z]/.test(before) || /[A-Za-z]/.test(after)) {
      out.push({ glyph: m[0] as '*' | '†', col: idx });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// §A3 marker<->note pairing
// ---------------------------------------------------------------------------

function pairMarkersAndNotes(
  markers: BodyMarker[],
  headerGlued: { glyph: '*' | '†'; col: number }[],
  notes: FootnoteNote[],
  headerLineIdx: number | null,
  pageFlags: string[]
): { pairs: FootnotePair[]; unmatchedMarkers: BodyMarker[]; unmatchedNotes: FootnoteNote[]; workLevelNotes: FootnoteNote[] } {
  const pairs: FootnotePair[] = [];
  const unmatchedMarkers: BodyMarker[] = [];
  const unmatchedNotes: FootnoteNote[] = [];
  const workLevelNotes: FootnoteNote[] = [];
  const usedNotes = new Set<FootnoteNote>();

  // Numbered: first-to-first pairing by verbatim label; duplicates keep both.
  const byLabel = new Map<string, FootnoteNote[]>();
  for (const n of notes.filter((n) => n.kind === 'numbered')) {
    const arr = byLabel.get(n.label);
    if (arr) arr.push(n);
    else byLabel.set(n.label, [n]);
  }
  for (const [label, ns] of byLabel) {
    if (ns.length > 1) pageFlags.push(`footnote-duplicate-number:${label}`);
  }
  const nextIdx = new Map<string, number>();
  for (const marker of markers.filter((m) => m.kind === 'numbered')) {
    const ns = byLabel.get(marker.label);
    const idx = nextIdx.get(marker.label) ?? 0;
    if (ns && idx < ns.length) {
      pairs.push({ label: marker.label, marker, note: ns[idx] });
      usedNotes.add(ns[idx]);
      nextIdx.set(marker.label, idx + 1);
    } else {
      pageFlags.push(`footnote-marker-unmatched:${marker.label}`);
      unmatchedMarkers.push(marker);
    }
  }

  // Star/dagger: body-glued markers first, then running-head-glued (work-level).
  const starNotesByGlyph = new Map<string, FootnoteNote[]>();
  for (const n of notes.filter((n) => n.kind === 'star')) {
    const arr = starNotesByGlyph.get(n.label);
    if (arr) arr.push(n);
    else starNotesByGlyph.set(n.label, [n]);
  }
  for (const marker of markers.filter((m) => m.kind === 'star')) {
    const ns = starNotesByGlyph.get(marker.label) ?? [];
    const next = ns.find((n) => !usedNotes.has(n));
    if (next) {
      pairs.push({ label: marker.label, marker, note: next });
      usedNotes.add(next);
    } else {
      pageFlags.push(`footnote-marker-unmatched:${marker.label}`);
      unmatchedMarkers.push(marker);
    }
  }
  for (const hg of headerGlued) {
    const ns = starNotesByGlyph.get(hg.glyph) ?? [];
    const next = ns.find((n) => !usedNotes.has(n));
    if (next) {
      const marker: BodyMarker = {
        label: hg.glyph,
        kind: 'star',
        lineIdx: headerLineIdx ?? -1,
        col: hg.col,
        raw: hg.glyph,
        flags: ['footnote-star-worklevel'],
      };
      pairs.push({ label: hg.glyph, marker, note: next });
      usedNotes.add(next);
      workLevelNotes.push(next);
      pageFlags.push('footnote-star-worklevel');
    }
    // Else: AM3 — a glyph glued to the heading with NO matching note is inert
    // title decoration (the "†Magna Moralia*" case's leading dagger), never a
    // marker, never flagged.
  }

  for (const n of notes) {
    if (!usedNotes.has(n)) {
      pageFlags.push(`footnote-note-unmatched:${n.label}`);
      unmatchedNotes.push(n);
    }
  }

  return { pairs, unmatchedMarkers, unmatchedNotes, workLevelNotes };
}

// ---------------------------------------------------------------------------
// §A4 scope autodetection state machine
// ---------------------------------------------------------------------------

function predict(kind: ScopeKind, crossedBook: boolean, crossedChapter: boolean): 'continue' | 'reset' {
  if (kind === 'continuous') return 'continue';
  if (kind === 'per-book') return crossedBook ? 'reset' : 'continue';
  return crossedChapter ? 'reset' : 'continue';
}

function scoreTransition(state: FootnoteState, N: number, book: number | null, chapter: number | null): void {
  if (state.lastNoteNumber === null) {
    // Spec: "skip the slice's first note" — seed only.
    state.lastNoteNumber = N;
    state.lastPos = { book, chapter };
    return;
  }
  const P = state.lastNoteNumber;
  let actual: 'reset' | 'continue' | 'anomaly';
  if (N === 1) actual = 'reset';
  else if (N === P + 1) actual = 'continue';
  else actual = 'anomaly';

  if (actual === 'anomaly') {
    state.flags.push(`footnote-number-gap:${P}->${N}`);
    state.lastNoteNumber = N;
    state.lastPos = { book, chapter };
    return; // a data gap kills no hypothesis
  }

  const prevPos = state.lastPos!;
  const crossedBook = prevPos.book !== null && book !== null && book !== prevPos.book;
  const crossedChapter = crossedBook || (prevPos.chapter !== null && chapter !== null && chapter !== prevPos.chapter);
  const discriminating = crossedBook || crossedChapter;

  (['continuous', 'perBook', 'perChapter'] as const).forEach((key) => {
    if (!state.scopesAlive[key]) return;
    const kind: ScopeKind = key === 'perBook' ? 'per-book' : key === 'perChapter' ? 'per-chapter' : 'continuous';
    if (predict(kind, crossedBook, crossedChapter) !== actual) state.scopesAlive[key] = false;
  });
  if (discriminating) state.discriminatingObs += 1;

  const aliveCount =
    Number(state.scopesAlive.continuous) + Number(state.scopesAlive.perBook) + Number(state.scopesAlive.perChapter);
  if (aliveCount === 0) {
    // Zero alive (including a post-verdict contradiction, since once a
    // verdict is set exactly one scope remains alive — see §5 below — and a
    // later mismatch kills that last one too): safest fallback.
    state.flags.push('footnote-scope-conflict');
    state.verdict = 'continuous';
  } else if (state.verdict === null && state.discriminatingObs >= SCOPE_DECIDE_N && aliveCount === 1) {
    const kind: ScopeKind = state.scopesAlive.continuous ? 'continuous' : state.scopesAlive.perBook ? 'per-book' : 'per-chapter';
    state.verdict = kind;
    state.flags.push(`footnote-scope:${kind}`);
  }

  state.lastNoteNumber = N;
  state.lastPos = { book, chapter };
}

// ---------------------------------------------------------------------------
// extractFootnotes
// ---------------------------------------------------------------------------

type FootnoteEvent =
  | { lineIdx: number; kind: 'division'; division: Division }
  | { lineIdx: number; kind: 'note'; printed: number };

export function extractFootnotes(page: Page, scan: PageScan, divisions: Division[], state: FootnoteState): PageFootnotes {
  if (scan.side === null) {
    return { notes: [], markers: [], pairs: [], unmatchedMarkers: [], unmatchedNotes: [], workLevelNotes: [], flags: [] };
  }

  const lines = page.lines;
  const pageFlags: string[] = [];

  const noteBlockStart = computeNoteBlockStart(lines);
  const notes = noteBlockStart !== null ? parseNoteBlock(lines, noteBlockStart, pageFlags) : [];
  const headingLines = new Set<number>();
  for (const d of divisions) {
    headingLines.add(d.lineIdx);
    if (d.titleLineIdx !== null) headingLines.add(d.titleLineIdx);
  }
  const markers = scanBodyMarkers(page, scan, noteBlockStart, headingLines, pageFlags);
  const headerGlued = headerGluedMarkers(page, scan);

  const { pairs, unmatchedMarkers, unmatchedNotes, workLevelNotes } = pairMarkersAndNotes(
    markers,
    headerGlued,
    notes,
    scan.headerLineIdx,
    pageFlags
  );
  state.workLevelNotes.push(...workLevelNotes);

  // §A4: score every numbered note in document order, using its matched
  // marker's position when one exists (the in-body citation point is what
  // scope-crossing is measured against — see implementation-notes.md), else
  // falling back to the note's own (page-bottom) position for the rare
  // unmatched case. Divisions are merged in by line order so currentBook/
  // currentChapter reflect the position AT each scored event, including
  // divisions that land on this same page before or after a note.
  const pairedNoteToMarkerLine = new Map<FootnoteNote, number>();
  for (const p of pairs) pairedNoteToMarkerLine.set(p.note, p.marker.lineIdx);

  const events: FootnoteEvent[] = [];
  for (const d of divisions) events.push({ lineIdx: d.lineIdx, kind: 'division', division: d });
  for (const n of notes) {
    if (n.kind !== 'numbered') continue;
    const markerLine = pairedNoteToMarkerLine.get(n);
    events.push({ lineIdx: markerLine !== undefined && markerLine >= 0 ? markerLine : n.lineIdx, kind: 'note', printed: n.printed! });
  }
  events.sort((a, b) => a.lineIdx - b.lineIdx);

  for (const ev of events) {
    if (ev.kind === 'division') {
      state.currentBook = ev.division.book;
      state.currentChapter = ev.division.kind === 'chapter' ? ev.division.chapter : null;
      continue;
    }
    scoreTransition(state, ev.printed, state.currentBook, state.currentChapter);
  }

  return { notes, markers, pairs, unmatchedMarkers, unmatchedNotes, workLevelNotes, flags: pageFlags };
}
