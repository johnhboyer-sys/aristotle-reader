// Structure editing for DOCUMENT-SPINE works (design doc D8 §2 — "the user
// owns row count"): the pure halves of the row-level paragraph split/merge
// commands, the sentence-boundary fix-up on paragraph rows, and the
// paragraph_starts chunk-grouping toggles for plain-line docs. ChapterEditor
// owns the views, focus and undo bookkeeping around these functions — same
// division of labour as gridRows.ts (the D6 intra-row machinery, which this
// module builds on: splitOffsets on a paragraph row ARE the sentence
// boundaries, D8 §3).
//
// Everything here branches ONLY on scheme capabilities (`spineSource`,
// `gutter.rowUnit`), never a scheme id (d2 contract, enforced by
// schemeIdIsolation.test.ts). rowUnit comparisons against strings that double
// as scheme ids ('paragraph', 'plain-line') use `switch` — the sanctioned
// form (see viewPolicy.ts's header for why).

import type { CitationScheme } from '../citation/types';
import type { PMDocJSON } from './schema';
import { rowSchema, emptyRowDocJSON } from './schema';
import { joinRowDocs } from './serialize';
import { isValidSplitOffset } from '../chapterfile';

// ── capability gates (D8 §2) ────────────────────────────────────────────────

/**
 * Whether ROW-LEVEL paragraph split/merge is permitted: only document-spine
 * paragraph-unit docs — the document IS the spine, so the user may create
 * and destroy rows. Corpus-spine schemes (Bekker, Busse) always refuse: the
 * corpus owns row count (D6 semantics intact, regression-tested).
 */
export function canEditRowStructure(scheme: CitationScheme): boolean {
  if (scheme.spineSource !== 'document') return false;
  switch (scheme.gutter.rowUnit) {
    case 'paragraph':
      return true;
    default:
      return false;
  }
}

/**
 * Whether the chunk-grouping gestures apply (D8 §5): plain-line
 * document-spine docs group lines into visual paragraphs via
 * `paragraph_starts` — pure display metadata, no row/text changes.
 */
export function canGroupLines(scheme: CitationScheme): boolean {
  if (scheme.spineSource !== 'document') return false;
  switch (scheme.gutter.rowUnit) {
    case 'plain-line':
      return true;
    default:
      return false;
  }
}

// ── row-level paragraph split / merge (D8 §2) ───────────────────────────────

/** A row's structural fields, address-free (addresses are derived from row
 * ordinal for document-spine works and re-derived after every splice). */
export interface RowStructure {
  greek: string;
  english: PMDocJSON;
  english2?: PMDocJSON[];
  splitOffsets?: number[];
  englishPara?: PMDocJSON;
}

function pack(greek: string, docs: PMDocJSON[], offsets: number[], englishPara: PMDocJSON | undefined): RowStructure {
  return {
    greek,
    english: docs[0] ?? emptyRowDocJSON(),
    ...(docs.length > 1 ? { english2: docs.slice(1) } : {}),
    ...(offsets.length > 0 ? { splitOffsets: offsets } : {}),
    ...(englishPara !== undefined ? { englishPara } : {}),
  };
}

function docsOf(row: RowStructure): PMDocJSON[] {
  return [row.english, ...(row.english2 ?? [])];
}

function hasParaText(doc: PMDocJSON | undefined): boolean {
  return (doc?.content?.length ?? 0) > 0;
}

/**
 * Split one paragraph row into TWO rows at a validated source offset (D8 §2
 * — a row-level operation, distinct from D6's intra-row segment split).
 * Distribution rules:
 *
 * - SOURCE: text before `offset` stays in `first` (trailing whitespace
 *   trimmed), text from `offset` becomes `second` (leading whitespace
 *   trimmed — the un-merge rejoin adds its own single space).
 * - SENTENCE BOUNDARIES (splitOffsets): partition by offset — boundaries
 *   below `offset` stay with `first` verbatim, boundaries above re-base into
 *   `second`. A boundary exactly AT `offset` becomes the row boundary itself
 *   and is dropped from both.
 * - SENTENCE-LAYER ENGLISH: each segment follows its sentence — segments
 *   whose sentence START is >= `offset` move to `second` (re-based by
 *   position); the segment whose sentence STRADDLES the split keeps its
 *   English in `first` (English is never divided by guesswork). The
 *   straddling sentence's source tail in `second` becomes an untranslated
 *   leading sentence (empty segment) so segment↔boundary pairing holds.
 * - PARAGRAPH-LAYER ENGLISH (englishPara): stays ENTIRELY on `first` — the
 *   app never guesses a split of English; `second` starts without one.
 *
 * Returns null for an invalid offset (isValidSplitOffset is the single
 * validity authority — offset 0 and the text end are never split points).
 */
