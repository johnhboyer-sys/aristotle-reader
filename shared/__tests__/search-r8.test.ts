// Findings of Codex's review R8 of the search build (whole branch): pages hold
// what chapter-pages assigns in every Context; a proximity instance shows
// every term of its window; and only the latest page render writes.
import { fireEvent, render, within } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, GreekLine } from '../lib/data';
import type { SearchResult } from '../lib/search';

vi.mock('../lib/search', async original => ({
  ...await original<typeof import('../lib/search')>(),
  search: vi.fn(), loadOffsets: vi.fn(async () => null),
  loadEngChapters: vi.fn(async () => { throw new Error('none'); }),
  greekHitForms: vi.fn(async () => ({ byResult: new Map(), headwords: new Map(), failedWorks: [] })),
  speakerRoster: vi.fn(async () => []),
}));
vi.mock('../lib/data', async original => ({
  ...await original<typeof import('../lib/data')>(),
  fetchBook: vi.fn(), fetchChapters: vi.fn(),
}));
afterEach(() => { vi.resetAllMocks(); window.history.replaceState(null, '', '/'); });
const line = (n: number, text: string): GreekLine => ({ n, text,
  tokens: [...text.matchAll(/\S+/g)].map(m => ({ t: m[0], o: m.index!, k: m[0] })) });
const hit = (column: string, positions: number[], windows?: number[][]): SearchResult => ({
  work: 'EN', meta: { id: `1:${column}`, book: 1, column }, grkMatch: true, engMatch: false,
  grkPositions: positions, ...(windows ? { windows } : {}),
});
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();
async function open(book: BookData, results: SearchResult[], query = '') {
  const { fetchBook, fetchChapters } = await import('../lib/data');
  const { search } = await import('../lib/search');
  vi.mocked(fetchBook).mockResolvedValue(book);
  vi.mocked(fetchChapters).mockResolvedValue({ '1': [{ column: '70a', chapter: '1', line: '1', bekker: '70a' }, { column: '70a', chapter: '2', line: '21', bekker: '70a' }] });
  vi.mocked(search).mockResolvedValue({ results, failedWorks: [] });
  window.history.replaceState(null, '', `/search?g=α${query}`);
  const page = render(Search);
  await vi.waitFor(() => expect(page.container.querySelector('li.instance')).not.toBeNull());
  return page.container;
}
const bookOf = (...greek: GreekLine[]): BookData => ({ book: 1, segments: [{
  id: '1:70a', column: '70a', greek,
  english: { text: 'One two three.', notes: [], markers: [] },
}] });

// Finding 3: a section that runs over a chapter break. Each chapter shows its
// own hits, Whole section included. Pages are rows now (John, 16 Nov), and the
// two chapters' rows are one page.
const marksByChapter = (c: Element) => [...c.querySelectorAll('.run-heading')].map(h =>
  [text(h.querySelector('.sx-chap')), h.nextElementSibling!.querySelectorAll('li.instance .greek mark').length]);
it.each(['3', '1', 's'])('holds each chapter to its hits at Context %s', async ctx => {
  const { loadOffsets } = await import('../lib/search');
  vi.mocked(loadOffsets).mockResolvedValue({ token_count: 22, seg_base_offset: [0],
    segments: [{ book: 1, column: '70a', line_runs: Array.from({ length: 22 }, (_, i) => [i + 1, 1]) }],
    book_bounds: [{ book: 1, start: 0 }], chapter_bounds: [
      { book: 1, chapter: '1', start: 0, accuracy: 'exact' },
      { book: 1, chapter: '2', start: 20, accuracy: 'exact' },
    ] } as never);
  const c = await open(bookOf(...Array.from({ length: 22 }, (_, i) => line(i + 1, 'α'))),
    [hit('70a', Array.from({ length: 22 }, (_, i) => i))], `&ps=20&ctx=${ctx}`);
  await vi.waitFor(() => expect(marksByChapter(c)).toEqual([['Chapter 1', 20], ['Chapter 2', 2]]));
  expect(c.querySelector('.pager-bottom')).toBeNull();
});

