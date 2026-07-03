// Line-split display expansion + the pure halves of the split/un-split
// commands (design doc D6, Slice 2).
//
// The model keeps ONE RowModel per Bekker line (splits live INSIDE the row as
// `splitOffsets` + `english2`); the grid renders DISPLAY rows. `expandRows`
// is the ONLY place the "one line = two grid rows" fact exists: every split
// row expands into one DisplayRow per English segment, all sharing the line's
// one address. Everything here is pure and node-testable — ChapterEditor owns
// the views, focus and undo bookkeeping around these functions.
//
// KEY STABILITY (remount churn): a DisplayRow's render key is
// `${rowIndex}.${segment}:${address.raw}@${greekStart}`. Splitting one line
// must not remount anything else — unrelated rows keep their keys verbatim,
// and the split line's segment 0 keeps its key too (its start is always 0);
// only the NEW continuation row mounts. Re-splitting at a DIFFERENT offset
// after an un-split changes the continuation's `@start`, forcing a fresh
// mount with the fresh doc (the boundary is part of the segment's identity —
// Codex's addition to the deep-reasoner key). The grid ordinal is
// deliberately NOT in the key: rows below a split shift position without
// remounting.

import type { Address } from '../citation/types';
import type { PMDocJSON } from './schema';
import { rowSchema, emptyRowDocJSON } from './schema';
import type { RowModel } from './model';
import { englishDocsOf } from './model';
import { joinRowDocs, runsOf, buildRowDoc } from './serialize';
import type { InlineRun } from './serialize';
import { isValidSplitOffset } from '../chapterfile';

// ── display expansion ───────────────────────────────────────────────────────

export interface DisplayRow {
  /** Model (Bekker-line) row index — the stable identity, never the ordinal. */
  rowIndex: number;
  /** English segment index within the row (0 = the row's `english`). */
  segment: number;
  /** The ONE address every segment of the line shares (gutter repeats it). */
  address: Address;
  /** This segment's slice of the row's Greek ('' for anchorless drift segments). */
  greekSlice: string;
  /** Code-unit start of `greekSlice` in the row's Greek (0 for segment 0;
   * `greek.length` for anchorless drift segments beyond the offsets). */
  greekStart: number;
  /** The segment's committed English doc (informational — live views win). */
  englishDoc: PMDocJSON;
  /** True for every segment after the first (indented Greek, D6 §5). */
  continuation: boolean;
  /** Stable render key — see the module header on remount churn. */
  key: string;
}

/**
 * Expand model rows into the flat display-row list the grid renders. An
 * unsplit row passes through as exactly one DisplayRow (segment 0, full
 * Greek). A split row yields one DisplayRow per English segment; Greek slices
 * come from `splitOffsets`. On hydration drift `english2` may run LONGER than
 * `splitOffsets` (English count wins — model.ts invariant): the extra
 * segments still display (English is never dropped) with an empty Greek
 * slice, anchored at `greek.length`.
 */
export function expandRows(rows: RowModel[]): DisplayRow[] {
  const out: DisplayRow[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const docs = englishDocsOf(row);
    const offsets = row.splitOffsets ?? [];
    for (let segment = 0; segment < docs.length; segment++) {
      // A segment has a Greek anchor while offsets cover it; drift extras
      // beyond the offsets are anchorless (empty slice at the line's end).
      const anchored = segment <= offsets.length;
      const start = segment === 0 ? 0 : anchored ? offsets[segment - 1] : row.greek.length;
      const end = segment < offsets.length && segment < docs.length - 1 ? offsets[segment] : row.greek.length;
      out.push({
        rowIndex,
        segment,
        address: row.address,
        greekSlice: anchored ? row.greek.slice(start, end) : '',
        greekStart: start,
        englishDoc: docs[segment],
        continuation: segment > 0,
        key: `${rowIndex}.${segment}:${row.address.raw}@${start}`,
      });
    }
  }
  return out;
}

// ── split-gesture offset snapping (D6 §4.1) ─────────────────────────────────

const WORD_CHAR = /[\p{L}\p{M}]/u;

