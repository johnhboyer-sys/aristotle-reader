import { describe, expect, it } from 'vitest';
import type { Offsets, SearchResult } from '../lib/search';
import { chapterJoin, chapterPlaces, measure } from '../lib/chapter-pages';

// One book of two 100-token sections; chapter 2 begins at token 105, five
// words into 164b. The main translation's chapter 2 begins at word 3 of 164b.
const offsets: Offsets = {
  token_count: 200,
  seg_base_offset: [0, 100],
  segments: ['164a', '164b'].map(column => ({ book: 1, column, line_runs: [[1, 100]] })),
  book_bounds: [{ book: 1, start: 0 }],
  chapter_bounds: [
    { book: 1, chapter: '1', start: 0, accuracy: 'exact' },
    { book: 1, chapter: '2', start: 105, accuracy: 'exact' },
  ],
};
const places = chapterPlaces(new Map([['SE', offsets]]), new Map([['SE', { english: { '1': [[3, '2']] } }]]));
const res = (column: string, grk: number[], eng?: number[], extra: Partial<SearchResult> = {}): SearchResult => ({
  work: 'SE', meta: { id: `1:${column}`, book: 1, column },
  grkMatch: grk.length > 0, engMatch: !!eng, grkPositions: grk,
  ...(eng ? { engHits: [{ translation: 'english', positions: eng }] } : {}), ...extra,
});

describe('chapterJoin: both terms anywhere in one chapter', () => {
  it('keeps a chapter with both, wherever in it they fall, and drops one with only one', () => {
    // 164a: Greek in chapter 1; 164b: English word 5 in chapter 2, Greek 10 in chapter 2.
    const results = [res('164a', [4]), res('164b', [10], [5])];
    const out = chapterJoin(results, places);
    expect(out).toHaveLength(1);
    expect(out[0].grkPositions).toEqual([10]);
    expect(measure(out, places)).toMatchObject({ chapters: 1, both: 1, grkHits: 1, engHits: 1 });
  });

  it('keeps a window whole or not at all, by the chapter of its first word', () => {
    // Windows [4,5] (chapter 1, by word 4) and [5,6] (chapter 2) share word 5;
    // only chapter 2 has English. The first must not survive as [5].
    const r = res('164b', [4, 5, 6], [8], { windows: [[4, 5], [5, 6]] });
    const [out] = chapterJoin([r], places);
    expect(out.windows).toEqual([[5, 6]]);
    expect(out.grkPositions).toEqual([5, 6]);
  });

  it('drops a match with no translation named when its chapter has no Greek', () => {
    // engMatch with no engHits stands at its section's head: 164b opens in chapter 1.
    const out = chapterJoin([res('164b', [10], undefined, { engMatch: true })], places);
    expect(out).toEqual([]);
  });

  it('counts each translation\'s words where that translation puts them', () => {
    // Word 2 is chapter 1's, word 3 chapter 2's.
    expect(measure([res('164b', [], [2, 3])], places)).toMatchObject({ chapters: 2, engOnly: 2, engHits: 2 });
  });
});
