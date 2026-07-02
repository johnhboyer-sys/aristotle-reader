/**
 * Import orchestration (d3 §4, §5, §6) — turn a parsed import file into an
 * `ImportPlan` the dialog renders and, on confirm, serializes.
 *
 * Responsibilities:
 *   - resolve the corpus (absent → failure (f));
 *   - refuse works whose scheme gutter.rowUnit !== 'bekker-line' (d3 §Governing 6);
 *   - compute the spine WINDOW via the shared `chapterSpineRows` helper dilated
 *     ±8 rows (§4), escalating chapter → book → whole work when the file is
 *     unhinted or the hinted window's coverage fails (§3.3, §4);
 *   - run seeding + banded DP (align.ts) and read the §5 per-row semantics;
 *   - parse `bekker_start` ONLY through the scheme, surfacing a discrepancy (§4,
 *     §7 (b)) without ever overriding the content match;
 *   - detect a whole-chapter no-match (§7 (a)) and a wrong declared chapter
 *     (§7 (b));
 *   - carry everything the dialog needs to render §6, including
 *     `buildChapterFile` (spine Greek + assigned English + column_starts) via the
 *     EXISTING serializer types. plan.ts NEVER writes files.
 *
 * Addresses stay opaque raw strings; `bekker_start`/spine addresses are parsed
 * and compared ONLY via `scheme.parseAddress`/`compareAddress`. No
 * `scheme.id === …` branch anywhere (d2 defect).
 */

import type { WorkCorpus } from '../data/corpusStore';
import { loadCorpus } from '../data/corpusStore';
import {
  chapterSpineRows,
  bookChapterNumbers,
  type ChapterSpineWindow,
  type FlatLine,
} from '../data/chapterRows';
import type { WorkManifest } from '../works/manifest';
import { getScheme } from '../citation/registry';
import type { Address } from '../citation/types';
import type { ChapterFile, ChapterFileMeta, ColumnStart } from '../chapterfile/types';
import { libraryStorage } from '../library/storage';
import { chapterFileName } from '../library/storage';
import { features, type LineFeatures } from './compareKey';
import { align, relineateGreek, type SpineRowKind, type RelineateResult } from './align';
import type { ParsedImportFile } from './parseImportFile';
import type { ScrivenerNormalized, Marker, EnglishSegment } from './scrivenerMd';

/** Dilation applied to the hinted window into the neighbours (d3 §4). */
export const WINDOW_DILATION = 8;
/** Whole-chapter no-match threshold: fraction of spine rows matched (d3 §7 (a)). */
export const COVERAGE_MIN = 0.4;
/** Auto-accept similarity floor (d3 §5). */
export const AUTO_ACCEPT_SIM = 0.55;
/** Low-confidence band floor (d3 §5): below this a match is not a match. */
export const LOW_CONF_SIM = 0.3;
/** Healthy-margin requirement over the runner-up spine row for auto-accept (d3 §5). */
export const AUTO_ACCEPT_MARGIN = 0.1;

/** Plain-language badge shown per spine row (never a numeric score, d3 §5). */
export type RowState = 'matched' | 'low-confidence' | 'split' | 'merged' | 'no-source';

/** Source format that produced a plan — the canonical file, or a scrivener-md pair. */
export type ImportSource = 'canonical' | 'scrivener-md';

export interface PlanRow {
  /** The spine row's canonical address as an OPAQUE raw string (dialog-opaque). */
  address: string;
  /** The bundled spine Greek — this is what gets saved (d3 §5). */
  spineGreek: string;
  /** The English proposed for this row (concatenated for merges, empty for tails/no-source). */
  proposedEnglish: string;
  state: RowState;
  /** True for every ⚠ row (any non-quiet state), for the >25% banner (d3 §5). */
  flagged: boolean;
  /**
   * The user's Greek for this row when it differs from the spine Greek — the
   * on-demand diff (d3 §5). Undefined when identical or when there's no single
   * source line (no-source / split-tail).
   */
  userGreek?: string;
}

/** An import line that matched nothing — the unplaced list (d3 §5, §6). */
export interface OrphanLine {
  importIndex: number;
  greek: string;
  english: string;
}

export type ImportPlanFailureKind =
  | 'corpus-absent' // §7 (f)
  | 'unsupported-scheme'
  | 'no-match' // §7 (a)
  | 'wrong-location'; // §7 (b)

export interface ImportPlanFailure {
  ok: false;
  kind: ImportPlanFailureKind;
  message: string;
  detail: string;
}

/** A resolved plan the dialog renders (§6). `blocked` is true whenever import must not proceed. */
export interface ImportPlan {
  ok: true;
  work: WorkManifest;
  book: number;
  chapter: number;
  rows: PlanRow[];
  orphans: OrphanLine[];
  /** True while any orphan is unresolved OR a location discrepancy stands (d3 §4/§5). */
  blocked: boolean;
  /** Fraction of ⚠ rows — the dialog shows the review banner above ~0.25 (§5). */
  flaggedFraction: number;
  /**
   * A non-fatal discrepancy the dialog surfaces (e.g. bekker_start disagreeing
   * with the content match, §4): plain sentence, import still proceeds unless
   * `blocked`. Absent when everything agreed.
   */
  discrepancy?: string;
  /** Spine window used (for buildChapterFile column_starts + tests). */
  window: { flat: FlatLine[]; start: number; end: number };
  /** Which format produced this plan (canonical unless a scrivener pair). */
  source: ImportSource;
  /**
   * Imported footnotes (scrivener-md only; chapter-local ids). Carried onto the
   * ChapterFile by buildChapterFile. Empty for the canonical path.
   */
  footnotes: PlanFootnote[];
  /**
   * Non-silent normalization notices from a scrivener-md import (hyphen/scrub/
   * enum/inline-Greek/orphan-footnote decisions, d3a §5/§7). Plain sentences the
   * dialog surfaces. Empty for the canonical path.
   */
  notices: string[];
}

