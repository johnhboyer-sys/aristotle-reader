// pdf-import/gutter.ts
//
// Detects printed Bekker gutter tics (the running page/column/line markers
// a critical edition prints in the margin, e.g. "1094a1", "5", "676a") in
// `pdftotext -layout` output, resolves each into a Bekker address, and binds
// it to the word it precedes in the reflowed text stream.
//
// Why this is hard: the tic is NOT a structural token in the PDF — it is
// just another string of digits placed at a particular column by the print
// layout. A gutter scanner has to tell "1094a1" (a real tic) apart from
// "1894)." (a footnote year), "93." (a footnote cross-reference), "1.2" (a
// division heading), "233" (a folio/running page number), and
// "sciences,1" (a footnote marker glued to the preceding word) using only
// position, spacing, and grammar — there is no markup left after
// `pdftotext -layout` flattens everything to plain text.
//
// The model, page by page:
//   1. First non-blank line is furniture (running head / Bekker range) and
//      is excluded from scanning — never an anchor, never a hyphen source.
//   2. A trailing block (folio number, footnote lines) is furniture too,
//      detected by scanning up from the bottom past a blank-line gap.
//   3. The page's side (recto/verso) is inferred from body indent *and*
//      from where the gutter-shaped tokens cluster; the two signals
//      corroborate each other, with a physical-page-alternation fallback
//      for pages too sparse to tell on their own.
//   4. Gutter-position candidates are collected, then narrowed to a tight
//      x-band (median column ± MAD) so off-column stray digits fall out.
//   5. Kept candidates are resolved into Bekker addresses (full-form tics
//      like "1094b1" roll the running column; bare tics like "5" inherit
//      it) and walked in reading order enforcing monotonicity — anything
//      that doesn't advance the address is either an "unmarked roll" (a
//      bare number that's actually the next column's line, printed without
//      the customary full form) or genuinely out of order and demoted to
//      an audit trail rather than trusted.
//   6. A same-column cadence self-audit (marks every 5th line, first
//      interval only 4) flags — but never interpolates — a missing mark.
//   7. Anchors bind to the first real word on the tic's own line, skipping
//      one token when that token is a hyphenation fragment carried over
//      from the previous line.
//   8. A page whose candidate geometry is too irregular (columns don't
//      line up, tics are stacked on consecutive lines) is flagged
//      collapsed: full-form tics still identify their column, but bare
//      tics on a collapsed page can't be trusted at their face-value
//      position and are flagged rather than silently kept.
//
// All of this is pure and stateless except for `DocContext`, which is
// threaded explicitly by the caller across pages (including across
// physical pages that turn out to be blank) so that a bare tic can inherit
// a column established several pages back, and so the cadence/monotonic
// audit keeps working across a page break.
//
// No I/O, no Tauri imports — this module only ever sees `Page` objects
// already split out by pages.ts.

import type { Page } from './pages';
import {
  classifyTicToken,
  findTrailingToken,
  isHeadingClassLine,
  isDisplayShapedLine,
  stripLikelyTicEnds,
  lineShape,
  ticSpanOnLine,
  LEFT_MIN,
  type Side,
  type BekkerCol,
} from './line-shape';

// The tic grammar (FULLFORM/BARE regexes), the recto/verso positional gates,
// and the trailing/leading token finders live in line-shape.ts (shared with
// divisions.ts); this module keeps the stateful pipeline.

export type { Side, BekkerCol };

// ---------------------------------------------------------------------------
// Constants (Phase 1 spec, amendments A1-A7 applied)
// ---------------------------------------------------------------------------

const BAND_MAD_K = 3;
const BAND_MIN_WIN = 6;
const BAND_OUTLIER_DELTA = 12;

const MIN_SIDE_TICS = 3;

const COLLAPSE_EDGE_SIGMA = 4;
const COLLAPSE_MED_DPRINT = 2;
const COLLAPSE_ADJ_FRAC = 0.5;
const MIN_TICS_FOR_COLLAPSE = 3;

