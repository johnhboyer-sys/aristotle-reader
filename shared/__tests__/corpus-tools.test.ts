import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  citationsFor,
  GREEK_FUNCTION_LEMMATA,
  contentWords,
  findOccurrences,
  grammaticalForms,
  selectedKeys,
  sharedPhrases,
  whereElseOffered,
} from '../lib/corpus-tools';

// Real rows from build/dist/ngrams, trimmed. τίνα τρόπον opens the Pol at
// 327a ("in what manner they would hold it") and stands 91 times in 17 works;
// as dictionary words, τίς τρόπος, 138 times in 24. Only the Cat and
// Pol occurrences are kept here, with their real delta-encoded offsets.
const shards: Record<string, Record<string, unknown>> = {
  'form/t': { 'tina tropon': [2, 91, 673.4, 17] },
  'lemma/t': { 'tis tropos': [2, 138, 426.2, 24] },
};
const occ: Record<string, Record<string, Record<string, number[]>>> = {
  'form/t-2': { 'tina tropon': { Cat: [5831, 15462], Pol: [18, 14202, 1520] } },
  'lemma/t-2': { 'tis tropos': { Cat: [405, 3746, 1680, 15462], Pol: [18, 14202, 1520] } },
};

vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchNgramShard: vi.fn(async (stream: string, letter: string) => shards[`${stream}/${letter}`] ?? {}),
    fetchNgramOccurrences: vi.fn(async (stream: string, letter: string, n: number) => {
      const file = occ[`${stream}/${letter}-${n}`];
      if (!file) throw new Error('HTTP 404');
      return file;
    }),
  };
});

// Real lemma-map entries (build/dist/lemma-map), for the words these tests ask about. The
// page memoises each shard, so one map serves the whole file.
const lemmaMap: Record<string, Record<string, string[]>> = {
  a: { alla: ['alla', 'allos'], agaqos: ['agaqos'] },
  c: { cun: ['sun'] },
  s: { sun: ['sun'] },
  d: { dia: ['dia', 'dih', 'dios', 'zeus'], dunaton: ['dunatos'], dh: ['dh'], de: ['de'], "d'": ['de'] },
  e: { en: ['eimi', 'eis', 'en', 'ihmi'] },
  g: { gar: ['gar'], ge: ['ge'] },
  h: { h: ['eimi', 'h', 'hmi', 'ihmi', 'o', 'os'], hdh: ['hdh', 'hdos', 'oida'] },
  k: { kai: ['kai'], kata: ['eita', 'kata'], kalos: ['kalos'] },
  m: { mhn: ['meis', 'mhn', 'mhs'], men: ['men'] },
  o: { oun: ['oun'], os: ['os'], outw: ['outws'] },
  p: { panu: ['panu'], pws: ['pws'] },
  t: { tauton: ['tautos'], to: ['o'], ton: ['o'], ta: ['o', 'tis'], tina: ['tis'], tropon: ['tropos'], te: ['su', 'te'], toinun: ['toinun'] },
  y: { yuxh: ['yuxazw', 'yuxh', 'yuxw'] },
};


function json(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}

describe('Where else: the n-gram lookup', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const map = String(url).match(/lemma-map\/([a-z_])\.json$/);
      if (map) return json(lemmaMap[map[1]] ?? {});
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('finds τίνα τρόπον by form, offsets decoded', async () => {
    const found = await findOccurrences('form', ['tina', 'tropon']);
    expect(found.readings).toEqual(['tina tropon']);
    expect(found.byWork).toEqual({ Cat: [5831, 21293], Pol: [18, 14220, 15740] });
  });

  it('finds τίνα τρόπον by dictionary word through the lemma map', async () => {
    const found = await findOccurrences('lemma', ['tina', 'tropon']);
    expect(found.readings).toEqual(['tis tropos']);
    expect(found.byWork.Cat).toEqual([405, 4151, 5831, 21293]);
  });

  it('finds nothing for a run the index does not hold', async () => {
    const found = await findOccurrences('form', ['tina', 'logon']);
    expect(found).toEqual({ readings: [], byWork: {}, groups: [], searched: 1, total: 1 });
  });
});

describe('Where else: citations', () => {
  // Pol's offsets, cut to its first three Stephanus sections.
  const offsets = {
    token_count: 200,
    seg_base_offset: [0, 45, 104],
    segments: [
      { book: 1, column: '327a', line_runs: [[1, 100]] },
      { book: 1, column: '327b', line_runs: [[1, 100]] },
      { book: 1, column: '327c', line_runs: [[1, 100]] },
    ],
    book_bounds: [{ book: 1, start: 0 }],
    turn_bounds: [],
  } as never;

  it('cites a global offset by Stephanus section and links into the reader', () => {
    expect(citationsFor('Pol', offsets, [18, 60], '')).toEqual([
      { cite: '327a1', href: '/Pol/book/1?loc=327a:1' },
      { cite: '327b1', href: '/Pol/book/1?loc=327b:1' },
    ]);
  });
});

