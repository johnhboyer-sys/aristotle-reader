import { describe, expect, it } from 'vitest';
import type { SearchResult } from '../lib/search';
import { engHitCount, hitCount, paginate, stephanusPage } from '../lib/search-pages';

const r = (work: string, book: number, column: string, grk: number, eng: number[][] = []): SearchResult => ({
  work,
  meta: { id: `${book}:${column}`, book, column },
  grkMatch: grk > 0,
  engMatch: eng.length > 0,
  ...(eng.length ? { engHits: eng.map((positions, i) => ({ translation: i ? 'ross' : 'rackham', positions })) } : {}),
  grkPositions: Array.from({ length: grk }, (_, i) => i),
});
const ids = (pages: SearchResult[][]) => pages.map(p => p.map(x => `${x.work} ${x.meta.column}`));

describe('counting hits', () => {
  it('counts each Greek word and each English word in each translation', () => {
    expect(hitCount(r('EN', 1, '70a', 2, [[1, 4], [3]]))).toBe(5);
    expect(hitCount(r('EN', 1, '70a', 0, [[]]))).toBe(1);   // a bare * is one hit
    expect(engHitCount({ translation: 'rackham', positions: [] })).toBe(1);
  });

  it('counts a match of several words once, however many words it touches (John, 2026-11-11)', () => {
    // Running text, a phrase or a proximity window alike: each window is one.
    const several: SearchResult = { ...r('Pol', 1, '327a', 4), windows: [[0, 1], [2, 3]] };
    expect(hitCount(several)).toBe(2);
    // With no windows, each word is a hit.
    expect(hitCount({ ...several, windows: undefined })).toBe(4);
    // An English phrase: each run once.
    expect(engHitCount({ translation: 'rackham', positions: [0, 1, 5, 6], matches: [0, 5] })).toBe(2);
    // Three one-match, two-word results at page size 3: one page by matches
    // (3), where counting words (6) would make two.
    const one = (column: string): SearchResult =>
      ({ ...r('Pol', 1, column, 2), windows: [[0, 1]] });
    expect(ids(paginate([one('327a'), one('328a'), one('329a')], 3)))
      .toEqual([['Pol 327a', 'Pol 328a', 'Pol 329a']]);
  });

  it('reads the Stephanus page off a section', () => {
    expect(stephanusPage('70a')).toBe(70);
    expect(stephanusPage('327e')).toBe(327);
  });
});

describe('paginate', () => {
  it('breaks only between Stephanus pages, never inside one', () => {
    const pages = paginate([
      r('EN', 1, '70a', 2), r('EN', 1, '70e', 2),   // page 70: 4 hits
      r('EN', 1, '71a', 3),                            // page 71: 3 hits
    ], 4);
    expect(ids(pages)).toEqual([['EN 70a', 'EN 70e'], ['EN 71a']]);
  });

  it('puts small pages together, and lets one big page stand alone', () => {
    const pages = paginate([
      r('EN', 1, '70a', 1), r('EN', 1, '71a', 1), r('EN', 1, '72a', 9), r('EN', 1, '73a', 1),
    ], 4);
    expect(ids(pages)).toEqual([['EN 70a', 'EN 71a'], ['EN 72a'], ['EN 73a']]);
  });

  it('counts English hits toward page size', () => {
    const pages = paginate([r('EN', 1, '70a', 0, [[1, 2], [5]]), r('EN', 1, '71a', 1)], 3);
    expect(ids(pages)).toEqual([['EN 70a'], ['EN 71a']]);
  });

  it('runs pages in corpus order: work, then book, then page', () => {
    // Int precedes EN in the tetralogies; Pol II follows Pol I.
    const pages = paginate([
      r('EN', 1, '70a', 1), r('Pol', 2, '357a', 1), r('Int', 1, '43a', 1), r('Pol', 1, '354a', 1),
    ], 1);
    expect(ids(pages)).toEqual([['Int 43a'], ['EN 70a'], ['Pol 354a'], ['Pol 357a']]);
  });

  it('makes no pages of no results', () => {
    expect(paginate([], 40)).toEqual([]);
  });
});