/** A footnote to write into the ChapterFile (chapter-local id + body). */
export interface PlanFootnote {
  id: number;
  body: string;
}

export type ImportPlanResult = ImportPlan | ImportPlanFailure;

function fail(kind: ImportPlanFailureKind, message: string, detail: string): ImportPlanFailure {
  return { ok: false, kind, message, detail };
}

/** Raw address of flat line `k` (opaque string, same shape chapterRows stamps). */
function flatAddress(flat: FlatLine[], k: number): string {
  return `${flat[k].column}${flat[k].n}`;
}

// ── window selection ─────────────────────────────────────────────────────────

interface Window {
  book: number;
  chapter: number;
  /** Canonical (undilated) chapter bounds — the written file is bounded to these. */
  canonical: { start: number; end: number };
  /** Dilated bounds the aligner may look within. */
  dilated: { start: number; end: number };
  flat: FlatLine[];
}

function makeWindow(w: ChapterSpineWindow, book: number, chapter: number): Window {
  const dilStart = Math.max(0, w.start - WINDOW_DILATION);
  const dilEnd = Math.min(w.flat.length - 1, w.end + WINDOW_DILATION);
  return {
    book,
    chapter,
    canonical: { start: w.start, end: w.end },
    dilated: { start: dilStart, end: dilEnd },
    flat: w.flat,
  };
}

/** All (book, chapter) pairs in the corpus, in document order. */
function allChapters(corpus: WorkCorpus): Array<{ book: number; chapter: number }> {
  const out: Array<{ book: number; chapter: number }> = [];
  const books = new Set<number>();
  for (const c of corpus.chapters) books.add(c.book);
  for (const book of [...books].sort((a, b) => a - b)) {
    for (const chapter of bookChapterNumbers(corpus, book)) out.push({ book, chapter });
  }
  return out;
}

/** Where import line 0 is expected in the dilated spine array (the leading
 * dilation margin before the chapter's canonical start). */
function expectedOffset(win: Window): number {
  return win.canonical.start - win.dilated.start;
}

/**
 * Alignment coverage of a candidate window — QUALITY-weighted, not a raw match
 * count. The DP will always match a line somewhere (a low-sim match is cheaper
 * than a double gap), so match *count* saturates to 1.0 on every window; the
 * discriminating signal is the mean match SIMILARITY across the import block
 * (≈0.9 on the true window, ≈0.13 on unrelated Greek — measured on Ζ.17). A
 * match below LOW_CONF_SIM contributes nothing (it isn't really a match, §5).
 */
function windowCoverage(imports: LineFeatures[], win: Window): number {
  const spine = spineFeatures(win.flat, win.dilated.start, win.dilated.end);
  const result = align(imports, spine, expectedOffset(win));
  let total = 0;
  for (const a of result.imports) {
    if (a.role.kind === 'match' && a.role.sim >= LOW_CONF_SIM) total += a.role.sim;
  }
  return imports.length === 0 ? 0 : total / imports.length;
}

const spineFeatureCache = new WeakMap<FlatLine[], Map<number, LineFeatures>>();
function spineFeatures(flat: FlatLine[], start: number, end: number): LineFeatures[] {
  let byIndex = spineFeatureCache.get(flat);
  if (!byIndex) {
    byIndex = new Map();
    spineFeatureCache.set(flat, byIndex);
  }
  const out: LineFeatures[] = [];
  for (let k = start; k <= end; k++) {
    let f = byIndex.get(k);
    if (!f) {
      f = features(flat[k].text);
      byIndex.set(k, f);
    }
    out.push(f);
  }
  return out;
}

/**
 * Choose the spine window. Hinted (book+chapter present) tries that chapter's
 * dilated window first; if its coverage is below COVERAGE_MIN it escalates to a
 * whole-work sweep (§3.3, §4) and reports the winning chapter for the §7 (b)
 * discrepancy check. Unhinted goes straight to the sweep.
 */
function selectWindow(
  corpus: WorkCorpus,
  imports: LineFeatures[],
  hint: { book?: number; chapter?: number },
): { window: Window; sweptFrom?: { book?: number; chapter?: number } } | null {
  if (hint.book !== undefined && hint.chapter !== undefined) {
    const w = chapterSpineRows(corpus, hint.book, hint.chapter);
    if (w) {
      const win = makeWindow(w, hint.book, hint.chapter);
      if (windowCoverage(imports, win) >= COVERAGE_MIN) return { window: win };
    }
    // Hinted window missing or weak → sweep, remember the hint for §7 (b).
    const swept = sweepWholeWork(corpus, imports);
    if (swept) return { window: swept, sweptFrom: hint };
    return w ? { window: makeWindow(w, hint.book, hint.chapter) } : null;
  }
  const swept = sweepWholeWork(corpus, imports);
  return swept ? { window: swept } : null;
}