describe('Where else: offered for two to five words', () => {
  it('is offered for 2–5 words and for nothing else', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(whereElseOffered))
      .toEqual([false, false, true, true, true, true, false, false]);
  });

  it('reads the keys of the words a selection covers', () => {
    document.body.innerHTML =
      '<p><span class="tok" data-k="ti/na">τίνα</span> <span class="tok" data-k="tro/pon">τρόπον</span> ' +
      '<span class="tok" data-k="poih/sousin">ποιήσουσιν</span></p>';
    const toks = document.querySelectorAll('.tok');
    const range = document.createRange();
    range.setStart(toks[0].firstChild!, 1);
    range.setEnd(toks[1].firstChild!, 2);
    expect(selectedKeys(range, document)).toEqual(['tina', 'tropon']);
  });
});

describe('Compare works: shared phrases', () => {
  it('lists only the phrases both works use, each side decoded', () => {
    const files = [
      occ['form/t-2'],
      { 'kata to dunaton kai en': { Cat: [3616], Pol: [87474] }, 'ws epos eipein': { Pol: [100] } },
    ];
    const shared = sharedPhrases(files, 'Cat', 'Pol');
    expect(shared.map((s) => s.key).sort()).toEqual(['kata to dunaton kai en', 'tina tropon']);
    const row = shared.find((s) => s.key === 'tina tropon')!;
    expect(row).toEqual({ key: 'tina tropon', n: 2, a: [5831, 21293], b: [18, 14220, 15740] });
    expect(sharedPhrases(files, 'Cat', 'Cat')).toEqual([]);
  });
});

describe('Compare works: grammatical words by headword', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const map = String(url).match(/lemma-map\/([a-z_])\.json$/);
      if (map) return json(lemmaMap[map[1]] ?? {});
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('counts the words that are not grammatical words', async () => {
    const words = "kai mhn h d' os tina tropon kata to dunaton en kalos te agaqos".split(' ');
    const gram = await grammaticalForms(words);
    // μήν reads also as μήν "month", ἡ also as ἵημι: under the lemma rule both
    // count as content (the map gives them those headwords).
    expect(contentWords("kai mhn h d' os", gram)).toBe(2);
    expect(contentWords('tina tropon', gram)).toBe(1);
    expect(contentWords('kata to dunaton kai en', gram)).toBe(3);
    expect(contentWords('kalos te kai agaqos', gram)).toBe(2);
  });

  // τὸν Δία, τὰ ἄλλα, ᾔδη γάρ, πάνυ γε: a spelling a content word shares is
  // content (διά and Ζεύς, ἀλλά and ἄλλος, ἤδη and οἶδα), and πάνυ is no
  // grammatical word. Not τὸ ἕν: εἷς folds to `eis` with εἰς, so εν counts
  // as content only through a stray ἵημι reading, not for a sound reason.
  it('keeps phrases whose words a content word also spells', async () => {
    const kept = ['ton dia', 'ta alla', 'hdh gar', 'panu ge'];
    // ξὺν τό folds to cun to (ξ is c in Beta Code): σύν by headword, as σὺν τό.
    const hidden = ['kai gar', 'men oun', 'kai dh', "kai d' os", 'ta de', 'kai toinun', 'sun to', 'cun to'];
    const gram = await grammaticalForms([...kept, ...hidden].flatMap((p) => p.split(' ')));
    expect(kept.map((p) => contentWords(p, gram))).toEqual([1, 1, 1, 1]);
    expect(hidden.map((p) => contentWords(p, gram))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  // Weight-bearing words stay content (Grok review round 2): πῶς and οὕτω,
  // ἦ "said", ταὐτόν. πῶς γάρ stands 314 times, ἦ δ' ἐγώ 861.
  it('keeps πῶς γάρ, οὕτω δή, ταὐτὸν καί by form', async () => {
    const kept = ['pws gar', "pws d'", 'pws dh', 'outw dh', 'outw kai', 'tauton dh', 'tauton kai', 'to tauton'];
    const gram = await grammaticalForms(kept.flatMap((p) => p.split(' ')));
    expect(kept.map((p) => contentWords(p, gram))).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('keeps ἦ δ᾽ ἐγώ, πῶς γάρ, ταὐτὸν εἶναι by dictionary word', () => {
    const kept = ['hmi de egw', 'hmi de os', 'pws gar', 'pou gar', 'outws dh', 'tautos kai', 'tautos eimi'];
    expect(kept.map((p) => contentWords(p, GREEK_FUNCTION_LEMMATA))).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('counts by headword in the dictionary-word stream', () => {
    expect(contentWords('o eis', GREEK_FUNCTION_LEMMATA)).toBe(0);
    expect(contentWords('o yuxh', GREEK_FUNCTION_LEMMATA)).toBe(1);
    expect(contentWords('panu ge', GREEK_FUNCTION_LEMMATA)).toBe(1);
  });

  it('counts every word as content when the lemma map cannot be loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response));
    // ὡς ὦ: a letter no test above has loaded (the shards are memoised).
    const gram = await grammaticalForms(['ws', 'w']);
    expect(contentWords('ws w', gram)).toBe(2);
  });
});
