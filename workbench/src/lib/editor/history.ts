// App-level undo/redo stack (design doc D1 §"Undo/redo").
//
// ProseMirror's history() plugin is deliberately NOT installed on the row
// editors. Row docs are one Bekker line, so whole-doc before/after snapshots
// are bytes, not KB — no step inversion, and the stack survives any future
// mount/unmount lifecycle because it lives on the model, not the views.
//
// - A typing burst in one row coalesces into one entry (new entry on ~500ms
//   idle, row change, or any non-typing command → breakCoalescing()).
// - Cross-row paste distribution is one entry (N row edits).
// - Footnote-table changes ride along on the entry that caused them
//   (fnBefore/fnAfter snapshots).
// - Redo clears on any new edit.
//
// Line splits (design doc D6): the edit payload is the row's SEGMENT BUNDLE —
// every segment doc plus the row's splitOffsets — so a split or un-split is
// ONE entry whose undo restores the whole structural before-state (offsets
// AND both English docs) in one ⌘Z. A segment text edit is still a
// single-row entry (its bundle differs only in that segment's doc).
//
// This module is pure bookkeeping: applying an entry back to the model and
// the live views (updateState + refocus) is ChapterEditor's job.

import type { Node as PMNode } from '@tiptap/pm/model';
import type { Footnote } from './model';

export interface SelRef {
  row: number;
  /** English segment within the row (0 unless the line is split — D6). */
  segment: number;
  /** Which English layer the caret was in (D8 §4): the default sentence
   * layer (`english`/`english2`), or the paragraph layer (`englishPara`).
   * Absent = 'sentence' (every pre-D8 caller). */
  layer?: 'sentence' | 'para';
  anchor: number;
  head: number;
}

/** One row's full structural state: segment docs in order + split offsets +
 * the paragraph layer. */
export interface RowSnapshot {
  /** Segment docs in document order; docs[0] is the row's `english`. */
  docs: PMNode[];
  /** The row's splitOffsets at snapshot time (cloned; undefined = unsplit). */
  splitOffsets?: number[];
  /**
   * The row's paragraph-layer English (`englishPara`) at snapshot time, or
   * undefined when the row has none (D8 §4). Captured on EVERY snapshot so an
   * undo/redo restores the whole row — a paragraph-view edit reverts its
   * `englishPara`, and a sentence-layer edit never clobbers a paragraph
   * translation it didn't touch (the field round-trips through the snapshot
   * unchanged).
   */
  englishPara?: PMNode;
}

export interface RowEdit {
  row: number;
  before: RowSnapshot;
  after: RowSnapshot;
}

/**
 * One ROW's full model state for a STRUCTURAL edit (D8 §2 — document-spine
 * paragraph split/merge, where the operation creates/destroys RowModels).
 * Unlike RowSnapshot this also carries the row's SOURCE text: a paragraph
 * split partitions the Greek between two rows, so restoring the row set
 * must restore the text with it. Addresses are NOT captured — document-spine
 * addresses are derived from row ordinal and re-derived after every splice.
 */
export interface StructuralRowSnapshot {
  /** The row's source (Greek/original) text. */
  greek: string;
  /** Sentence-layer segment docs in document order; docs[0] = `english`. */
  docs: PMNode[];
  /** Sentence boundaries (splitOffsets) at snapshot time. */
  splitOffsets?: number[];
  /** Paragraph-layer English, when the row has one. */
  englishPara?: PMNode;
  /** Heading level (D8 heading tools), when the row carries one — so an
   * inserted/marked heading survives structural undo/redo. */
  headingLevel?: number;
}

/**
 * A structural (row-count-changing) edit: the rows `[index, index +
 * before.length)` are replaced by `after` on do/redo, and `[index, index +
 * after.length)` by `before` on undo. A paragraph split is one row → two;
 * a paragraph merge is two rows → one. Exactly one ⌘Z restores the exact
 * prior row structure (D8 §2). An entry carries EITHER `edits` (in-row
 * changes, the D1/D6 shape) OR `structural` — never both.
 */
export interface StructuralEdit {
  /** Model row index where the replaced span begins. */
  index: number;
  before: StructuralRowSnapshot[];
  after: StructuralRowSnapshot[];
}

export interface UndoEntry {
  edits: RowEdit[];
  /** Row-count-changing edit (D8 §2) — see StructuralEdit. */
  structural?: StructuralEdit;
  /**
   * paragraph_starts change (D8 §5 chunk grouping for plain-line docs):
   * cloned 1-based ordinal lists before/after. Pure display metadata riding
   * the same stack so grouping gestures undo like everything else.
   */
  paraStarts?: { before: number[]; after: number[] };
  /**
   * Heading-mark change (D8 heading tools): one row's headingLevel before/after
   * a "Mark as …/Clear heading" toggle (null = ordinary row). Rides the same
   * stack — mirrors `paraStarts` — so a plain heading mark is its own ⌘Z step.
   */
  headingLevel?: { row: number; before: number | null; after: number | null };
  fnBefore?: Footnote[];
  fnAfter?: Footnote[];
  selBefore: SelRef | null;
  selAfter: SelRef | null;
}

export interface PushOptions {
  /** Same non-null key on consecutive pushes within 500ms merges them. */
  coalesceKey?: string | null;
  /** Injectable clock for tests. */
  now?: number;
}

export const COALESCE_WINDOW_MS = 500;

export class AppHistory {
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private lastKey: string | null = null;
  private lastTime = 0;
  private limit: number;

  constructor(limit = 500) {
    this.limit = limit;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  get depth(): number {
    return this.undoStack.length;
  }

  push(entry: UndoEntry, opts: PushOptions = {}): void {
    this.redoStack.length = 0;
    const now = opts.now ?? Date.now();
    const key = opts.coalesceKey ?? null;
    const top = this.undoStack[this.undoStack.length - 1];

    const canMerge =
      key !== null &&
      key === this.lastKey &&
      now - this.lastTime <= COALESCE_WINDOW_MS &&
      top !== undefined &&
      top.edits.length === 1 &&
      entry.edits.length === 1 &&
      top.edits[0].row === entry.edits[0].row &&
      entry.fnBefore === undefined &&
      top.fnBefore === undefined;

    if (canMerge) {
      top.edits[0].after = entry.edits[0].after;
      top.selAfter = entry.selAfter;
    } else {
      this.undoStack.push(entry);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.lastKey = key;
    this.lastTime = now;
  }

  /** Force the next push to start a fresh entry (idle settle, blur, command). */
  breakCoalescing(): void {
    this.lastKey = null;
  }

  /** Pop the entry to revert; caller applies `before` docs / fnBefore / selBefore. */
  undo(): UndoEntry | undefined {
    const entry = this.undoStack.pop();
    if (entry) {
      this.redoStack.push(entry);
      this.breakCoalescing();
    }
    return entry;
  }

  /** Pop the entry to re-apply; caller applies `after` docs / fnAfter / selAfter. */
  redo(): UndoEntry | undefined {
    const entry = this.redoStack.pop();
    if (entry) {
      this.undoStack.push(entry);
      this.breakCoalescing();
    }
    return entry;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.breakCoalescing();
  }
}