/**
 * Snap a raw click offset to the split point at the START of the word the
 * click belongs to — so the clicked word becomes the FIRST word of the new
 * paragraph. The word the click "belongs to" is the word it lands inside OR
 * at the trailing edge of: a caret resolves to the position just PAST a
 * word's last letter when you click the right side of that word (or the
 * space right after it), and that click still means "this word." Only when
 * there is no word at or immediately before the click (leading whitespace, a
 * wide gap) do we look FORWARD to the next word. Returns null when no valid
 * split point exists there — the first word (offset 0) and the line end are
 * not split points (isValidSplitOffset is the single validity authority;
 * this never returns an offset it rejects).
 */
export function snapToWordStart(greek: string, offset: number): number | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > greek.length) return null;
  let p = offset;
  const onWord = p < greek.length && WORD_CHAR.test(greek[p]);
  const afterWord = p > 0 && WORD_CHAR.test(greek[p - 1]);
  // Only a click with no word under it AND none ending just before it looks
  // forward; a click inside a word or at its trailing edge stays on that word.
  if (!onWord && !afterWord) {
    while (p < greek.length && !WORD_CHAR.test(greek[p])) p++;
  }
  // Back up to the start of the resolved word.
  while (p > 0 && WORD_CHAR.test(greek[p - 1])) p--;
  return isValidSplitOffset(greek, p) ? p : null;
}

// ── English caret division (D6 §4.2) ────────────────────────────────────────

/** fnRef anchor extents: [run start, marker end) — the unsplittable ranges. */
function anchorRanges(doc: ReturnType<typeof rowSchema.nodeFromJSON>): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const runStart = new Map<string, number>();
  let pos = 0;
  doc.forEach((child) => {
    if (child.isText) {
      const mark = child.marks.find((m) => m.type.name === 'fnRef');
      if (mark) {
        const id = String(mark.attrs.id);
        if (!runStart.has(id)) runStart.set(id, pos);
      }
    } else if (child.type.name === 'footnoteMarker') {
      const id = String(child.attrs.id);
      const start = runStart.get(id);
      if (start !== undefined) {
        ranges.push({ start, end: pos + child.nodeSize });
        runStart.delete(id);
      }
    }
    pos += child.nodeSize;
  });
  return ranges;
}

function trimRunsStart(runs: InlineRun[]): InlineRun[] {
  const out = runs.map((r) => (r.kind === 'text' ? { ...r, marks: { ...r.marks } } : r));
  while (out.length > 0) {
    const first = out[0];
    if (first.kind !== 'text') break;
    const trimmed = first.text.replace(/^\s+/, '');
    if (trimmed === first.text) break;
    if (trimmed.length === 0) {
      out.shift();
      continue;
    }
    first.text = trimmed;
    break;
  }
  return out;
}

function trimRunsEnd(runs: InlineRun[]): InlineRun[] {
  const out = runs.map((r) => (r.kind === 'text' ? { ...r, marks: { ...r.marks } } : r));
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last.kind !== 'text') break;
    const trimmed = last.text.replace(/\s+$/, '');
    if (trimmed === last.text) break;
    if (trimmed.length === 0) {
      out.pop();
      continue;
    }
    last.text = trimmed;
    break;
  }
  return out;
}

/**
 * Divide one row doc at a caret position into [first, second]. Footnote
 * anchors NEVER split (d6 convergence, Codex detail): an anchor phrase and
 * its marker stay whole on the side holding the marker — a position strictly
 * inside a fnRef run (or between the run's end and its marker) snaps back to
 * the run's start, so the whole anchor lands in `second`. Plain whitespace at
 * the division point is trimmed from both sides (the un-split rejoin adds its
 * own single space — this keeps split→un-split from accreting doubles).
 */
export function divideDocAt(docJSON: PMDocJSON, pos: number): [PMDocJSON, PMDocJSON] {
  const doc = rowSchema.nodeFromJSON(docJSON);
  let p = Math.max(0, Math.min(pos, doc.content.size));
  const ranges = anchorRanges(doc);
  let moved = true;
  while (moved) {
    moved = false;
    for (const r of ranges) {
      if (p > r.start && p < r.end) {
        p = r.start;
        moved = true;
      }
    }
  }
  const first = buildRowDoc(trimRunsEnd(runsOf(doc.cut(0, p))));
  const second = buildRowDoc(trimRunsStart(runsOf(doc.cut(p))));
  return [first.toJSON(), second.toJSON()];
}

