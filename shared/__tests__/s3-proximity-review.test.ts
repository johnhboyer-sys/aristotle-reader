import { afterEach, describe, expect, it, vi } from 'vitest';
import { comboWindows, ProximityTooComplex, searchCombo, type ComboOptions, type SlotRelation } from '../lib/search';

// Codex review of S3 (a31ffeb4b3), findings 1 and 2: placement cost is
// bounded, results equal a brute-force count, and a word marked "near" a
// match satisfies the not-near terms measured from its term.

type Hit = { start: number; span: number; certain: boolean };
type Offsets = Parameters<typeof comboWindows>[2];
const at = (...starts: number[]): Hit[] => starts.map((start) => ({ start, span: 1, certain: true }));

describe('placement cost on a search that cannot match', () => {
  // Three grammar terms dense in chapter 1, the fourth only in chapter 2.
  const offsets = {
    token_count: 8000,
    seg_base_offset: [0],
    segments: [{ book: 1, column: '1a', line_runs: [[1, 8000]] }],
    book_bounds: [{ book: 1, start: 0 }],
    chapter_bounds: [{ book: 1, chapter: '1', start: 0, accuracy: 'exact' }, { book: 1, chapter: '2', start: 5000, accuracy: 'exact' }],
  } as unknown as Offsets;
  const dense = (n: number, k: number) => at(...Array.from({ length: n }, (_, i) => i * 4 + k));
  const chapter: ComboOptions = { window: 5, unit: 'chapter', ordered: false, crossChapter: true };

  // Before the fix: 2.7 s on this machine (cubic in the hits).
  it.each([
    ['every term from term 1', [0, 0, 0, 0], false],
    ['the fourth from the third', [0, 0, 1, 2], false],
    ['in this order', [0, 0, 0, 0], true],
  ] as const)('400 dense hits, %s: no match, under 300 ms', (_, targets, ordered) => {
    const t0 = performance.now();
    const w = comboWindows([dense(400, 0), dense(400, 1), dense(400, 2), at(6000)], { ...chapter, ordered }, offsets, [], [], [...targets]);
    const ms = performance.now() - t0;
    expect(w).toEqual([]);
    expect(ms).toBeLessThan(300);
  });

  it('still finds the matches when the fourth term is in the chapter', () => {
    const w = comboWindows([dense(400, 0), dense(400, 1), dense(400, 2), at(1000)], chapter, offsets, [], [], [0, 0, 0, 0]);
    expect(w).toHaveLength(400);
  });

  it('a search past the step budget fails with an explicit message, never a short result', () => {
    // Words unit, window 50, in this order, the last term before every other:
    // no relaxation rules it out, so the placement must be searched.
    const many = (k: number) => at(...Array.from({ length: 900 }, (_, i) => 100 + i * 4 + k));
    const words: ComboOptions = { window: 50, unit: 'words', ordered: true, crossChapter: true };
    let thrown: unknown;
    try {
      // The last slot is measured from slot 2 and must stand before it; with
      // the lock it must also follow it. Contradictory, and found only by search.
      comboWindows([many(0), many(1), many(2), many(3)], words, offsets, ['near', 'near', 'near', 'before'], [], [0, 0, 1, 2], { left: 20_000 });
    } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(ProximityTooComplex);
    expect((thrown as Error).message).toMatch(/too many/i);
  });
});

describe('a search past the step budget, through searchCombo', () => {
  afterEach(() => vi.restoreAllMocks());
  it('stops the whole search with the message, not as a work that failed to load', async () => {
    // Four terms on every one of 5,000 words, the last both after (the lock)
    // and before (its relation) the third: millions of placements, no match.
    const every = Array.from({ length: 5000 }, (_, i) => [0, i]);
    const json = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json([{ id: '1:1a', book: 1, column: '1a' }]);
      if (path.endsWith('/offsets.json')) return json({ token_count: 5000, seg_base_offset: [0], segments: [{ book: 1, column: '1a', line_runs: [[1, 5000]] }], book_bounds: [{ book: 1, start: 0 }] });
      if (path.endsWith('/greek_form.json')) return json({ a: every, b: every, c: every, d: every });
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
    const f = (t: string, over = {}) => ({ kind: 'form' as const, terms: [t], ...over });
    const run = searchCombo([f('a'), f('b'), f('c', { target: 1 }), f('d', { relation: 'before', target: 2 })],
      { window: 50, unit: 'words', ordered: true, crossChapter: true }, ['BUDGET1']);
    await expect(run).rejects.toBeInstanceOf(ProximityTooComplex);
    await expect(run).rejects.toThrow(/too many ways to place its terms/);
  });
});

// ── Brute force: every assignment of a hit to each term, checked against the
// rules as stated, with no engine code. ─────────────────────────────────────
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

interface Case {
  perSlot: Hit[][];
  relations: SlotRelation[];
  identities: string[];
  targets: number[];
  opts: ComboOptions;
  offsets: Offsets;
  bounds: { books: number[]; chapters: number[]; lines: number[] };
}

