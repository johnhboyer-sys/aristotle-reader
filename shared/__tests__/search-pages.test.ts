import { describe, expect, it } from 'vitest';
import type { Offsets, SearchResult } from '../lib/search';
import { engHitCount, hitCount, paginate } from '../lib/search-pages';

function result(work: string, book: number, column: string, grk: number[], eng?: number[][]): SearchResult {
  return {
    work,
    meta: { id: `${book}:${column}`, book, column },
    grkMatch: grk.length > 0,
    engMatch: !!eng?.length,
    ...(eng ? { engHits: eng.map((positions, i) => ({ translation: `t${i}`, positions })) } : {}),
    grkPositions: grk,
  };
}

// One book of four 100-token columns. Chapter 1 runs from 0, chapter 2 from
// 150 (half way down the second column), chapter 3 from 300 (the fourth).
const COLUMNS = ['164a', '164b', '165a', '165b'];
const offsets: Offsets = {
  token_count: 400,
  seg_base_offset: [0, 100, 200, 300],
  segments: COLUMNS.map(column => ({ book: 1, column, line_runs: [[1, 100]] })),
  book_bounds: [{ book: 1, start: 0 }],
  chapter_bounds: [
    { book: 1, chapter: '1', start: 0, accuracy: 'exact' },
    { book: 1, chapter: '2', start: 150, accuracy: 'exact' },
    { book: 1, chapter: '3', start: 300, accuracy: 'exact' },
  ],
};
const chapterOf = (column: string, pos: number) => {
  const g = offsets.seg_base_offset[COLUMNS.indexOf(column)] + pos;
  return g >= 300 ? '3' : g >= 150 ? '2' : '1';
};
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

describe('hitCount', () => {
  it('counts every Greek word matched', () => {
    expect(hitCount(result('SE', 1, '164a', [1, 5, 9]))).toBe(3);
  });

  it('counts every English word matched, in each translation', () => {
    // "logos" twice in one translation and once in another: three hits, not two.
    expect(hitCount(result('SE', 1, '164a', [], [[3, 40], [7]]))).toBe(3);
    expect(hitCount(result('SE', 1, '164a', [2], [[3, 40]]))).toBe(3);
  });

  it('counts a match without word positions once', () => {
    expect(engHitCount({ translation: 't', positions: [] })).toBe(1);
    expect(hitCount(result('SE', 1, '164a', [], [[]]))).toBe(1);
    const legacy = { ...result('SE', 1, '164a', []), engMatch: true };
    expect(hitCount(legacy)).toBe(1);
  });

  it('counts nothing for English the filter set aside', () => {
    expect(hitCount({ ...result('SE', 1, '164a', [0]), engMatch: false, engHits: [] })).toBe(1);
  });
});

