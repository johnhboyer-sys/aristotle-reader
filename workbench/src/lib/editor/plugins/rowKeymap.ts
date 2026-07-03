// Cross-row UX for one row editor (design doc D1 §"Cross-row UX").
//
// - Enter (anywhere): commit + focus next row, caret at END of its content.
//   Enter NEVER splits or inserts — row count is owned by the Greek spine.
// - Tab / Shift-Tab: next / previous row.
// - Backspace at row start / Delete at row end: swallowed with a subtle row
//   flash + status hint; a second Backspace within ~600ms moves the caret to
//   the previous row's end WITHOUT deleting (two-step so held-Backspace can't
//   run through a boundary).
// - ArrowUp/Down at the first/last visual line: goal-column navigation via
//   coordsAtPos/posAtCoords; savedX persists across consecutive vertical
//   moves and clears on horizontal movement / typing / click.
// - Paste with newlines: distribute into N following EMPTY rows behind an
//   inline confirm (one undo group), else flatten newlines to spaces + toast.

import { Plugin } from '@tiptap/pm/state';
import type { Command, Transaction } from '@tiptap/pm/state';
import { keymap } from '@tiptap/pm/keymap';
import { chainCommands, deleteSelection, toggleMark } from '@tiptap/pm/commands';
import { ReplaceStep } from '@tiptap/pm/transform';
import { rowSchema } from '../schema';
import { resetGreekRun } from './greekInput';

export const DOUBLE_BACKSPACE_MS = 600;

/** Everything a row needs from the chapter (implemented by ChapterEditor).
 *
 * All indexes here are DISPLAY-row (grid) ordinals (design doc D6): a
 * paragraph-split Bekker line renders as two display rows, and Enter / Tab /
 * Arrows walk them in order (segment 0 → segment 1 → next line). ChapterEditor
 * implements `index` as a live getter so the ordinal stays correct when a
 * split above shifts the grid. */
export interface RowContext {
  index: number;
  rowCount(): number;
  /** Live-view emptiness of row k (used for paste distribution). */
  isRowEmpty(k: number): boolean;
  /** Display row k is a CONTINUATION segment (same Bekker address as k-1). */
  isContinuation(k: number): boolean;
  focusRowEnd(k: number): void;
  focusRowStart(k: number): void;
  focusRowAtX(k: number, edge: 'first' | 'last', x: number): void;
  getSavedX(): number | null;
  setSavedX(x: number): void;
  clearSavedX(): void;
  flash(k: number): void;
  hint(text: string): void;
  toast(text: string): void;
  toggleGreek(): void;
  undo(): void;
  redo(): void;
  insertFootnote(): void;
  requestPasteDistribute(k: number, segments: string[]): void;
  /** AI-assist (design doc D4): suggest a translation for THIS row (⌘⏎). */
  requestAssist(): void;
}

// ── pure paste planning (unit-tested) ──────────────────────────────────────

export type PastePlan =
  | { kind: 'insert'; text: string }
  | { kind: 'flatten'; text: string }
  | { kind: 'distribute'; segments: string[] };

export function splitSegments(text: string): string[] {
  const segments = text.split(/\r\n?|\n/);
  // Trailing newline(s) produce empty tail segments — they carry no content.
  while (segments.length > 1 && segments[segments.length - 1] === '') segments.pop();
  return segments;
}

export function flattenSegments(segments: string[]): string {
  return segments
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(' ');
}

/**
 * Decide what a paste does. `remainderEmpty` = nothing after the caret in the
 * current row; `followingEmpties` = number of consecutive entirely-empty rows
 * directly below it.
 */
export function planPaste(text: string, remainderEmpty: boolean, followingEmpties: number): PastePlan {
  const segments = splitSegments(text);
  if (segments.length <= 1) return { kind: 'insert', text: segments[0] ?? '' };
  if (remainderEmpty && followingEmpties >= segments.length - 1) {
    return { kind: 'distribute', segments };
  }
  return { kind: 'flatten', text: flattenSegments(segments) };
}