const TOTAL = 40;
function randomCase(r: () => number): Case {
  const n = 2 + Math.floor(r() * 3);   // 2 to 4 terms
  const relations: SlotRelation[] = ['near'];
  const targets = [0];
  for (let s = 1; s < n; s++) {
    relations.push((['near', 'near', 'before', 'after', 'not'] as const)[Math.floor(r() * 5)]);
    const kept = relations.slice(0, s).map((rel, i) => (i === 0 || rel !== 'not' ? i : -1)).filter((i) => i >= 0);
    targets.push(kept[Math.floor(r() * kept.length)]);
  }
  const perSlot = relations.map(() => {
    const starts = new Set<number>();
    const k = Math.floor(r() * 6);
    for (let i = 0; i < k; i++) starts.add(Math.floor(r() * TOTAL));
    return [...starts].map((start) => ({ start, span: r() < 0.15 && start < TOTAL - 1 ? 2 : 1, certain: true }));
  });
  // Sometimes two terms ask the same thing.
  const identities = relations.map(() => '');
  if (n >= 2 && r() < 0.35) {
    const a = Math.floor(r() * n);
    const b = Math.floor(r() * n);
    if (a !== b) { identities[a] = 'x'; identities[b] = 'x'; }
  }
  const units = ['words', 'words', 'line', 'chapter'] as const;
  const opts: ComboOptions = {
    window: 1 + Math.floor(r() * 5),
    unit: units[Math.floor(r() * units.length)],
    ordered: r() < 0.3,
    crossChapter: r() < 0.8,
  };
  const books = r() < 0.4 ? [0, 25] : [0];
  const chapters = [0, 12, 30];
  const lines = [0, 10, 20, 30];
  const offsets = {
    token_count: TOTAL,
    seg_base_offset: [0],
    segments: [{ book: 1, column: '1a', line_runs: [[1, 10], [2, 10], [3, 10], [4, 10]] }],
    book_bounds: books.map((start, i) => ({ book: i + 1, start })),
    chapter_bounds: chapters.map((start, i) => ({ book: 1, chapter: String(i + 1), start, accuracy: 'exact' })),
  } as unknown as Offsets;
  return { perSlot, relations, identities, targets, opts, offsets, bounds: { books, chapters, lines } };
}

// The cell of each partition a token is in: book always, chapter when the
// chapter is the unit or matches may not cross one, line when the line is.
function unitOf(c: Case, at: number): [number, number] {
  const cell = (starts: number[]): [number, number] => {
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= at) i++;
    return [starts[i], i + 1 < starts.length ? starts[i + 1] : TOTAL];
  };
  let [lo, hi] = cell(c.bounds.books);
  const clamp = ([s, e]: [number, number]) => { lo = Math.max(lo, s); hi = Math.min(hi, e); };
  if (c.opts.unit === 'chapter' || c.opts.crossChapter === false) clamp(cell(c.bounds.chapters));
  if (c.opts.unit === 'line') clamp(cell(c.bounds.lines));
  return [lo, hi];
}

// Whether `take` (a hit per term, undefined for NOT terms) is a match.
function valid(c: Case, take: (Hit | undefined)[]): boolean {
  const W = c.opts.window;
  const words = c.opts.unit === 'words';
  const anchor = take[0]!;
  const [lo, hi] = unitOf(c, anchor.start);
  const kept = c.relations.map((rel, s) => s === 0 || rel !== 'not');
  const inUnit = (h: Hit) => h.start >= lo && h.start + h.span <= hi;
  let prev: Hit | undefined;
  for (let s = 0; s < take.length; s++) {
    if (!kept[s]) continue;
    const h = take[s]!;
    if (!inUnit(h)) return false;
    if (c.opts.ordered && prev && h.start < prev.start + prev.span) return false;
    prev = h;
    if (s === 0) continue;
    const from = take[c.targets[s]]!;
    if (words && Math.abs(h.start - from.start) > W) return false;
    if (c.relations[s] === 'after' && h.start < from.start + from.span) return false;
    if (c.relations[s] === 'before' && h.start + h.span > from.start) return false;
  }
  for (let s = 0; s < take.length; s++) for (let k = s + 1; k < take.length; k++) {
    if (kept[s] && kept[k] && c.identities[s] && c.identities[s] === c.identities[k] && take[s]!.start === take[k]!.start) return false;
  }
  return !notReached(c, take, lo, hi);
}

// A NOT hit near the hit chosen for its target (anywhere in the unit, for the
// line and chapter units), unless a term asking the same thing took its word.
function notReached(c: Case, take: (Hit | undefined)[], lo: number, hi: number): boolean {
  const W = c.opts.window;
  for (let s = 1; s < c.relations.length; s++) {
    if (c.relations[s] !== 'not') continue;
    const from = take[c.targets[s]]!;
    const nlo = c.opts.unit === 'words' ? from.start - W : lo;
    const nhi = c.opts.unit === 'words' ? from.start + from.span + W : hi;
    for (const n of c.perSlot[s]) {
      if (n.start + n.span <= nlo || n.start >= nhi) continue;
      if (n.start < lo || n.start + n.span > hi) continue;
      const exempt = take.some((m, k) => m && c.relations[k] !== 'not' && c.identities[s] && c.identities[k] === c.identities[s] && m.start === n.start);
      if (!exempt) return true;
    }
  }
  return false;
}

