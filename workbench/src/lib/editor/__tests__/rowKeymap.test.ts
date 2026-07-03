// Pure row-keymap logic: paste planning (distribute vs flatten) and the
// typing-transaction shape check used for undo coalescing.
import { describe, expect, it } from 'vitest';
import { EditorState } from '@tiptap/pm/state';
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
  function makeCtx() {
    const calls = { requestAssist: 0, focusRowEnd: [] as number[] };
    const ctx: RowContext = {
      index: 0,
      rowCount: () => 3,
      isRowEmpty: () => true,
      focusRowEnd: (k) => {
        calls.focusRowEnd.push(k);
      },
      focusRowAtX: () => {},
      getSavedX: () => null,
      setSavedX: () => {},
      clearSavedX: () => {},
      flash: () => {},
      hint: () => {},
      toast: () => {},
      toggleGreek: () => {},
      undo: () => {},
      redo: () => {},
      insertFootnote: () => {},
      requestPasteDistribute: () => {},
      requestAssist: () => {
        calls.requestAssist++;
      },
    };
    return { ctx, calls };
  }

  function pressEnter(mods: { mod?: boolean } = {}) {
    const { ctx, calls } = makeCtx();
    const [bindings] = rowPlugins(ctx);
    const state = EditorState.create({ doc: buildRowDoc([]) });
    const view = { state, dispatch: () => {} } as unknown as EditorView;
    const mod = mods.mod ?? false;
    const event = {
      key: 'Enter',
      keyCode: 13,
      ctrlKey: mod && !IS_MAC,
      metaKey: mod && IS_MAC,
      altKey: false,
      shiftKey: false,
    } as unknown as KeyboardEvent;
    const handled = bindings.props.handleKeyDown!.call(bindings, view, event);
    return { handled, calls };
  }

  it('⌘⏎ (Mod-Enter) requests an AI suggestion for the row — it never advances', () => {
    const { handled, calls } = pressEnter({ mod: true });
    expect(handled).toBe(true);
    expect(calls.requestAssist).toBe(1);
    expect(calls.focusRowEnd).toEqual([]);
  });

  it('plain Enter still advances to the next row (D1 muscle memory unchanged)', () => {
    const { handled, calls } = pressEnter();
    expect(handled).toBe(true);
    expect(calls.requestAssist).toBe(0);
    expect(calls.focusRowEnd).toEqual([1]);
  });
});