export function splitParagraphRow(row: RowStructure, offset: number): { first: RowStructure; second: RowStructure } | null {
  if (!isValidSplitOffset(row.greek, offset)) return null;
  const docs = docsOf(row);
  const offsets = (row.splitOffsets ?? []).slice();

  const firstGreek = row.greek.slice(0, offset).replace(/\s+$/u, '');
  const secondRaw = row.greek.slice(offset);
  const secondGreek = secondRaw.replace(/^\s+/u, '');
  const lead = secondRaw.length - secondGreek.length;

  // Boundaries partition by offset; anything a trim made invalid is dropped
  // (defensive — a valid word-start boundary survives both trims).
  const firstOffsets = offsets.filter((o) => o < offset && isValidSplitOffset(firstGreek, o));
  const secondOffsets = offsets
    .filter((o) => o > offset)
    .map((o) => o - offset - lead)
    .filter((o) => isValidSplitOffset(secondGreek, o));

  // Each English segment follows its sentence START (same anchoring rule as
  // expandRows: doc 0 starts at 0, doc i at offsets[i-1], drift extras
  // beyond the offsets anchor at the text end — so extras land in `second`
  // and stay anchorless there, English never dropped).
  const firstDocs: PMDocJSON[] = [];
  const secondDocs: PMDocJSON[] = [];
  for (let i = 0; i < docs.length; i++) {
    const anchored = i <= offsets.length;
    const start = i === 0 ? 0 : anchored ? offsets[i - 1] : row.greek.length;
    (start < offset ? firstDocs : secondDocs).push(docs[i]);
  }
  // The straddle remnant: when the split lands INSIDE a sentence, that
  // sentence's English stayed in `first`, so `second`'s source up to its
  // first boundary has no segment — it becomes an untranslated leading
  // sentence rather than silently re-pairing every following segment.
  while (secondDocs.length < secondOffsets.length + 1) secondDocs.unshift(emptyRowDocJSON());
  if (secondDocs.length === 0) secondDocs.push(emptyRowDocJSON());
  if (firstDocs.length === 0) firstDocs.push(emptyRowDocJSON());

  return {
    first: pack(firstGreek, firstDocs, firstOffsets, row.englishPara),
    second: pack(secondGreek, secondDocs, secondOffsets, undefined),
  };
}

export interface MergedParagraphResult {
  row: RowStructure;
  /** Caret position of the join point within the merged `englishPara` (0
   * when nothing of `a`'s paragraph text precedes it). */
  paraJoinPos: number;
}

/**
 * Merge paragraph row `b` onto its predecessor `a` — the inverse of
 * splitParagraphRow (D8 §2):
 *
 * - SOURCE: concatenated with a single space.
 * - SENTENCE BOUNDARIES: `a`'s stay verbatim; `b`'s re-base past the join.
 *   The JOIN POINT becomes a sentence boundary only when one exists there —
 *   i.e. it is a valid word-start boundary of the merged source (both sides
 *   non-empty). Each row's English segments keep their own sentences; the
 *   join never silently fuses two translation units.
 * - SENTENCE-LAYER ENGLISH: `b`'s segments are APPENDED after `a`'s.
 * - PARAGRAPH-LAYER ENGLISH: both non-empty → joined with a single space
 *   (the caller confirm-guards this case — see paragraphMergeNeedsConfirm);
 *   one side → kept; neither → absent.
 */
