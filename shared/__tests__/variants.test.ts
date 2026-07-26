import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchPhraseVariants, VARIANT_READING_CAP } from '../lib/search';

// One segment. The phrase "to ti hn einai" stands at 0-3; the same formula with
// a different article, "tw ti hn einai", stands at 10-13. Only the second is
// reachable by widening, because its surface string differs.
const meta = [{ id: '1:980a', book: 1, column: '980a', greek_head: '', english_head: '' }];

// hn is genuinely ambiguous: Morpheus reads it as both eimi and hmi, and BOTH
// readings land on the same tokens. That is the case the union has to survive.
const lemmaIndex: Record<string, [number, number][]> = {
  o: [[0, 0], [0, 10]],
  tis: [[0, 1], [0, 11]],
  eimi: [[0, 2], [0, 3], [0, 12], [0, 13]],
  hmi: [[0, 2], [0, 12]],
  ean: [[0, 40]],
};
const lemmaMap: Record<string, Record<string, string[]>> = {
  t: { to: ['o'], ti: ['tis'] },
  h: { hn: ['ean', 'eimi', 'hmi'] },
  e: { einai: ['eimi'] },
};

function json(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}

describe('searchPhraseVariants', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      const shard = path.match(/lemma-map\/([a-z_])\.json$/);
      if (shard) return json(lemmaMap[shard[1]] ?? {});
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/greek_lemma.json')) return json(lemmaIndex);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('needs at least two words and a work', async () => {
    expect((await searchPhraseVariants('to', ['V1'])).results).toHaveLength(0);
    expect((await searchPhraseVariants('to ti', [])).results).toHaveLength(0);
  });

  it('finds the inflected variant an exact phrase cannot reach', async () => {
    const { results } = await searchPhraseVariants('to ti hn einai', ['V2']);
    // Both the typed phrase at 0-3 and the variant at 10-13.
    expect(results[0].grkPositions).toEqual([0, 1, 2, 3, 10, 11, 12, 13]);
  });

  // The crux: two readings of the same word land on the same tokens, because
  // they are one passage under two parses. Summing them would double the count.
  it('unions the offsets of overlapping readings instead of summing them', async () => {
    const { results, productive } = await searchPhraseVariants('to ti hn einai', ['V3']);
    const eimi = productive.find(r => r[2] === 'eimi');
    const hmi = productive.find(r => r[2] === 'hmi');
    expect(eimi).toBeTruthy();
    expect(hmi).toBeTruthy();
    // Each reading matches 2 places x 4 tokens = 8; summed that would be 16.
    expect(results[0].grkPositions).toHaveLength(8);
    expect(new Set(results[0].grkPositions).size).toBe(8);
  });

  it('reports which readings actually matched, not just which were tried', async () => {
    const { readings, productive } = await searchPhraseVariants('to ti hn einai', ['V4']);
    expect(readings).toHaveLength(3);                 // ean, eimi, hmi
    expect(productive.map(r => r[2]).sort()).toEqual(['eimi', 'hmi']);   // ean matched nothing
  });

  it('returns nothing when a word has no known headword', async () => {
    const { results } = await searchPhraseVariants('to zzzz', ['V5']);
    expect(results).toHaveLength(0);
  });

  it('caps a runaway fan-out and says how large it was', async () => {
    const wide = Array.from({ length: 40 }, (_, i) => `l${i}`);
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (/lemma-map\//.test(path)) return json({ aa: wide, ab: wide });
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/greek_lemma.json')) return json({});
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
    const { readings, cappedFrom } = await searchPhraseVariants('aa ab', ['V6']);
    expect(readings.length).toBeLessThanOrEqual(VARIANT_READING_CAP);
    expect(cappedFrom).toBe(1600);      // 40 x 40, stated rather than hidden
  });
});
