import { afterEach, describe, expect, it, vi } from 'vitest';
import { greekHitForms, narrowToTypedHeadwords, search, searchPhraseVariants } from '../lib/search';

const HEADS: Record<string, string[]> = {
  mhn: ['μήν'],
  meis: ['μείς'],
  mhs: ['μής'],
  ei: ['εἰ'],
  eimi: ['εἰμί'],
  tis: ['τίς'],
};

const headsOf = (key: string) => Promise.resolve(HEADS[key] ?? []);

const MHN = ['meis', 'mhn', 'mhs'];
const EI = ['ei', 'eimi'];

describe('narrowToTypedHeadwords', () => {
  it('narrows μήν to the headword key mhn', async () => {
    expect('μήν').not.toBe('μην');
    expect(await narrowToTypedHeadwords(['μήν'], [MHN], headsOf)).toEqual([['mhn']]);
    expect(await narrowToTypedHeadwords(['Μήν'], [MHN], headsOf)).toEqual([['mhn']]);
    expect(await narrowToTypedHeadwords(['*μήν'], [MHN], headsOf)).toEqual([['mhn']]);
    expect(await narrowToTypedHeadwords(['mh/n'], [MHN], headsOf)).toEqual([['mhn']]);
  });

  it('narrows εἰ to the headword key ei', async () => {
    expect(await narrowToTypedHeadwords(['εἰ'], [EI], headsOf)).toEqual([['ei']]);
  });

  it('leaves εἶ on every headword its spelling can belong to', async () => {
    expect('εἶ').not.toBe('εἰ');
    expect(await narrowToTypedHeadwords(['εἶ'], [EI], headsOf)).toEqual([EI]);
  });

  it('leaves an unaccented μην on every headword', async () => {
    expect(await narrowToTypedHeadwords(['μην'], [MHN], headsOf)).toEqual([MHN]);
  });

  it('leaves options unchanged when a picker shard fails to load', async () => {
    const fail = async () => { throw new Error('HTTP 404 for lemma-picker/m.json'); };
    expect(await narrowToTypedHeadwords(['μήν'], [MHN], fail)).toEqual([MHN]);
    const oneShard = async (key: string) => {
      if (key === 'meis') throw new Error('HTTP 404 for lemma-picker/m.json');
      return HEADS[key] ?? [];
    };
    expect(await narrowToTypedHeadwords(['μήν'], [MHN], oneShard)).toEqual([MHN]);
  });

  it('changes at least one word, so returning the input unchanged cannot pass', async () => {
    const cases = [
      { typed: 'μήν', options: MHN },
      { typed: 'εἰ', options: EI },
      { typed: 'εἶ', options: EI },
      { typed: 'μην', options: MHN },
    ];
    const got = await Promise.all(cases.map((c) => narrowToTypedHeadwords([c.typed], [c.options], headsOf)));
    expect(got.some((row, i) => row[0].join('|') !== cases[i].options.join('|'))).toBe(true);
  });
});

// τί μήν stands at 0–1. τί μείς ("what month") stands at 2–3. A lemma phrase
// that fans out on the folded letters matches both; μήν spelled as the
// headword must match only the first.
const meta = [{ id: 's1', book: 1, column: '1a' }];
const lemmaIndex = {
  tis: [[0, 0], [0, 2]],
  mhn: [[0, 1]],
  meis: [[0, 3]],
  mhs: [[0, 5]],
};
const formIndex = { ti: [[0, 0], [0, 2]], mhn: [[0, 1]], meis: [[0, 3]], mhs: [[0, 5]] };
const lemmaMap: Record<string, Record<string, string[]>> = {
  t: { ti: ['tis'] },
  m: { mhn: ['meis', 'mhn', 'mhs'] },
  e: { ei: ['ei', 'eimi'] },
};
const picker: Record<string, Record<string, { n: number; c: { h: string }[] }>> = {
  t: { tis: { n: 1, c: [{ h: 'τίς' }] } },
  m: {
    mhn: { n: 1, c: [{ h: 'μήν' }] },
    meis: { n: 1, c: [{ h: 'μείς' }] },
    mhs: { n: 1, c: [{ h: 'μής' }] },
  },
  e: {
    ei: { n: 1, c: [{ h: 'εἰ' }] },
    eimi: { n: 1, c: [{ h: 'εἰμί' }] },
  },
};

function json(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}

describe('a lemma phrase does not fan a typed headword out to its homographs', () => {
  afterEach(() => vi.restoreAllMocks());

  function mockFetch() {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      const map = path.match(/lemma-map\/([a-z_])\.json$/);
      if (map) return json(lemmaMap[map[1]] ?? {});
      const pick = path.match(/lemma-picker\/([a-z_])\.json$/);
      if (pick) return json(picker[pick[1]] ?? {});
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/greek_lemma.json')) return json(lemmaIndex);
      if (path.endsWith('/greek_form.json')) return json(formIndex);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  }

  it('searchPhraseVariants keeps μήν on mhn and leaves εἶ wide', async () => {
    mockFetch();
    expect((await searchPhraseVariants('τί μήν', ['W'])).readings).toEqual([['tis', 'mhn']]);
    expect((await searchPhraseVariants('εἶ τί', ['W'])).readings).toEqual([['ei', 'tis'], ['eimi', 'tis']]);
  });

  it('a lemma phrase search for τί μήν does not match τί μείς', async () => {
    mockFetch();
    const phrase = await search('τί μήν', '', 'phrase', 'all', 'and', ['W'], 'lemma');
    expect(phrase.results.map((r) => r.grkPositions)).toEqual([[0, 1]]);
  });

  it('a single-word lemma search still takes every headword of the spelling', async () => {
    mockFetch();
    const one = await search('μήν', '', 'all', 'all', 'and', ['W'], 'lemma');
    expect(one.results.map((r) => r.grkPositions)).toEqual([[1, 3, 5]]);
  });

  it('the form list of a lemma phrase names only the headwords the phrase took', async () => {
    mockFetch();
    const phrase = await search('τί μήν', '', 'phrase', 'all', 'and', ['W'], 'lemma');
    const asPhrase = await greekHitForms(phrase.results, 'τί μήν', 'lemma', true);
    expect(asPhrase.headwords.get('mhn')).toEqual(['mhn']);
    // Read as separate words, the same spelling belongs to all three: the check
    // above is not passing because the list never names μείς.
    const asWords = await greekHitForms(phrase.results, 'τί μήν', 'lemma', false);
    expect(asWords.headwords.get('mhn')).toEqual(['meis', 'mhn', 'mhs']);
  });
});