/**
 * Whole-work sweep (§3.3): score the cheap seed skeleton at each chapter's
 * window, then pick the best-covering chapter and return its dilated window.
 * Scoring reuses the same coverage measure (align is already O(N·B) per window
 * and there are ~150 chapters — well under the 3s budget for Metaphysics).
 */
function sweepWholeWork(corpus: WorkCorpus, imports: LineFeatures[]): Window | null {
  let best: Window | null = null;
  let bestCov = -1;
  for (const { book, chapter } of allChapters(corpus)) {
    const w = chapterSpineRows(corpus, book, chapter);
    if (!w) continue;
    const win = makeWindow(w, book, chapter);
    const cov = windowCoverage(imports, win);
    if (cov > bestCov) {
      bestCov = cov;
      best = win;
    }
  }
  return best;
}

// ── plan assembly ────────────────────────────────────────────────────────────

/**
 * Build the ImportPlan (or a typed failure). `parsed` is a successful
 * parseImportFile result; `work` is the resolved manifest (its id must equal
 * `parsed.frontmatter.work`); corpus is loaded via loadCorpus unless injected
 * (tests pass a corpus directly to stay off Tauri/fetch).
 */
export async function buildImportPlan(
  parsed: ParsedImportFile,
  work: WorkManifest,
  injectedCorpus?: WorkCorpus | null,
): Promise<ImportPlanResult> {
  const scheme = getScheme(work.scheme);

  // Refuse non-bekker-line works up front (§Governing 6).
  if (scheme.gutter.rowUnit !== 'bekker-line') {
    return fail(
      'unsupported-scheme',
      "Import isn't available for this work's citation style yet.",
      `scheme ${work.scheme} rowUnit=${scheme.gutter.rowUnit}`,
    );
  }

  const corpus = injectedCorpus !== undefined ? injectedCorpus : await loadCorpus(work.id);
  if (!corpus) {
    return fail(
      'corpus-absent',
      "The standard Greek text for this work isn't on this Mac yet, so lines can't be matched — add the work first, then import.",
      `loadCorpus(${work.id}) resolved absent`,
    );
  }

  // Scrivener-md path (d3a): the Greek is paragraph flow, not 1:1 lines, so it
  // re-lineates against the spine (§3) and distributes English by markers (§4)
  // instead of the line aligner. The canonical path below is byte-for-byte
  // unchanged.
  if (parsed.scrivener) {
    return buildScrivenerPlan(parsed.scrivener as ScrivenerNormalized, work, corpus, scheme);
  }

  const imports = parsed.greek.map((g) => features(g));
  const selected = selectWindow(corpus, imports, {
    book: parsed.frontmatter.book,
    chapter: parsed.frontmatter.chapter,
  });
  if (!selected) {
    return fail(
      'no-match',
      "None of this chapter's Greek lines matched the standard text for this work — check that the file's work and chapter are right, or that the Greek isn't from a very different edition.",
      'no window could be located for the import',
    );
  }
  const { window: win, sweptFrom } = selected;

  const spine = spineFeatures(win.flat, win.dilated.start, win.dilated.end);
  const result = align(imports, spine, expectedOffset(win));

  // Whole-chapter no-match (§7 (a)): QUALITY-weighted coverage (mean match sim,
  // same metric selectWindow ranks on) — a raw match count saturates to 1.
  const coverage = windowCoverage(imports, win);
  if (coverage < COVERAGE_MIN) {
    return fail(
      'no-match',
      "None of this chapter's Greek lines matched the standard text for this work — check that the file's work and chapter are right, or that the Greek isn't from a very different edition.",
      `coverage ${coverage.toFixed(2)} < ${COVERAGE_MIN} in window book ${win.book} ch ${win.chapter}`,
    );
  }

  // Wrong declared location (§7 (b)): the file names book/chapter but the
  // content matched elsewhere (the sweep moved us).
  if (
    sweptFrom &&
    sweptFrom.book !== undefined &&
    sweptFrom.chapter !== undefined &&
    (sweptFrom.book !== win.book || sweptFrom.chapter !== win.chapter)
  ) {
    return fail(
      'wrong-location',
      `This file is labeled Book ${sweptFrom.book}, Chapter ${sweptFrom.chapter}, but its text matches Book ${win.book}, Chapter ${win.chapter} — import there instead, or cancel and fix the label.`,
      `hinted (${sweptFrom.book},${sweptFrom.chapter}) vs matched (${win.book},${win.chapter})`,
    );
  }

  // ── build the per-spine-row plan, bounded to the CANONICAL window ──────────
  const rows: PlanRow[] = [];
  let flaggedCount = 0;
  for (let k = win.canonical.start; k <= win.canonical.end; k++) {
    const relIndex = k - win.dilated.start; // index into the aligned spine array
    const rowAssign = result.rows[relIndex];
    const spineGreek = win.flat[k].text;
    const address = flatAddress(win.flat, k);

    const plan = classifyRow(rowAssign?.kind ?? 'no-source', rowAssign, parsed);
    const row: PlanRow = {
      address,
      spineGreek,
      proposedEnglish: plan.english,
      state: plan.state,
      flagged: plan.flagged,
    };
    if (plan.userGreek !== undefined && plan.userGreek !== spineGreek) row.userGreek = plan.userGreek;
    rows.push(row);
    if (plan.flagged) flaggedCount++;
  }

  // Orphans (§5): only those that would BELONG to the canonical window are
  // surfaced. An orphan whose alignment neighbourhood is entirely in the
  // dilation margin is still an alien line and still blocks (honesty gate).
  const orphans: OrphanLine[] = result.orphans.map((i) => ({
    importIndex: i,
    greek: parsed.greek[i],
    english: parsed.english[i],
  }));

  // bekker_start reconciliation (§4): parsed ONLY via the scheme, never
  // overrides content. A disagreement is a surfaced discrepancy, not a failure.
  let discrepancy: string | undefined;
  if (parsed.frontmatter.bekkerStart) {
    discrepancy = reconcileBekkerStart(parsed.frontmatter.bekkerStart, rows, scheme, work.scheme);
  }

  const blocked = orphans.length > 0;
  const flaggedFraction = rows.length === 0 ? 0 : flaggedCount / rows.length;

  return {
    ok: true,
    work,
    book: win.book,
    chapter: win.chapter,
    rows,
    orphans,
    blocked,
    flaggedFraction,
    ...(discrepancy ? { discrepancy } : {}),
    window: { flat: win.flat, start: win.canonical.start, end: win.canonical.end },
    source: 'canonical',
    footnotes: [],
    notices: [],
  };
}

