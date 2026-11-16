// The form panel: which Greek forms a result is made of, how many of each,
// and what is left when some are set aside. greekHitForms (lib/search) finds
// each hit's form; lib/form-panel counts and filters. Both are fed here from a
// stubbed index, shards and per-work files alike.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { excludeForms, formGroups } from '../lib/form-panel';
import { greekHitForms, search, shardName, type HitForms, type SearchResult } from '../lib/search';

type Postings = [number, number][];
type Index = Record<string, Postings>;

// a1: ἐστι λόγον ἦν    a2: λόγον εἶναι    (ἦν is εἰμί or ὅς)
const A = {
  'meta.json': [{ id: 'a1', book: 1, column: '1a' }, { id: 'a2', book: 1, column: '1b' }],
  'greek_lemma.json': { eimi: [[0, 0], [0, 2], [1, 1]], os: [[0, 2]], logos: [[0, 1], [1, 0]] } as Index,
  'greek_form.json': { esti: [[0, 0]], hn: [[0, 2]], einai: [[1, 1]], logon: [[0, 1], [1, 0]] } as Index,
  // Socrates says a1's first two words, EN the rest.
  'offsets.json': {
    token_count: 5, seg_base_offset: [0, 3],
    segments: [{ book: 1, column: '1a', line_runs: [[1, 3]] }, { book: 1, column: '1b', line_runs: [[1, 2]] }],
    book_bounds: [{ book: 1, start: 0 }], chapter_bounds: [],
    turn_bounds: [
      { book: 1, speaker: 'Socrates', start: 0, accuracy: 'exact' },
      { book: 1, speaker: 'EN', start: 2, accuracy: 'exact' },
    ],
  },
};
// b1: ἐστι
const B = {
  'meta.json': [{ id: 'b1', book: 1, column: '5a' }],
  'greek_lemma.json': { eimi: [[0, 0]] } as Index,
  'greek_form.json': { esti: [[0, 0]] } as Index,
};
// d1: ϝάναξ, a form the lemma map files under v.
const D = {
  'meta.json': [{ id: 'd1', book: 1, column: '9a' }],
  'greek_lemma.json': { anac: [[0, 0]] } as Index,
  'greek_form.json': { vanac: [[0, 0]] } as Index,
};
// CtlFail is A again under a name only the failed-index test reads: every
// index is memoised for the module once it has loaded.
const WORKS: Record<string, Record<string, unknown>> = { A, B, CtlA: A, CtlD: D, CtlFail: A };
const LEMMA_MAP: Record<string, Record<string, string[]>> = {
  e: { esti: ['eimi'], einai: ['eimi'], eimi: ['eimi'] },
  h: { hn: ['eimi', 'os'] },
  l: { logon: ['logos'], logos: ['logos'] },
  o: { os: ['os'] },
  v: { vanac: ['anac'] },
};

// Stage 9's rule over A and B; CtlA is read from its own files.
function buildShards() {
  const files: Record<string, Record<string, Record<string, Postings>>> = {};
  const streams: Record<string, { shards: string[]; sources: Record<string, string> }> = {};
  for (const work of ['A', 'B']) {
    for (const [stream, file] of [['lemma', 'greek_lemma.json'], ['form', 'greek_form.json']]) {
      const entry = (streams[stream] ??= { shards: [], sources: {} });
      entry.sources[work] = 'hash';
      for (const [word, postings] of Object.entries(WORKS[work][file] as Index)) {
        const name = shardName(word);
        if (!entry.shards.includes(name)) entry.shards.push(name);
        ((files[`${stream}/${name}.json`] ??= {})[word] ??= {})[work] = postings;
      }
    }
  }
  return { index: { streams }, files };
}
const SHARDS = buildShards();

const json = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
const notFound = () => Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
let requested: string[] = [];
let failing = new Set<string>();
beforeEach(() => {
  requested = [];
  failing = new Set();
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    const path = String(url).replace(/^\/data\//, '');
    requested.push(path);
    if (failing.has(path)) return Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response);
    if (path === 'search-shards/index.json') return json(SHARDS.index);
    const shard = /^search-shards\/(.+)$/.exec(path);
    if (shard) return shard[1] in SHARDS.files ? json(SHARDS.files[shard[1]]) : notFound();
    const map = /^lemma-map\/(.+)\.json$/.exec(path);
    if (map) return map[1] in LEMMA_MAP ? json(LEMMA_MAP[map[1]]) : notFound();
    const own = /^([^/]+)\/search\/(.+)$/.exec(path);
    if (own && WORKS[own[1]] && own[2] in WORKS[own[1]]) return json(WORKS[own[1]][own[2]]);
    return notFound();
  });
});
afterEach(() => vi.restoreAllMocks());