const CADENCE_STEP = 5;

// EWMA smoothing for the cross-page band-drift check (§7). The spec fixes
// the *threshold* (12 cols) but not the smoothing constant; 0.3 is a
// conservative pick — slow enough that one noisy page can't swing the
// tracked band, fast enough to follow a genuine font/margin change within a
// handful of pages.
const BAND_EWMA_ALPHA = 0.3;

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

export interface Tic {
  /** Bekker page number (e.g. 1094), or null while unresolved. */
  page: number | null;
  /** Index into the page's `lines` array where the tic itself was printed. */
  lineIdx: number;
  /** The literal printed text of the tic (e.g. "5", "1094b1", "1098 b1"). */
  raw: string;
  /** Resolved "page+col" address string (e.g. "1094a"), or null if unresolved. */
  column: string | null;
  /** Resolved Bekker line number within `column`, or null if unresolved. */
  line: number | null;
  side: Side;
  anchorLineIdx: number | null;
  anchorCol: number | null;
  /** The bound word itself, punctuation-stripped — for tests/debugging. */
  anchorWord: string | null;
  flags: string[];
}

export interface DocContext {
  /** Current running Bekker page number, or null before any tic is seen. */
  page: number | null;
  col: BekkerCol | null;
  lastTic: { page: number; col: BekkerCol; line: number; physPage: number } | null;
  sideParity: { physPage: number; side: Side } | null;
  bandEwma: { recto: number | null; verso: number | null };
  anyTicSeen: boolean;
  docFlags: string[];
}

export interface PageScan {
  tics: Tic[];
  collapsed: boolean;
  side: Side | null;
  headerLineIdx: number | null;
  bottomFurnitureStartIdx: number | null;
  /**
   * Modal first-alpha column of the page's body lines (the side signal-A
   * measurement: recto → 0, verso → ~11), exposed so divisions.ts and the
   * heading-aware anchor binding share one measurement. Null when the page
   * has no qualifying body lines.
   */
  bodyLeft: number | null;
  flags: string[];
}

export function createDocContext(): DocContext {
  return {
    page: null,
    col: null,
    lastTic: null,
    sideParity: null,
    bandEwma: { recto: null, verso: null },
    anyTicSeen: false,
    docFlags: [],
  };
}

export interface RefusalStats {
  pages: number;
  nonEmptyPages: number;
}

export interface Refusal {
  refused: true;
  scanned: RefusalStats;
  lookedFor: string[];
  found: 'none';
  note: string;
}

// §12: document-level refusal. Callers invoke this once, after scanning
// every page, when `ctx.anyTicSeen` is still false.
export function buildRefusal(ctx: DocContext, pageStats: RefusalStats): Refusal {
  return {
    refused: true,
    scanned: pageStats,
    lookedFor: [
      'full-form Bekker tic (e.g. "1094a1", "676a")',
      'bare Bekker line tic (e.g. "5", "40")',
    ],
    found: 'none',
    note:
      'No printed Bekker gutter markers detected; not a Bekker-numbered edition, or ' +
      'the extraction lost the gutter.',
  };
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

interface Token {
  text: string;
  col: number;
}

function tokenizeWithCols(text: string): Token[] {
  const out: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ text: m[0], col: m.index });
  return out;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mad(values: number[], med: number): number {
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = -1;
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && best !== null && v < best)) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Candidate grammar (§6, A1-A3)
// ---------------------------------------------------------------------------

interface Candidate {
  lineIdx: number;
  raw: string;
  startCol: number;
  endCol: number; // exclusive
  kind: 'full' | 'bare';
  fullPage?: number;
  fullCol?: BekkerCol;
  fullLine?: number; // present only when the printed form carries a line number
  bareValue?: number;
}