interface RowClassification {
  state: RowState;
  english: string;
  flagged: boolean;
  userGreek?: string;
}

/** Map an align SpineRowAssignment to the §5 badge, English, and diff. */
function classifyRow(
  kind: SpineRowKind,
  rowAssign: import('./align').SpineRowAssignment | undefined,
  parsed: ParsedImportFile,
): RowClassification {
  if (!rowAssign) {
    return { state: 'no-source', english: '', flagged: true };
  }
  const english = rowAssign.importIndices.map((i) => parsed.english[i]).join(' ');
  const firstImport = rowAssign.importIndices[0];
  const userGreek = firstImport !== undefined ? parsed.greek[firstImport] : undefined;

  switch (kind) {
    case 'match': {
      // Auto-accept gate (§5): 1:1 span, sim≥0.55, healthy margin, no adjacent gap.
      const oneToOne = rowAssign.importIndices.length === 1;
      const quiet =
        oneToOne &&
        rowAssign.sim >= AUTO_ACCEPT_SIM &&
        rowAssign.margin >= AUTO_ACCEPT_MARGIN &&
        !rowAssign.adjacentGap;
      if (quiet) return { state: 'matched', english, flagged: false, userGreek };
      // Low-confidence band 0.30–0.55, or a match that fails the structural gate.
      return { state: 'low-confidence', english, flagged: true, userGreek };
    }
    case 'merge':
      return { state: 'merged', english, flagged: true, userGreek };
    case 'split-head':
      return { state: 'split', english, flagged: true, userGreek };
    case 'split-tail':
      return { state: 'split', english: '', flagged: true };
    case 'no-source':
    default:
      return { state: 'no-source', english: '', flagged: true };
  }
}

/**
 * Reconcile the file's `bekker_start` against the content-matched first row.
 * Parsed and compared ONLY through the scheme. Returns a plain discrepancy
 * sentence when they disagree, else undefined. Never overrides the match.
 */
function reconcileBekkerStart(
  raw: string,
  rows: PlanRow[],
  scheme: ReturnType<typeof getScheme>,
  schemeId: import('../citation/types').SchemeId,
): string | undefined {
  if (rows.length === 0) return undefined;
  let declared: Address;
  try {
    declared = scheme.parseAddress(raw);
  } catch {
    return `The starting reference in this file's header (${raw}) isn't a valid reference for this work — the app matched the text on its own instead.`;
  }
  const actual: Address = { scheme: schemeId, raw: rows[0].address };
  if (scheme.compareAddress(declared, actual) !== 0) {
    return `This file's header says it starts at ${raw}, but its text matches the standard text starting at ${rows[0].address} — the app used the matched location.`;
  }
  return undefined;
}

// ── scrivener-md plan (d3a §3/§4) ────────────────────────────────────────────

/** Sentence-boundary characters used to cut a hard segment (d3a §4c). */
const SENTENCE_BOUNDARY_RE = /([.;·”—])/;

/**
 * Build a plan from a normalized scrivener-md pair (d3a). Re-lineate the Greek
 * flow onto the hinted chapter's spine rows (§3), then distribute the English
 * marker-segments across spine-row RANGES (§4) — never Bekker arithmetic, always
 * spine index ranges. The saved Greek is the spine Greek (d3 §5); the user's
 * re-lineated Greek is retained per row for the on-demand diff.
 *
 * Stage-0 exports always carry the form's book+chapter (§1), so this uses the
 * hinted window directly. A coverage miss surfaces §7 (a); the bekker_start /
 * first-full-ref hint recenters seeding but content always wins (§2).
 */