describe('paginate', () => {
  // Every Greek hit, the page that shows it, and its chapter.
  function placed(results: SearchResult[], target: number) {
    const laid = paginate(results, new Map([['SE', offsets]]), target);
    const shown: { chapter: string; page: number }[] = [];
    for (const r of results) {
      for (const p of r.grkPositions) {
        const chapter = chapterOf(r.meta.column, p);
        const page = laid.pageOf(r, chapter);
        // The page that shows a hit has the passage in its slice to show.
        expect(laid.pages[page]).toContain(r);
        shown.push({ chapter, page });
      }
    }
    return { laid, shown };
  }

  it('breaks pages between chapters, never inside one', () => {
    // 50 hits a column, 200 in all: the case that put a whole book on a page.
    const results = COLUMNS.map(c => result('SE', 1, c, range(0, 100).filter(i => i % 2 === 0)));
    const { laid, shown } = placed(results, 40);
    expect(shown).toHaveLength(200);
    expect(laid.pages.length).toBe(3);   // one chapter a page: 75, 75, 50 hits
    const pagesOf = new Map<string, Set<number>>();
    for (const { chapter, page } of shown) {
      (pagesOf.get(chapter) ?? pagesOf.set(chapter, new Set()).get(chapter)!).add(page);
    }
    expect([...pagesOf.values()].map(s => s.size)).toEqual([1, 1, 1]);
  });

  it('puts small chapters together on one page', () => {
    const results = [result('SE', 1, '164a', [1, 2]), result('SE', 1, '164b', [60, 70]), result('SE', 1, '165b', [5])];
    const { laid, shown } = placed(results, 40);
    expect(laid.pages).toHaveLength(1);
    expect(shown.map(s => s.page)).toEqual([0, 0, 0, 0, 0]);
  });

  it('shows a passage that spans two chapters on both pages, each hit once', () => {
    // 164b holds the end of chapter 1 and the start of chapter 2.
    const results = [
      result('SE', 1, '164a', range(0, 30)),
      result('SE', 1, '164b', [10, 20, 60, 70]),
      result('SE', 1, '165a', range(0, 30)),
    ];
    const { laid, shown } = placed(results, 40);
    expect(laid.pages).toHaveLength(2);
    expect(laid.pages[0]).toContain(results[1]);
    expect(laid.pages[1]).toContain(results[1]);
    expect(shown.filter(s => s.chapter === '1').every(s => s.page === 0)).toBe(true);
    expect(shown.filter(s => s.chapter === '2').every(s => s.page === 1)).toBe(true);
  });

  it('puts a chapter the offsets do not name on the page where the section opens', () => {
    const r = result('SE', 1, '164b', [60]);   // chapter 2
    const laid = paginate([result('SE', 1, '164a', range(0, 40)), r], new Map([['SE', offsets]]), 40);
    expect(laid.pages).toHaveLength(2);
    // 164b opens in chapter 1, so its first page is the first.
    expect(laid.pageOf(r, '—')).toBe(0);
    expect(laid.pageOf(r, '2')).toBe(1);
    expect(laid.pages[1]).toContain(r);
    // Its one hit is chapter 2's: the first page has nothing of it to show.
    expect(laid.pages[0]).not.toContain(r);
  });

  it('shows an English hit a translation places one chapter past its column on that chapter\'s page', () => {
    // 164a is all chapter 1 in the Greek, but a translation's slice there can
    // run into chapter 2, which starts the next page: its chapter 2 begins at
    // word 2 (eng-chapters.json).
    const r = result('SE', 1, '164a', [], [[3]]);
    const results = [result('SE', 1, '164a', range(0, 39)), r, result('SE', 1, '164b', [60])];
    const laid = paginate(results, new Map([['SE', offsets]]), 40, new Map([['SE', { english: { '0': [[2, '2']] } }]]));
    expect(laid.pages).toHaveLength(2);
    expect(laid.pageOf(r, '2')).toBe(1);
    expect(laid.pages[1]).toContain(r);
    expect(laid.pages[0]).not.toContain(r);
    expect(laid.pageOf(r, '1')).toBe(0);
  });

  it('lays a work without offsets out by whole books', () => {
    const results = COLUMNS.map(c => result('SE', 1, c, range(0, 30)));
    const laid = paginate(results, new Map([['SE', null]]), 40);
    expect(laid.pages).toHaveLength(1);
    expect(laid.pages[0]).toHaveLength(4);
    expect(results.every(r => laid.pageOf(r, '2') === 0)).toBe(true);
  });

  it('counts English hits toward page size', () => {
    const results = [
      result('SE', 1, '164a', [], [range(0, 30), range(0, 30)]),
      result('SE', 1, '165b', [], [[1]]),
    ];
    const laid = paginate(results, new Map([['SE', offsets]]), 40);
    expect(laid.pages).toHaveLength(2);
  });

  it('runs pages in corpus order, across works', () => {
    const results = [result('EN', 1, '1094a', [1]), result('SE', 1, '164a', [1])];
    const laid = paginate(results, new Map(), 1);
    // The Sophistical Refutations comes before the Ethics in the corpus.
    expect(laid.pages.map(p => p[0].work)).toEqual(['SE', 'EN']);
  });

  it('makes no pages of no results', () => {
    expect(paginate([], new Map(), 40).pages).toEqual([]);
  });
});

// Page 67 of the Both search ἀρετή + virtue drew nothing (16 Nov). Politics
// 1276b opens in III 3 and its English hits all fall in III 4: the pages
// counted them in III 3, where the column begins, and the page drew them in
// III 4, so III 3 had a page to itself with nothing on it. A hit must be
// counted in the chapter it is drawn in, and every page must draw something.
describe('paginate: a hit is counted where it is drawn', () => {
  // 164b's English: words 0–9 end chapter 1; chapter 2 begins at word 10.
  const eng = new Map([['SE', { english: { '1': [[10, '2']] as [number, string][] } }]]);
  const pageHits = (laid: ReturnType<typeof paginate>, results: SearchResult[]) =>
    laid.pages.map((_, i) => results.flatMap(r => [
      ...r.grkPositions.map(p => chapterOf(r.meta.column, p)),
      ...(r.engHits ?? []).flatMap(h => h.positions.map(w => (w >= 10 ? '2' : '1'))),
    ].filter(ch => laid.pageOf(r, ch) === i)).length);

  it('draws something on every page when a column\'s English falls past its chapter', () => {
    // Chapter 1 has no hit of its own: 164b opens in it, but its English
    // hits are all chapter 2's.
    const results = [
      result('SE', 1, '164b', [], [range(10, 30)]),
      result('SE', 1, '165a', range(0, 30)),
    ];
    const laid = paginate(results, new Map([['SE', offsets]]), 40, eng);
    expect(pageHits(laid, results)).toEqual([50]);
    expect(laid.pageOf(results[0], '2')).toBe(laid.pageOf(results[1], '2'));
  });
});