it('marks only the current chapter’s English hits under Whole section', async () => {
  const { loadOffsets, loadEngChapters } = await import('../lib/search');
  // Chapters now place an English word by the work's eng-chapters.json (John,
  // 15-16 Nov); 'One' is word 0 of chapter 1, 'two' word 1, the start of chapter 2.
  vi.mocked(loadEngChapters).mockResolvedValue({ english: { '0': [[0, '1'], [1, '2']] } });
  vi.mocked(loadOffsets).mockResolvedValue({ token_count: 22, seg_base_offset: [0],
    segments: [{ book: 1, column: '70a', line_runs: Array.from({ length: 22 }, (_, i) => [i + 1, 1]) }],
    book_bounds: [{ book: 1, start: 0 }], chapter_bounds: [
      { book: 1, chapter: '1', start: 0, accuracy: 'exact' },
      { book: 1, chapter: '2', start: 20, accuracy: 'exact' },
    ] } as never);
  const book = bookOf(...Array.from({ length: 22 }, (_, i) => line(i + 1, 'α')));
  book.segments[0].english!.bekker = [{ n: 1, offset: 0, real: true }, { n: 21, offset: 4, real: true }];
  const result = { ...hit('70a', Array.from({ length: 22 }, (_, i) => i)), engMatch: true,
    engHits: [{ translation: 'rackham', positions: [0, 1] }] };
  const c = await open(book, [result], '&e=one%20two&ps=20&ctx=s');
  const englishMarks = () => [...c.querySelectorAll('.run-heading')].map(h =>
    [text(h.querySelector('.sx-chap')), [...h.nextElementSibling!.querySelectorAll('li.instance .inst-en mark')].map(text)]);
  await vi.waitFor(() => expect(marksByChapter(c)).toEqual([['Chapter 1', 20], ['Chapter 2', 2]]));
  expect(englishMarks()).toEqual([['Chapter 1', ['One']], ['Chapter 2', ['two']]]);
});

// Finding 4: a proximity window whose terms stand lines apart, in a section
// with Bekker-aligned English (where the hit is drawn by whole lines). The
// snippet widens to the window; no partner is cut.
const lines = (n: number, from = 1) => Array.from({ length: n }, (_, i) => line(from + i, 'α β'));
it.each(['1', '3'])('shows every term of a proximity window at Context %s', async ctx => {
  const book = bookOf(...lines(8));
  book.segments[0].english!.bekker = [{ n: 1, offset: 0, real: true }];
  // α on line 1 and β on line 7: tokens 0 and 13.
  const c = await open(book, [hit('70a', [0, 13], [[0, 13]])], `&ctx=${ctx}`);
  const inst = c.querySelector('li.instance')!;
  await vi.waitFor(() => expect(inst.querySelectorAll('.greek mark')).toHaveLength(2));
  expect(c.querySelectorAll('li.instance')).toHaveLength(1);
});

it('shows a partner that falls in the next section', async () => {
  const book = bookOf(...lines(3));
  book.segments[0].english!.bekker = [{ n: 1, offset: 0, real: true }];
  book.segments.push({ id: '1:70b', column: '70b', greek: lines(3, 4), english: { text: 'Four.', notes: [], markers: [], bekker: [{ n: 4, offset: 0, real: true }] } } as never);
  // α on 70a1 and β on 70b5: tokens 0 and 9 counted on from 70a.
  const c = await open(book, [hit('70a', [0, 9], [[0, 9]])], '&ctx=1');
  const inst = c.querySelector('li.instance')!;
  await vi.waitFor(() => expect(inst.querySelectorAll('.greek mark')).toHaveLength(2));
});

// Finding 6: two renders of the page in flight, the first slow. Only the
// latest writes: the first, finishing last, must not draw over it.
it('lets only the latest render of the page write', async () => {
  const c = await open(bookOf(line(1, 'α β')), [hit('70a', [0])]);
  const { fetchBook } = await import('../lib/data');
  let release!: (b: BookData) => void;
  vi.mocked(fetchBook).mockImplementationOnce(() => new Promise(r => { release = r; }));
  const choose = async (label: string) => {
    const radio = within(c.querySelector('.sx-display') ?? c).getByRole('radio', { name: label });
    await fireEvent.click(radio);
  };
  await choose('Whole section');   // slow: its book is held back
  await choose('1 line');          // fast
  await vi.waitFor(() => expect(text(c.querySelector('li.instance .greek'))).toContain('α'));
  release(bookOf(line(1, 'ω ψ')));
  await new Promise(r => setTimeout(r, 20));
  expect(text(c.querySelector('li.instance .greek'))).toContain('α');
  expect(text(c.querySelector('li.instance .greek'))).not.toContain('ω');
});
