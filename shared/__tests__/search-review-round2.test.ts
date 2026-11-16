import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { comboWindows, search, searchCombo, type ComboOptions, type SlotRelation } from '../lib/search';

// Review round 2 on the Greek pattern syntax and the NOT-near combo slot.

function json(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}
function mockIndex(index: Record<string, [number, number][]>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    const path = String(url);
    if (path.endsWith('/meta.json')) return json([{ id: 's1', book: 1, column: '1a' }]);
    if (path.endsWith('/greek_form.json') || path.endsWith('/greek_lemma.json')) return json(index);
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
  });
}
let n = 0;

describe('bounded pattern matching', () => {
  // 46k synthetic 35-letter keys, the real key that blew up, and a key of
  // one letter repeated.
  const letters = 'abgdezhqiklmncoprstufxyw';
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const words = Array.from({ length: 46000 }, () =>
    Array.from({ length: 35 }, () => letters[Math.floor(rnd() * letters.length)]).join(''));
  words.push('enneakaieikosikaieptakosioplasiakis', 'a'.repeat(35));
  const index = Object.fromEntries(words.map((k, i) => [k, [[0, i]] as [number, number][]]));
  beforeEach(() => mockIndex(index));
  afterEach(() => vi.restoreAllMocks());

  const timed = async (q: string) => {
    const t0 = performance.now();
    const { results } = await search(q, '', 'all', 'all', 'and', [`TBound${n++}`], 'form');
    return { ms: performance.now() - t0, hits: results[0]?.grkPositions.length ?? 0 };
  };

  it('stays fast on adversarial patterns, the real key included', async () => {
    await timed('λογος');   // warm the module
    for (const q of [
      '[^β]+'.repeat(10) + 'β',
      '.*'.repeat(12) + 'ω',
      '(.*ε|.*η)(.*α|.*ο)(.*ι|.*υ)ς',
      '(α+|ε+|ο+)(.+|.*ι)(.*ς|.*ν)',
      '[^α]*[^ε]*[^ι]*[^ο]*ω',
      '*'.repeat(15) + 'β',
      '*α' + '.'.repeat(13),
    ]) {
      const { ms } = await timed(q);
      expect(ms, q).toBeLessThan(300);
    }
  });

  it('(.+)+β stays invalid', async () => {
    expect((await timed('(.+)+β')).hits).toBe(0);
  });

  // Checked against a regular expression over a sample, where its
  // backtracking is affordable; [^b]{10,}b says what ten [^β]+ and β say,
  // and a Greek * is any run, so .* is one letter or more.
  it('the bounded matcher finds what a regular expression finds', async () => {
    const sample = [...words.slice(0, 1500), ...words.slice(-2)];
    vi.restoreAllMocks();
    mockIndex(Object.fromEntries(sample.map((k, i) => [k, [[0, i]] as [number, number][]])));
    const check = async (q: string, re: RegExp) => {
      const want = sample.filter((w) => re.test(w)).length;
      expect((await timed(q)).hits, q).toBe(want);
    };
    await check('[^β]+'.repeat(10) + 'β', /^[^b]{10,}b$/);
    await check('.*ικος', /^[a-z]+ikos$/);
    await check('(.*ε|.*η)(.*α|.*ο)(.*ι|.*υ)ς', /^(?:[a-z]+e|[a-z]+h)(?:[a-z]+a|[a-z]+o)(?:[a-z]+i|[a-z]+u)s$/);
    await check('[^α]*[^ε]*[^ι]*[^ο]*ω', /^[^a][a-z]*[^e][a-z]*[^i][a-z]*[^o][a-z]*w$/);
    await check('α+.*', /^a+[a-z]+$/);
    // α fourteen letters from the end needs 2^14 sets of states, past the
    // store's cap, so the rest of a word is stepped without it.
    await check('*α' + '.'.repeat(13), /^[a-z']*a[a-z]{13}$/);
  });
});

describe('NFD input', () => {
  const KEYS = ['logos', 'loogos', 'lgos'];
  beforeEach(() => mockIndex(Object.fromEntries(KEYS.map((k, i) => [k, [[0, i]] as [number, number][]]))));
  afterEach(() => vi.restoreAllMocks());

  it('+ repeats an accented letter typed decomposed, as it does one typed composed', async () => {
    const keys = async (q: string) => {
      const { results } = await search(q, '', 'all', 'all', 'and', [`TNfd${n++}`], 'form');
      return (results[0]?.grkPositions ?? []).map((p) => KEYS[p]).sort();
    };
    expect(await keys('λό+γος'.normalize('NFC'))).toEqual(['logos', 'loogos']);
    expect(await keys('λό+γος'.normalize('NFD'))).toEqual(['logos', 'loogos']);
  });
});

function offsetsOf(total: number, turns: number[] = [0]) {
  return {
    token_count: total,
    seg_base_offset: [0],
    segments: [{ book: 1, column: '1a', line_runs: [[1, total]] }],
    book_bounds: [{ book: 1, start: 0 }],
    turn_bounds: turns.map((start) => ({ book: 1, speaker: 'S', start, accuracy: 'exact' })),
  } as unknown as Parameters<typeof comboWindows>[2];
}
const opts = (over: Partial<ComboOptions> = {}): ComboOptions => ({
  window: 5, unit: 'words', ordered: false, crossTurn: true, ...over,
});

describe('X NOT near X over a long book', () => {
  it('is linear, not quadratic, in the hits', () => {
    const total = 60000;
    const every = Array.from({ length: total }, (_, start) => ({ start, span: 1, certain: true }));
    const rel: SlotRelation[] = ['near', 'not'];
    for (const unit of ['words', 'turn', 'line'] as const) {
      const t0 = performance.now();
      const out = comboWindows([every, every], opts({ unit }), offsetsOf(total), rel, ['x', 'x']);
      expect(out, unit).toEqual([]);
      expect(performance.now() - t0, unit).toBeLessThan(1500);
    }
  });
});

describe('NOT phrases and structural fit', () => {
  it('a NOT phrase that crosses into another turn does not count when turns are kept apart', () => {
    // Turns at 0 and 10. A@8; the NOT phrase runs 9–10, across the edge.
    const at = (start: number, span = 1) => ({ start, span, certain: true });
    const rel: SlotRelation[] = ['near', 'not'];
    const o = offsetsOf(40, [0, 10]);
    expect(comboWindows([[at(8)], [at(9, 2)]], opts({ crossTurn: false }), o, rel).length).toBe(1);
    expect(comboWindows([[at(8)], [at(8 - 1, 1)]], opts({ crossTurn: false }), o, rel).length).toBe(0);
    // And in the turn unit.
    expect(comboWindows([[at(8)], [at(9, 2)]], opts({ unit: 'turn' }), o, rel).length).toBe(1);
    // A NOT phrase reaching back across the edge: A@11, phrase 9–10.
    expect(comboWindows([[at(11)], [at(9, 2)]], opts({ crossTurn: false }), o, rel).length).toBe(1);
    expect(comboWindows([[at(11)], [at(9, 2)]], opts({ unit: 'turn' }), o, rel).length).toBe(1);
  });
});

describe('X NOT near X, however X is typed', () => {
  // logos at 2 and 12, ten apart; with a window of 5 neither is near the other.
  const segs = [{ id: 's1', book: 1, column: '1a' }];
  const offsets = {
    token_count: 20, seg_base_offset: [0],
    segments: [{ book: 1, column: '1a', line_runs: [[1, 20]] }],
    book_bounds: [{ book: 1, start: 0 }],
    turn_bounds: [{ book: 1, speaker: 'S', start: 0, accuracy: 'exact' }],
  };
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(segs);
      if (path.endsWith('/offsets.json')) return json(offsets);
      if (path.endsWith('/greek_form.json') || path.endsWith('/greek_lemma.json')) return json({ logos: [[0, 2], [0, 12]] });
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('spellings that fold alike are the same query, so each X is exempt from itself', async () => {
    for (const other of ['λόγος', 'LOGOS', 'λογος', 'λόγος'.normalize('NFD'), 'lo/gos']) {
      const { results } = await searchCombo(
        [{ kind: 'form', terms: ['λόγος'], relation: 'near' }, { kind: 'form', terms: [other], relation: 'not' }],
        opts(), [`TSelf${n++}`]);
      expect(results.map((r) => r.grkPositions), other).toEqual([[2, 12]]);
    }
  });

  it('patterns that read alike are the same query', async () => {
    const { results } = await searchCombo(
      [{ kind: 'form', terms: ['λογ.ς'], relation: 'near' }, { kind: 'form', terms: ['LOG?S'], relation: 'not' }],
      opts(), [`TSelf${n++}`]);
    expect(results.map((r) => r.grkPositions)).toEqual([[2, 12]]);
  });
});

describe('a proximity search that opens with a NOT term', () => {
  afterEach(() => vi.restoreAllMocks());
  it('is no search', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const { results } = await searchCombo(
      [{ kind: 'form', terms: ['beta'], relation: 'not' }, { kind: 'form', terms: ['gamma'], relation: 'near' }],
      opts(), ['TNotFirst']);
    expect(results).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('text before the first labelled turn', () => {
  // Parmenides and Lysis open with narration before the first labelled turn
  // (Parmenides' first turn starts 3,872 words in). That opening is a unit of
  // its own, not part of the first turn: λόγος NOT near ἀρετή in the same
  // speech lost 18 Parmenides hits to it, in a work with no ἀρετή at all.
  const at = (start: number, span = 1) => ({ start, span, certain: true });
  const o = offsetsOf(40, [10, 20]);
  it('keeps a hit before the first turn when the NOT term is absent', () => {
    expect(comboWindows([[at(2)], []], opts({ unit: 'turn' }), o, ['near', 'not']).length).toBe(1);
  });
  it('pairs two hits before the first turn, and not one either side of it', () => {
    expect(comboWindows([[at(2)], [at(5)]], opts({ unit: 'turn' }), o).length).toBe(1);
    expect(comboWindows([[at(2)], [at(12)]], opts({ unit: 'turn' }), o).length).toBe(0);
    expect(comboWindows([[at(8)], [at(11)]], opts({ crossTurn: false }), o).length).toBe(0);
  });
  it('a NOT hit before the first turn excludes only there', () => {
    const rel: SlotRelation[] = ['near', 'not'];
    expect(comboWindows([[at(2)], [at(6)]], opts({ unit: 'turn' }), o, rel).length).toBe(0);
    expect(comboWindows([[at(12)], [at(6)]], opts({ unit: 'turn' }), o, rel).length).toBe(1);
  });
});
