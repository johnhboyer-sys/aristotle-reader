import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { greekProvider, lsjShardLetter } from '../provider';

// Synthetic fixture served over a mocked fetch — mirrors the dev-middleware
// URL shape (/corpus/<workId>/analyses.json, /corpus/lsj/<letter>.json).
// isTauri() is false under vitest's node environment (no __TAURI_INTERNALS__
// on globalThis), so greekProvider always takes the fetch path here.

const ANALYSES: Record<string, unknown> = {
  'pa/ntes': [
    { lemma: 'pa=s', gloss: 'all', parse: 'masc nom/voc pl', lsj: ['pa=s1'] },
  ],
  // A capitalized proper name stored lowercase (matches the real pipeline's
  // convention — see greekToBeta.ts header on the fallback chain).
  'a)nacago/ras': [
    { lemma: 'a)nacago/ras', gloss: 'Anaxagoras', parse: 'masc nom sg', lsj: ['*)anacago/ras'] },
  ],
  // Stored with the enclitic-stripped single accent; running text carries two.
  'e(/kaston': [
    { lemma: 'e(/kastos', gloss: 'each', parse: 'neut nom/voc/acc sg', lsj: ['e(/kastos'] },
  ],
};

const LSJ_P: Record<string, unknown> = {
  'pa=s1': { key: 'pa=s1', head: 'πᾶς', html: '<span class="lsj-head">πᾶς</span> all' },
};
const LSJ_A: Record<string, unknown> = {
  '*)anacago/ras': { key: '*)anacago/ras', head: 'Ἀναξαγόρας', html: '<span class="lsj-head">Ἀναξαγόρας</span> Anaxagoras' },
};
const LSJ_E: Record<string, unknown> = {
  'e(/kastos': { key: 'e(/kastos', head: 'ἕκαστος', html: '<span class="lsj-head">ἕκαστος</span> each' },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function installFetchMock() {
  const routes: Record<string, unknown> = {
    '/corpus/meta/analyses.json': ANALYSES,
    '/corpus/lsj/p.json': LSJ_P,
    '/corpus/lsj/a.json': LSJ_A,
    '/corpus/lsj/e.json': LSJ_E,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url in routes) return jsonResponse(routes[url]);
      return new Response('not found', { status: 404 });
    }),
  );
}

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lsjShardLetter', () => {
  it('picks the first Latin letter, skipping a leading capital marker', () => {
    expect(lsjShardLetter('pa=s1')).toBe('p');
    expect(lsjShardLetter('*)anacago/ras')).toBe('a');
  });

  it('falls back to "_" when no Latin letter is present', () => {
    expect(lsjShardLetter(')(=/|')).toBe('_');
  });
});

describe('greekProvider(workId).lookup', () => {
  it('looks up a plain word by encoding it to its Beta key', async () => {
    const result = await greekProvider('meta').lookup('Πάντες');
    expect(result.analyses).toHaveLength(1);
    expect(result.analyses[0].gloss).toBe('all');
    expect(result.analyses[0].lemmaDisplay).toBe('πᾶς');
    expect(result.lsjEntries).toHaveLength(1);
    expect(result.lsjEntries[0].head).toBe('πᾶς');
  });

  it('falls back through the capital-marker variant for a capitalized word', async () => {
    // "Ἀναξαγόραν" would encode with a leading "*" the dictionary key lacks.
    const result = await greekProvider('meta').lookup('Ἀναξαγόρας');
    expect(result.analyses).toHaveLength(1);
    expect(result.analyses[0].gloss).toBe('Anaxagoras');
    expect(result.lsjEntries[0].head).toBe('Ἀναξαγόρας');
  });

  it('falls back through the extra-accent variant for an enclitic-accented word', async () => {
    // ἕκαστόν encodes to "e(/kasto/n" (two accents); the dictionary key is
    // the single-accent "e(/kaston" — only resolves via dropExtraAccent().
    const result = await greekProvider('meta').lookup('ἕκαστόν');
    expect(result.analyses).toHaveLength(1);
    expect(result.analyses[0].gloss).toBe('each');
  });

  it('returns an empty result for a word with no analysis entry, never throws', async () => {
    const result = await greekProvider('meta').lookup('ζζζζζ');
    expect(result).toEqual({ analyses: [], lsjEntries: [] });
  });

  it('returns an empty result (not an error) when the corpus has no analyses.json', async () => {
    const result = await greekProvider('nonexistent-work').lookup('Πάντες');
    expect(result).toEqual({ analyses: [], lsjEntries: [] });
  });

  it('returns an empty result for blank input', async () => {
    const result = await greekProvider('meta').lookup('   ');
    expect(result).toEqual({ analyses: [], lsjEntries: [] });
  });
});