async function buildScrivenerPlan(
  n: ScrivenerNormalized,
  work: WorkManifest,
  corpus: WorkCorpus,
  scheme: ReturnType<typeof getScheme>,
): Promise<ImportPlanResult> {
  const book = n.frontmatter.book;
  const chapter = n.frontmatter.chapter;
  if (book === undefined || chapter === undefined) {
    return fail(
      'no-match',
      "None of this chapter's Greek lines matched the standard text for this work — check that the file's work and chapter are right, or that the Greek isn't from a very different edition.",
      'scrivener import has no book/chapter form hint',
    );
  }
  const w = chapterSpineRows(corpus, book, chapter);
  if (!w) {
    return fail(
      'no-match',
      "None of this chapter's Greek lines matched the standard text for this work — check that the file's work and chapter are right, or that the Greek isn't from a very different edition.",
      `chapter ${book}.${chapter} not in corpus`,
    );
  }
  const win = makeWindow(w, book, chapter);

  // Spine row texts for the CANONICAL window (the written chapter is bounded to
  // these; re-lineation targets exactly these rows so the count invariant holds).
  const spineRowTexts: string[] = [];
  for (let k = win.canonical.start; k <= win.canonical.end; k++) spineRowTexts.push(win.flat[k].text);

  const relined: RelineateResult = relineateGreek(n.greekFlow, spineRowTexts);

  // Whole-chapter no-match (§7 (a)): re-lineation coverage below the floor means
  // the flow isn't this chapter's text.
  if (relined.coverage < COVERAGE_MIN) {
    return fail(
      'no-match',
      "None of this chapter's Greek lines matched the standard text for this work — check that the file's work and chapter are right, or that the Greek isn't from a very different edition.",
      `relineate coverage ${relined.coverage.toFixed(2)} < ${COVERAGE_MIN} in ${book}.${chapter}`,
    );
  }

  // Map each marker (Greek + English side) to a spine row index via SPINE INDEX
  // RANGE — the address→row lookup, never arithmetic (§4a).
  const rowIndex = buildBekkerRowIndex(win);

  // Distribute the English segments across spine-row ranges (§4).
  const dist = distributeSegments(n.segments, n.englishMarkers, rowIndex, spineRowTexts.length, win);

  // §2a marker-vs-content boundary check: a Bekker marker is a PRIOR on where a
  // row breaks; content decides. When a marker (Greek or English) resolves to a
  // spine row that sits >±1 row from where the content actually placed the same
  // Bekker line, that row is surfaced as a ⚠ ("the line number you typed here
  // sits a word or two off from where the standard text breaks — check this
  // row."). We compare each Greek marker's resolved row to the same-valued
  // English marker's resolved row (both via the SPINE INDEX lookup, never
  // arithmetic); a disagreement flags the Greek marker's row.
  const boundaryWarnRows = markerBoundaryDisagreements(
    n.greekMarkers,
    n.englishMarkers,
    rowIndex,
    spineRowTexts.length,
  );

  // Assemble per-row plan.
  const rows: PlanRow[] = [];
  let flaggedCount = 0;
  for (let r = 0; r < spineRowTexts.length; r++) {
    const k = win.canonical.start + r;
    const spineGreek = win.flat[k].text;
    const address = flatAddress(win.flat, k);
    const rel = relined.rows[r];
    const cell = dist.rows[r];

    let state: RowState = cell.state;
    let flagged = cell.flagged;
    // A re-lineation divergence (low-similarity token walk / editorial insertion)
    // upgrades an otherwise-quiet row to low-confidence (§3).
    if (rel.lowConfidence && state === 'matched') {
      state = 'low-confidence';
      flagged = true;
    }
    // A marker-vs-content boundary disagreement (§2a) also upgrades the row.
    if (boundaryWarnRows.has(r) && state === 'matched') {
      state = 'low-confidence';
      flagged = true;
    }

    const row: PlanRow = {
      address,
      spineGreek,
      proposedEnglish: cell.english,
      state,
      flagged,
    };
    if (rel.userGreek && rel.userGreek !== spineGreek) row.userGreek = rel.userGreek;
    rows.push(row);
    if (flagged) flaggedCount++;
  }

  // bekker_start reconciliation (§2/§4): the first full-ref (or the form's
  // bekker_start) recenters seeding like bekker_start; a disagreement with the
  // matched first row is a surfaced discrepancy, never an override.
  let discrepancy: string | undefined;
  const declaredStart = n.frontmatter.bekkerStart ?? firstFullRef(n.greekMarkers);
  if (declaredStart) {
    discrepancy = reconcileBekkerStart(declaredStart, rows, scheme, work.scheme);
  }

  const footnotes: PlanFootnote[] = n.footnotes.map((f) => ({ id: f.id, body: f.body }));
  const notices = n.flags.map((f) => f.message);
  if (boundaryWarnRows.size > 0) {
    notices.push(
      `A line number you typed sits a word or two off from where the standard text breaks on ${boundaryWarnRows.size} row(s) — check the flagged rows.`,
    );
  }

  // Scrivener import is never blocked by orphans (the flow has no alien LINES —
  // every token rides a row); honesty is served by the per-row flags + notices.
  const flaggedFraction = rows.length === 0 ? 0 : flaggedCount / rows.length;

  await Promise.resolve(); // keep the async contract uniform with the canonical path

  return {
    ok: true,
    work,
    book: win.book,
    chapter: win.chapter,
    rows,
    orphans: [],
    blocked: false,
    flaggedFraction,
    ...(discrepancy ? { discrepancy } : {}),
    window: { flat: win.flat, start: win.canonical.start, end: win.canonical.end },
    source: 'scrivener-md',
    footnotes,
    notices,
  };
}

