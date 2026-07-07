import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBook, fetchFootnotes, fetchLsjShard, lookupWord, lsjShard, parseBekker, resolveBekker } from '../lib/data';

function mockFetch(map: Record<string, unknown>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    const key = Object.keys(map).find((part) => String(url).includes(part));
    if (!key) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    return Promise.resolve({ ok: true, json: async () => map[key] } as Response);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { __ARISTOTLE_BOOK_HOOK__?: unknown }).__ARISTOTLE_BOOK_HOOK__;
});

describe('parseBekker and resolveBekker', () => {
  it.each([
    ['1097a15', { column: '1097a', line: 15 }],
    ['1097a 15', { column: '1097a', line: 15 }],
    ['1097A.15', { column: '1097a', line: 15 }],
    ['  1000b2  ', { column: '1000b', line: 2 }],
    ['not a citation', null],
    ['1097c15', null],
  ])('parses %s', (raw, expected) => {
    expect(parseBekker(raw)).toEqual(expected);
  });

  it('resolves columns and snaps shared-column gaps to the nearest book', () => {
    const columns = {
      '1097a': [{ book: 1, lo: 1, hi: 20 }],
      '1100b': [{ book: 1, lo: 1, hi: 8 }, { book: 2, lo: 14, hi: 20 }],
    };
    expect(resolveBekker(columns, '1097a', 10)).toBe(1);
    expect(resolveBekker(columns, '1100b', 4)).toBe(1);
    expect(resolveBekker(columns, '1100b', 12)).toBe(2);
    expect(resolveBekker(columns, '999a', 1)).toBeNull();
  });
});

describe('fetch and lookup helpers', () => {
  it('fetchBook returns JSON data and applies the runtime hook', async () => {
    mockFetch({
      'HookWork/book-01.json': { book: 1, segments: [] },
    });
    (globalThis as { __ARISTOTLE_BOOK_HOOK__?: unknown }).__ARISTOTLE_BOOK_HOOK__ = vi.fn((_work, _n, data) => ({
      ...data,
      segments: [{ id: 'hooked', column: '1a', greek: [], english: null }],
    }));

    await expect(fetchBook('HookWork', 1)).resolves.toMatchObject({
      book: 1,
      segments: [{ id: 'hooked' }],
    });
  });

  it('fetchFootnotes linkifies glossary references for EN only', async () => {
    mockFetch({
      'EN/footnotes.json': { '1': 'See Glossary, <em>hexis</em>.' },
      'DA/footnotes.json': { '1': 'See Glossary, <em>hexis</em>.' },
    });

    await expect(fetchFootnotes('EN')).resolves.toMatchObject({
      '1': expect.stringContaining('class="gloss-ref"'),
    });
    await expect(fetchFootnotes('DA')).resolves.toMatchObject({
      '1': 'See Glossary, <em>hexis</em>.',
    });
  });

  it('selects LSJ shards and de-duplicates lookupWord dictionary entries', async () => {
    mockFetch({
      'LookupWork/analyses.json': {
        logos: [
          { lemma: 'lo/gos', gloss: 'word', parse: 'noun', lsj: ['lo/gos', '*a)rxh/'] },
          { lemma: 'lo/gos', gloss: 'speech', parse: 'noun', lsj: ['lo/gos'] },
        ],
      },
      '/lsj/l.json': { 'lo/gos': { key: 'lo/gos', head: 'λόγος', html: '<p>word</p>' } },
      '/lsj/a.json': { '*a)rxh/': { key: '*a)rxh/', head: 'ἀρχή', html: '<p>beginning</p>' } },
    });

    expect(lsjShard('*a)rxh/')).toBe('a');
    expect(lsjShard('123')).toBe('_');
    const result = await lookupWord('LookupWork', 'logos');
    expect(result.analyses).toHaveLength(2);
    expect(result.lsj.map((e) => e.key)).toEqual(['lo/gos', '*a)rxh/']);
    await expect(fetchLsjShard('missing')).resolves.toEqual({});
  });
});
