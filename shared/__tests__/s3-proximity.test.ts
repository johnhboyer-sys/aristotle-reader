import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { comboGroups, comboWindows, searchCombo, type ComboOptions, type ComboSlot, type SlotRelation } from '../lib/search';

// S3: or-joined terms, terms measured from an earlier term, and not near
// measured from that term (HANDOFF-SEARCH-BUILD §7 items 1-3).

// One book of 60 tokens, one line, no turns.
function offsetsOf(total = 60, books: number[] = [0]) {
  return {
    token_count: total,
    seg_base_offset: [0],
    segments: [{ book: 1, column: '1a', line_runs: [[1, total]] }],
    book_bounds: books.map((start, i) => ({ book: i + 1, start })),
  } as unknown as Parameters<typeof comboWindows>[2];
}
const at = (...starts: number[]) => starts.map((start) => ({ start, span: 1, certain: true }));
const opts = (over: Partial<ComboOptions> = {}): ComboOptions => ({
  window: 5, unit: 'words', ordered: false, crossChapter: true, ...over,
});
const starts = (w: { hits: { start: number }[] }[]) => w.map((x) => x.hits.map((h) => h.start));

// John, 12 Nov: each term within N of the hit chosen for the term it is
// measured from, pair by pair and nothing more. Two terms measured from one
// term may stand on either side of it, up to 2N apart.
describe('plain pairwise distance', () => {
  // ἀρετή@20, ἕξις 8 to its left, ἡδονή 8 to its right; within 10 words.
  it('accepts two terms either side of their target, 16 apart', () => {
    const w = comboWindows([at(20), at(12), at(28)], opts({ window: 10 }), offsetsOf(), [], [], [0, 0, 0]);
    expect(starts(w)).toEqual([[20, 12, 28]]);
    expect([w[0].start, w[0].end]).toEqual([12, 28]);
  });

  it('checks before and after against the target alone', () => {
    // ἕξις near ἀρετή, ἡδονή before ἀρετή: ἕξις 8 after, ἡδονή 8 before.
    expect(starts(comboWindows([at(20), at(28), at(12)], opts({ window: 10 }), offsetsOf(), ['near', 'near', 'before'], [], [0, 0, 0])))
      .toEqual([[20, 28, 12]]);
    expect(starts(comboWindows([at(20), at(12), at(28)], opts({ window: 10 }), offsetsOf(), ['near', 'before', 'after'], [], [0, 0, 0])))
      .toEqual([[20, 12, 28]]);
    // Each pair still within N: ἡδονή 11 before is out.
    expect(comboWindows([at(20), at(28), at(9)], opts({ window: 10 }), offsetsOf(), ['near', 'near', 'before'], [], [0, 0, 0])).toEqual([]);
  });

  it('rejects a match only for a NOT hit within N of its target\'s hit', () => {
    // A@10, B@14 from A; C (not, from A) at 18 is 8 from A, 4 from B.
    const rel: SlotRelation[] = ['near', 'near', 'not'];
    expect(comboWindows([at(10), at(14), at(18)], opts(), offsetsOf(), rel, [], [0, 0, 0])).toHaveLength(1);
    expect(comboWindows([at(10), at(14), at(15)], opts(), offsetsOf(), rel, [], [0, 0, 0])).toHaveLength(0);
    // B@6, 4 before A: a NOT hit 5 before A still counts, 6 before does not.
    expect(comboWindows([at(10), at(6), at(5)], opts(), offsetsOf(), rel, [], [0, 0, 0])).toHaveLength(0);
    expect(comboWindows([at(10), at(6), at(4)], opts(), offsetsOf(), rel, [], [0, 0, 0])).toHaveLength(1);
  });

  it('with the order lock, keeps slot order and each pair within N of its target', () => {
    // A@10, B@14, C@18, all from A: C is 8 from A.
    expect(comboWindows([at(10), at(14), at(18)], opts({ window: 8, ordered: true }), offsetsOf(), [], [], [0, 0, 0])).toHaveLength(1);
    expect(comboWindows([at(10), at(14), at(18)], opts({ window: 7, ordered: true }), offsetsOf(), [], [], [0, 0, 0])).toHaveLength(0);
  });
});

