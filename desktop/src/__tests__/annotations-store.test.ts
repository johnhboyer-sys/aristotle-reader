// Annotation storage safety: an unreadable file must never be silently
// replaced by the next highlight, and the in-memory list must never claim an
// annotation the disk refused. Browser store (localStorage) is used because
// its read/write path is the same shape as the Tauri one.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addAnnotation, annotationsProblem, captureSelection, deleteAnnotation, greekCiteForRange, greekRange,
  listAnnotations, setAnnotationStoreForTests, updateAnnotation, type Annotation, type GreekTarget,
} from '../lib/annotations';
import { atomicWriteText } from '../lib/runtime';

const ann = (work: string, id: string, body = ''): Annotation => ({
  id, work, created: '2026-01-01T00:00:00.000Z', body, layer: 'greek', exact: 'logos',
  target: { kind: 'greek', book: 1, start: { column: '1094a', line: 1, word: 0 }, end: { column: '1094a', line: 1, word: 0 } },
});

beforeEach(() => {
  localStorage.clear();
  setAnnotationStoreForTests(null);
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

function selectText(el: Element) {
  const text = el.firstChild;
  if (!text) throw new Error('fixture has no text node');
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, text.textContent!.length);
  const sel = window.getSelection();
  if (!sel) throw new Error('no selection');
  sel.removeAllRanges();
  sel.addRange(range);
  return range;
}

describe('annotations store', () => {
  it('a corrupt annotations file is reported in one sentence and never overwritten by a new highlight', async () => {
    localStorage.setItem('annotations:corrupt-work', '[{"id": "ann-1", "work": "corrupt-work"');
    expect(await listAnnotations('corrupt-work')).toEqual([]);
    const problem = annotationsProblem('corrupt-work');
    expect(problem).toMatch(/could not be read/i);
    expect(problem).not.toMatch(/\n\s+at /);

    await expect(addAnnotation(ann('corrupt-work', 'ann-2'))).rejects.toThrow(/could not be read/i);
    await expect(updateAnnotation('corrupt-work', 'ann-1', 'note')).rejects.toThrow(/could not be read/i);
    await expect(deleteAnnotation('corrupt-work', 'ann-1')).rejects.toThrow(/could not be read/i);
    // The bytes on disk are exactly what they were: recoverable by hand.
    expect(localStorage.getItem('annotations:corrupt-work')).toBe('[{"id": "ann-1", "work": "corrupt-work"');
    expect(await listAnnotations('corrupt-work')).toEqual([]);
  });

  it('a file that parses but is not a list is treated the same way', async () => {
    localStorage.setItem('annotations:object-work', '{"id": "ann-1"}');
    expect(await listAnnotations('object-work')).toEqual([]);
    expect(annotationsProblem('object-work')).toMatch(/could not be read/i);
    await expect(addAnnotation(ann('object-work', 'ann-2'))).rejects.toThrow();
    expect(localStorage.getItem('annotations:object-work')).toBe('{"id": "ann-1"}');
  });

  it('a missing file is simply an empty list with no problem, and the first write creates it', async () => {
    expect(await listAnnotations('fresh-work')).toEqual([]);
    expect(annotationsProblem('fresh-work')).toBeNull();
    await addAnnotation(ann('fresh-work', 'ann-1'));
    expect(JSON.parse(localStorage.getItem('annotations:fresh-work')!)).toHaveLength(1);
    expect(await listAnnotations('fresh-work')).toHaveLength(1);
  });

  it('a write that fails does not leave the annotation in the in-memory list as if it were saved', async () => {
    await addAnnotation(ann('flaky-work', 'ann-1'));
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    await expect(addAnnotation(ann('flaky-work', 'ann-2'))).rejects.toThrow('QuotaExceededError');
    setItem.mockRestore();
    expect((await listAnnotations('flaky-work')).map(a => a.id)).toEqual(['ann-1']);
    expect(JSON.parse(localStorage.getItem('annotations:flaky-work')!).map((a: Annotation) => a.id)).toEqual(['ann-1']);
  });

  it('overlapping commits on one work keep both changes', async () => {
    const work = 'race-work';
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let writes = 0;
    const stored: Annotation[][] = [];
    setAnnotationStoreForTests({
      async read() {
        return { anns: [ann(work, 'A', 'old'), ann(work, 'B', 'keep')] };
      },
      async write(_work, anns) {
        writes += 1;
        if (writes === 1) await gate;
        stored.push(anns.map((a) => ({ ...a })));
      },
    });
    const p1 = updateAnnotation(work, 'A', 'new text');
    const p2 = deleteAnnotation(work, 'B');
    await vi.waitUntil(() => writes >= 1);
    release();
    await Promise.all([p1, p2]);
    const final = stored[stored.length - 1];
    expect(final.map((a) => a.id)).toEqual(['A']);
    expect(final.find((a) => a.id === 'A')?.body).toBe('new text');
  });

  it('a first load racing a commit cannot put the old list back', async () => {
    const work = 'read-race';
    const reads: Array<(v: { anns: Annotation[] }) => void> = [];
    const stored: Annotation[][] = [];
    setAnnotationStoreForTests({
      read() { return new Promise((resolve) => { reads.push(resolve); }); },
      async write(_work, anns) { stored.push(anns.map((a) => ({ ...a }))); },
    });
    const listed = listAnnotations(work);
    const p1 = updateAnnotation(work, 'A', 'new text');
    await new Promise((r) => setTimeout(r, 0));   // let the commit start its read, if it makes one
    const disk = () => ({ anns: [ann(work, 'A', 'old'), ann(work, 'B', 'keep')] });
    const [first, ...later] = reads;
    if (later.length) {
      // Two reads: the commit's answers and saves, THEN the list's read lands late.
      for (const r of later) r(disk());
      await p1;
      first(disk());
    } else {
      first(disk());
      await p1;
    }
    await listed;
    await deleteAnnotation(work, 'B');
    expect(stored[stored.length - 1].map((a) => [a.id, a.body])).toEqual([['A', 'new text']]);
  });

  it('a failed commit rejects its caller and does not block the next one', async () => {
    const work = 'fail-then-ok';
    let n = 0;
    setAnnotationStoreForTests({
      async read() { return { anns: [ann(work, 'A', 'old')] }; },
      async write() {
        n += 1;
        if (n === 1) throw new Error('disk full');
      },
    });
    const p1 = updateAnnotation(work, 'A', 'new text');
    const p2 = updateAnnotation(work, 'A', 'second');
    await expect(p1).rejects.toThrow('disk full');
    await p2;
    expect((await listAnnotations(work)).find((a) => a.id === 'A')?.body).toBe('second');
  });
});

describe('lettered-line annotations', () => {
  it('cites a lettered line without a hyphen', () => {
    document.body.innerHTML = '<span class="greek-line" id="L775a-11a">λόγος</span>';
    const el = document.getElementById('L775a-11a')!;
    const range = document.createRange();
    range.selectNodeContents(el);
    expect(greekCiteForRange(range, 'GA')).toBe('(GA 775a11a)');
  });

  it('captures a lettered line and resolves the target back to that element', () => {
    document.body.innerHTML = '<div class="greek-col"><span class="greek-line" id="L775a-11a"><span class="tok">λόγος</span></span></div>';
    selectText(document.querySelector('.tok')!);
    const cap = captureSelection(4, '');
    expect(cap).toMatchObject({
      target: {
        kind: 'greek',
        start: { column: '775a', line: 11, sub: 'a' },
        end: { column: '775a', line: 11, sub: 'a' },
      },
    });
    const ranges = greekRange((cap as { target: GreekTarget }).target);
    expect(ranges).toHaveLength(1);
    expect(document.getElementById('L775a-11a')!.contains(ranges[0].startContainer)).toBe(true);
  });

  it('resolves an old annotation that has no letter suffix', () => {
    document.body.innerHTML = '<span class="greek-line" id="L1094a-3"><span class="tok">ἀρετή</span></span>';
    const target: GreekTarget = {
      kind: 'greek',
      book: 1,
      start: { column: '1094a', line: 3, word: 0 },
      end: { column: '1094a', line: 3, word: 0 },
    };
    const ranges = greekRange(target);
    expect(ranges).toHaveLength(1);
    expect(document.getElementById('L1094a-3')!.contains(ranges[0].startContainer)).toBe(true);
  });
});

describe('atomicWriteText', () => {
  it('gives overlapping writes to one path distinct temp names', async () => {
    const temps: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let n = 0;
    const fs = {
      writeTextFile: async (p: string | URL) => {
        temps.push(String(p));
        n += 1;
        if (n === 1) await gate;
      },
      rename: async (_from: string | URL, _to: string | URL) => {},
    };
    const p1 = atomicWriteText(fs, '/tmp/a.json', 'one');
    const p2 = atomicWriteText(fs, '/tmp/a.json', 'two');
    await vi.waitUntil(() => temps.length >= 2);
    expect(temps[0]).not.toBe(temps[1]);
    expect(temps[0]).toMatch(/\/tmp\/a\.json\.\d+\.tmp$/);
    expect(temps[1]).toMatch(/\/tmp\/a\.json\.\d+\.tmp$/);
    release();
    await Promise.all([p1, p2]);
  });
});
