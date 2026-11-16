import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  englishForms, englishIndexFile, englishQueryUnits, englishTermMatcher, englishWords,
  greekFold, offsetCite, offsetRef, search,
} from '../lib/search';
import { hitCount } from '../lib/search-pages';

const meta = [
  { id: 's1', book: 1, column: '1094a' },
  { id: 's2', book: 1, column: '1094b' },
  { id: 's3', book: 2, column: '1100a' },
];

const greekIndex = {
  logos: [[0, 0], [1, 1]],
  areth: [[0, 1]],
  pasa: [[0, 2]],
  meqodos: [[0, 3]],
  kai: [[0, 5]],
  yuxh: [[1, 0]],
  texnh: [[2, 0]],
  lozzz: [[0, 4]],
  xlogos: [[2, 1]],
} satisfies Record<string, [number, number][]>;

// s1 "virtue is a habit of choice", s2 "happiness and virtue together", s3
// "craft concerns making", as stage6 indexes them.
const englishIndex = {
  virtue: [[0, 0], [1, 2]],
  habit: [[0, 3]],
  choice: [[0, 5]],
  happiness: [[1, 0]],
  and: [[1, 1]],
  craft: [[2, 0]],
  making: [[2, 2]],
} satisfies Record<string, [number, number][]>;

function json(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}

describe('greekFold', () => {
  it.each([
    ['λόγος', 'logos'],
    ['lo/gos', 'logos'],
    ['*a)nqrwpos', 'anqrwpos'],
    ["ἀρετή'", "areth'"],
    ['ψυχή κόσμος', 'yuxhkosmos'],
    ['δ’', "d'"],           // the page's elision mark, U+2019
    ["δ'", "d'"],
  ])('folds %s', (input, expected) => {
    expect(greekFold(input)).toBe(expected);
  });
});