describe('a term measured from an earlier term', () => {
  // A@10, B@14, C@19: C is 9 from A but 5 from B.
  const hits = [at(10), at(14), at(19)];
  it('reaches as far from the anchor as its own target allows', () => {
    expect(comboWindows(hits, opts(), offsetsOf(), [], [], [0, 0, 0])).toHaveLength(0);
    expect(starts(comboWindows(hits, opts(), offsetsOf(), [], [], [0, 0, 1]))).toEqual([[10, 14, 19]]);
  });

  it('keeps every term measured from one term within reach of it, pair by pair', () => {
    // B@14 and C@19 both from A@10: B is 4 from A, C 9; with A@16, 2 and 3.
    expect(comboWindows([at(10), at(14), at(19)], opts(), offsetsOf(), [], [], [0, 0, 0])).toHaveLength(0);
    expect(comboWindows([at(16), at(14), at(19)], opts(), offsetsOf(), [], [], [0, 0, 0])).toHaveLength(1);
    // B@6 and C@14 either side of A@10, 8 apart: each is 4 from A.
    expect(comboWindows([at(10), at(6), at(14)], opts(), offsetsOf(), [], [], [0, 0, 0])).toHaveLength(1);
    // Measured from B, C needs only B within reach: A@10, B@14, C@19 and C@9.
    expect(starts(comboWindows([at(10), at(14), at(9, 19)], opts(), offsetsOf(), [], [], [0, 0, 1]))).toEqual([[10, 14, 9]]);
  });

  it('places before and after against its own target', () => {
    // A@10, B@14, C@12 lies before B, after A.
    const rel: SlotRelation[] = ['near', 'near', 'before'];
    expect(comboWindows([at(10), at(14), at(12)], opts(), offsetsOf(), rel, [], [0, 0, 1])).toHaveLength(1);
    expect(comboWindows([at(10), at(14), at(12)], opts(), offsetsOf(), rel, [], [0, 0, 0])).toHaveLength(0);
    const after: SlotRelation[] = ['near', 'near', 'after'];
    expect(comboWindows([at(10), at(14), at(12)], opts(), offsetsOf(), after, [], [0, 0, 0])).toHaveLength(1);
    expect(comboWindows([at(10), at(14), at(12)], opts(), offsetsOf(), after, [], [0, 0, 1])).toHaveLength(0);
  });

  it('chooses the target hit that lets the later term fit', () => {
    // B occurs at 6 and 14; only B@14 has a C (at 19) within 5.
    expect(starts(comboWindows([at(10), at(6, 14), at(19)], opts(), offsetsOf(), [], [], [0, 0, 1]))).toEqual([[10, 14, 19]]);
  });

  it('never crosses a book edge, whatever it is measured from', () => {
    // Book 2 starts at 18: C@19 is in it.
    expect(comboWindows(hits, opts(), offsetsOf(60, [0, 18]), [], [], [0, 0, 1])).toHaveLength(0);
  });

  it('reads a target that is itself, later, or out of range as the first term', () => {
    for (const bad of [2, 3, 7, -1]) {
      expect(comboWindows([at(16), at(14), at(19)], opts(), offsetsOf(), [], [], [0, 0, bad])).toHaveLength(1);
      expect(comboWindows([at(10), at(14), at(19)], opts(), offsetsOf(), [], [], [0, 0, bad])).toHaveLength(0);
    }
  });

  it('marks the later term\'s other words in range of its own target', () => {
    // C@17 and C@19 are both within 5 of B@14; C@19 is out of A's reach.
    const [w] = comboWindows([at(10), at(14), at(17, 19)], opts(), offsetsOf(), [], [], [0, 0, 1]);
    expect(w.hits.map((h) => h.start)).toEqual([10, 14, 17]);
    expect(w.near.map((h) => h.start)).toEqual([19]);
  });
});

