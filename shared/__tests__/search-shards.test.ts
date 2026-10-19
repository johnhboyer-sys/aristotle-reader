import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { search, searchPhraseVariants, shardName, type MatchMode, type SearchMode, type LangOp } from '../lib/search';

// The corpus search shards (stage 9): every work's lexical indexes merged and
// split by a word's first two letters. These tests build the shards from
// per-work files by the stage's rule, then hold the reader to two things: it
// fetches only the shards a query's words can fall in, and what it finds there
// is exactly what the per-work files would have given.

type Postings = [number, number][];
type Index = Record<string, Postings>;

const A: Record<string, unknown> = {
  'meta.json': [{ id: 'a1', book: 1, column: '1a' }, { id: 'a2', book: 1, column: '1b' }, { id: 'a3', book: 2, column: '2a' }],
  // a1 "happiness is the end", a2 "goodness of soul", a3 "the good life"
  'english.json': {
    happiness: [[0, 0]], is: [[0, 1]], the: [[0, 2], [2, 0]], end: [[0, 3]],
    goodness: [[1, 0]], of: [[1, 1]], soul: [[1, 2]], good: [[2, 1]], life: [[2, 2]],
  },
  'greek_lemma.json': { logos: [[0, 0], [1, 1]], yuxh: [[1, 0]], agaqos: [[2, 0]] },
  'greek_form.json': { logou: [[0, 0]], logos: [[1, 1]], yuxhs: [[1, 0]], agaqon: [[2, 0]] },
};
const B: Record<string, unknown> = {
  'meta.json': [{ id: 'b1', book: 1, column: '5a' }, { id: 'b2', book: 1, column: '5b' }],
  // b1 "coming to be of happiness", b2 "gold and god zzz"
  'english.json': {
    coming: [[0, 0]], to: [[0, 1]], be: [[0, 2]], of: [[0, 3]], happiness: [[0, 4]],
    gold: [[1, 0]], and: [[1, 1]], god: [[1, 2]], zzz: [[1, 3]],
  },
  'greek_lemma.json': { logos: [[1, 0]], texnh: [[0, 0]] },
  'greek_form.json': { logos: [[1, 0]], texnh: [[0, 0]] },
};
// EN carries four translations in the registry: Rackham (english), Ross
// (secondary), Ostwald (third), Peters (overlay).
const EN: Record<string, unknown> = {
  'meta.json': [{ id: 'e1', book: 1, column: '1094a' }, { id: 'e2', book: 1, column: '1094b' }],
  'english.json': { virtue: [[0, 0]], happiness: [[1, 0]] },
  'english-secondary.json': { mean: [[0, 2]] },
  'english-third.json': { virtue: [[1, 1]], mean: [[1, 2]] },
  'english-overlay-peters.json': { temperance: [[0, 4]] },
  'greek_lemma.json': { areth: [[0, 0]] },
  'greek_form.json': { areth: [[0, 0]] },
};
// F carries forms of one word for "any form": "men" is filed in shard "me",
// "man" and "man's" in "ma". f1 "the virtues of men", f2 "a man's virtue",
// f3 "virtuous man".
const F: Record<string, unknown> = {
  'meta.json': [{ id: 'f1', book: 1, column: '1a' }, { id: 'f2', book: 1, column: '1b' }, { id: 'f3', book: 1, column: '1c' }],
  'english.json': {
    the: [[0, 0]], virtues: [[0, 1]], of: [[0, 2]], men: [[0, 3]],
    a: [[1, 0]], "man's": [[1, 1]], virtue: [[1, 2]],
    virtuous: [[2, 0]], man: [[2, 1]],
  },
  'greek_lemma.json': {},
  'greek_form.json': {},
};
// CtlA, CtlB and CtlF are A, B and F again under names the shards do not list,
// so they are read from their own files: the control every shard result is
// compared with.
const WORKS: Record<string, Record<string, unknown>> = { A, B, EN, F, CtlA: A, CtlB: B, CtlF: F };

// Stage 9's rule, applied to A, B, EN and F. Peters is left out of the listing,
// as a translation the desktop app imported after the shards were built.
function buildShards() {
  const files: Record<string, Record<string, Record<string, Postings>>> = {};
  const streams: Record<string, { shards: string[]; sources: Record<string, string> }> = {};
  const add = (stream: string, source: string, index: Index) => {
    const entry = (streams[stream] ??= { shards: [], sources: {} });
    entry.sources[source] = 'hash';
    for (const [word, postings] of Object.entries(index)) {
      const name = shardName(word);
      if (!entry.shards.includes(name)) entry.shards.push(name);
      ((files[`${stream}/${name}.json`] ??= {})[word] ??= {})[source] = postings;
    }
  };
  for (const work of ['A', 'B', 'EN', 'F']) {
    const w = WORKS[work];
    add('lemma', work, w['greek_lemma.json'] as Index);
    add('form', work, w['greek_form.json'] as Index);
    for (const [file, index] of Object.entries(w)) {
      const slot = file === 'english.json' ? 'english' : /^english-(.+)\.json$/.exec(file)?.[1];
      if (slot && slot !== 'overlay-peters') add('english', `${work}/${slot}`, index as Index);
    }
  }
  return { index: { streams }, files };
}
const SHARDS = buildShards();

