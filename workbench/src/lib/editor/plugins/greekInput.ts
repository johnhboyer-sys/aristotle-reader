// Greek mode + Beta Code pending buffer (design doc D1 §"Greek insertion").
//
// Greek is a MARK; Unicode is canonical in the doc. Beta Code is an input
// method only: while Greek mode is on, each ASCII keystroke appends to a
// transient raw buffer, the WHOLE buffer is re-decoded through betaToGreek(),
// and the rendered range is replaced in the SAME transaction as the keystroke
// (one Cmd-Z undoes char + transform together — the transaction carries a
// coalesce meta so history treats the burst as typing).
//
// Whole-buffer re-decode is mandatory: suffix diacritics ("h" → ")" → "=")
// and the final-sigma flip (σ↔ς when the next char lands) make incremental
// transforms wrong by construction.
//
// The buffer commits (state reset; the rendered text simply stays) on:
// word boundary (space/punctuation), caret leaving the run, blur, mode
// toggle-off, or any foreign change to the document. Backspace inside a
// pending run pops the raw buffer and re-decodes.
//
// IME guard: no transform while `view.composing`. Composed input (macOS dead
// keys, system Greek keyboard, dictation) is accepted as-is; on
// compositionend the pending run is reset so the next plain keystroke starts
// a fresh buffer. Direct Unicode Greek from a system keyboard therefore
// passes through untouched, per the doc.

import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Mark } from '@tiptap/pm/model';
import { betaToGreek, isBetaChar } from '../../betacode';
import { rowSchema } from '../schema';

// ── pure pending-buffer core (unit-tested directly) ────────────────────────

export interface PendingRun {
  raw: string;
  rendered: string;
}

export { isBetaChar };

/** Append one keystroke to the buffer and re-decode the whole thing. */
export function pushChar(run: PendingRun | null, ch: string): PendingRun {
  const raw = (run?.raw ?? '') + ch;
  return { raw, rendered: betaToGreek(raw) };
}

/** Backspace inside a pending run: pop one raw char, re-decode. */
export function popChar(run: PendingRun): PendingRun | null {
  const raw = run.raw.slice(0, -1);
  if (raw === '') return null;
  return { raw, rendered: betaToGreek(raw) };
}

/** A char that ends the current Beta word (commits the buffer). */
export function isBoundaryChar(ch: string): boolean {
  return !isBetaChar(ch);
}

/**
 * Test harness helper: feed a keystroke sequence through the buffer exactly
 * as the plugin does and return the text that would end up in the document.
 */
export function typeSequence(input: string): string {
  let committed = '';
  let run: PendingRun | null = null;
  for (const ch of input) {
    if (isBetaChar(ch)) {
      run = pushChar(run, ch);
    } else {
      // Boundary: commit the rendered run, insert the boundary char as-is.
      committed += (run?.rendered ?? '') + ch;
      run = null;
    }
  }
  return committed + (run?.rendered ?? '');
}

// ── plugin state ───────────────────────────────────────────────────────────

interface RunState {
  run: PendingRun;
  from: number;
  to: number;
}

type GreekMeta = { type: 'set'; state: RunState } | { type: 'reset' };

export const greekInputKey = new PluginKey<RunState | null>('greekInput');

export interface GreekInputContext {
  isGreekMode(): boolean;
}

/** Commit (reset) the pending buffer without touching the document. */
export function resetGreekRun(view: EditorView): void {
  if (greekInputKey.getState(view.state)) {
    view.dispatch(view.state.tr.setMeta(greekInputKey, { type: 'reset' } satisfies GreekMeta));
  }
}

function greekMarksAt(state: EditorState, pos: number): readonly Mark[] {
  const stored = state.storedMarks ?? state.doc.resolve(pos).marks();
  const greek = rowSchema.marks.greek;
  return greek.isInSet([...stored]) ? stored : [...stored, greek.create()];
}

export function greekInput(ctx: GreekInputContext): Plugin<RunState | null> {
  return new Plugin<RunState | null>({
    key: greekInputKey,
    state: {
      init: () => null,
      apply(tr: Transaction, value: RunState | null): RunState | null {
        const meta = tr.getMeta(greekInputKey) as GreekMeta | undefined;
        if (meta) return meta.type === 'set' ? meta.state : null;
        if (!value) return null;
        if (tr.docChanged) return null; // foreign edit → commit
        if (tr.selectionSet && tr.selection.head !== value.to) return null; // caret left the run
        return value;
      },
    },
    props: {
      handleTextInput(view, from, to, text) {
        if (!ctx.isGreekMode()) return false;
        if (view.composing) return false; // IME guard — accept composed input as-is
        if (text.length !== 1) {
          // Multi-char input (paste path handles its own flattening) — commit.
          resetGreekRun(view);
          return false;
        }

        const prev = greekInputKey.getState(view.state) ?? null;

        if (!isBetaChar(text)) {
          // Word boundary: commit the run, let the boundary char insert
          // normally — but keep the greek mark on it so a following word
          // stays inside one greek span.
          const marks = greekMarksAt(view.state, from);
          const tr = view.state.tr.replaceWith(from, to, rowSchema.text(text, [...marks]));
          tr.setMeta(greekInputKey, { type: 'reset' } satisfies GreekMeta);
          tr.setMeta('coalesce', 'typing');
          view.dispatch(tr);
          return true;
        }

        const continuing = prev !== null && from === prev.to && to === from;
        const run = pushChar(continuing ? prev.run : null, text);
        const start = continuing ? prev.from : from;
        const end = continuing ? prev.to : to;
        const marks = greekMarksAt(view.state, start);

        const tr = view.state.tr;
        if (run.rendered.length > 0) {
          tr.replaceWith(start, end, rowSchema.text(run.rendered, [...marks]));
        } else {
          // e.g. a lone "*" (capital marker) decodes to nothing yet.
          if (end > start) tr.delete(start, end);
        }
        const newTo = start + run.rendered.length;
        tr.setMeta(greekInputKey, {
          type: 'set',
          state: { run, from: start, to: newTo },
        } satisfies GreekMeta);
        tr.setMeta('coalesce', 'typing');
        // Keep storedMarks greek so boundary chars / next words stay marked.
        tr.setStoredMarks([...marks]);
        view.dispatch(tr);
        return true;
      },

      handleKeyDown(view, event) {
        if (event.key !== 'Backspace' || event.metaKey || event.ctrlKey || event.altKey) return false;
        const pending = greekInputKey.getState(view.state);
        if (!pending) return false;
        const sel = view.state.selection;
        if (!sel.empty || sel.head !== pending.to) return false;

        const popped = popChar(pending.run);
        const tr = view.state.tr;
        if (popped) {
          tr.replaceWith(
            pending.from,
            pending.to,
            rowSchema.text(popped.rendered, [...greekMarksAt(view.state, pending.from)]),
          );
          tr.setMeta(greekInputKey, {
            type: 'set',
            state: { run: popped, from: pending.from, to: pending.from + popped.rendered.length },
          } satisfies GreekMeta);
        } else {
          if (pending.to > pending.from) tr.delete(pending.from, pending.to);
          tr.setMeta(greekInputKey, { type: 'reset' } satisfies GreekMeta);
        }
        tr.setMeta('coalesce', 'typing');
        view.dispatch(tr);
        return true;
      },

      handleDOMEvents: {
        blur(view) {
          resetGreekRun(view);
          return false;
        },
        compositionend(view) {
          resetGreekRun(view);
          return false;
        },
      },
    },
  });
}