describe('not near, measured from its own target', () => {
  const rel: SlotRelation[] = ['near', 'near', 'not'];
  it('excludes only near the term it names', () => {
    // A@10, B@14 measured from A. Measured from A, C's reach is A@10 alone:
    // C@21 is 11 from it, outside 5.
    expect(comboWindows([at(10), at(14), at(21)], opts(), offsetsOf(), rel, [], [0, 0, 0])).toHaveLength(1);
    expect(comboWindows([at(10), at(14), at(18)], opts(), offsetsOf(), rel, [], [0, 0, 1])).toHaveLength(0);
    // C@5 is 5 before A, 9 before B: near A, not near B.
    expect(comboWindows([at(10), at(14), at(5)], opts(), offsetsOf(), rel, [], [0, 0, 0])).toHaveLength(0);
    // Measured from B, C@5 stands 9 away.
    expect(comboWindows([at(10), at(14), at(5)], opts(), offsetsOf(), rel, [], [0, 0, 1])).toHaveLength(1);
  });

  it('a term measured from a NOT term is measured from what the NOT term is', () => {
    // Slot 2 (not) measured from 1; slot 3 measured from slot 2 → from 1.
    const r4: SlotRelation[] = ['near', 'near', 'not', 'near'];
    expect(comboWindows([at(10), at(14), at(40), at(18)], opts(), offsetsOf(), r4, [], [0, 0, 1, 2])).toHaveLength(1);
  });
});

describe('the order lock with terms measured from each other', () => {
  it('still binds every term to slot order', () => {
    // A@10, B@14, C@12 from B: in slot order C must come after B.
    expect(comboWindows([at(10), at(14), at(12)], opts({ ordered: true }), offsetsOf(), [], [], [0, 0, 1])).toHaveLength(0);
    expect(comboWindows([at(10), at(14), at(16)], opts({ ordered: true }), offsetsOf(), [], [], [0, 0, 1])).toHaveLength(1);
  });
  it('marks only partner words after the anchor', () => {
    const [w] = comboWindows([at(10), at(7, 12)], opts({ ordered: true }), offsetsOf(), [], [], [0, 0]);
    expect(w.hits.map((h) => h.start)).toEqual([10, 12]);
    expect(w.near).toEqual([]);
  });
});

describe('comboGroups', () => {
  const s = (name: string, over: Partial<ComboSlot> = {}): ComboSlot => ({ kind: 'form', terms: name ? [name] : [], ...over });
  const usable = (x: ComboSlot) => !!x.terms?.length;
  const shape = (slots: ComboSlot[]) => comboGroups(slots, usable)
    .map((g) => [g.members.map((m) => m.terms![0]).join('|'), g.relation, g.target]);

  it('makes an or-joined run one term with its first slot\'s relation and target', () => {
    expect(shape([s('a'), s('b', { relation: 'before' }), s('c', { or: true, relation: 'after', target: 0 })]))
      .toEqual([['a', 'near', 0], ['b|c', 'before', 0]]);
  });

  it('reads targets as term indices once or-runs are joined', () => {
    // Slot 3 is measured from slot 2, which is the second member of term 1.
    expect(shape([s('a'), s('b'), s('c', { or: true }), s('d', { target: 2 })]))
      .toEqual([['a', 'near', 0], ['b|c', 'near', 0], ['d', 'near', 1]]);
  });

  it('drops empty slots and re-points what was measured from them', () => {
    // Slot 1 is empty; slot 2 was measured from it, so from what it was measured from.
    expect(shape([s('a'), s('', { target: 0 }), s('c', { target: 1 })]))
      .toEqual([['a', 'near', 0], ['c', 'near', 0]]);
    expect(shape([s('a'), s('b'), s(''), s('d', { target: 2 }), s('e', { target: 3 })]))
      .toEqual([['a', 'near', 0], ['b', 'near', 0], ['d', 'near', 0], ['e', 'near', 2]]);
    // An empty head leaves its or-joined member as the term, with the head's relation.
    expect(shape([s('a'), s('', { relation: 'after' }), s('c', { or: true })]))
      .toEqual([['a', 'near', 0], ['c', 'after', 0]]);
  });

  it('measures a term from a NOT term\'s own target instead', () => {
    expect(shape([s('a'), s('b'), s('c', { relation: 'not', target: 1 }), s('d', { target: 2 })]))
      .toEqual([['a', 'near', 0], ['b', 'near', 0], ['c', 'not', 1], ['d', 'near', 1]]);
  });

  it('reads a target that is not earlier as the first term', () => {
    expect(shape([s('a'), s('b', { target: 1 }), s('c', { target: 5 })]))
      .toEqual([['a', 'near', 0], ['b', 'near', 0], ['c', 'near', 0]]);
  });
});