/** Typing-shaped transaction (small text replace) → history coalesces it. */
export function isTypingTransaction(tr: Transaction): boolean {
  if (!tr.docChanged) return false;
  for (const step of tr.steps) {
    if (!(step instanceof ReplaceStep)) return false;
    const slice = step.slice;
    if (slice.content.size > 2) return false;
    if (slice.content.size > 0 && !slice.content.firstChild?.isText) return false;
  }
  return true;
}

// ── plugins ────────────────────────────────────────────────────────────────

function atRowStart(sel: { empty: boolean; head: number }): boolean {
  return sel.empty && sel.head === 0;
}

export function rowPlugins(ctx: RowContext): Plugin[] {
  let lastSwallowedBackspace = 0;

  const advance: Command = () => {
    if (ctx.index >= ctx.rowCount() - 1) {
      ctx.flash(ctx.index);
      return true; // still swallow — Enter never inserts anything
    }
    ctx.focusRowEnd(ctx.index + 1);
    return true;
  };

  const backspaceGuard: Command = (state) => {
    if (!atRowStart(state.selection)) return false;
    // Continuation segment of the SAME Bekker line (D6 divergence F):
    // Backspace is NAVIGATION ONLY — the caret moves to the previous
    // segment's end, nothing ever joins. Un-split is the explicit
    // context-menu command. The merge guard below stays for DISTINCT
    // addresses only.
    if (ctx.index > 0 && ctx.isContinuation(ctx.index)) {
      ctx.focusRowEnd(ctx.index - 1);
      return true;
    }
    const now = Date.now();
    if (ctx.index > 0 && now - lastSwallowedBackspace <= DOUBLE_BACKSPACE_MS) {
      lastSwallowedBackspace = 0;
      ctx.focusRowEnd(ctx.index - 1); // move only — no deletion, ever
      return true;
    }
    lastSwallowedBackspace = now;
    ctx.flash(ctx.index);
    ctx.hint('Bekker lines can’t be merged' + (ctx.index > 0 ? ' — Backspace again to go up' : ''));
    return true;
  };

  // Backspace over an inline atom (footnote marker): handle explicitly —
  // native contenteditable deletion of atoms is unreliable.
  const deleteMarkerBefore: Command = (state, dispatch) => {
    const { empty, head } = state.selection;
    if (!empty || head === 0) return false;
    const before = state.doc.resolve(head).nodeBefore;
    if (!before || before.type.name !== 'footnoteMarker') return false;
    dispatch?.(state.tr.delete(head - before.nodeSize, head));
    return true;
  };

  const deleteGuard: Command = (state) => {
    const { empty, head } = state.selection;
    if (!empty || head !== state.doc.content.size) return false;
    // Delete at a segment end whose NEXT display row is the same line's
    // continuation: navigation only, mirroring the Backspace rule — never
    // joins (D6 divergence F).
    if (ctx.index < ctx.rowCount() - 1 && ctx.isContinuation(ctx.index + 1)) {
      ctx.focusRowStart(ctx.index + 1);
      return true;
    }
    ctx.flash(ctx.index);
    ctx.hint('Bekker lines can’t be merged');
    return true;
  };

  const deleteMarkerAfter: Command = (state, dispatch) => {
    const { empty, head } = state.selection;
    if (!empty) return false;
    const after = state.doc.resolve(head).nodeAfter;
    if (!after || after.type.name !== 'footnoteMarker') return false;
    dispatch?.(state.tr.delete(head, head + after.nodeSize));
    return true;
  };

  const verticalMove =
    (dir: 'up' | 'down'): Command =>
    (state, _dispatch, view) => {
      if (!view) return false;
      if (view.composing) return false;
      if (!view.endOfTextblock(dir)) return false; // inner visual line → default
      const target = dir === 'up' ? ctx.index - 1 : ctx.index + 1;
      if (target < 0 || target >= ctx.rowCount()) return true; // edge of chapter: swallow
      let x = ctx.getSavedX();
      if (x == null) {
        x = view.coordsAtPos(state.selection.head).left;
        ctx.setSavedX(x);
      }
      ctx.focusRowAtX(target, dir === 'up' ? 'last' : 'first', x);
      return true;
    };

  // Horizontal movement clears the goal column; the key still does its
  // default job (return false → native caret move).
  const clearX: Command = () => {
    ctx.clearSavedX();
    return false;
  };

  const bindings = keymap({
    Enter: advance,
    'Shift-Enter': advance,
    // ⌘⏎ while the caret is in an English cell = suggest-for-this-row
    // (design doc D4; the quiet gutter glyph is the pointer path).
    'Mod-Enter': () => {
      ctx.requestAssist();
      return true;
    },
    Tab: () => {
      if (ctx.index >= ctx.rowCount() - 1) {
        ctx.flash(ctx.index);
        return true;
      }
      ctx.focusRowEnd(ctx.index + 1);
      return true;
    },
    'Shift-Tab': () => {
      if (ctx.index === 0) {
        ctx.flash(ctx.index);
        return true;
      }
      ctx.focusRowEnd(ctx.index - 1);
      return true;
    },
    Backspace: chainCommands(backspaceGuard, deleteSelection, deleteMarkerBefore),
    Delete: chainCommands(deleteGuard, deleteSelection, deleteMarkerAfter),
    'Mod-b': toggleMark(rowSchema.marks.bold),
    'Mod-i': toggleMark(rowSchema.marks.italic),
    'Mod-u': toggleMark(rowSchema.marks.underline),
    'Mod-g': () => {
      ctx.toggleGreek();
      return true;
    },
    'Mod-z': () => {
      ctx.undo();
      return true;
    },
    'Shift-Mod-z': () => {
      ctx.redo();
      return true;
    },
    'Mod-y': () => {
      ctx.redo();
      return true;
    },
    ArrowUp: verticalMove('up'),
    ArrowDown: verticalMove('down'),
    ArrowLeft: clearX,
    ArrowRight: clearX,
    Home: clearX,
    End: clearX,
  });

  const behavior = new Plugin({
    props: {
      handlePaste(view, event) {
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (!text) return true; // never let PM parse foreign HTML into a row

        const sel = view.state.selection;
        const remainderEmpty = sel.$to.pos === view.state.doc.content.size;
        let followingEmpties = 0;
        for (let k = ctx.index + 1; k < ctx.rowCount() && ctx.isRowEmpty(k); k++) followingEmpties++;

        const plan = planPaste(text, remainderEmpty, followingEmpties);
        if (plan.kind === 'insert') {
          resetGreekRun(view);
          view.dispatch(view.state.tr.insertText(plan.text).setMeta('noCoalesce', true));
        } else if (plan.kind === 'flatten') {
          resetGreekRun(view);
          view.dispatch(view.state.tr.insertText(plan.text).setMeta('noCoalesce', true));
          ctx.toast('Line breaks flattened — rows are fixed to Bekker lines');
        } else {
          ctx.requestPasteDistribute(ctx.index, plan.segments);
        }
        return true;
      },

      handleClick() {
        ctx.clearSavedX();
        return false;
      },

      handleDOMEvents: {
        // The browser's own undo must never touch a row (history is app-level).
        beforeinput(_view, event) {
          const e = event as InputEvent;
          if (e.inputType === 'historyUndo') {
            e.preventDefault();
            ctx.undo();
            return true;
          }
          if (e.inputType === 'historyRedo') {
            e.preventDefault();
            ctx.redo();
            return true;
          }
          return false;
        },
      },
    },
  });

  return [bindings, behavior];
}
