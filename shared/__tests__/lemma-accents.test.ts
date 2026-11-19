import { afterEach, describe, expect, it, vi } from 'vitest';
import { accentKey, buildLemmaAccents, narrowByAccent, type IndexedWork } from '../lib/lemma-accents';
import { greekFold, search } from '../lib/search';

// One work, one segment. The printed words, by position:
const WORDS = [
  'αὐτή',     // 0  autos
  'αὕτη',     // 1  outos
  'αὑτῇ',     // 2  eautou
  'μήν',      // 3  the index gives this token mhn and meis
  'Ἴωνα',     // 4  iwn (the name), a key the lemma map does not give "iwn"
  'ἰών',      // 5  ia (εἶμι)
  'τὰ',       // 6  o (grave)
  'τα',       // 7  tis (enclitic, unmarked)
  'καταχρῆται', // 8  the index gives both keys
];
const INDEX: Record<string, [number, number][]> = {
  autos: [[0, 0]], outos: [[0, 1]], eautou: [[0, 2]],
  mhn: [[0, 3]], meis: [[0, 3]],
  iwn: [[0, 4]], ia: [[0, 5]],
  o: [[0, 6]], tis: [[0, 7]],
  kataxraomai: [[0, 8]], kataxraw: [[0, 8]],
};
const MAP = {
  auth: ['outos', 'autos', 'eautou'],
  mhn: ['meis', 'mhn', 'mhs'],
  iwn: ['ia', 'ion', 'iow'],
  ta: ['o', 'tis'],
  kataxrhtai: ['kataxraomai', 'kataxraw'],
};
const work = (index = INDEX, words = WORDS): IndexedWork =>
  ({ lemmaIndex: index, wordAt: (si, pos) => (si === 0 ? words[pos] : undefined) });

describe('buildLemmaAccents, from the index', () => {
  const { table, missing, postings } = buildLemmaAccents([work()], MAP, greekFold);

  it('reads every posting', () => {
    expect(missing).toBe(0);
    expect(postings).toBe(11);
  });

  it('narrows each printed spelling to the keys the index gave it', () => {
    // The bare fold "auth" is no key and no token carries it, so it stays.
    expect(table.auth).toEqual({ 'αὐτή': ['auth', 'autos'], 'αὕτη': ['auth', 'outos'], 'αὑτῇ': ['auth', 'eautou'] });
  });

  it('keeps every key the index gave a spelling, however the analyses read it', () => {
    expect(table.kataxrhtai).toBeUndefined();
  });

  it('keeps mhs, which no token carries, so μήν narrows nothing', () => {
    expect(table.mhn).toBeUndefined();
  });

  it('keeps a bare-fold key the map does not give (the name Ἴων)', () => {
    // ἰών claims ia; iwn, ion, iow are carried by no token folded "iwn".
    expect(table.iwn).toBeUndefined();
  });

  it('reads a grave as an acute, and gives an unmarked spelling no entry', () => {
    expect(table.ta).toEqual({ 'τά': ['ta', 'o'] });
  });

  it('counts a posting whose word cannot be read', () => {
    const short = buildLemmaAccents([work(INDEX, WORDS.slice(0, 3))], MAP, greekFold);
    expect(short.missing).toBe(8);
  });

  it('reads the plays\' [key, beta] map entries as keys', () => {
    const pairs = { auth: MAP.auth.map((k) => [k, k]) };
    expect(buildLemmaAccents([work()], pairs, greekFold).table.auth).toEqual(table.auth);
  });
});

describe('narrowByAccent', () => {
  const { table } = buildLemmaAccents([work()], MAP, greekFold);
  const wide = ['auth', ...MAP.auth];

  it('narrows a typed accented form to its own keys', () => {
    expect(narrowByAccent(table, 'αὐτή', 'auth', wide)).toEqual(['auth', 'autos']);
    expect(narrowByAccent(table, 'Αὕτη', 'auth', wide)).toEqual(['auth', 'outos']);
    expect(narrowByAccent(table, 'au)th/', 'auth', wide)).toEqual(['auth', 'autos']);
    expect(narrowByAccent(table, 'τὰ', 'ta', ['ta', ...MAP.ta])).toEqual(['ta', 'o']);
  });

  it('leaves an unaccented, unprinted, or ambiguous word wide (null)', () => {
    expect(narrowByAccent(table, 'αυτη', 'auth', wide)).toBeNull();
    expect(narrowByAccent(table, 'τα', 'ta', ['ta', ...MAP.ta])).toBeNull();
    expect(narrowByAccent(table, 'αὐτῆ', 'auth', wide)).toBeNull();
    expect(narrowByAccent(table, 'μήν', 'mhn', MAP.mhn)).toBeNull();
    expect(narrowByAccent({}, 'αὐτή', 'auth', wide)).toBeNull();
  });

  it('never returns a key it was not given', () => {
    expect(narrowByAccent(table, 'αὐτή', 'auth', ['outos', 'eautou'])).toBeNull();
    expect(narrowByAccent(table, 'αὐτή', 'auth', MAP.auth)).toEqual(['autos']);
  });

  it('drops an editor\'s dot under a letter', () => {
    expect(accentKey('αὕ\u0323τ\u0323η')).toBe(accentKey('αὕτη'));
  });

  it('drops an editor\'s brackets and daggers', () => {
    expect(accentKey('[ἤ')).toBe(accentKey('ἤ'));
    expect(accentKey('⟨ἤ⟩')).toBe(accentKey('ἤ'));
    expect(accentKey('†ἤ')).toBe(accentKey('ἤ'));
    expect(accentKey('α[ὐ]τοὶ')).toBe(accentKey('αὐτοί'));
  });

  it('keys elision marks alike', () => {
    expect(accentKey("ἀλλ'")).toBe(accentKey('ἀλλ’'));
  });
});

// The search itself, over the same index.
const meta = [{ id: 's1', book: 1, column: '1a' }];
function json(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}

describe('a lemma search narrows by the accented form typed', () => {
  afterEach(() => vi.restoreAllMocks());
  function mockFetch() {
    const { table } = buildLemmaAccents([work()], MAP, greekFold);
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      const shard = path.match(/lemma-map\/([a-z_])\.json$/);
      if (shard) return json(Object.fromEntries(Object.entries(MAP).filter(([f]) => f[0] === shard[1])));
      if (path.endsWith('/lemma-accents.json')) return json(table);
      if (/lemma-picker\/[a-z_]\.json$/.test(path)) return json({});
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/greek_lemma.json')) return json(INDEX);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  }
  const hits = async (q: string) =>
    (await search(q, '', 'all', 'all', 'and', ['W'], 'lemma')).results.map((r) => r.grkPositions);

  it('αὐτή finds αὐτός only, and αὕτη finds οὗτος only', async () => {
    mockFetch();
    expect(await hits('αὐτή')).toEqual([[0]]);
    expect(await hits('αὕτη')).toEqual([[1]]);
  });

  it('an unaccented αυτη still takes every headword of the spelling', async () => {
    mockFetch();
    expect(await hits('αυτη')).toEqual([[0, 1, 2]]);
  });

  it('Ἴων still finds the name through its bare-fold key', async () => {
    mockFetch();
    expect(await hits('Ἴων')).toEqual([[4, 5]]);
  });

  it('καταχρῆται keeps both keys the index gives it', async () => {
    mockFetch();
    expect(await hits('καταχρῆται')).toEqual([[8]]);
  });
});
