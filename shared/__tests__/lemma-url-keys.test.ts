import { describe, expect, it } from 'vitest';
import { resolveHeadwordKeys, type HeadwordKeyDeps } from '../lib/search';
import { decodeSearchUrl, resolveDecodedLemmaKeys } from '../lib/search-url';

// Picker shards: a key present here is a dictionary headword key.
// Lemma map: a folded spelling → the headword keys it can belong to.
const PICKER: Record<string, Record<string, unknown>> = {
  n: { noos: { n: 1, c: [{ h: 'νοῦς' }] } },
  m: { mhn: { n: 1, c: [{ h: 'μήν' }] } },
  e: { ei: { n: 1, c: [{ h: 'εἰ' }] } },
};
const MAP: Record<string, Record<string, string[]>> = {
  // "ghost" is not a picker key, so a resolver that returns the map raw fails.
  n: { nous: ['noos', 'ghost'] },
  m: { mhn: ['meis', 'mhn', 'mhs'] },
  e: { ei: ['ei', 'eimi'] },
};

function deps(mapsRead: string[] = []): HeadwordKeyDeps {
  return {
    pickerShard: async (letter) => PICKER[letter] ?? {},
    lemmaMap: async (letter) => {
      mapsRead.push(letter);
      return MAP[letter] ?? {};
    },
  };
}

describe('resolveHeadwordKeys', () => {
  it('keeps a picker key and does not read the lemma map', async () => {
    const read: string[] = [];
    expect(await resolveHeadwordKeys('mhn', deps(read))).toEqual(['mhn']);
    expect(await resolveHeadwordKeys('noos', deps(read))).toEqual(['noos']);
    expect(read).toEqual([]);
  });

  it('resolves νοῦς to the headword key noos', async () => {
    expect(await resolveHeadwordKeys('νοῦς', deps())).toEqual(['noos']);
  });

  it('returns nothing for an unknown word', async () => {
    expect(await resolveHeadwordKeys('ἄγνωστον', deps())).toEqual([]);
    expect(await resolveHeadwordKeys('zzzz', deps())).toEqual([]);
  });
});

describe('decoded lemma keys', () => {
  it('maps lemma slots and l= keys onto headword keys and leaves the rest', async () => {
    const params = new URLSearchParams();
    params.append('l', 'νοῦς,zzzz');
    params.append('c', 'l:νοῦς');
    params.append('c', 'l:ψυχή');
    params.append('c', 'lb2:ἄλλος');
    params.append('c', 'lo:ἕτερος');
    params.set('cw', '10');
    const s = decodeSearchUrl(params, ['EN']);
    await resolveDecodedLemmaKeys(s, (key) => resolveHeadwordKeys(key, deps()));

    expect(s.lemmas).toEqual(['noos', 'zzzz']);
    expect(s.combo!.slots.map((slot) => slot.picked)).toEqual([
      ['noos'],
      ['ψυχή'],
      ['ἄλλος'],
      ['ἕτερος'],
    ]);
    expect(s.combo!.slots.map((slot) => slot.relation)).toEqual(['near', 'near', 'before', 'near']);
    expect(s.combo!.slots[2].target).toBe(1);
    expect(s.combo!.slots[3].or).toBe(true);
    expect(s.combo!.slots[0].or).toBeUndefined();
    expect(s.combo!.window).toBe(10);
    expect(s.combo!.unit).toBe('words');
    expect(s.combo!.ordered).toBe(false);
  });
});