describe('search', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/greek_lemma.json') || path.endsWith('/greek_form.json')) return json(greekIndex);
      if (path.endsWith('/english.json')) return json(englishIndex);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns no results for empty queries or no works', async () => {
    await expect(search('', ' ', 'all', 'all', 'and', ['TEmpty'])).resolves.toEqual({ results: [], failedWorks: [] });
    await expect(search('logos', '', 'all', 'all', 'and', [])).resolves.toEqual({ results: [], failedWorks: [] });
  });

  it('supports all, any, and phrase modes', async () => {
    expect((await search('logos areth', '', 'all', 'all', 'and', ['TAll'])).results).toHaveLength(1);
    expect((await search('yuxh areth', '', 'any', 'all', 'and', ['TAny'])).results).toHaveLength(2);
    expect((await search('logos areth', '', 'phrase', 'all', 'and', ['TPhraseMiss'])).results).toHaveLength(1);
    expect((await search('areth logos', '', 'phrase', 'all', 'and', ['TPhraseHit'])).results).toHaveLength(0);
  });

  it('matches a mid-word Greek * without widening it to a prefix', async () => {
    const matching = (await search('l*s', '', 'all', 'all', 'and', ['TGreekMidStar'])).results;
    const missing = (await search('l*x', '', 'all', 'all', 'and', ['TGreekMidStar'])).results;
    expect(matching.map((r) => [r.meta.id, r.grkPositions])).toEqual([
      ['s1', [0]],
      ['s2', [1]],
    ]);
    expect(missing).toHaveLength(0);
  });

  it('keeps the trailing-* prefix fast path', async () => {
    const hits = (await search('tex*', '', 'all', 'all', 'and', ['TGreekTrailingStar'])).results;
    expect(hits.map((r) => r.meta.id)).toEqual(['s3']);
  });

  it('makes Greek ? match exactly one fold character', async () => {
    const one = (await search('l?gos', '', 'all', 'all', 'and', ['TGreekQuestion'])).results;
    const zero = (await search('l?ogos', '', 'all', 'all', 'and', ['TGreekQuestion'])).results;
    const two = (await search('l?os', '', 'all', 'all', 'and', ['TGreekQuestion'])).results;
    expect(one.map((r) => r.meta.id)).toEqual(['s1', 's2']);
    expect(zero).toHaveLength(0);
    expect(two).toHaveLength(0);
  });

  it('treats a leading Greek * as a capital marker', async () => {
    const hits = (await search('*logos', '', 'all', 'all', 'and', ['TGreekLeadingStar'])).results;
    expect(hits.map((r) => r.meta.id)).toEqual(['s1', 's2']);
  });

  it('matches a mid-word English * instead of looking up it literally', async () => {
    const hits = (await search('', 'hap*ness', 'all', 'all', 'and', ['TEnglishMidStar'])).results;
    expect(hits.map((r) => r.meta.id)).toEqual(['s2']);
  });

  it('makes English ? match exactly one fold character', async () => {
    const one = (await search('', 'c?aft', 'all', 'all', 'and', ['TEnglishQuestion'])).results;
    const zero = (await search('', 'c?raft', 'all', 'all', 'and', ['TEnglishQuestion'])).results;
    const two = (await search('', 'c?ft', 'all', 'all', 'and', ['TEnglishQuestion'])).results;
    expect(one.map((r) => r.meta.id)).toEqual(['s3']);
    expect(zero).toHaveLength(0);
    expect(two).toHaveLength(0);
  });

  it('keeps a bare English * matching every segment', async () => {
    const hits = (await search('', '*', 'all', 'all', 'and', ['TEnglishBareStar'])).results;
    expect(hits.map((r) => r.meta.id)).toEqual(['s1', 's2', 's3']);
  });

  it('combines Greek and English boxes with AND or OR', async () => {
    const andHits = (await search('logos', 'happiness', 'all', 'all', 'and', ['TAnd'])).results;
    const orHits = (await search('texnh', 'happiness', 'all', 'all', 'or', ['TOr'])).results;
    expect(andHits.map((r) => r.meta.id)).toEqual(['s2']);
    expect(orHits.map((r) => r.meta.id)).toEqual(['s2', 's3']);
  });

  // Regression: phrases used to be verified by substring-matching the user's
  // SURFACE folds against meta.greek_tokens, which was a LEMMA fold stream — so
  // genuine form-mode hits were silently dropped. Real case: EN 1:1094a reads
  // "pas meqodos" in the lemma stream while greek_form holds the surface pasa.
  // Phrases are now verified against posting adjacency, and greek_tokens is gone.
  // The index below stands in for that split: pasa@2, meqodos@3, kai@5.
  it('matches a form phrase whose lemma stream differs from the surface forms', async () => {
    const hits = (await search('pasa meqodos', '', 'phrase', 'all', 'and', ['TPhraseLemmaStream'], 'form')).results;
    expect(hits.map((r) => r.meta.id)).toEqual(['s1']);
    expect(hits[0].grkPositions).toEqual([2, 3]);
  });

  it('makes each run of a Greek phrase one match, counted once (John, 2026-11-11)', async () => {
    const [hit] = (await search('pasa meqodos', '', 'phrase', 'all', 'and', ['TPhraseRun'], 'form')).results;
    // One window holding both words: one row on the page, one in the count.
    expect(hit.windows).toEqual([[2, 3]]);
    expect(hitCount(hit)).toBe(1);
  });

  it('counts each run of an English phrase once', async () => {
    const [hit] = (await search('', 'happiness and', 'all', 'phrase', 'and', ['TEngPhraseRun'])).results;
    expect(hit?.engHits?.[0]).toMatchObject({ positions: [0, 1], matches: [0] });
    expect(hitCount(hit)).toBe(1);
  });

  it('rejects phrase terms that are present but not adjacent or out of order', async () => {
    expect((await search('meqodos pasa', '', 'phrase', 'all', 'and', ['TPhraseOrder'], 'form')).results).toHaveLength(0);
    expect((await search('pasa kai', '', 'phrase', 'all', 'and', ['TPhraseGap'], 'form')).results).toHaveLength(0);
  });

  // A wildcard term inside a phrase must contribute its postings to adjacency,
  // and must survive the phrase VERIFICATION as well as the posting lookup.
  it('allows a wildcard inside a Greek phrase', async () => {
    const hits = (await search('pas* meqodos', '', 'phrase', 'all', 'and', ['TPhraseWild'], 'form')).results;
    expect(hits.map((r) => r.meta.id)).toEqual(['s1']);
    expect(hits[0].grkPositions).toEqual([2, 3]);
  });

  it('allows a wildcard inside an English phrase', async () => {
    // Regression: the phrase check folded `*` away and then looked for the
    // literal string "happ virtue", so the postings matched and the check
    // discarded them.
    const hits = (await search('', 'happ* and virtue', 'phrase', 'phrase', 'and', ['TEngPhraseWild'])).results;
    expect(hits.map((r) => r.meta.id)).toEqual(['s2']);
  });

  it.each([
    ['whitespace only', '   ', '\t'],
    ['pure punctuation', '!!!', '...'],
    ['regex metacharacters', '.*+?^${}()|[]\\', '.*+?^${}()|[]\\'],
    ['Greek string', 'λόγος τέχνη', 'virtue'],
    ['very long string', `${'logos '.repeat(500)}texnh`, `${'virtue '.repeat(500)}craft`],
  ])('does not throw for adversarial input: %s', async (_label, grk, eng) => {
    await expect(search(grk, eng, 'any', 'any', 'or', [`TAdv-${_label}`])).resolves.toMatchObject({ results: expect.any(Array), failedWorks: expect.any(Array) });
  });
});

