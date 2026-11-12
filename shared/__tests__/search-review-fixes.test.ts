import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { comboWindows, greekFold, patternMatcher, patternPieces, search, type ComboOptions, type SlotRelation } from '../lib/search';

// Review fixes on the Greek pattern syntax and the NOT-near combo slot.

const KEYS = ['logos', 'loogos', 'lgos', 'logou', 'aa', 'a'];
const index = Object.fromEntries(KEYS.map((k, i) => [k, [[0, i]]]));
function json(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}
let n = 0;
async function keys(query: string): Promise<string[]> {
  const { results } = await search(query, '', 'all', 'all', 'and', [`TReview${n++}`], 'form');
  return (results[0]?.grkPositions ?? []).map((p) => KEYS[p]).sort();
}
// As the index compiles a pattern: folded letters and apostrophes.
const indexRegex = (q: string) => {
  const pieces = patternPieces(q);
  return pieces && patternMatcher(pieces, { literal: (ch) => [...greekFold(ch)], isLetter: (u) => u !== "'" });
};

describe('pattern validity', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json([{ id: 's1', book: 1, column: '1a' }]);
      if (path.endsWith('/greek_form.json')) return json(index);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('+ is allowed only after a single-letter item: a letter, ., ?, or a class', async () => {
    expect(await keys('λο+γος')).toEqual(['logos', 'loogos']);
    expect(await keys('λ.+ς')).toEqual(['lgos', 'logos', 'loogos']);
    expect(await keys('λ?+ς')).toEqual(['lgos', 'logos', 'loogos']);
    expect(await keys('λ[ο]+γος')).toEqual(['logos', 'loogos']);
    expect(await keys('λ[^γ]+γος')).toEqual(['logos', 'loogos']);
  });

  it('+ after a group, after *, after +, or at the start is invalid and matches nothing', async () => {
    for (const q of ['(.+)+β', '(α|αα)+', 'λ*+', 'λο++γος', '+λογος', 'λ(ο)+γος']) {
      expect(indexRegex(q), q).toBeNull();
      expect(await keys(q), q).toEqual([]);
    }
  });

  it('adversarial patterns over a 46k-word list return quickly', () => {
    const letters = 'abgdezhqiklmncoprstufxyw';
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const words = Array.from({ length: 46000 }, () =>
      Array.from({ length: 25 }, () => letters[Math.floor(rnd() * letters.length)]).join(''));
    words.push('a'.repeat(25));
    for (const q of ['(.+)+β', '(α|αα)+β', 'λ*+', '(α+)+β', 'α+α+α+β',
      // A chain of wildcards tries every way to split a word unless it is
      // read as one gap: 4.2 s over the real forms before it was.
      '.*.*.*.*.*.*.*.*.*.*.*.*ω', '.+.+.+.+.+.+.+β', '*.*.*.*.*.*.*.*.*.*.*.*ω']) {
      const re = indexRegex(q);
      const t0 = performance.now();
      if (re) for (const w of words) re(w);
      expect(performance.now() - t0, q).toBeLessThan(200);
    }
  });

  it('reads a chain of wildcards as one gap, with the same words', async () => {
    expect(await keys('.*.*ος')).toEqual(await keys('..*ος'));
    expect(await keys('λ.+.+ς')).toEqual(await keys('λ..*ς'));
    expect(await keys('α*.')).toEqual(await keys('α.*'));
    expect(await keys('α*.')).toEqual(['aa']);
  });

  it('^ only at the very start and $ only at the very end; anywhere else the pattern is invalid', async () => {
    expect(await keys('^logos$')).toEqual(['logos']);
    expect(await keys('^λογος$')).toEqual(['logos']);
    for (const q of ['λο$γος', 'λογ^ος', 'lo$gos', 'log^os', 'λογ$*', 'λογ^*', '$logos', 'logos^', '(λογος$)']) {
      expect(indexRegex(q), q).toBeNull();
      expect(await keys(q), q).toEqual([]);
    }
  });
});

// One book, one turn, one line of 40 tokens: the NOT tests turn on the word
// window alone.
function offsetsOf(turns: number[] = [0], lineRuns: [number, number][] = [[1, 40]]) {
  return {
    token_count: 40,
    seg_base_offset: [0],
    segments: [{ book: 1, column: '1a', line_runs: lineRuns }],
    book_bounds: [{ book: 1, start: 0 }],
    turn_bounds: turns.map((start) => ({ book: 1, speaker: 'S', start, accuracy: 'exact' })),
  } as unknown as Parameters<typeof comboWindows>[2];
}
const at = (...starts: number[]) => starts.map((start) => ({ start, span: 1, certain: true }));
const opts = (over: Partial<ComboOptions> = {}): ComboOptions => ({
  window: 5, unit: 'words', ordered: false, crossChapter: true, ...over,
});
const starts = (w: { hits: { start: number }[] }[]) => w.map((x) => x.hits.map((h) => h.start));

describe('NOT near while choosing partners', () => {
  it('words: a match the NOT term excludes gives way to another partner the NOT term does not reach', () => {
    // A@10 with B@5 reaches back to 0, where C@1 stands; A@10 with B@14
    // reaches back only to 5.
    const rel: SlotRelation[] = ['near', 'near', 'not'];
    expect(starts(comboWindows([at(10), at(5, 14), at(1)], opts(), offsetsOf(), rel))).toEqual([[10, 14]]);
    // And a NOT term on the other side picks the earlier partner.
    expect(starts(comboWindows([at(10), at(5, 14), at(18)], opts(), offsetsOf(), rel))).toEqual([[10, 5]]);
    // Both sides: no partner escapes.
    expect(starts(comboWindows([at(10), at(5, 14), at(1, 18)], opts(), offsetsOf(), rel))).toEqual([]);
  });

  it('line and turn: a NOT term anywhere in the unit excludes, whichever partner is chosen', () => {
    const rel: SlotRelation[] = ['near', 'near', 'not'];
    // Turns at 0 and 20; lines of 10.
    const o = offsetsOf([0, 20], [[1, 10], [2, 10], [3, 10], [4, 10]]);
    expect(starts(comboWindows([at(12), at(11, 18), at(19)], opts({ unit: 'turn' }), o, rel))).toEqual([]);
    expect(starts(comboWindows([at(12), at(11, 18), at(25)], opts({ unit: 'turn' }), o, rel))).toEqual([[12, 11]]);
    expect(starts(comboWindows([at(12), at(11, 18), at(19)], opts({ unit: 'line' }), o, rel))).toEqual([]);
    expect(starts(comboWindows([at(12), at(11, 18), at(9)], opts({ unit: 'line' }), o, rel))).toEqual([[12, 11]]);
  });

  it('keeps the self-match exemption: "X not near X" is an X with no OTHER X nearby', () => {
    const rel: SlotRelation[] = ['near', 'not'];
    const ids = ['x', 'x'];
    expect(starts(comboWindows([at(5, 20), at(5, 20)], opts(), offsetsOf(), rel, ids))).toEqual([[5], [20]]);
    expect(starts(comboWindows([at(5, 8), at(5, 8)], opts(), offsetsOf(), rel, ids))).toEqual([]);
  });
});