/** The first full-ref marker's Bekker address, if any (§2 recenter hint). */
function firstFullRef(markers: Marker[]): string | undefined {
  for (const mk of markers) if (mk.bekker !== undefined) return mk.bekker;
  return undefined;
}

/**
 * §2a: rows where the Greek and English marker skeletons disagree by >±1 spine
 * row on the SAME Bekker value — the marker "sits a word or two off from where
 * the standard text breaks." Both sides resolve through the SPINE INDEX lookup;
 * a full-ref matches exactly, a bare line matches monotonically. Returns the set
 * of (Greek-side) spine row indices to surface as ⚠.
 */
function markerBoundaryDisagreements(
  greekMarkers: Marker[],
  englishMarkers: Marker[],
  index: BekkerRowIndex,
  rowCount: number,
): Set<number> {
  const warn = new Set<number>();
  // Index the English markers by Bekker value → resolved rows.
  const englishRowsByValue = new Map<string, number[]>();
  let ecur = 0;
  for (const mk of englishMarkers) {
    const r = resolveMarkerRow(mk, index, ecur, rowCount - 1);
    ecur = r;
    const key = markerKey(mk);
    const arr = englishRowsByValue.get(key);
    if (arr) arr.push(r);
    else englishRowsByValue.set(key, [r]);
  }
  let gcur = 0;
  for (const mk of greekMarkers) {
    const gr = resolveMarkerRow(mk, index, gcur, rowCount - 1);
    gcur = gr;
    const key = markerKey(mk);
    const eRows = englishRowsByValue.get(key);
    if (!eRows || eRows.length === 0) continue;
    // Nearest English boundary of the same value.
    let nearest = eRows[0];
    for (const er of eRows) if (Math.abs(er - gr) < Math.abs(nearest - gr)) nearest = er;
    if (Math.abs(nearest - gr) > 1) warn.add(gr);
  }
  return warn;
}

/** A stable comparison key for a marker's Bekker value (full-ref or bare line). */
function markerKey(mk: Marker): string {
  if (mk.bekker !== undefined) return `b:${mk.bekker}`;
  if (mk.line !== undefined) return `l:${mk.line}`;
  return `raw:${mk.raw}`;
}

/**
 * Resolve a marker (full-ref bekker OR bare line) to canonical spine ROW INDICES
 * (0-based within the window), via the window's flat addresses — a SPINE INDEX
 * lookup, never Bekker arithmetic (column resets like 73b→74a break arithmetic,
 * §4a). A full-ref resolves to its exact row. A BARE LINE is ambiguous across
 * columns (`1041a11` and `1041b11` both match "11"), so it returns EVERY
 * candidate row; the caller picks the monotonic one (≥ the running cursor).
 */
interface BekkerRowIndex {
  /** Exact row for a marker's full-ref, or null. */
  exact(mk: Marker): number | null;
  /** All candidate rows for a marker (full-ref → [exact]; bare line → every match). */
  candidates(mk: Marker): number[];
}
function buildBekkerRowIndex(win: Window): BekkerRowIndex {
  const startK = win.canonical.start;
  const endK = win.canonical.end;
  const byFull = new Map<string, number>();
  const byLine = new Map<number, number[]>();
  for (let k = startK; k <= endK; k++) {
    const addr = `${win.flat[k].column}${win.flat[k].n}`;
    if (!byFull.has(addr)) byFull.set(addr, k - startK);
    const arr = byLine.get(win.flat[k].n);
    if (arr) arr.push(k - startK);
    else byLine.set(win.flat[k].n, [k - startK]);
  }
  const lineTail = (mk: Marker): number | undefined => {
    if (mk.bekker !== undefined) {
      const t = /(\d+)$/.exec(mk.bekker);
      return t ? Number(t[1]) : undefined;
    }
    return mk.line;
  };
  return {
    exact(mk) {
      if (mk.bekker !== undefined) {
        const r = byFull.get(mk.bekker);
        return r !== undefined ? r : null;
      }
      return null;
    },
    candidates(mk) {
      if (mk.bekker !== undefined) {
        const r = byFull.get(mk.bekker);
        if (r !== undefined) return [r];
      }
      const n = lineTail(mk);
      if (n === undefined) return [];
      return byLine.get(n) ?? [];
    },
  };
}

interface DistRow {
  english: string;
  state: RowState;
  flagged: boolean;
}
interface DistResult {
  rows: DistRow[];
}

/**
 * Distribute the English marker-segments across the spine rows (d3a §4).
 * Each segment spans [startRow, endRow) resolved by SPINE INDEX RANGE from its
 * bounding markers (§4a). Within a segment (§4b/c):
 *   - 1:1 (rowCount === sentenceCount-ish / one line) → place by position, quiet;
 *   - off-by-1 boundary artifact → auto-resolve (place, quiet);
 *   - otherwise → length-proportional pre-split, EVERY row flagged `split`.
 * Bare-line markers are resolved positionally (monotonic, nearest row ≥ the
 * previous boundary) so a column reset never mis-seats them.
 */