function json(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}
const notFound = () => Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);

let requested: string[] = [];
const everRequested = new Set<string>();   // across the module, for the memo
let failing = new Set<string>();
beforeEach(() => {
  requested = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    const path = String(url).replace(/^\/data\//, '');
    requested.push(path);
    everRequested.add(path);
    if (failing.has(path)) return Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response);
    if (path === 'search-shards/index.json') return json(SHARDS.index);
    const shard = /^search-shards\/(.+)$/.exec(path);
    if (shard) return shard[1] in SHARDS.files ? json(SHARDS.files[shard[1]]) : notFound();
    const own = /^([^/]+)\/search\/(.+)$/.exec(path);
    if (own && WORKS[own[1]] && own[2] in WORKS[own[1]]) return json(WORKS[own[1]][own[2]]);
    return notFound();
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  failing = new Set();
});

const perWorkIndexes = () => requested.filter((p) => /\/search\/(english|greek)/.test(p));

it('files a word under the shard stage 9 does', () => {
  const fixture = JSON.parse(readFileSync(
    resolve(__dirname, '../../pipeline/tests/fixtures/search_shards.json'), 'utf-8',
  )) as { cases: { word: string; shard: string }[] };
  for (const { word, shard } of fixture.cases) expect(shardName(word), word).toBe(shard);
});

// Shards are memoised for the module, like every index, so the tests that
// watch a shard being fetched come before the ones that load every shard.
describe('what a query fetches', () => {
  it('an English word: its one shard, and the meta of the works it stands in', async () => {
    const { results } = await search('', 'happiness', 'all', 'all', 'and', ['A', 'B', 'EN']);
    expect(results.map((r) => [r.work, r.meta.id])).toEqual([['A', 'a1'], ['B', 'b1'], ['EN', 'e2']]);
    expect(requested.sort()).toEqual([
      'A/search/meta.json', 'B/search/meta.json',
      // Peters is not in the shards, so it is read from its own file.
      'EN/search/english-overlay-peters.json', 'EN/search/meta.json',
      'search-shards/english/ha.json', 'search-shards/index.json',
    ]);
  });

  it('a Greek word: its one shard, and no meta for a work without it', async () => {
    const { results } = await search('agaqos', '', 'all', 'all', 'and', ['A', 'B'], 'headword');
    expect(results.map((r) => r.meta.id)).toEqual(['a3']);
    expect(requested.sort()).toEqual(['search-shards/lemma/ag.json']);
  });

  it('a one-letter prefix: only that letter’s shards', async () => {
    const { results } = await search('', 'g*', 'all', 'all', 'and', ['A', 'B']);
    expect(results.map((r) => r.meta.id)).toEqual(['a2', 'a3', 'b2']);
    const shards = requested.filter((p) => p.startsWith('search-shards/english/'));
    expect(shards.length).toBeGreaterThan(0);
    expect(shards.every((p) => p.startsWith('search-shards/english/g'))).toBe(true);
    expect(perWorkIndexes()).toEqual([]);
  });

  it('a source the shards do not list is read from its own file', async () => {
    const { results } = await search('', 'temperance', 'all', 'all', 'and', ['EN']);
    expect(results.map((r) => [r.meta.id, r.engHits])).toEqual([
      ['e1', [{ translation: 'peters', positions: [4] }]],
    ]);
  });

  it('a shard that fails to load fails the search rather than finding nothing, and is retried', async () => {
    failing = new Set(['search-shards/english/zz.json']);
    await expect(search('', 'zzz', 'all', 'all', 'and', ['A', 'B'])).rejects.toThrow(/Could not load the search index/);
    failing = new Set();
    const { results } = await search('', 'zzz', 'all', 'all', 'and', ['A', 'B']);
    expect(results.map((r) => r.meta.id)).toEqual(['b2']);
  });

  it('a translation beyond the primary is found in the shards and named', async () => {
    const { results } = await search('', 'virtue mean', 'all', 'all', 'and', ['EN']);
    expect(results.map((r) => [r.meta.id, r.engHits])).toEqual([
      ['e2', [{ translation: 'ostwald', positions: [1, 2] }]],
    ]);
  });

  it('widened phrase variants read the lemma shards too', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url).replace(/^\/data\//, '');
      requested.push(path);
      everRequested.add(path);
      if (path === 'lemma-map/y.json') return json({ yuxhs: ['yuxh'] });
      if (path === 'lemma-map/l.json') return json({ logou: ['logos'] });
      if (path === 'search-shards/index.json') return json(SHARDS.index);
      const shard = /^search-shards\/(.+)$/.exec(path);
      if (shard && shard[1] in SHARDS.files) return json(SHARDS.files[shard[1]]);
      if (path === 'A/search/meta.json') return json(A['meta.json']);
      return notFound();
    });
    const outcome = await searchPhraseVariants('yuxhs logou', ['A', 'B']);
    expect(outcome.results.map((r) => [r.work, r.meta.id, r.grkPositions])).toEqual([['A', 'a2', [0, 1]]]);
    expect(perWorkIndexes()).toEqual([]);
  });

  it('a leading * loads every shard of its stream', async () => {
    await search('', '*ness', 'all', 'all', 'and', ['A']);
    const listed = SHARDS.index.streams.english.shards.map((n) => `search-shards/english/${n}.json`);
    // Some were cached by the tests above; none may be missing after this one.
    expect(listed.filter((p) => !everRequested.has(p))).toEqual([]);
    expect(listed.length).toBeGreaterThan(10);
  });
});