const hits = (results: SearchResult[]) => results.reduce((n, r) => n + r.grkPositions.length, 0);
const formsOf = (results: SearchResult[], forms: HitForms) =>
  Object.fromEntries(results.map(r => [r.meta.id, forms.byResult.get(`${r.work}:${r.meta.id}`)]));
const counts = (results: SearchResult[], forms: HitForms) =>
  formGroups(results, forms).map(g => [g.headword, g.forms.map(f => `${f.form} ${f.count}`).join(', ')]);

// First in the file: the lemma map is memoised once read, and a failed read
// is not kept, so this is the only place it can be seen to fail.
describe('greekHitForms: a lemma map that cannot be read', () => {
  it('fails the lookup as a whole', async () => {
    const { results } = await search('eimi', '', 'all', 'all', 'and', ['A'], 'headword');
    failing.add('lemma-map/h.json');
    await expect(greekHitForms(results, 'eimi', 'headword')).rejects.toThrow(/lemma-map\/h\.json/);
  });
});

describe('greekHitForms', () => {
  it.each(['A', 'CtlA'])('names the form of every hit of a headword search (%s)', async (work) => {
    const { results } = await search('eimi', '', 'all', 'all', 'and', [work], 'headword');
    const forms = await greekHitForms(results, 'eimi', 'headword');
    expect(formsOf(results, forms)).toEqual({ a1: ['esti', 'hn'], a2: ['einai'] });
  });

  it('names the forms of a form search from the keys it matched', async () => {
    const { results } = await search('e*', '', 'all', 'all', 'and', ['A', 'B'], 'form');
    const forms = await greekHitForms(results, 'e*', 'form');
    expect(formsOf(results, forms)).toEqual({ a1: ['esti'], a2: ['einai'], b1: ['esti'] });
    expect(forms.headwords.size).toBe(0);
    // A form search needs no lemma map.
    expect(requested.some(p => p.startsWith('lemma-map/'))).toBe(false);
  });

  it('a typed inflection: every headword it belongs to, and each form under its own', async () => {
    // ἦν resolves to εἰμί and ὅς, so the search finds every form of both.
    const { results } = await search('hn', '', 'all', 'all', 'and', ['A'], 'lemma');
    const forms = await greekHitForms(results, 'hn', 'lemma');
    expect(formsOf(results, forms)).toEqual({ a1: ['esti', 'hn'], a2: ['einai'] });
    expect(forms.headwords.get('hn')).toEqual(['eimi', 'os']);
    expect(forms.headwords.get('esti')).toEqual(['eimi']);
  });

  it('names each word of a two-term search', async () => {
    const { results } = await search('eimi logos', '', 'all', 'all', 'and', ['A'], 'headword');
    const forms = await greekHitForms(results, 'eimi logos', 'headword');
    expect(formsOf(results, forms)).toEqual({ a1: ['esti', 'logon', 'hn'], a2: ['logon', 'einai'] });
  });
});

describe('greekHitForms: what does not load', () => {
  it('does not fetch a digamma lemma shard for Aristotle', async () => {
    const { results } = await search('anac', '', 'all', 'all', 'and', ['CtlD'], 'headword');
    const forms = await greekHitForms(results, 'anac', 'headword');
    expect(formsOf(results, forms)).toEqual({ d1: [''] });
    expect(requested).not.toContain('lemma-map/v.json');
  });

  it('asks once for a lemma-map shard the corpus does not have', async () => {
    const { results } = await search('eimi', '', 'all', 'all', 'and', ['A'], 'headword');
    await greekHitForms(results, 'eimi', 'headword');
    requested = [];
    await greekHitForms(results, 'eimi', 'headword');
    // z.json was a 404 the first time; a 404 is an answer, not a failure.
    expect(requested).not.toContain('lemma-map/z.json');
  });

  it('names a work whose form index did not load, and leaves its hits without forms', async () => {
    const { results } = await search('eimi', '', 'all', 'all', 'and', ['A', 'CtlFail'], 'headword');
    failing.add('CtlFail/search/greek_form.json');
    const forms = await greekHitForms(results, 'eimi', 'headword');
    expect(forms.failedWorks).toEqual(['CtlFail']);
    expect(forms.byResult.has('CtlFail:a1')).toBe(false);
    expect(forms.byResult.get('A:a1')).toEqual(['esti', 'hn']);
  });

});