function distributeSegments(
  segments: EnglishSegment[],
  markers: Marker[],
  index: BekkerRowIndex,
  rowCount: number,
  win: Window,
): DistResult {
  const rows: DistRow[] = [];
  for (let r = 0; r < rowCount; r++) rows.push({ english: '', state: 'no-source', flagged: true });

  // Resolve each segment's [startRow, endRow) span monotonically. A boundary
  // marker resolves to its exact full-ref row, or (bare line) to the nearest
  // candidate row ≥ the running cursor — so a column reset (73b→74a; 1041a→1041b)
  // never seats a bare "11" on the wrong column (§4a).
  // The Scrivener convention tags each English line with its Bekker line at the
  // line's END, so a segment's CLOSING marker names the LAST spine row the
  // segment covers — the end boundary is INCLUSIVE of the marked row. The span
  // is [cursor, closeRow] inclusive → [cursor, closeRow+1) half-open.
  let cursor = 0;
  const spans: Array<{ startRow: number; endRow: number; lines: string[] }> = [];
  for (const seg of segments) {
    let endRow: number;
    if (seg.endBekker) {
      const closeRow = resolveMarkerRow(seg.endBekker, index, Math.max(cursor, 0), rowCount - 1);
      endRow = closeRow + 1; // inclusive of the marked row
    } else {
      endRow = rowCount; // last segment runs to chapter end
    }
    const s = cursor;
    const e = Math.max(endRow, s + (seg.lines.length ? 1 : 0));
    spans.push({ startRow: s, endRow: Math.min(e, rowCount), lines: seg.lines });
    cursor = Math.min(e, rowCount);
  }

  for (const span of spans) {
    if (!span.lines.length) continue;
    const nRows = Math.max(1, span.endRow - span.startRow);
    const greekTokCounts: number[] = [];
    for (let r = span.startRow; r < span.startRow + nRows && r < rowCount; r++) {
      greekTokCounts.push(countTokens(win.flat[win.canonical.start + r].text));
    }
    const pieces = distributeSegment(span.lines, nRows, greekTokCounts);
    for (let p = 0; p < pieces.length; p++) {
      const r = span.startRow + p;
      if (r >= rowCount) break;
      const piece = pieces[p];
      rows[r] = {
        english: piece.text,
        state: piece.state,
        flagged: piece.flagged,
      };
    }
  }

  return { rows };
}

/**
 * Resolve a marker to a spine row, monotonically: prefer an exact full-ref row;
 * otherwise the smallest candidate row ≥ `cursor` (so ambiguous bare lines seat
 * on the right column after a reset). Falls back to the cursor when nothing
 * resolves at/after it (a marker the window doesn't carry — the segment simply
 * abuts the previous one). Result is clamped to [0, rowCount].
 */
function resolveMarkerRow(mk: Marker, index: BekkerRowIndex, cursor: number, rowCount: number): number {
  const exact = index.exact(mk);
  if (exact !== null) return clampRow(exact, rowCount);
  const cands = index.candidates(mk);
  let pick: number | null = null;
  for (const c of cands) {
    if (c >= cursor && (pick === null || c < pick)) pick = c;
  }
  if (pick === null && cands.length) {
    // No candidate at/after the cursor — take the largest (a marker slightly
    // behind, e.g. a re-stated boundary); still monotonic-ish.
    pick = Math.max(...cands);
  }
  return clampRow(pick ?? cursor, rowCount);
}

function clampRow(r: number, rowCount: number): number {
  if (r < 0) return 0;
  if (r > rowCount) return rowCount;
  return r;
}