describe('lemma search resolves an inflected word to its headword', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/greek_lemma.json') || path.endsWith('/greek_form.json')) return json(greekIndex);
      if (path.endsWith('/english.json')) return json(englishIndex);
      // fold(surface) -> the headwords it can belong to
      if (path.endsWith('/lemma-map/l.json')) return json({ logou: ['logos'], logos: ['logos'] });
      if (path.endsWith('/lemma-map/y.json')) return json({ yuxhs: ['yuxh'] });
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds the whole word from a form the reader met on the page', async () => {
    // logou is not a key in the lemma index; logos is. Before the map was
    // consulted this returned nothing for a word occurring twice.
    const { results } = await search('logou', '', 'all', 'all', 'and', ['TInflected'], 'lemma');
    expect(results.map((r) => r.meta.id)).toEqual(['s1', 's2']);
  });

  it('still finds it when the reader types the dictionary form', async () => {
    const { results } = await search('logos', '', 'all', 'all', 'and', ['TDictForm'], 'lemma');
    expect(results.map((r) => r.meta.id)).toEqual(['s1', 's2']);
  });

  it('leaves a wildcard alone — it is a pattern over keys, not a word to resolve', async () => {
    const { results } = await search('l*s', '', 'all', 'all', 'and', ['TWild'], 'lemma');
    expect(results.map((r) => r.meta.id)).toEqual(['s1', 's2']);
  });

  it('resolves a capitalised Beta Code word: the leading * is a capital, not a wildcard', async () => {
    const { results } = await search('*LO/GOU', '', 'all', 'all', 'and', ['TCapital'], 'lemma');
    expect(results.map((r) => r.meta.id)).toEqual(['s1', 's2']);
  });

  it('still treats a * or ? after the capital marker as a wildcard', async () => {
    const { results } = await search('*l?gos', '', 'all', 'all', 'and', ['TCapitalWild'], 'lemma');
    expect(results.map((r) => r.meta.id)).toEqual(['s1', 's2']);
  });

  it('does not resolve in form mode, where the typed spelling is the query', async () => {
    const { results } = await search('logou', '', 'all', 'all', 'and', ['TFormMode'], 'form');
    expect(results).toEqual([]);
  });
});

describe('a lemma search whose headword map does not load', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/greek_lemma.json')) return json(greekIndex);
      // A letter no other block loads: the shards are cached for the module.
      if (path.endsWith('/lemma-map/k.json')) return Promise.resolve({ ok: false, status: 503, json: async () => ({}) } as Response);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('says which words went unresolved instead of passing the search off as complete', async () => {
    // Searching "kai" as typed still finds s1; what it cannot do is widen an
    // inflection to its headwords, and a reader who typed λόγου must be told so
    // rather than read "No passages found" as the corpus's answer.
    const outcome = await search('kai', '', 'all', 'all', 'and', ['TNoMap'], 'lemma');
    expect(outcome.results.map((r) => r.meta.id)).toEqual(['s1']);
    expect(outcome.unresolvedTerms).toEqual(['kai']);
  });

  it('reports nothing when the map loads', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/greek_lemma.json')) return json(greekIndex);
      if (path.endsWith('/lemma-map/k.json')) return json({ kai: ['kai'] });
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
    const outcome = await search('kai', '', 'all', 'all', 'and', ['TMapBack'], 'lemma');
    expect(outcome.results.map((r) => r.meta.id)).toEqual(['s1']);
    expect(outcome.unresolvedTerms).toBeUndefined();
  });
});

describe('? stands for one letter, never an apostrophe', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/greek_lemma.json') || path.endsWith('/greek_form.json')) return json({ "d'": [[0, 0]], de: [[1, 0]] });
      if (path.endsWith('/english.json')) return json({ "can't": [[0, 0]], cant: [[1, 0]] });
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('in Greek: d? is δέ, not the elided δ’', async () => {
    const { results } = await search('d?', '', 'all', 'all', 'and', ['TQGreekElision'], 'form');
    expect(results.map((r) => r.meta.id)).toEqual(['s2']);
  });

  it('in English: can?t does not match can’t', async () => {
    const { results } = await search('', 'can?t', 'all', 'all', 'and', ['TQEnglishApostrophe']);
    expect(results).toEqual([]);
  });
});