describe('formGroups', () => {
  it('counts every form found, and the counts add up to the hits', async () => {
    const { results } = await search('eimi', '', 'all', 'all', 'and', ['A', 'B'], 'headword');
    const forms = await greekHitForms(results, 'eimi', 'headword');
    // One headword is still named: the reader sees whose forms these are.
    expect(counts(results, forms)).toEqual([['eimi', 'esti 2, einai 1, hn 1']]);
    expect(formGroups(results, forms)[0].count).toBe(hits(results));
  });

  it('groups the forms under each headword when the typed word has several', async () => {
    const { results } = await search('hn', '', 'all', 'all', 'and', ['A'], 'lemma');
    const forms = await greekHitForms(results, 'hn', 'lemma');
    // ἦν stands under both: it is a form of either.
    expect(counts(results, forms)).toEqual([['eimi', 'einai 1, esti 1, hn 1'], ['os', 'hn 1']]);
  });

  it('counts what a speaker filter left', async () => {
    const speaker = { mode: 'only' as const, names: ['Socrates'] };
    const { results } = await search('eimi', '', 'all', 'all', 'and', ['A'], 'headword', false, speaker);
    const forms = await greekHitForms(results, 'eimi', 'headword');
    // Socrates says ἐστι; ἦν and εἶναι are EN's.
    expect(counts(results, forms)).toEqual([['eimi', 'esti 1']]);
    expect(formGroups(results, forms)[0].count).toBe(hits(results));
  });
});

describe('excludeForms', () => {
  it("removes exactly the excluded form's hits", async () => {
    const { results } = await search('eimi', '', 'all', 'all', 'and', ['A', 'B'], 'headword');
    const forms = await greekHitForms(results, 'eimi', 'headword');
    const left = excludeForms(results, forms, new Set(['esti']), 'and');
    // a1 keeps ἦν, a2 its εἶναι; b1 had only ἐστι and is gone.
    expect(left.map(r => [r.meta.id, r.grkPositions])).toEqual([['a1', [2]], ['a2', [1]]]);
    expect(hits(results) - hits(left)).toBe(2);
    expect(excludeForms(results, forms, new Set(), 'and')).toBe(results);
  });

  it('keeps the arrays that run beside the positions in step', () => {
    const r: SearchResult = {
      work: 'A', meta: { id: 'a1', book: 1, column: '1a' }, grkMatch: true, engMatch: false,
      grkPositions: [0, 2], speakers: ['Socrates', 'EN'],
      grammar: [{ values: { case: ['nom'] }, certain: true }, { values: { case: ['acc'] }, certain: false }],
    };
    const forms: HitForms = { byResult: new Map([['A:a1', ['esti', 'hn']]]), headwords: new Map(), failedWorks: [] };
    const [left] = excludeForms([r], forms, new Set(['esti']), 'and');
    expect(left.grkPositions).toEqual([2]);
    expect(left.speakers).toEqual(['EN']);
    expect(left.grammar).toEqual([{ values: { case: ['acc'] }, certain: false }]);
  });

  it('lets the English side stand under "either", and drops the passage under "both"', () => {
    const r: SearchResult = {
      work: 'A', meta: { id: 'a1', book: 1, column: '1a' }, grkMatch: true, engMatch: true,
      grkPositions: [0], engHits: [{ translation: 'rackham', positions: [3] }],
    };
    const forms: HitForms = { byResult: new Map([['A:a1', ['esti']]]), headwords: new Map(), failedWorks: [] };
    expect(excludeForms([r], forms, new Set(['esti']), 'and')).toEqual([]);
    const [either] = excludeForms([r], forms, new Set(['esti']), 'or');
    expect([either.grkMatch, either.grkPositions, either.engMatch]).toEqual([false, [], true]);
  });
});
