// Pure row-keymap logic: paste planning (distribute vs flatten), the
// typing-transaction shape check used for undo coalescing, and the headless
// keymap bindings — including the D6 display-row navigation (Enter/Backspace/
// Delete across the segments of a paragraph-split Bekker line).
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { planPaste, splitSegments, flattenSegments, rowPlugins } from '../plugins/rowKeymap';
import type { RowContext } from '../plugins/rowKeymap';
import { buildRowDoc } from '../serialize';

describe('splitSegments', () => {
  it('splits on \\n, \\r\\n and \\r', () => {
    expect(splitSegments('a\nb\r\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops trailing empty segments from a final newline', () => {
    expect(splitSegments('a\nb\n')).toEqual(['a', 'b']);
    expect(splitSegments('a\n\n')).toEqual(['a']);
  });

  it('keeps interior empty segments (blank line = empty row)', () => {
    expect(splitSegments('a\n\nb')).toEqual(['a', '', 'b']);
  });
});

describe('planPaste', () => {
  it('single-line paste inserts as-is', () => {
    expect(planPaste('some prose', true, 0)).toEqual({ kind: 'insert', text: 'some prose' });
    expect(planPaste('some prose', false, 0)).toEqual({ kind: 'insert', text: 'some prose' });
  });

  it('distributes N segments when the remainder is empty and N-1 empty rows follow', () => {
    expect(planPaste('one\ntwo\nthree', true, 2)).toEqual({
      kind: 'distribute',
      segments: ['one', 'two', 'three'],
    });
    // More empties than needed is fine too.
    expect(planPaste('one\ntwo', true, 5)).toEqual({ kind: 'distribute', segments: ['one', 'two'] });
  });

  it('flattens when the caret has content after it', () => {
    expect(planPaste('one\ntwo', false, 5)).toEqual({ kind: 'flatten', text: 'one two' });
  });

  it('flattens when the following rows are not empty enough', () => {
    expect(planPaste('one\ntwo\nthree', true, 1)).toEqual({ kind: 'flatten', text: 'one two three' });
  });

  it('never proposes creating rows: distribution requires exactly following empties', () => {
    // 4 segments at the end of the chapter with only 2 rows below → flatten.
    expect(planPaste('a\nb\nc\nd', true, 2).kind).toBe('flatten');
  });

  it('flatten trims segment edges and skips blank lines', () => {
    expect(flattenSegments([' one ', '', 'two  ', 'three'])).toBe('one two three');
  });
});

// ── keymap behavior, headless (no DOM: fake view + plain key events) ────────
// prosemirror-keymap resolves Mod → Meta on a Mac and Ctrl elsewhere, using
// the same navigator.platform sniff at module load (node ≥21 has a global
// navigator) — mirror it so the modifier below lands on Mod either way.

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform ?? '');

describe('row keymap bindings', () => {
  function makeCtx(overrides: Partial<RowContext> = {}) {
    const calls = {
      requestAssist: 0,
      focusRowEnd: [] as number[],
      focusRowStart: [] as number[],
      flash: [] as number[],
      hints: [] as string[],
    };
    const ctx: RowContext = {
      index: 0,
      rowCount: () => 3,
      isRowEmpty: () => true,
      isContinuation: () => false,
      focusRowEnd: (k) => {
        calls.focusRowEnd.push(k);
      },
      focusRowStart: (k) => {
        calls.focusRowStart.push(k);
      },
      focusRowAtX: () => {},
      getSavedX: () => null,
      setSavedX: () => {},
      clearSavedX: () => {},
      flash: (k) => {
        calls.flash.push(k);
      },
      hint: (t) => {
        calls.hints.push(t);
      },
      toast: () => {},
      toggleGreek: () => {},
      undo: () => {},
      redo: () => {},
      insertFootnote: () => {},
      requestPasteDistribute: () => {},
      requestAssist: () => {
        calls.requestAssist++;
      },
      ...overrides,
    };
    return { ctx, calls };
  }

  function press(
    key: string,
    keyCode: number,
    opts: {
      mod?: boolean;
      made?: ReturnType<typeof makeCtx>;
      doc?: ReturnType<typeof buildRowDoc>;
      selAt?: number;
    } = {},
  ) {
    const made = opts.made ?? makeCtx();
    const [bindings] = rowPlugins(made.ctx);
    let state = EditorState.create({ doc: opts.doc ?? buildRowDoc([]) });
    if (opts.selAt !== undefined) {
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, opts.selAt)));
    }
    const dispatched: unknown[] = [];
    const view = {
      state,
      dispatch: (tr: unknown) => {
        dispatched.push(tr);
      },
    } as unknown as EditorView;
    const mod = opts.mod ?? false;
    const event = {
      key,
      keyCode,
      ctrlKey: mod && !IS_MAC,
      metaKey: mod && IS_MAC,
      altKey: false,
      shiftKey: false,
    } as unknown as KeyboardEvent;
    const handled = bindings.props.handleKeyDown!.call(bindings, view, event);
    return { handled, calls: made.calls, dispatched };
  }

  const text = (t: string) => buildRowDoc([{ kind: 'text', text: t, marks: {} }]);

  it('⌘⏎ (Mod-Enter) requests an AI suggestion for the row — it never advances', () => {
    const { handled, calls } = press('Enter', 13, { mod: true });
    expect(handled).toBe(true);
    expect(calls.requestAssist).toBe(1);
    expect(calls.focusRowEnd).toEqual([]);
  });

  it('plain Enter still advances to the next row (D1 muscle memory unchanged)', () => {
    const { handled, calls } = press('Enter', 13);
    expect(handled).toBe(true);
    expect(calls.requestAssist).toBe(0);
    expect(calls.focusRowEnd).toEqual([1]);
  });

  // ── D6: display-row navigation across split segments ──────────────────
  it('Enter walks DISPLAY rows: segment 0 advances to the same line’s continuation', () => {
    // Grid: [line A seg 0, line A seg 1, line B]. Enter from ordinal 0 lands
    // on ordinal 1 — the continuation — not on line B.
    const made = makeCtx({ isContinuation: (k) => k === 1 });
    const { handled, calls } = press('Enter', 13, { made });
    expect(handled).toBe(true);
    expect(calls.focusRowEnd).toEqual([1]);
  });

  it('Backspace at a continuation start NAVIGATES to the previous segment end — never joins, no merge hint', () => {
    const made = makeCtx({ index: 1, isContinuation: (k) => k === 1 });
    const { handled, calls, dispatched } = press('Backspace', 8, {
      made,
      doc: text('continuation text'),
      selAt: 0,
    });
    expect(handled).toBe(true);
    expect(calls.focusRowEnd).toEqual([0]); // caret moved up…
    expect(dispatched).toEqual([]); // …and NOTHING was deleted or joined
    expect(calls.hints).toEqual([]); // no “can’t be merged” — same address
    expect(calls.flash).toEqual([]);
  });

  it('Backspace at the start of a DISTINCT address keeps the two-step merge guard', () => {
    const made = makeCtx({ index: 1 }); // isContinuation stays false
    const { handled, calls, dispatched } = press('Backspace', 8, {
      made,
      doc: text('row text'),
      selAt: 0,
    });
    expect(handled).toBe(true);
    expect(dispatched).toEqual([]);
    expect(calls.focusRowEnd).toEqual([]); // first press only hints
    expect(calls.hints[0]).toContain('Bekker lines can’t be merged');
    expect(calls.flash).toEqual([1]);
  });

  it('Delete at a segment end before the same line’s continuation navigates — never joins', () => {
    const doc = text('first segment');
    const made = makeCtx({ isContinuation: (k) => k === 1 });
    const { handled, calls, dispatched } = press('Delete', 46, { made, doc, selAt: doc.content.size });
    expect(handled).toBe(true);
    expect(calls.focusRowStart).toEqual([1]);
    expect(dispatched).toEqual([]);
    expect(calls.hints).toEqual([]);
  });

  it('Delete at a row end before a DISTINCT address still hints the merge guard', () => {
    const doc = text('row');
    const made = makeCtx();
    const { handled, calls } = press('Delete', 46, { made, doc, selAt: doc.content.size });
    expect(handled).toBe(true);
    expect(calls.focusRowStart).toEqual([]);
    expect(calls.hints).toEqual(['Bekker lines can’t be merged']);
  });
});