describe('a phrase typed as it stands on the page, under the default lemma mode', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/greek_lemma.json')) return json(greekIndex);
      if (path.endsWith('/lemma-map/l.json')) return json({ logou: ['logos'], logos: ['logos', 'xlogos'] });
      if (path.endsWith('/lemma-map/a.json')) return json({ areths: ['areth'] });
      if (path.endsWith('/lemma-map/t.json')) return json({ texnh: ['texnh', 'logos'] });
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('finds the run under the headwords the typed inflections belong to', async () => {
    // logou and areths are not keys in the lemma index; the run "logos areth"
    // stands at s1 positions 0–1. Matching only the typed fold found nothing
    // and then told the reader the words never stand together.
    const { results } = await search('logou areths', '', 'phrase', 'all', 'and', ['TPhraseInfl'], 'lemma');
    expect(results.map((r) => [r.meta.id, r.grkPositions])).toEqual([['s1', [0, 1]]]);
  });

  it('under headword mode takes the keys as given and widens nothing', async () => {
    // The lemma-map says the spelling "texnh" can also belong to logos (s1, s2).
    // A typed word is widened; a picked headword key is exactly itself. (The
    // lemma-map shards are cached for the module, so this uses a letter no
    // earlier block loaded.)
    const typed = await search('texnh', '', 'all', 'all', 'and', ['THeadTyped'], 'lemma');
    expect(typed.results.map((r) => r.meta.id)).toEqual(['s1', 's2', 's3']);
    const picked = await search('texnh', '', 'all', 'all', 'and', ['THeadPicked'], 'headword');
    expect(picked.results.map((r) => r.meta.id)).toEqual(['s3']);
  });
});

describe('an English phrase is an adjacency test over word positions', () => {
  const longMeta = [
    { id: 'L1', book: 1, column: '1094a' },
    { id: 'L2', book: 1, column: '1094b' },
    { id: 'L3', book: 2, column: '1100a' },
  ];
  // L1: "virtue habit" adjacent far into the segment. L2: "virtue and a
  // habit" — not adjacent. L3: "virtue and habit" — not adjacent.
  const positional = {
    virtue: [[0, 120], [1, 0], [2, 120]],
    habit: [[0, 121], [1, 3], [2, 122]],
    and: [[1, 1], [2, 121]],
  };
  let books: string[];
  const mock = (english: unknown) => {
    books = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(longMeta);
      if (path.endsWith('/english.json')) return json(english);
      if (/\/book-\d+\.json$/.test(path)) books.push(path);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  };
  afterEach(() => vi.restoreAllMocks());

  it('finds the phrase from the postings, fetching no book', async () => {
    mock(positional);
    const { results } = await search('', 'virtue habit', 'all', 'phrase', 'and', ['TPosIndex']);
    expect(results.map((r) => r.meta.id)).toEqual(['L1']);
    expect(books).toEqual([]);
  });
});

describe('an English word typed or pasted from the page', () => {
  const quoteMeta = [
    { id: 'Q1', book: 1, column: '1094a' },
  ];
  // Keyed as stage6's english_words() keys them.
  const index = { "aristotle's": [[0, 0]], first: [[0, 1]], change: [[0, 2]], "isn't": [[0, 3]], the: [[0, 4]], last: [[0, 5]] };
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(quoteMeta);
      if (path.endsWith('/english.json')) return json(index);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['aristotle’s', 1],    // the page's U+2019
    ["aristotle's", 1],
    ['‘change’', 1],       // quote marks are not part of the word
    ["'change'", 1],
    ['aristotles', 0],
  ])('%s → %i segment', async (q, n) => {
    const { results } = await search('', q, 'all', 'all', 'and', ['TQuotes']);
    expect(results).toHaveLength(n);
  });

  it('finds a phrase whose words the page prints with curly marks', async () => {
    const { results } = await search('', 'first ‘change’ isn’t', 'all', 'phrase', 'and', ['TQuotesPhrase']);
    expect(results.map((r) => r.meta.id)).toEqual(['Q1']);
  });
});