describe('the shards find what the per-work files find', () => {
  const queries: [string, string, SearchMode, SearchMode, LangOp, MatchMode][] = [
    ['logos', '', 'all', 'all', 'and', 'lemma'],
    ['logou', '', 'all', 'all', 'and', 'form'],
    ['l*s', '', 'all', 'all', 'and', 'form'],
    ['*logos', '', 'all', 'all', 'and', 'lemma'],
    ['log?s', '', 'all', 'all', 'and', 'form'],
    ['logos yuxh', '', 'any', 'all', 'and', 'lemma'],
    ['logos yuxh', '', 'all', 'all', 'and', 'lemma'],
    ['yuxh logos', '', 'phrase', 'all', 'and', 'lemma'],
    ['logos texnh', '', 'any', 'all', 'and', 'headword'],
    ['', 'happiness', 'all', 'all', 'and', 'lemma'],
    ['', 'hap*', 'all', 'all', 'and', 'lemma'],
    ['', '*ness', 'all', 'all', 'and', 'lemma'],
    ['', 'h*', 'all', 'all', 'and', 'lemma'],
    ['', 'go?d', 'all', 'all', 'and', 'lemma'],
    ['', '*', 'all', 'all', 'and', 'lemma'],
    ['', 'the good', 'all', 'phrase', 'and', 'lemma'],
    ['', 'good soul', 'all', 'any', 'and', 'lemma'],
    ['', 'coming-to-be happiness', 'all', 'all', 'and', 'lemma'],
    ['', 'of *ness', 'all', 'phrase', 'and', 'lemma'],
    ['logos', 'happiness', 'all', 'all', 'or', 'lemma'],
    ['logos', 'happiness', 'all', 'all', 'and', 'lemma'],
    ['texnh', 'gold', 'all', 'all', 'or', 'form'],
    ['nothing', 'nowhere', 'all', 'all', 'or', 'lemma'],
  ];

  it.each(queries)('%j %j (%s/%s/%s/%s)', async (grk, eng, grkMode, engMode, langOp, matchMode) => {
    const sharded = await search(grk, eng, grkMode, engMode, langOp, ['A', 'B'], matchMode);
    const own = await search(grk, eng, grkMode, engMode, langOp, ['CtlA', 'CtlB'], matchMode);
    expect(sharded.failedWorks).toEqual([]);
    expect(own.failedWorks).toEqual([]);
    expect(sharded.results).toEqual(own.results.map((r) => ({ ...r, work: r.work.slice(3) })));
  });
});

// "Any form" looks a typed word's forms up in the index it is given. On the
// shard path that index holds only the keys the query's terms matched, so the
// forms must be among the terms the shards are cut for, and a form may stand
// in another shard than the typed word ("men" for "man").
describe('the shards find every form the per-work files find', () => {
  const queries: [string, SearchMode][] = [
    ['man', 'all'],
    ['men', 'all'],
    ["man's", 'all'],
    ['virtue', 'all'],
    ['virtues', 'all'],
    ['virtue man', 'any'],
    ['virtue of man', 'phrase'],
    ['vir*', 'all'],
  ];
  const cases = queries.flatMap(([q, mode]) => [[q, mode, true], [q, mode, false]] as [string, SearchMode, boolean][]);

  it.each(cases)('%j (%s, forms %s)', async (eng, engMode, forms) => {
    const sharded = await search('', eng, 'all', engMode, 'and', ['F'], 'lemma', forms);
    const own = await search('', eng, 'all', engMode, 'and', ['CtlF'], 'lemma', forms);
    expect(sharded.failedWorks).toEqual([]);
    expect(own.failedWorks).toEqual([]);
    expect(sharded.results).toEqual(own.results.map((r) => ({ ...r, work: r.work.slice(3) })));
  });

  it('finds man as men, which stands in another shard', async () => {
    const { results } = await search('', 'man', 'all', 'all', 'and', ['F'], 'lemma', true);
    expect(results.map((r) => [r.meta.id, r.engHits![0].positions])).toEqual([
      ['f1', [3]], ['f2', [1]], ['f3', [1]],
    ]);
  });
});