export function mergeParagraphRows(a: RowStructure, b: RowStructure): MergedParagraphResult {
  const aGreek = a.greek.replace(/\s+$/u, '');
  const bGreek = b.greek.replace(/^\s+/u, '');
  const greek = aGreek.length === 0 ? bGreek : bGreek.length === 0 ? aGreek : `${aGreek} ${bGreek}`;
  const joint = aGreek.length + 1; // start of b's text in the merged source

  const docs = [...docsOf(a), ...docsOf(b)];
  const jointValid = aGreek.length > 0 && bGreek.length > 0 && isValidSplitOffset(greek, joint);
  const rebase = aGreek.length === 0 ? 0 : joint; // b's start in the merged source
  const offsets = [
    ...(a.splitOffsets ?? []).filter((o) => isValidSplitOffset(greek, o)),
    ...(jointValid ? [joint] : []),
    ...(b.splitOffsets ?? []).map((o) => o + rebase).filter((o) => isValidSplitOffset(greek, o)),
  ];
  // Model invariant: offsets may run SHORT of the segments (anchorless
  // extras) but never longer.
  while (offsets.length > docs.length - 1) offsets.pop();

  const aHas = hasParaText(a.englishPara);
  const bHas = hasParaText(b.englishPara);
  let englishPara: PMDocJSON | undefined;
  let paraJoinPos = 0;
  if (aHas && bHas) {
    englishPara = joinRowDocs([a.englishPara!, b.englishPara!]);
    paraJoinPos = rowSchema.nodeFromJSON(a.englishPara!).content.size;
  } else if (aHas) {
    englishPara = a.englishPara;
    paraJoinPos = rowSchema.nodeFromJSON(a.englishPara!).content.size;
  } else if (bHas) {
    englishPara = b.englishPara;
  }

  return { row: pack(greek, docs, offsets, englishPara), paraJoinPos };
}

/**
 * A paragraph merge confirms ONLY when BOTH rows carry paragraph-layer
 * English (the D6 un-split confirm default, applied to the layer this
 * operation actually joins): fusing two real paragraph translations is worth
 * one line of friction; an empty side merges silently. Sentence-layer
 * segments are appended, never joined, so they need no guard.
 */
export function paragraphMergeNeedsConfirm(a: RowStructure, b: RowStructure): boolean {
  return hasParaText(a.englishPara) && hasParaText(b.englishPara);
}

// ── sentence-boundary fix-up on paragraph rows (D8 §3) ──────────────────────

export interface SentenceBoundaryResult {
  english: PMDocJSON;
  english2?: PMDocJSON[];
  splitOffsets: number[];
}

/**
 * Add a sentence boundary at a validated source offset of a paragraph row —
 * the D6 splitOffsets machinery generalized to rows that already carry
 * boundaries (import auto-segmentation seeds several; D6's splitUnsplitRow
 * is deliberately single-split for the Bekker UI). The covering sentence's
 * English stays with the sentence START (never divided by guesswork); the
 * new sentence starts with an empty segment. Returns null for an invalid
 * offset or one that is already a boundary.
 */
export function addSentenceBoundary(row: RowStructure, offset: number): SentenceBoundaryResult | null {
  if (!isValidSplitOffset(row.greek, offset)) return null;
  const offsets = (row.splitOffsets ?? []).slice();
  if (offsets.includes(offset)) return null;
  const docs = docsOf(row);
  const k = offsets.filter((o) => o < offset).length; // covering segment index
  const newDocs = [...docs.slice(0, k + 1), emptyRowDocJSON(), ...docs.slice(k + 1)];
  const newOffsets = [...offsets.slice(0, k), offset, ...offsets.slice(k)];
  return {
    english: newDocs[0],
    ...(newDocs.length > 1 ? { english2: newDocs.slice(1) } : {}),
    splitOffsets: newOffsets,
  };
}

/**
 * The boundary to remove for a "Join sentences" gesture at a click offset:
 * the boundary at the START of the clicked sentence (joining it onto the
 * previous one). Null when the click sits in the first sentence (nothing
 * before it to join) or the row has no boundaries.
 */
export function joinBoundaryAt(splitOffsets: number[] | undefined, clickOffset: number): number | null {
  const offsets = splitOffsets ?? [];
  const sentence = offsets.filter((o) => o <= clickOffset).length;
  return sentence >= 1 ? sentence - 1 : null;
}

// ── paragraph_starts chunk grouping (D8 §5) ─────────────────────────────────

/** Add a 1-based row ordinal to paragraph_starts (sorted, de-duped). */
export function addParagraphStart(starts: number[] | undefined, ordinal: number): number[] {
  return [...new Set([...(starts ?? []), ordinal])].sort((x, y) => x - y);
}

/** Remove a 1-based row ordinal from paragraph_starts. */
export function removeParagraphStart(starts: number[] | undefined, ordinal: number): number[] {
  return (starts ?? []).filter((o) => o !== ordinal);
}