describe('English search across a work’s translations', () => {
  // The EN carries Rackham (the primary) and Ross (turn-aligned; its words
  // filed under the section a speech starts in).
  const menoMeta = [
    { id: '1:70a', book: 1, column: '70a' },
    { id: '1:70b', book: 1, column: '70b' },
    { id: '1:71a', book: 1, column: '71a' },
  ];
  const files: Record<string, unknown> = {
    'meta.json': menoMeta,
    // Rackham: "virtue" in 70a only; "the good" in 70b.
    'english.json': { virtue: [[0, 3]], the: [[0, 2], [1, 0]], good: [[1, 1]] },
    // Ross: "virtue" and "taught" together in 71a, "the good" in 70b.
    'english-secondary.json': { virtue: [[2, 1]], taught: [[2, 4]], the: [[1, 4]], good: [[1, 5]] },
    'greek_form.json': { areth: [[0, 0], [2, 0]] },
  };
  let requested: string[] = [];
  beforeEach(() => {
    requested = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      // The Int carries Ross too, but its index is absent here, as on a
      // corpus whose aligner never re-indexed.
      const m = path.match(/\/(EN|Int)\/search\/(.+)$/);
      if (m?.[1] === 'EN') requested.push(m[2]);
      const missing = m?.[1] === 'Int' && m[2] === 'english-secondary.json';
      if (m && m[2] in files && !missing) return json(files[m[2]]);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('names each index by its slot, as stage6 writes them', () => {
    expect(englishIndexFile({ id: 'rackham', slot: 'english' })).toBe('english.json');
    expect(englishIndexFile({ id: 'ross', slot: 'secondary' })).toBe('english-secondary.json');
    expect(englishIndexFile({ id: 'x', slot: 'secondary' })).toBe('english-secondary.json');
  });

  it('reports every translation a word stands in, with its positions', async () => {
    const { results } = await search('', 'virtue', 'all', 'all', 'and', ['EN']);
    expect(results.map((r) => [r.meta.id, r.engHits])).toEqual([
      ['1:70a', [{ translation: 'rackham', positions: [3] }]],
      ['1:71a', [{ translation: 'ross', positions: [1] }]],
    ]);
    expect(results.every((r) => r.engMatch)).toBe(true);
  });

  it('asks "all words" of one translation at a time, never of two pooled', async () => {
    // 70a has "virtue" in Rackham only; "taught" is Ross's alone: not a hit there.
    const { results } = await search('', 'virtue taught', 'all', 'all', 'and', ['EN']);
    expect(results.map((r) => r.meta.id)).toEqual(['1:71a']);
    expect(results[0].engHits).toEqual([{ translation: 'ross', positions: [1, 4] }]);
  });

  it('marks the run of a phrase in the translation that has it', async () => {
    const { results } = await search('', 'the good', 'all', 'phrase', 'and', ['EN']);
    expect(results.map((r) => [r.meta.id, r.engHits])).toEqual([
      ['1:70b', [
        { translation: 'rackham', positions: [0, 1], matches: [0] },
        { translation: 'ross', positions: [4, 5], matches: [4] },
      ]],
    ]);
  });

  it('says which translation it could not search, and searches the rest', async () => {
    const outcome = await search('', 'virtue', 'any', 'any', 'and', ['Int']);
    expect(outcome.failedWorks).toEqual([]);
    expect(outcome.unsearchedTranslations).toEqual([{ work: 'Int', translation: 'ross' }]);
    expect(outcome.results.flatMap((r) => r.engHits!.map((h) => h.translation))).toEqual(['cooke']);
  });

  it('joins Greek to the English of any translation', async () => {
    const both = await search('areth', 'virtue', 'all', 'all', 'and', ['EN'], 'form');
    expect(both.results.map((r) => r.meta.id)).toEqual(['1:70a', '1:71a']);
    const either = await search('areth', 'good', 'all', 'all', 'or', ['EN'], 'form');
    expect(either.results.map((r) => [r.meta.id, r.grkMatch, r.engHits?.map((h) => h.translation)])).toEqual([
      ['1:70a', true, []],
      ['1:70b', false, ['rackham', 'ross']],
      ['1:71a', true, []],
    ]);
  });

  it('loads no English index for a Greek-only query', async () => {
    const { results } = await search('areth', '', 'all', 'all', 'and', ['EN'], 'form');
    expect(results[0].engHits).toBeUndefined();
    expect(requested.filter((f) => f.startsWith('english'))).toEqual([]);
  });
});

// The same split stage6's english_words() makes, read from the fixture its
// pipeline test reads, so a posting's word_pos lands on the word it counted.
describe('englishWords', () => {
  const fixture = JSON.parse(readFileSync(
    resolve(__dirname, '../../pipeline/tests/fixtures/english_words.json'), 'utf-8',
  )) as { cases: { text: string; words: string[] }[] };

  it.each(fixture.cases)('splits $text as the index does', ({ text, words }) => {
    const got = englishWords(text);
    expect(got.map((w) => w.word)).toEqual(words);
    // Each span covers its word on the page, markers inside it aside.
    for (const w of got) {
      const span = text.slice(w.start, w.end).replace(/\[\^[^\]]*\]/g, '')
        .replace(/[’ʼ]/g, "'").toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/æ/g, 'ae').replace(/œ/g, 'oe');
      expect(span).toBe(w.word);
    }
  });
});