function countTokens(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

interface Piece {
  text: string;
  state: RowState;
  flagged: boolean;
}

/**
 * Distribute one segment's English across `nRows` spine rows (d3a §4b/c). The
 * segment's PHYSICAL LINES (the translator's own breaks) are the fast-path unit:
 *   - line count === row count → 1:1, place line k on row k, quiet ✓ (Meta's
 *     near-verse whole chapter);
 *   - off by exactly 1 → auto-resolve by position, quiet ✓ (a doubled/absorbed
 *     boundary line — the measured Meta case);
 *   - otherwise → join the lines and length-proportional PRE-SPLIT across the
 *     rows at sentence/clause boundaries, weighted by each row's Greek token
 *     count; EVERY row flagged `split` (never auto-accepted; the measured APo
 *     hard-segment case).
 */
export function distributeSegment(lines: string[], nRows: number, greekTokCounts: number[]): Piece[] {
  const clean = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  const out: Piece[] = [];
  for (let r = 0; r < nRows; r++) out.push({ text: '', state: 'no-source', flagged: true });

  if (clean.length === 0) return out;

  // 1:1 fast path — exactly one English line per spine row.
  if (clean.length === nRows) {
    for (let r = 0; r < nRows; r++) out[r] = { text: clean[r], state: 'matched', flagged: false };
    return out;
  }

  // Off-by-1 auto-resolve (boundary artifact). Place by position, quiet.
  if (Math.abs(clean.length - nRows) === 1) {
    if (clean.length === nRows - 1) {
      // One fewer line than rows: place lines on the first rows; the extra row
      // is a genuine no-source (spine line the translator didn't break out).
      for (let r = 0; r < nRows; r++) {
        out[r] = r < clean.length
          ? { text: clean[r], state: 'matched', flagged: false }
          : { text: '', state: 'no-source', flagged: true };
      }
    } else {
      // One more line than rows: place the first nRows-1 lines 1:1, fold the
      // remaining two into the last row (a merge — the boundary line absorbed).
      for (let r = 0; r < nRows - 1; r++) out[r] = { text: clean[r], state: 'matched', flagged: false };
      out[nRows - 1] = { text: clean.slice(nRows - 1).join(' '), state: 'matched', flagged: false };
    }
    return out;
  }

  // Hard segment (merged paragraphs) → length-proportional pre-split, all ⚠.
  const joined = clean.join(' ');
  const totalTok = greekTokCounts.reduce((a, b) => a + b, 0);
  const weights =
    totalTok > 0 ? greekTokCounts.map((c) => c / totalTok) : greekTokCounts.map(() => 1 / nRows);
  const pieces = splitProportional(joined, weights);
  return pieces.map((p) => ({ text: p, state: 'split' as RowState, flagged: true }));
}

/**
 * Split `text` into `weights.length` pieces whose lengths approximate the
 * given proportional weights, cutting at the nearest sentence/clause boundary
 * (`. ; · ” —`) to each cumulative target. Boundaries keep their punctuation
 * with the LEFT piece. Always returns exactly `weights.length` pieces (padding
 * with '' if the text runs out).
 */
function splitProportional(text: string, weights: number[]): string[] {
  const nRows = weights.length;
  // Candidate cut offsets: just AFTER each boundary char (keep punct on left).
  const cuts: number[] = [];
  {
    let idx = 0;
    const parts = text.split(SENTENCE_BOUNDARY_RE);
    // parts alternates [chunk, delim, chunk, delim, …]
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      acc += parts[i];
      idx += parts[i].length;
      if (i % 2 === 1) {
        // just consumed a delimiter → a candidate cut after it
        cuts.push(idx);
      }
    }
  }
  const totalLen = text.length;

  // Cumulative targets (character offsets).
  const targets: number[] = [];
  let cum = 0;
  for (let r = 0; r < nRows - 1; r++) {
    cum += weights[r];
    targets.push(Math.round(cum * totalLen));
  }

  // For each target, pick the nearest candidate cut strictly greater than the
  // previous chosen cut (keep pieces non-crossing, monotonic).
  const chosen: number[] = [];
  let prev = 0;
  for (const target of targets) {
    let best = -1;
    let bestDist = Infinity;
    for (const c of cuts) {
      if (c <= prev) continue;
      const d = Math.abs(c - target);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    if (best < 0) best = Math.max(prev + 1, Math.min(totalLen, target)); // no boundary → hard cut at target
    chosen.push(best);
    prev = best;
  }

  const out: string[] = [];
  let start = 0;
  for (const c of chosen) {
    out.push(text.slice(start, c).trim());
    start = c;
  }
  out.push(text.slice(start).trim());
  // Guarantee exactly nRows pieces.
  while (out.length < nRows) out.push('');
  if (out.length > nRows) {
    // Merge any overflow into the last row (shouldn't happen; defensive).
    const tail = out.splice(nRows - 1).join(' ').trim();
    out.push(tail);
  }
  return out.slice(0, nRows);
}

// ── chapter-file production (§6) ─────────────────────────────────────────────

/**
 * Build a ChapterFile from a resolved plan via the EXISTING serializer types.
 * column_starts is computed from the window's column transitions (the first
 * pair carries span_start; each new column starts a segment at its first row).
 * plan.ts itself never writes the file — the dialog calls serializeChapterFile
 * and libraryStorage().write.
 */
export function buildChapterFile(plan: ImportPlan): ChapterFile {
  const { flat, start, end } = plan.window;
  const greekLines: string[] = [];
  const englishLines: string[] = [];
  const columnStarts: ColumnStart[] = [];
  let lastColumn: string | null = null;

  for (let k = start; k <= end; k++) {
    const rowIndex1 = k - start + 1; // 1-based
    const line = flat[k];
    greekLines.push(line.text);
    englishLines.push(plan.rows[k - start].proposedEnglish);
    if (line.column !== lastColumn) {
      columnStarts.push({ ref: `${line.column}${line.n}`, rowIndex: rowIndex1 });
      lastColumn = line.column;
    }
  }

  const spanStart = `${flat[start].column}${flat[start].n}`;
  const spanEnd = `${flat[end].column}${flat[end].n}`;
  const meta: ChapterFileMeta = {
    schemaVersion: 1,
    work: plan.work.id,
    book: plan.book,
    chapter: plan.chapter,
    citationScheme: plan.work.scheme,
    spanStart,
    spanEnd,
    columnStarts,
  };
  // Carry imported footnotes (scrivener-md); canonical plans have none.
  const footnotes = plan.footnotes.map((f) => ({ id: f.id, body: f.body }));
  return { meta, greekLines, englishLines, footnotes };
}

/** Whether a saved chapter file already exists for (workId, book, chapter) —
 * the §7 (c) duplicate check the DIALOG performs (plan.ts stays write-free). */
export async function chapterFileExists(
  workId: string,
  book: number,
  chapter: number,
): Promise<boolean> {
  const content = await libraryStorage().read(workId, chapterFileName(book, chapter));
  return content !== null;
}