// ── the structural commands, pure (D6 §4) ───────────────────────────────────

export interface SplitRowResult {
  english: PMDocJSON;
  english2: PMDocJSON[];
  splitOffsets: number[];
}

/**
 * Split an UNSPLIT row at a validated Greek offset (Phase-1 UI is
 * single-split; the model/format stay N-ready). English division per John's
 * §4.2 answer: at `englishCaret` when the caret was in this row's English
 * cell, otherwise ALL existing English stays in segment 0 and the
 * continuation starts empty. Returns null for an already-split row or an
 * invalid offset — the caller surfaces the status line.
 */
export function splitUnsplitRow(row: RowModel, offset: number, englishCaret: number | null): SplitRowResult | null {
  if ((row.splitOffsets?.length ?? 0) > 0 || (row.english2?.length ?? 0) > 0) return null;
  if (!isValidSplitOffset(row.greek, offset)) return null;
  if (englishCaret === null) {
    return { english: row.english, english2: [emptyRowDocJSON()], splitOffsets: [offset] };
  }
  const [first, second] = divideDocAt(row.english, englishCaret);
  return { english: first, english2: [second], splitOffsets: [offset] };
}

export interface MergeSegmentsResult {
  english: PMDocJSON;
  english2?: PMDocJSON[];
  splitOffsets?: number[];
  /** Caret position of the join point within the merged segment's doc. */
  joinPos: number;
}

/**
 * Un-split (d6 divergence F): merge segments `boundary` and `boundary + 1`
 * of a split row back into one, rejoining their English with a single space
 * (joinRowDocs — the app's one join convention). Removes the matching Greek
 * offset; on a drift row whose offsets run short, an anchorless boundary
 * merges without touching the offsets. Returns null when the boundary
 * doesn't exist. This is NOT the forbidden Bekker merge — both segments
 * share one address; no address is created or destroyed.
 */
export function mergeSegments(row: RowModel, boundary: number): MergeSegmentsResult | null {
  const docs = englishDocsOf(row);
  if (boundary < 0 || boundary >= docs.length - 1) return null;
  const merged = joinRowDocs([docs[boundary], docs[boundary + 1]]);
  const joinPos = rowSchema.nodeFromJSON(docs[boundary]).content.size;
  const newDocs = [...docs.slice(0, boundary), merged, ...docs.slice(boundary + 2)];
  const offsets = (row.splitOffsets ?? []).slice();
  if (boundary < offsets.length) offsets.splice(boundary, 1);
  // Re-assert the model invariant (offsets never longer than continuations).
  while (offsets.length > newDocs.length - 1) offsets.pop();
  return {
    english: newDocs[0],
    ...(newDocs.length > 1 ? { english2: newDocs.slice(1) } : {}),
    ...(offsets.length > 0 ? { splitOffsets: offsets } : {}),
    joinPos,
  };
}

function segmentHasContent(json: PMDocJSON): boolean {
  const doc = rowSchema.nodeFromJSON(json);
  if (doc.textContent.trim().length > 0) return true;
  let marker = false;
  doc.descendants((node) => {
    if (node.type.name === 'footnoteMarker') marker = true;
    return !marker;
  });
  return marker;
}

/**
 * Un-split confirms ONLY when both English cells at the boundary are
 * non-empty (John's adopted default) — rejoining two real paragraphs of
 * prose is worth one line of friction; an empty side rejoins silently
 * (nothing to lose). A footnote marker counts as content.
 */
export function mergeNeedsConfirm(row: RowModel, boundary: number): boolean {
  const docs = englishDocsOf(row);
  if (boundary < 0 || boundary >= docs.length - 1) return false;
  return segmentHasContent(docs[boundary]) && segmentHasContent(docs[boundary + 1]);
}