describe('englishTermMatcher', () => {
  it('matches a word as the index lookup does', () => {
    const m = englishTermMatcher(['virtue', 'hap*ness', "aristotle’s"]);
    expect(['virtue', 'virtues', 'happiness', 'hapness', "aristotle's", 'aristotle'].map(m))
      .toEqual([true, false, true, true, true, false]);
  });
});

// A typed term splits where the index splits text, so a hyphenated word is
// found as its parts standing in a row; and in English a leading * is a
// wildcard, not Beta Code's capital marker.
describe('English query terms as the index reads them', () => {
  const hyMeta = [
    { id: 'h1', book: 1, column: '1a' },
    { id: 'h2', book: 1, column: '1b' },
  ];
  // h1: "the coming-to-be of happiness"; h2: "coming ... to be ... goodness",
  // the same words, not in a row.
  const hyIndex = {
    the: [[0, 0]], coming: [[0, 1], [1, 0]], to: [[0, 2], [1, 3]], be: [[0, 3], [1, 4]],
    of: [[0, 4]], happiness: [[0, 5]], goodness: [[1, 6]], ness: [[1, 9]],
  };
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(hyMeta);
      if (path.endsWith('/english.json')) return json(hyIndex);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('splits a term where the index splits text', () => {
    expect(englishQueryUnits('coming-to-be  Aristotle’s self–control *ness ‘end’ ---')).toEqual([
      ['coming', 'to', 'be'], ["aristotle's"], ['self', 'control'], ['*ness'], ['end'],
    ]);
  });

  it('finds a hyphenated word where its parts stand in a row, and only there', async () => {
    const { results } = await search('', 'coming-to-be', 'all', 'all', 'and', ['THyphenAll']);
    expect(results.map((r) => [r.meta.id, r.engHits![0].positions])).toEqual([['h1', [1, 2, 3]]]);
  });

  it('keeps a hyphenated unit whole beside other words', async () => {
    const all = await search('', 'coming-to-be happiness', 'all', 'all', 'and', ['THyphenMixed']);
    expect(all.results.map((r) => r.meta.id)).toEqual(['h1']);
    const any = await search('', 'coming-to-be goodness', 'all', 'any', 'and', ['THyphenAny']);
    expect(any.results.map((r) => r.meta.id)).toEqual(['h1', 'h2']);
  });

  it('reads a leading * in English as a wildcard', async () => {
    const { results } = await search('', '*ness', 'all', 'all', 'and', ['TSuffix']);
    expect(results.map((r) => [r.meta.id, r.engHits![0].positions])).toEqual([
      ['h1', [5]],
      ['h2', [6, 9]],
    ]);
    expect(englishTermMatcher(['*ness'])('happiness')).toBe(true);
    expect(englishTermMatcher(['*ness'])('nest')).toBe(false);
  });
});