function bruteAnchors(c: Case): number[] {
  const out: number[] = [];
  const anchors = [...c.perSlot[0]].sort((a, b) => a.start - b.start);
  for (const anchor of anchors) {
    const take: (Hit | undefined)[] = [anchor];
    const go = (s: number): boolean => {
      if (s === c.relations.length) return valid(c, take);
      if (c.relations[s] === 'not') { take[s] = undefined; return go(s + 1); }
      for (const h of c.perSlot[s]) { take[s] = h; if (go(s + 1)) return true; }
      return false;
    };
    if (go(1)) out.push(anchor.start);
  }
  return out;
}

describe('the placement equals a brute-force search', () => {
  it('on 400 random small searches (fixed seed)', () => {
    const r = rng(20261112);
    let matched = 0;
    for (let i = 0; i < 400; i++) {
      const c = randomCase(r);
      const ctx = JSON.stringify({ ...c, offsets: undefined });
      const w = comboWindows(c.perSlot, c.opts, c.offsets, c.relations, c.identities, c.targets);
      const want = bruteAnchors(c);
      expect(w.map((x) => x.hits[0].start), ctx).toEqual(want);
      matched += want.length;
      const keptSlots = c.relations.map((rel, s) => (s === 0 || rel !== 'not' ? s : -1)).filter((s) => s >= 0);
      for (const x of w) {
        // The hits it chose are a match by the rules.
        const take: (Hit | undefined)[] = c.relations.map(() => undefined);
        keptSlots.forEach((s, k) => { take[s] = x.hits[k]; });
        expect(valid(c, take), ctx).toBe(true);
        // A word marked near the match: no NOT term measured from its term
        // reaches it (finding 2).
        const [lo, hi] = unitOf(c, x.hits[0].start);
        for (const h of x.near) {
          const s = keptSlots.find((slot) => c.perSlot[slot].includes(h))!;
          const alt = take.slice();
          alt[s] = h;
          expect(notReached(c, alt, lo, hi), `${ctx} near ${h.start}`).toBe(false);
        }
      }
    }
    // The cases are not all empty.
    expect(matched).toBeGreaterThan(100);
  });
});

describe('words marked near a match', () => {
  // John, 12 Nov: pairwise; a not-near term is measured from its target's hit.
  const offsets = {
    token_count: 60,
    seg_base_offset: [0],
    segments: [{ book: 1, column: '1a', line_runs: [[1, 60]] }],
    book_bounds: [{ book: 1, start: 0 }],
  } as unknown as Offsets;
  const opts: ComboOptions = { window: 5, unit: 'words', ordered: false, crossChapter: true };

  it('leave out a partner hit that its own not-near term reaches', () => {
    // A@10; B near A at 5 or 14; C not near B, at 1: B@5 has C 4 away.
    const [w] = comboWindows([at(10), at(5, 14), at(1)], opts, offsets, ['near', 'near', 'not'], [], [0, 0, 1]);
    expect(w.hits.map((h) => h.start)).toEqual([10, 14]);
    expect(w.near.map((h) => h.start)).toEqual([]);
  });

  it('keep a partner hit no not-near term reaches', () => {
    // C@30 is far from both B hits: B@5 is marked as before.
    const [w] = comboWindows([at(10), at(5, 14), at(30)], opts, offsets, ['near', 'near', 'not'], [], [0, 0, 1]);
    expect(w.hits.map((h) => h.start)).toEqual([10, 5]);
    expect(w.near.map((h) => h.start)).toEqual([14]);
  });

  it('a NOT hit on another term\'s own word still counts, unless that term asks the same thing', () => {
    // A@10, B@14 near A; C not near B stands on A's word, 4 from B. Only a
    // term asking what C asks may own the word ("X not near X", John); A
    // does not, so the match goes, as it does with C measured from A.
    expect(comboWindows([at(10), at(14), at(10)], opts, offsets, ['near', 'near', 'not'], [], [0, 0, 1])).toEqual([]);
    expect(comboWindows([at(10), at(14), at(10)], opts, offsets, ['near', 'near', 'not'], [], [0, 0, 0])).toEqual([]);
    expect(comboWindows([at(10), at(14), at(10)], opts, offsets, ['near', 'near', 'not'], ['x', '', 'x'], [0, 0, 1])).toHaveLength(1);
  });

  it('leave out a first-term hit its own not-near term reaches', () => {
    // A@10 and A@13; B@12; C not near A at 18: A@13 has C 5 away, A@10 8.
    const w = comboWindows([at(10, 13), at(12), at(18)], opts, offsets, ['near', 'near', 'not'], [], [0, 0, 0]);
    expect(w.map((x) => x.hits.map((h) => h.start))).toEqual([[10, 12]]);
    expect(w[0].near.map((h) => h.start)).toEqual([]);
  });
});
