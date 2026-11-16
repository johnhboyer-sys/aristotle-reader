import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { search } from '../lib/search';

// The Greek wildcard syntax (John, 2026-11-10). A term with any Greek letter
// is Greek script and takes the whole syntax, a leading * included; a term
// without one is Beta Code, where a leading * is the capital and ( ) | + are
// marks the fold drops.

const meta = [{ id: 's1', book: 1, column: '1a' }];
// Every key at its own position in one segment, so a hit names its key.
const KEYS = [
  'logos', 'logou', 'logon', 'logwn', 'lgos', 'loogos', 'politikos', 'hqikos', 'kakos',
  'ikos', 'swkraths', 'alla', 'tw', "d'", 'de', 'areth',
];
const index = Object.fromEntries(KEYS.map((k, i) => [k, [[0, i]]]));

function json(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}

let n = 0;
// The keys a Greek query finds, by the form index; each call its own work,
// since indexes are memoised for the module.
async function keys(query: string): Promise<string[]> {
  const { results } = await search(query, '', 'all', 'all', 'and', [`TWild${n++}`], 'form');
  return (results[0]?.grkPositions ?? []).map((p) => KEYS[p]).sort();
}

describe('Greek wildcard syntax', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/greek_form.json') || path.endsWith('/greek_lemma.json')) return json(index);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('a leading * in Greek script is a wildcard: a suffix search', async () => {
    expect(await keys('*ικος')).toEqual(['hqikos', 'ikos', 'politikos']);
  });

  it('a leading * in Beta Code is the capital, and is dropped', async () => {
    expect(await keys('*ikos')).toEqual(['ikos']);
    expect(await keys('*swkraths')).toEqual(['swkraths']);
  });

  it('Beta Code writes a suffix search as .*ikos$', async () => {
    // The . is a letter, so ikos itself is not among them.
    expect(await keys('.*ikos$')).toEqual(['hqikos', 'politikos']);
    expect(await keys('.*ικος$')).toEqual(['hqikos', 'politikos']);
  });

  it('. and ? are one letter, never the apostrophe', async () => {
    expect(await keys('log.s')).toEqual(['logos']);
    expect(await keys('λογ.ς')).toEqual(['logos']);
    expect(await keys('log?n')).toEqual(['logon', 'logwn']);
    expect(await keys('d.')).toEqual(['de']);
    expect(await keys('δ?')).toEqual(['de']);
  });

  it('+ in Greek script is one or more of the item before', async () => {
    expect(await keys('λο+γος')).toEqual(['logos', 'loogos']);
    expect(await keys('λ+γος')).toEqual(['lgos']);
  });

  it('+ in Beta Code is the diaeresis, dropped by the fold', async () => {
    expect(await keys('lo+gos')).toEqual(['logos']);
  });

  it('[…] is one of its letters, Greek or Beta Code; [^…] any other letter', async () => {
    expect(await keys('log[ow]n')).toEqual(['logon', 'logwn']);
    expect(await keys('λογ[οω]ν')).toEqual(['logon', 'logwn']);
    expect(await keys('log[οω]n')).toEqual(['logon', 'logwn']);
    expect(await keys('λογ[^ο]ν')).toEqual(['logwn']);
    expect(await keys('log[^o]n')).toEqual(['logwn']);
    expect(await keys('δ[^ε]')).toEqual([]);
  });

  it('( ) and | in Greek script group and alternate', async () => {
    expect(await keys('λογ(ος|ου)')).toEqual(['logos', 'logou']);
    expect(await keys('λογος|αρετη')).toEqual(['areth', 'logos']);
    expect(await keys('(λ|κ)ογος')).toEqual(['logos']);
    // + repeats a single letter only, never a group.
    expect(await keys('λ(ο)+γος')).toEqual([]);
  });

  it('( ) and | in Beta Code are breathings and the iota subscript', async () => {
    expect(await keys('a)lla')).toEqual(['alla']);
    expect(await keys('tw=|')).toEqual(['tw']);
    expect(await keys('logos|areth')).toEqual([]);
    expect(await keys('lo/gos*')).toEqual(['logos']);
  });

  it('^ and $ mark the word edges, which a match always is', async () => {
    expect(await keys('^logos$')).toEqual(['logos']);
    expect(await keys('^λογο.$')).toEqual(['logon', 'logos', 'logou']);
    expect(await keys('^log')).toEqual([]);
  });

  it('an unbalanced pattern finds nothing and does not throw', async () => {
    expect(await keys('λογ[ος')).toEqual([]);
    expect(await keys('λογ(ος')).toEqual([]);
    expect(await keys('λογος)')).toEqual([]);
    expect(await keys('log[os')).toEqual([]);
    await expect(search('λογ[ος logos', '', 'any', 'all', 'and', [`TWild${n++}`], 'form'))
      .resolves.toMatchObject({ failedWorks: [] });
  });

  it('a pattern in lemma mode is matched over the keys, not resolved as a word', async () => {
    const { results } = await search('λογ(ος|ου)', '', 'all', 'all', 'and', [`TWild${n++}`], 'lemma');
    expect(results[0].grkPositions.map((p) => KEYS[p]).sort()).toEqual(['logos', 'logou']);
    const asked = vi.mocked(fetch).mock.calls.map(([u]) => String(u));
    expect(asked.some((u) => u.includes('lemma-map'))).toBe(false);
  });
});