// English "any form": a typed word also finds its plurals and possessives, and
// a plural its singular, but only as words the index holds.
describe('English any form', () => {
  it('reaches plural and possessive forms, and back', () => {
    expect(englishForms('virtue')).toEqual(expect.arrayContaining(['virtue', 'virtues', "virtue's"]));
    expect(englishForms('virtues')).toEqual(expect.arrayContaining(['virtue', "virtue's"]));
    expect(englishForms("aristotle's")).toEqual(expect.arrayContaining(['aristotle', "aristotle's"]));
    expect(englishForms('body')).toEqual(expect.arrayContaining(['bodies', "body's"]));
    expect(englishForms('bodies')).toContain('body');
    expect(englishForms('class')).toContain('classes');
    expect(englishForms('causes')).toContain('cause');
    expect(englishForms('hero')).toContain('heroes');
  });

  it('knows the irregulars, and every -man compound', () => {
    expect(englishForms('man')).toEqual(expect.arrayContaining(['men', "man's", "men's"]));
    expect(englishForms('men')).toContain('man');
    expect(englishForms('woman')).toContain('women');
    expect(englishForms('statesmen')).toContain('statesman');
    expect(englishForms('child')).toEqual(expect.arrayContaining(['children', "children's"]));
    expect(englishForms('phenomena')).toContain('phenomenon');
    expect(englishForms('ox')).toContain('oxen');
  });

  it('leaves short words and wildcards alone, and keeps a singular in -s whole', () => {
    expect(englishForms('a')).toEqual(['a']);
    expect(englishForms('is')).toEqual(['is']);
    expect(englishForms('us')).toEqual(['us']);
    expect(englishForms('virtue*')).toEqual(['virtue*']);
    expect(englishForms('his')).not.toContain('hi');
    expect(englishForms('his')).not.toContain('hiss');
    expect(englishForms('genus')).not.toContain('genu');
    expect(englishForms('this')).not.toContain('thi');
  });

  it('gives a singular in -s its possessive', () => {
    expect(englishForms('class')).toContain("class's");
    expect(englishForms('basis')).toContain("basis's");
  });

  it('does not take an -s word that is no plural for one', () => {
    expect(englishForms('news')).not.toContain('new');
    expect(englishForms('politics')).not.toContain('politic');
    expect(englishForms('means')).not.toContain('mean');
    expect(englishForms('mean')).not.toContain('means');
    expect(englishForms('mean')).toContain("mean's");
  });

  it('does not take a determiner for the singular of a plural', () => {
    expect(englishForms('theses')).not.toContain('these');
    expect(englishForms('theses')).toContain('thesis');
    expect(englishForms('these')).toEqual(['these']);
  });

  it('gives a word in -ch both plurals', () => {
    expect(englishForms('stomach')).toEqual(expect.arrayContaining(['stomachs', 'stomaches']));
    expect(englishForms('church')).toContain('churches');
    expect(englishForms('epochs')).toContain('epoch');
  });

  it('matches a word by any form only when asked', () => {
    expect(['virtue', 'virtues', "virtue's", 'virtuous'].map(englishTermMatcher(['virtue'], true)))
      .toEqual([true, true, true, false]);
    expect(englishTermMatcher(['virtue'])('virtues')).toBe(false);
  });

  describe('search', () => {
    const formMeta = [
      { id: 'f1', book: 1, column: '1a', greek_head: '', english_head: '' },
      { id: 'f2', book: 1, column: '1b', greek_head: '', english_head: '' },
      { id: 'f3', book: 1, column: '1c', greek_head: '', english_head: '' },
    ];
    // f1: "the virtues of men"; f2: "a man's virtue"; f3: "virtuous man".
    const formIndex = {
      the: [[0, 0]], virtues: [[0, 1]], of: [[0, 2]], men: [[0, 3]],
      a: [[1, 0]], "man's": [[1, 1]], virtue: [[1, 2]],
      virtuous: [[2, 0]], man: [[2, 1]],
    };
    beforeEach(() => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const path = String(url);
        if (path.endsWith('/meta.json')) return json(formMeta);
        if (path.endsWith('/english.json')) return json(formIndex);
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
      });
    });
    afterEach(() => vi.restoreAllMocks());

    it('finds every form of a word, and marks where each stands', async () => {
      const { results } = await search('', 'virtue', 'all', 'all', 'and', ['TFormsOne'], 'lemma', true);
      expect(results.map((r) => [r.meta.id, r.engHits![0].positions])).toEqual([['f1', [1]], ['f2', [2]]]);
    });

    it('finds exactly what was typed without it', async () => {
      const { results } = await search('', 'virtue', 'all', 'all', 'and', ['TFormsOff'], 'lemma');
      expect(results.map((r) => r.meta.id)).toEqual(['f2']);
    });

    it('lets each word of a phrase stand in any of its forms', async () => {
      const { results } = await search('', 'virtue of man', 'all', 'phrase', 'and', ['TFormsPhrase'], 'lemma', true);
      expect(results.map((r) => [r.meta.id, r.engHits![0].positions])).toEqual([['f1', [1, 2, 3]]]);
    });

    it('finds man as men and man\'s, and never a word that only begins the same way', async () => {
      const { results } = await search('', 'man', 'all', 'all', 'and', ['TFormsMan'], 'lemma', true);
      expect(results.map((r) => [r.meta.id, r.engHits![0].positions])).toEqual([
        ['f1', [3]], ['f2', [1]], ['f3', [1]],
      ]);
    });

    // A plain JSON index inherits Object.prototype, so "constructor" is a key
    // of every one unless the lookup asks for its own keys only.
    it('finds no word the index does not hold, even one an object inherits', async () => {
      for (const [q, forms, work] of [
        ['constructors', true, 'TFormsProtoA'], ['constructor', false, 'TFormsProtoB'],
      ] as const) {
        const out = await search('', q, 'all', 'all', 'and', [work], 'lemma', forms);
        expect(out).toEqual({ results: [], failedWorks: [] });
      }
    });
  });
});

