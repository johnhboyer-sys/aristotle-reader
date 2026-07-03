// App-level undo stack: coalescing window, entry boundaries, redo semantics.
// Since design doc D6 the edit payload is the row's SEGMENT BUNDLE (docs +
// splitOffsets) so a split/un-split is one entry — the shape tests at the
// bottom pin that.
import { describe, expect, it } from 'vitest';
import { AppHistory, COALESCE_WINDOW_MS } from '../history';
import type { RowSnapshot, UndoEntry } from '../history';
import { buildRowDoc } from '../serialize';
import type { Node as PMNode } from '@tiptap/pm/model';

const d = (text: string): PMNode => buildRowDoc(text ? [{ kind: 'text', text, marks: {} }] : []);

/** Unsplit-row snapshot: one segment doc, no offsets. */
const snap = (text: string): RowSnapshot => ({ docs: [d(text)] });

function entry(row: number, before: string, after: string): UndoEntry {
  return {
    edits: [{ row, before: snap(before), after: snap(after) }],
    selBefore: { row, segment: 0, anchor: before.length, head: before.length },
    selAfter: { row, segment: 0, anchor: after.length, head: after.length },
  };
}

describe('AppHistory', () => {
  it('coalesces a typing burst in one row into one entry', () => {
    const h = new AppHistory();
    h.push(entry(3, '', 'a'), { coalesceKey: 'typing:3.0', now: 1000 });
    h.push(entry(3, 'a', 'ab'), { coalesceKey: 'typing:3.0', now: 1200 });
    h.push(entry(3, 'ab', 'abc'), { coalesceKey: 'typing:3.0', now: 1400 });
    expect(h.depth).toBe(1);

    const e = h.undo()!;
    expect(e.edits[0].before.docs[0].textContent).toBe('');
    expect(e.edits[0].after.docs[0].textContent).toBe('abc');
  });

  it('starts a new entry after the idle window', () => {
    const h = new AppHistory();
    h.push(entry(3, '', 'a'), { coalesceKey: 'typing:3.0', now: 1000 });
    h.push(entry(3, 'a', 'ab'), { coalesceKey: 'typing:3.0', now: 1000 + COALESCE_WINDOW_MS + 1 });
    expect(h.depth).toBe(2);
  });

  it('row change breaks coalescing (different key)', () => {
    const h = new AppHistory();
    h.push(entry(3, '', 'a'), { coalesceKey: 'typing:3.0', now: 1000 });
    h.push(entry(4, '', 'x'), { coalesceKey: 'typing:4.0', now: 1100 });
    h.push(entry(3, 'a', 'ab'), { coalesceKey: 'typing:3.0', now: 1200 });
    expect(h.depth).toBe(3);
  });

  it('segment change within one row breaks coalescing (different key — D6)', () => {
    const h = new AppHistory();
    h.push(entry(3, '', 'a'), { coalesceKey: 'typing:3.0', now: 1000 });
    h.push(entry(3, 'a', 'ab'), { coalesceKey: 'typing:3.1', now: 1100 });
    expect(h.depth).toBe(2);
  });

  it('breakCoalescing forces a boundary (blur / idle commit / command)', () => {
    const h = new AppHistory();
    h.push(entry(3, '', 'a'), { coalesceKey: 'typing:3.0', now: 1000 });
    h.breakCoalescing();
    h.push(entry(3, 'a', 'ab'), { coalesceKey: 'typing:3.0', now: 1100 });
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
    h.push(entry(3, '', 'a'), { coalesceKey: 'typing:3.0', now: 1000 });
    const withFn = entry(3, 'a', 'ab');
    withFn.fnBefore = [];
    withFn.fnAfter = [{ id: '1', body: '', anchored: true }];
    h.push(withFn, { coalesceKey: 'typing:3.0', now: 1100 });
    expect(h.depth).toBe(2);
  });

  it('multi-row paste is one entry; undo returns all edits', () => {
    const h = new AppHistory();
    const paste: UndoEntry = {
      edits: [
        { row: 2, before: snap('x'), after: snap('x one') },
        { row: 3, before: snap(''), after: snap('two') },
        { row: 4, before: snap(''), after: snap('three') },
      ],
      selBefore: { row: 2, segment: 0, anchor: 1, head: 1 },
      selAfter: { row: 4, segment: 0, anchor: 5, head: 5 },
    };
    h.push(paste);
    expect(h.depth).toBe(1);
    expect(h.undo()!.edits).toHaveLength(3);
  });

  it('undo moves entries to redo; redo restores; new edit clears redo', () => {
    const h = new AppHistory();
    h.push(entry(0, '', 'a'), { now: 1000 });
    h.push(entry(0, 'a', 'b'), { now: 2000 });
    expect(h.undo()!.edits[0].after.docs[0].textContent).toBe('b');
    expect(h.canRedo).toBe(true);
    expect(h.redo()!.edits[0].after.docs[0].textContent).toBe('b');
    h.undo();
    h.push(entry(0, 'a', 'c'), { now: 3000 });
    expect(h.canRedo).toBe(false);
    expect(h.depth).toBe(2);
  });

  it('undo after coalescing does not merge with pre-undo entries', () => {
    const h = new AppHistory();
    h.push(entry(0, '', 'a'), { coalesceKey: 'typing:0.0', now: 1000 });
    h.undo();
    h.push(entry(0, '', 'z'), { coalesceKey: 'typing:0.0', now: 1010 });
    expect(h.depth).toBe(1);
    expect(h.undo()!.edits[0].after.docs[0].textContent).toBe('z');
  });

  it('empty stacks return undefined', () => {
    const h = new AppHistory();
    expect(h.undo()).toBeUndefined();
    expect(h.redo()).toBeUndefined();
  });

  // ── D6: split/un-split entry shape ────────────────────────────────────
  it('a split is ONE entry whose bundles carry the structural before/after', () => {
    const h = new AppHistory();
    const split: UndoEntry = {
      edits: [
        {
          row: 5,
          before: { docs: [d('one flowing line')] }, // unsplit: 1 doc, no offsets
          after: { docs: [d('one flowing'), d('line')], splitOffsets: [14] },
        },
      ],
      selBefore: { row: 5, segment: 0, anchor: 16, head: 16 },
      selAfter: { row: 5, segment: 1, anchor: 0, head: 0 },
    };
    h.push(split);
    expect(h.depth).toBe(1);

    // One ⌘Z returns the whole structural state — offsets AND both docs.
    const e = h.undo()!;
    expect(e.edits[0].before.splitOffsets).toBeUndefined();
    expect(e.edits[0].before.docs).toHaveLength(1);
    expect(e.edits[0].after.splitOffsets).toEqual([14]);
    expect(e.edits[0].after.docs.map((x) => x.textContent)).toEqual(['one flowing', 'line']);
    expect(e.selBefore).toEqual({ row: 5, segment: 0, anchor: 16, head: 16 });
  });

  it('structural entries (offsets differ) never coalesce with typing', () => {
    const h = new AppHistory();
    h.push(entry(5, '', 'a'), { coalesceKey: 'typing:5.0', now: 1000 });
    const split: UndoEntry = {
      edits: [{ row: 5, before: { docs: [d('a')] }, after: { docs: [d('a'), d('')], splitOffsets: [3] } }],
      selBefore: null,
      selAfter: { row: 5, segment: 1, anchor: 0, head: 0 },
    };
    h.push(split, { now: 1010 }); // no coalesce key — a command, not typing
    expect(h.depth).toBe(2);
  });
});
