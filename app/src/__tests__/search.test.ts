import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { greekFold, search } from '../lib/search';

const meta = [
  { id: 's1', book: 1, column: '1094a', greek_head: 'λόγος ἀρετή', greek_tokens: 'logos areth', english_head: 'virtue is a habit of choice' },
  { id: 's2', book: 1, column: '1094b', greek_head: 'ψυχή λόγος', greek_tokens: 'yuxh logos', english_head: 'happiness and virtue together' },
  { id: 's3', book: 2, column: '1100a', greek_head: 'τέχνη', greek_tokens: 'texnh', english_head: 'craft concerns making' },
];

const greekIndex = {
  logos: [[0, 0], [1, 1]],
  areth: [[0, 1]],
  yuxh: [[1, 0]],
  texnh: [[2, 0]],
} satisfies Record<string, [number, number][]>;

const englishIndex = {
  virtue: [0, 1],
  habit: [0],
  choice: [0],
  happiness: [1],
  craft: [2],
  making: [2],
} satisfies Record<string, number[]>;

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
    await expect(search('', ' ', 'all', 'all', 'and', ['TEmpty'])).resolves.toEqual([]);
    await expect(search('logos', '', 'all', 'all', 'and', [])).resolves.toEqual([]);
  });

  it('supports all, any, and phrase modes', async () => {
    expect(await search('logos areth', '', 'all', 'all', 'and', ['TAll'])).toHaveLength(1);
    expect(await search('yuxh areth', '', 'any', 'all', 'and', ['TAny'])).toHaveLength(2);
    expect(await search('logos areth', '', 'phrase', 'all', 'and', ['TPhraseMiss'])).toHaveLength(1);
    expect(await search('areth logos', '', 'phrase', 'all', 'and', ['TPhraseHit'])).toHaveLength(0);
  });

  it('supports wildcards for Greek and English terms', async () => {
    const greek = await search('tex*', '', 'all', 'all', 'and', ['TGreekWildcard']);
    const english = await search('', 'hap*', 'all', 'all', 'and', ['TEngWildcard']);
    expect(greek.map((r) => r.meta.id)).toEqual(['s3']);
    expect(english.map((r) => r.meta.id)).toEqual(['s2']);
  });

  it('combines Greek and English boxes with AND or OR', async () => {
    const andHits = await search('logos', 'happiness', 'all', 'all', 'and', ['TAnd']);
    const orHits = await search('texnh', 'happiness', 'all', 'all', 'or', ['TOr']);
    expect(andHits.map((r) => r.meta.id)).toEqual(['s2']);
    expect(orHits.map((r) => r.meta.id)).toEqual(['s2', 's3']);
  });

  it.each([
    ['whitespace only', '   ', '\t'],
    ['pure punctuation', '!!!', '...'],
    ['regex metacharacters', '.*+?^${}()|[]\\', '.*+?^${}()|[]\\'],
    ['Greek string', 'λόγος τέχνη', 'virtue'],
    ['very long string', `${'logos '.repeat(500)}texnh`, `${'virtue '.repeat(500)}craft`],
  ])('does not throw for adversarial input: %s', async (_label, grk, eng) => {
    await expect(search(grk, eng, 'any', 'any', 'or', [`TAdv-${_label}`])).resolves.toEqual(expect.any(Array));
  });
});