// The index folds ligatures and accents (stage6 _latin_fold), so a query must
// too, whether typed plain or pasted with the page's letters.
describe('English accented Latin', () => {
  it('folds a query as the index folds the text', () => {
    expect(englishQueryUnits('Lacedæmonians versâ Œdipus')).toEqual([['lacedaemonians'], ['versa'], ['oedipus']]);
    expect(englishTermMatcher(['Lacedæmonians'])('lacedaemonians')).toBe(true);
    expect(englishTermMatcher(['lacedaemonians'])(englishWords('the Lacedæmonians')[1].word)).toBe(true);
  });

  it('gives a folded word the span of its letters on the page', () => {
    const text = 'the Lacedæmonians';
    const [, w] = englishWords(text);
    expect(text.slice(w.start, w.end)).toBe('Lacedæmonians');
  });

  it('keeps a combining accent at the end of a word inside its span', () => {
    const text = 'a cafe\u0301, then';
    const [, w] = englishWords(text);
    expect([w.word, text.slice(w.start, w.end)]).toEqual(['cafe', 'cafe\u0301']);
  });
});

// Three consecutive Stephanus sections in one book, 12 tokens in all. The
// coordinate fields are named for Bekker; the values are Stephanus, and every
// section is letter-suffixed — the case that has broken ref handling before.
const stephanusOffsets = {
  token_count: 12,
  seg_base_offset: [0, 5, 9],
  segments: [
    { book: 1, column: '34a', line_runs: [[1, 5]] as [number, number][] },
    { book: 1, column: '34b', line_runs: [[1, 4]] as [number, number][] },
    { book: 1, column: '35a', line_runs: [[1, 3]] as [number, number][] },
  ],
  book_bounds: [{ book: 1, start: 0 }],
  turn_bounds: [],
};

describe('offsetRef / offsetCite', () => {
  it('resolves an offset to its section and position', () => {
    expect(offsetRef(stephanusOffsets, 0)).toEqual({ seg_idx: 0, pos: 0, book: 1, column: '34a', line: 1 });
    expect(offsetRef(stephanusOffsets, 6)).toEqual({ seg_idx: 1, pos: 1, book: 1, column: '34b', line: 1 });
  });

  it('puts each side of a segment boundary in the right section', () => {
    // 4 is the last token of 34a; 5 is the first of 34b; 9 opens 35a.
    expect(offsetRef(stephanusOffsets, 4)).toEqual({ seg_idx: 0, pos: 4, book: 1, column: '34a', line: 1 });
    expect(offsetRef(stephanusOffsets, 5)).toEqual({ seg_idx: 1, pos: 0, book: 1, column: '34b', line: 1 });
    expect(offsetRef(stephanusOffsets, 9)).toEqual({ seg_idx: 2, pos: 0, book: 1, column: '35a', line: 1 });
  });

  it('refuses an offset outside the work', () => {
    expect(offsetRef(stephanusOffsets, -1)).toBeNull();
    expect(offsetRef(stephanusOffsets, 12)).toBeNull();
  });

  it('cites a lettered section as page + section', () => {
    expect(offsetCite('EN', stephanusOffsets, 6)).toBe('34b1');
    expect(offsetCite('EN', stephanusOffsets, 9)).toBe('35a1');
    expect(offsetCite('EN', stephanusOffsets, 12)).toBeNull();
  });

  it('keeps line numbers in Bekker citations', () => {
    // Every token of 34b must cite as "34b" — page + section and nothing else.
    for (let g = 0; g < stephanusOffsets.token_count; g++) {
      const cite = offsetCite('EN', stephanusOffsets, g)!;
      expect(cite).toMatch(/^\d+[ab]\d+$/);
    }
    const inSection = [5, 6, 7, 8].map((g) => offsetCite('EN', stephanusOffsets, g));
    expect(inSection).toEqual(['34b1', '34b1', '34b1', '34b1']);
  });
});

vi.mock('../lib/works', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/works')>();
  return { ...actual, searchableTranslations: (work: import('../lib/works').Work) => {
    const rows = actual.searchableTranslations(work);
    return work.id === 'EN' || work.id === 'Int' ? rows.slice(0, 2).map((t, i) => ({ ...t, id: i ? 'ross' : work.id === 'EN' ? 'rackham' : 'cooke' })) : rows;
  } };
});
