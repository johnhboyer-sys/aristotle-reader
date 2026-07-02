// App-level undo stack: coalescing window, entry boundaries, redo semantics.
import { describe, expect, it } from 'vitest';
import { AppHistory, COALESCE_WINDOW_MS } from '../history';
import type { UndoEntry } from '../history';
import { buildRowDoc } from '../serialize';
import type { Node as PMNode } from '@tiptap/pm/model';

const d = (text: string): PMNode => buildRowDoc(text ? [{ kind: 'text', text, marks: {} }] : []);

function entry(row: number, before: string, after: string): UndoEntry {
  return {
    edits: [{ row, before: d(before), after: d(after) }],
    selBefore: { row, anchor: before.length, head: before.length },
    selAfter: { row, anchor: after.length, head: after.length },
  };
}

describe('AppHistory', () => {
  it('coalesces a typing burst in one row into one entry', () => {
    const h = new AppHistory();
    h.push(entry(3, '', 'a'), { coalesceKey: 'typing:3', now: 1000 });
    h.push(entry(3, 'a', 'ab'), { coalesceKey: 'typing:3', now: 1200 });
    h.push(entry(3, 'ab', 'abc'), { coalesceKey: 'typing:3', now: 1400 });
    expect(h.depth).toBe(1);

    const e = h.undo()!;
    expect(e.edits[0].before.textContent).toBe('');
    expect(e.edits[0].after.textContent).toBe('abc');
  });

  it('starts a new entry after the idle window', () => {
    const h = new AppHistory();
    h.push(entry(3, '', 'a'), { coalesceKey: 'typing:3', now: 1000 });
    h.push(entry(3, 'a', 'ab'), { coalesceKey: 'typing:3', now: 1000 + COALESCE_WINDOW_MS + 1 });
    expect(h.depth).toBe(2);
  });

  it('row change breaks coalescing (different key)', () => {
    const h = new AppHistory();
    h.push(entry(3, '', 'a'), { coalesceKey: 'typing:3', now: 1000 });
    h.push(entry(4, '', 'x'), { coalesceKey: 'typing:4', now: 1100 });
    h.push(entry(3, 'a', 'ab'), { coalesceKey: 'typing:3', now: 1200 });
    expect(h.depth).toBe(3);
  });

  it('breakCoalescing forces a boundary (blur / idle commit / command)', () => {
    const h = new AppHistory();
    h.push(entry(3, '', 'a'), { coalesceKey: 'typing:3', now: 1000 });
    h.breakCoalescing();
    h.push(entry(3, 'a', 'ab'), { coalesceKey: 'typing:3', now: 1100 });
    expect(h.depth).toBe(2);
  });

  it('non-typing entries (no key) never merge', () => {
    const h = new AppHistory();
    h.push(entry(3, '', 'a'), { now: 1000 });
    h.push(entry(3, 'a', 'ab'), { now: 1010 });
    expect(h.depth).toBe(2);
  });

  it('entries with footnote-table snapshots never merge', () => {
    const h = new AppHistory();
    h.push(entry(3, '', 'a'), { coalesceKey: 'typing:3', now: 1000 });
    const withFn = entry(3, 'a', 'ab');
    withFn.fnBefore = [];
    withFn.fnAfter = [{ id: '1', body: '', anchored: true }];
    h.push(withFn, { coalesceKey: 'typing:3', now: 1100 });
    expect(h.depth).toBe(2);
  });

  it('multi-row paste is one entry; undo returns all edits', () => {
    const h = new AppHistory();
    const paste: UndoEntry = {
      edits: [
        { row: 2, before: d('x'), after: d('x one') },
        { row: 3, before: d(''), after: d('two') },
        { row: 4, before: d(''), after: d('three') },
      ],
      selBefore: { row: 2, anchor: 1, head: 1 },
      selAfter: { row: 4, anchor: 5, head: 5 },
    };
    h.push(paste);
    expect(h.depth).toBe(1);
    expect(h.undo()!.edits).toHaveLength(3);
  });

  it('undo moves entries to redo; redo restores; new edit clears redo', () => {
    const h = new AppHistory();
    h.push(entry(0, '', 'a'), { now: 1000 });
    h.push(entry(0, 'a', 'b'), { now: 2000 });
    expect(h.undo()!.edits[0].after.textContent).toBe('b');
    expect(h.canRedo).toBe(true);
    expect(h.redo()!.edits[0].after.textContent).toBe('b');
    h.undo();
    h.push(entry(0, 'a', 'c'), { now: 3000 });
    expect(h.canRedo).toBe(false);
    expect(h.depth).toBe(2);
  });

  it('undo after coalescing does not merge with pre-undo entries', () => {
    const h = new AppHistory();
    h.push(entry(0, '', 'a'), { coalesceKey: 'typing:0', now: 1000 });
    h.undo();
    h.push(entry(0, '', 'z'), { coalesceKey: 'typing:0', now: 1010 });
    expect(h.depth).toBe(1);
    expect(h.undo()!.edits[0].after.textContent).toBe('z');
  });

  it('empty stacks return undefined', () => {
    const h = new AppHistory();
    expect(h.undo()).toBeUndefined();
    expect(h.redo()).toBeUndefined();
  });
});