// §6 candidate extraction: positional + grammar gates live in line-shape.ts'
// ticSpanOnLine (recto: last token, ≥4-space gap, start col ≥ 40, not a
// lone-integer folio line, not dash-adjacent; verso: first token at col ≤ 1
// followed by space + text) — here we just attach the resolved grammar.
function extractCandidate(line: string, lineIdx: number, side: Side): Candidate | null {
  const span = ticSpanOnLine(line, side);
  if (!span) return null;
  const [startCol, endCol] = span;
  const raw = line.slice(startCol, endCol);
  const cls = classifyTicToken(raw);
  if (!cls) return null; // unreachable: ticSpanOnLine already checked grammar
  return { lineIdx, raw, startCol, endCol, ...cls };
}

function extractRectoCandidate(line: string, lineIdx: number): Candidate | null {
  return extractCandidate(line, lineIdx, 'recto');
}

function extractVersoCandidate(line: string, lineIdx: number): Candidate | null {
  return extractCandidate(line, lineIdx, 'verso');
}

function collectRawCandidates(
  lines: string[],
  excluded: Set<number>
): { recto: Candidate[]; verso: Candidate[] } {
  const recto: Candidate[] = [];
  const verso: Candidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (excluded.has(i)) continue;
    const line = lines[i];
    if (isBlank(line)) continue;
    const r = extractRectoCandidate(line, i);
    if (r) recto.push(r);
    const v = extractVersoCandidate(line, i);
    if (v) verso.push(v);
  }
  return { recto, verso };
}

// ---------------------------------------------------------------------------
// §1/§4 Furniture: header + bottom block
// ---------------------------------------------------------------------------

function findHeaderLineIdx(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (!isBlank(lines[i])) return i;
  }
  return null;
}

// Best-effort implementation of the header guard ("only strip if it contains
// no cadence-consistent in-band tic"). This is a rare escape hatch with no
// coverage in the gold fixtures (real running heads never coincide with a
// genuine tic position); it's implemented conservatively — the header is
// stripped unless there is BOTH a resolvable candidate on it AND that
// candidate is a clean cadence step (4 or 5) from ctx.lastTic.
function headerHasCadenceConsistentTic(lines: string[], headerIdx: number, ctx: DocContext): boolean {
  if (!ctx.lastTic) return false;
  const line = lines[headerIdx];
  const candidates = [extractRectoCandidate(line, headerIdx), extractVersoCandidate(line, headerIdx)].filter(
    (c): c is Candidate => c !== null
  );
  for (const cand of candidates) {
    let page: number, col: BekkerCol, lineNo: number;
    if (cand.kind === 'full') {
      page = cand.fullPage!;
      col = cand.fullCol!;
      lineNo = cand.fullLine ?? 1;
    } else {
      if (ctx.page === null || ctx.col === null) continue;
      page = ctx.page;
      col = ctx.col;
      lineNo = cand.bareValue!;
    }
    if (page === ctx.lastTic.page && col === ctx.lastTic.col) {
      const delta = lineNo - ctx.lastTic.line;
      if (delta === 4 || delta === 5) return true;
    }
  }
  return false;
}

// Phase-3 §A3 adds † as a valid note-starter glyph, symmetric with *.
const FOOTNOTE_LINE_RE = /^\s*(\d+\.\s|[*†])/;
const LONE_INTEGER_RE = /^\d+$/;