// The same, through searchCombo: an or-joined term's hits are its members'
// together.
describe('searchCombo with or-joins and targets', () => {
  const meta = [{ id: '1:1a', book: 1, column: '1a' }];
  const offsets = {
    token_count: 60, seg_base_offset: [0],
    segments: [{ book: 1, column: '1a', line_runs: [[1, 60]] }],
    book_bounds: [{ book: 1, start: 0 }],
  };
  // alpha@10, beta@14, gamma@30, delta@33, eps@19
  const form: Record<string, [number, number][]> = {
    alpha: [[0, 10]], beta: [[0, 14]], gamma: [[0, 30]], delta: [[0, 33]], eps: [[0, 19]],
  };
  const json = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/offsets.json')) return json(offsets);
      if (path.endsWith('/greek_form.json') || path.endsWith('/greek_lemma.json')) return json(form);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());
  const f = (t: string, over: Partial<ComboSlot> = {}): ComboSlot => ({ kind: 'form', terms: [t], ...over });
  const positions = async (slots: ComboSlot[], o: ComboOptions, w: string) =>
    (await searchCombo(slots, o, [w])).results.map((r) => r.windows);

  it('either member satisfies an or-joined term', async () => {
    // alpha near (gamma or beta): beta@14 is within 5 of alpha@10.
    expect(await positions([f('alpha'), f('gamma'), f('beta', { or: true })], opts(), 'OR1')).toEqual([[[10, 14]]]);
    // alpha near gamma alone: nothing.
    expect(await positions([f('alpha'), f('gamma')], opts(), 'OR2')).toEqual([]);
    // gamma or delta, near alpha: neither is.
    expect(await positions([f('alpha'), f('gamma'), f('delta', { or: true })], opts(), 'OR3')).toEqual([]);
  });

  it('an or-joined pair alone is no proximity search', async () => {
    expect((await searchCombo([f('alpha'), f('beta', { or: true })], opts(), ['OR4'])).results).toEqual([]);
  });

  it('or-joined NOT terms exclude if either occurs', async () => {
    // Measured from beta@14: gamma@30 is far, eps@19 is 5 away.
    const not = { relation: 'not' as const, target: 1 };
    expect(await positions([f('alpha'), f('beta'), f('gamma', not)], opts(), 'OR5')).toEqual([[[10, 14]]]);
    expect(await positions([f('alpha'), f('beta'), f('gamma', not), f('eps', { or: true })], opts(), 'OR6')).toEqual([]);
    // Measured from alpha@10, eps@19 is 9 away and excludes nothing.
    expect(await positions([f('alpha'), f('beta'), f('gamma', { relation: 'not' }), f('eps', { or: true })], opts(), 'OR7')).toEqual([[[10, 14]]]);
  });

  it('measures a term from the term it names', async () => {
    // eps@19 is 9 from alpha, 5 from beta.
    expect(await positions([f('alpha'), f('beta'), f('eps')], opts(), 'T1')).toEqual([]);
    expect(await positions([f('alpha'), f('beta'), f('eps', { target: 1 })], opts(), 'T2')).toEqual([[[10, 14, 19]]]);
  });
});