// §4 + A6, with the Phase-3 coordinated amendment (see implementation-notes.md
// and pdf-import/footnotes.ts's identical computeNoteBlockStart, which this
// mirrors): a wrapped note's continuation line — including a DISPLAY line
// (AM1), which by construction doesn't look note-shaped at all — is
// encountered BEFORE its own note-opening line when scanning upward from the
// bottom, so the original "stop at the first line that isn't note-shaped"
// loop truncated the furniture region and left a note's continuation in the
// tic/division scan set. Fixed by absorbing every non-blank line once inside
// the trailing run regardless of shape, and resolving each blank-line run by
// PEEKING across it: if the next non-blank line above is display-shaped (AM1
// — a diagram/label line a genuine interior note gap always brackets), the
// gap is interior — absorb through and keep climbing; otherwise it's the
// terminal body/footnote gap — stop (real terminal gaps in the slice run
// 1-4 blank lines, so a fixed length threshold isn't a safe signal on its
// own). The peek does NOT require sawNoteLine to already be true — reversed
// (bottom-up) traversal reaches a display block's interior gap before its
// own note-opener is ever seen, so gating the peek on sawNoteLine would
// truncate the walk right there. Only the FINAL commit is gated on
// sawNoteLine — a trailing run with no note-starter anywhere in it is left
// as before (folio-only boundary, or none), no matter how far the peek
// climbed. footnotes.ts re-derives its own bounds independently regardless
// (defensive — correct even if this amendment is imperfect on some page
// this slice doesn't exercise).
function findBottomFurnitureStart(lines: string[]): number | null {
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

  if (LONE_INTEGER_RE.test(lines[i].trim())) {
    boundary = i;
    i--;
    while (i >= 0 && isBlank(lines[i])) i--;
  }

  let sawNoteLine = false;
  // Phase 5 fix (2026-07-06; mirrors footnotes.ts's computeNoteBlockStart,
  // logged in implementation-notes.md): anchor the block's start on the
  // TOPMOST note-starter line actually reached, never on `tentative` (the
  // outermost position the bridge-and-climb happened to reach). A
  // display-shaped bridge legitimately crosses an INTERIOR gap inside a note
  // (AM1's diagram case — reached before the note's own "N. " opener,
  // climbing bottom-up), but the same bridge can also over-absorb a genuine
  // BODY display block (a table) sitting directly above the footnote block
  // with only one blank-line gap and nothing note-shaped above it at all.
  // Nothing legitimate ever precedes a footnote block's own first note, so
  // the topmost note-starter is correct in both cases and excludes the
  // false one (Categories ch.4's ten-categories table, real-slice-measured).
  let topmostNoteStarter: number | null = null;
  while (i >= 0) {
    if (isBlank(lines[i])) {
      let k = i;
      while (k >= 0 && isBlank(lines[k])) k--;
      if (k < 0) break;
      if (isDisplayShapedLine(stripLikelyTicEnds(lines[k]).trim())) {
        i = k;
        continue;
      }
      break;
    }
    if (FOOTNOTE_LINE_RE.test(lines[i])) {
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
  if (extent > 0) {
    const threshold = firstNonBlank + 0.6 * extent;
    if (boundary < threshold) return null;
  }
  return boundary;
}

// ---------------------------------------------------------------------------
// §5 Side determination
// ---------------------------------------------------------------------------

interface SideDecision {
  side: Side;
  flags: string[];
  rectoCount: number;
  versoCount: number;
  /** Signal A's modal body indent — exposed on PageScan as bodyLeft. */
  bodyLeft: number | null;
}

function decideSide(
  lines: string[],
  excluded: Set<number>,
  ctx: DocContext,
  physPage: number
): SideDecision {
  // Signal A: modal indent, measured to the first Latin-alpha character —
  // this deliberately ignores a leading tic's own digits, so a verso tic
  // line ("25         must...") contributes its prose's indent (~11), not 0.
  const indents: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (excluded.has(i) || isBlank(lines[i])) continue;
    if (!/[A-Za-z]{3,}/.test(lines[i])) continue;
    const m = /[A-Za-z]/.exec(lines[i]);
    if (m) indents.push(m.index);
  }
  const modeIndent = mode(indents);
  let sigA: Side | null = null;
  if (modeIndent !== null) {
    if (modeIndent <= 1) sigA = 'recto';
    else if (modeIndent >= 8) sigA = 'verso';
  }

  const { recto, verso } = collectRawCandidates(lines, excluded);
  const R = recto.length;
  const L = verso.length;
  const sigB: Side | null = R === L ? null : R > L ? 'recto' : 'verso';

  const flags: string[] = [];
  let side: Side;

  if (sigA !== null && sigB !== null && sigA === sigB) {
    side = sigA;
  } else if (sigB !== null) {
    // Signals disagree, or signal A had no verdict (indent in the [2,7] gap
    // or no qualifying body lines). Trust B if it clears the evidence floor.
    flags.push('side-ambiguous');
    const winnerCount = sigB === 'recto' ? R : L;
    if (winnerCount >= MIN_SIDE_TICS) {
      side = sigB;
    } else {
      side = alternationFallback(ctx, physPage, flags, R, L);
    }
  } else {
    // Neither signal resolves (R === L, including 0 === 0) — alternation
    // fallback directly.
    flags.push('side-ambiguous');
    side = alternationFallback(ctx, physPage, flags, R, L);
  }

  return { side, flags, rectoCount: R, versoCount: L, bodyLeft: modeIndent };
}

function alternationFallback(ctx: DocContext, physPage: number, flags: string[], R: number, L: number): Side {
  if (ctx.sideParity) {
    const diff = physPage - ctx.sideParity.physPage;
    const flips = ((diff % 2) + 2) % 2; // 0 = same side, 1 = flipped
    const side: Side = flips === 0 ? ctx.sideParity.side : opposite(ctx.sideParity.side);
    flags.push('side-inferred');
    return side;
  }
  flags.push('side-unseeded');
  if (R !== L) return R > L ? 'recto' : 'verso';
  return 'recto'; // default on tie
}

function opposite(side: Side): Side {
  return side === 'recto' ? 'verso' : 'recto';
}

// ---------------------------------------------------------------------------
// §7 Gutter x-band
// ---------------------------------------------------------------------------

function establishBand(
  candidates: Candidate[],
  side: Side,
  ctx: DocContext
): { kept: Candidate[]; flags: string[]; localMedian: number | null } {
  if (candidates.length === 0) return { kept: [], flags: [], localMedian: null };
  const starts = candidates.map((c) => c.startCol);
  const m = median(starts);
  const madValue = mad(starts, m);
  const halfWidth = Math.max(BAND_MAD_K * madValue, BAND_MIN_WIN);
  const kept = candidates.filter((c) => Math.abs(c.startCol - m) <= halfWidth);

  const flags: string[] = [];
  const ewma = ctx.bandEwma[side];
  if (ewma !== null && Math.abs(m - ewma) > BAND_OUTLIER_DELTA) {
    flags.push('band-outlier');
  }
  return { kept, flags, localMedian: m };
}

// ---------------------------------------------------------------------------
// §8/§9/§10d: promotion (resolve + monotonic + cadence)
// ---------------------------------------------------------------------------

interface Addr {
  page: number;
  col: BekkerCol;
  line: number;
}

function cmpAddr(a: Addr, b: Addr): number {
  if (a.page !== b.page) return a.page - b.page;
  if (a.col !== b.col) return a.col === 'a' ? -1 : 1;
  return a.line - b.line;
}

function sameCol(a: Addr, b: Addr): boolean {
  return a.page === b.page && a.col === b.col;
}

interface PromotedTic {
  candidate: Candidate;
  addr: Addr | null;
  ticFlags: string[];
}

interface PromotionResult {
  promoted: PromotedTic[];
  pageFlags: string[];
  /** Last address accepted into the running (page,col) chain, for ctx update. */
  finalAddr: Addr | null;
}

function nextMultiplesOf5Between(loLine: number, hiLine: number): number[] {
  const out: number[] = [];
  let n = Math.ceil((loLine + 1) / CADENCE_STEP) * CADENCE_STEP;
  for (; n < hiLine; n += CADENCE_STEP) out.push(n);
  return out;
}

function promoteByCadenceMonotonic(band: Candidate[], side: Side, ctx: DocContext): PromotionResult {
  const promoted: PromotedTic[] = [];
  const pageFlags: string[] = [];

  let prevAddr: Addr | null = ctx.lastTic
    ? { page: ctx.lastTic.page, col: ctx.lastTic.col, line: ctx.lastTic.line }
    : null;
  let cadenceBase: Addr | null = prevAddr;
  // Running (page,col) context used to resolve bare tics, independent of
  // ctx.page/ctx.col until scanPage commits the whole page's result.
  let curPage = ctx.page;
  let curCol = ctx.col;

  for (const cand of band) {
    if (cand.kind === 'bare' && (curPage === null || curCol === null)) {
      promoted.push({
        candidate: cand,
        addr: null,
        ticFlags: ['position-unresolved:no-column-context'],
      });
      continue;
    }

    const addr: Addr =
      cand.kind === 'full'
        ? { page: cand.fullPage!, col: cand.fullCol!, line: cand.fullLine ?? 1 }
        : { page: curPage!, col: curCol!, line: cand.bareValue! };

    if (prevAddr === null || cmpAddr(addr, prevAddr) > 0) {
      // Accept.
      const ticFlags: string[] = [];
      if (cadenceBase && sameCol(addr, cadenceBase)) {
        const delta = addr.line - cadenceBase.line;
        if (delta >= 10) {
          for (const n of nextMultiplesOf5Between(cadenceBase.line, addr.line)) {
            pageFlags.push(`dropped-line:${addr.page}${addr.col}${n}`);
          }
        } else if (!(delta === CADENCE_STEP || (delta === 4 && cadenceBase.line === 1))) {
          ticFlags.push(`off-cadence-tic:${cand.raw}`);
        }
        cadenceBase = addr;
      } else {
        // New column (a roll) — resets the cadence chain with no drop check.
        cadenceBase = addr;
      }
      prevAddr = addr;
      curPage = addr.page;
      curCol = addr.col;
      promoted.push({ candidate: cand, addr, ticFlags });
    } else if (cand.kind === 'bare' && addr.line < prevAddr.line && sameCol(addr, prevAddr)) {
      promoted.push({
        candidate: cand,
        addr: null,
        ticFlags: [`unmarked-roll:${cand.bareValue}`, 'position-unresolved:unmarked-roll'],
      });
    } else {
      promoted.push({
        candidate: cand,
        addr, // kept for the audit trail; not used to advance the chain
        ticFlags: [`non-monotonic:${cand.raw}`],
      });
    }
  }

  return { promoted, pageFlags, finalAddr: prevAddr };
}

// ---------------------------------------------------------------------------
// §11 Collapse detector
// ---------------------------------------------------------------------------

function detectCollapse(band: Candidate[], side: Side): boolean {
  if (band.length < MIN_TICS_FOR_COLLAPSE) return false;
  const edges = band.map((c) => (side === 'verso' ? c.startCol : c.endCol));
  const xFail = stdev(edges) > COLLAPSE_EDGE_SIGMA;

  const sortedByLine = [...band].sort((a, b) => a.lineIdx - b.lineIdx);
  const gaps: number[] = [];
  for (let i = 1; i < sortedByLine.length; i++) {
    gaps.push(sortedByLine[i].lineIdx - sortedByLine[i - 1].lineIdx);
  }
  const gapFail =
    gaps.length > 0 &&
    (median(gaps) < COLLAPSE_MED_DPRINT || gaps.filter((g) => g <= 1).length / gaps.length > COLLAPSE_ADJ_FRAC);

  return xFail || gapFail;
}

// ---------------------------------------------------------------------------
// §10a-c Anchor binding
// ---------------------------------------------------------------------------

interface AnchorBinding {
  anchorLineIdx: number | null;
  anchorCol: number | null;
  anchorWord: string | null;
  flags: string[];
}

// Phase-2 §7b: a tic on a division-heading line (e.g. "Book 8   1155a1")
// marks the onset of the section's first line, mirroring the locked
// paragraph rule ("a break coinciding with an anchor binds forward"). It
// binds forward past the heading block — the b.c line and the title line —
// to the first body word, never to heading paratext. The tic itself stays
// in the gutter system (address/cadence/monotonic unchanged).
function forwardBindPastHeading(
  lines: string[],
  cand: Candidate,
  headerLineIdx: number | null,
  bottomFurnitureStartIdx: number | null,
  side: Side,
  bodyLeft: number
): AnchorBinding {
  for (let j = cand.lineIdx + 1; j < lines.length; j++) {
    if (bottomFurnitureStartIdx !== null && j >= bottomFurnitureStartIdx) break;
    if (j === headerLineIdx || isBlank(lines[j])) continue;
    const span = ticSpanOnLine(lines[j], side);
    const shape = lineShape(lines[j], bodyLeft, side, span);
    if (shape.shape !== 'body') continue; // intervening b.c / title line
    if (shape.startCol - bodyLeft >= LEFT_MIN) continue;
    // Hyphen-skip is a no-op here (previous line is heading/blank): bind the
    // residual's first token directly.
    const tokens = tokenizeWithCols(shape.residual);
    if (tokens.length === 0) continue;
    const tok = tokens[0];
    return {
      anchorLineIdx: j,
      anchorCol: tok.col,
      anchorWord: tok.text.replace(/[.,;:]+$/, ''),
      flags: ['anchor-forwarded-past-heading'],
    };
  }
  // No body line before page end: Phase 4 binds to the next page's first
  // body word.
  return { anchorLineIdx: null, anchorCol: null, anchorWord: null, flags: ['anchor-forwarded-cross-page'] };
}

function bindAnchor(
  lines: string[],
  cand: Candidate,
  headerLineIdx: number | null,
  bottomFurnitureStartIdx: number | null,
  side: Side,
  bodyLeft: number
): AnchorBinding {
  const line = lines[cand.lineIdx];
  if (isHeadingClassLine(line, bodyLeft, side, [cand.startCol, cand.endCol])) {
    return forwardBindPastHeading(lines, cand, headerLineIdx, bottomFurnitureStartIdx, side, bodyLeft);
  }
  // Blank out the tic token in place (rather than concatenating the two
  // slices) so remaining tokens keep their original column positions —
  // essential for verso, where the tic is at the FRONT of the line and a
  // naive concatenation would shift every subsequent column left.
  const withoutTic =
    line.slice(0, cand.startCol) + ' '.repeat(cand.endCol - cand.startCol) + line.slice(cand.endCol);
  const tokens = tokenizeWithCols(withoutTic);
  if (tokens.length === 0) {
    return { anchorLineIdx: null, anchorCol: null, anchorWord: null, flags: ['anchor-unresolved'] };
  }

  const prevIdx = cand.lineIdx - 1;
  const prevExcluded =
    prevIdx < 0 || prevIdx === headerLineIdx || (bottomFurnitureStartIdx !== null && prevIdx >= bottomFurnitureStartIdx);
  let hyphenBreak = false;
  if (!prevExcluded) {
    const prevLine = lines[prevIdx];
    if (!isBlank(prevLine)) {
      // Strip the previous line's own trailing tic (if any) before testing —
      // §10a: "strip trailing tic before the hyphen test."
      const prevTrailing = findTrailingToken(prevLine);
      const prevCls = prevTrailing ? classifyTicToken(prevTrailing.raw) : null;
      const prevStripped = prevCls
        ? prevLine.slice(0, prevTrailing!.startCol).replace(/\s+$/, '')
        : prevLine.replace(/\s+$/, '');
      hyphenBreak = /[A-Za-z]-$/.test(prevStripped);
    }
  }

  const idx = hyphenBreak && tokens.length > 1 ? 1 : 0;
  const tok = tokens[idx];
  return {
    anchorLineIdx: cand.lineIdx,
    anchorCol: tok.col,
    anchorWord: tok.text.replace(/[.,;:]+$/, ''),
    flags: [],
  };
}

// ---------------------------------------------------------------------------
// scanPage
// ---------------------------------------------------------------------------

export function scanPage(page: Page, ctx: DocContext): PageScan {
  const lines = page.lines;
  if (lines.every(isBlank)) {
    return {
      tics: [],
      collapsed: false,
      side: null,
      headerLineIdx: null,
      bottomFurnitureStartIdx: null,
      bodyLeft: null,
      flags: [],
    };
  }

  const headerLineIdx = findHeaderLineIdx(lines);
  const bottomFurnitureStartIdx = findBottomFurnitureStart(lines);

  const excluded = new Set<number>();
  if (headerLineIdx !== null && !headerHasCadenceConsistentTic(lines, headerLineIdx, ctx)) {
    excluded.add(headerLineIdx);
  }
  if (bottomFurnitureStartIdx !== null) {
    for (let i = bottomFurnitureStartIdx; i < lines.length; i++) excluded.add(i);
  }

  const sideDecision = decideSide(lines, excluded, ctx, page.index);
  const side = sideDecision.side;
  const bodyLeft = sideDecision.bodyLeft;
  const flags: string[] = [...sideDecision.flags];

  const { recto, verso } = collectRawCandidates(lines, excluded);
  const sideCandidates = side === 'recto' ? recto : verso;

  const { kept: band, flags: bandFlags, localMedian } = establishBand(sideCandidates, side, ctx);
  flags.push(...bandFlags);

  const { promoted, pageFlags, finalAddr } = promoteByCadenceMonotonic(band, side, ctx);
  flags.push(...pageFlags);

  const collapsed = detectCollapse(band, side);
  if (collapsed) flags.push('page-collapsed');

  const tics: Tic[] = promoted.map(({ candidate, addr, ticFlags }) => {
    const anchor = bindAnchor(lines, candidate, headerLineIdx, bottomFurnitureStartIdx, side, bodyLeft ?? 0);
    const ticFlagsOut = [...ticFlags, ...anchor.flags];

    let column: string | null = null;
    let line: number | null = null;
    let resolvedPage: number | null = null;
    if (addr) {
      resolvedPage = addr.page;
      column = `${addr.page}${addr.col}`;
      line = addr.line;
      if (collapsed && candidate.kind === 'bare' && !ticFlagsOut.some((f) => f.startsWith('non-monotonic'))) {
        // §11: on a collapsed page, bare tics can't be trusted at face value —
        // full-form tics keep their address because the printed column
        // identity itself disambiguates them regardless of geometry.
        column = null;
        line = null;
        resolvedPage = null;
        ticFlagsOut.push('position-unresolved:collapsed');
      }
    }

    return {
      page: resolvedPage,
      lineIdx: candidate.lineIdx,
      raw: candidate.raw,
      column,
      line,
      side,
      anchorLineIdx: anchor.anchorLineIdx,
      anchorCol: anchor.anchorCol,
      anchorWord: anchor.anchorWord,
      flags: ticFlagsOut,
    };
  });

  // --- ctx update (§2 step 10) ---
  if (tics.length > 0) ctx.anyTicSeen = true;
  if (finalAddr) {
    ctx.lastTic = { page: finalAddr.page, col: finalAddr.col, line: finalAddr.line, physPage: page.index };
    ctx.page = finalAddr.page;
    ctx.col = finalAddr.col;
  }
  const sideCount = side === 'recto' ? sideDecision.rectoCount : sideDecision.versoCount;
  if (sideCount >= MIN_SIDE_TICS) {
    ctx.sideParity = { physPage: page.index, side };
  }
  if (localMedian !== null) {
    const prevEwma = ctx.bandEwma[side];
    ctx.bandEwma[side] = prevEwma === null ? localMedian : BAND_EWMA_ALPHA * localMedian + (1 - BAND_EWMA_ALPHA) * prevEwma;
  }

  return { tics, collapsed, side, headerLineIdx, bottomFurnitureStartIdx, bodyLeft, flags };
}
