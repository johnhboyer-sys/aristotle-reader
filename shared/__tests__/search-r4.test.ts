import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, GreekLine } from '../lib/data';
import type { SearchResult } from '../lib/search';

vi.mock('../lib/search', async original => ({
  ...await original<typeof import('../lib/search')>(),
  search: vi.fn(), loadOffsets: vi.fn(async () => null),
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

// Pages are rows now (John, 16 Nov): the two chapters' rows, one page.
it('keeps overlapping passages in their chapters', async () => {
  const { loadOffsets } = await import('../lib/search');
  vi.mocked(loadOffsets).mockResolvedValue({ token_count: 22, seg_base_offset: [0],
    segments: [{ book: 1, column: '70a', line_runs: Array.from({ length: 22 }, (_, i) => [i + 1, 1]) }],
    book_bounds: [{ book: 1, start: 0 }], chapter_bounds: [
      { book: 1, chapter: '1', start: 0, accuracy: 'exact' },
      { book: 1, chapter: '2', start: 20, accuracy: 'exact' },
    ] });
  const c = await open(bookOf(...Array.from({ length: 22 }, (_, i) => line(i + 1, 'α'))),
    [hit('70a', Array.from({ length: 22 }, (_, i) => i))], '&ps=20');
  await vi.waitFor(() => expect([...c.querySelectorAll('.run-heading')].map(h =>
    [text(h.querySelector('.sx-chap')), h.nextElementSibling!.querySelectorAll('.inst-snippet.greek mark').length]))
    .toEqual([['Chapter 1', 20], ['Chapter 2', 2]]));
  expect(c.querySelector('.pager-bottom')).toBeNull();
});

it.each([false, true])('keeps proximity windows separate with aligned Greek=%s', async aligned => {
  const book = bookOf(line(1, 'α β γ δ'));
  if (aligned) book.segments[0].english!.bekker = [{ n: 1, offset: 0, real: true }];
  const c = await open(book, [hit('70a', [0, 1, 2, 3], [[0, 1], [2, 3]])]);
  expect(c.querySelectorAll('li.instance')).toHaveLength(2);
  expect([...c.querySelectorAll('.inst-ref')].map(text)).toEqual(['70a1', '70a1']);
});

it('counts each form in a mixed merge for Commonest form first', async () => {
  const book = bookOf(line(1, 'α β β β'));
  for (const column of ['70b', '70c']) book.segments.push({ ...bookOf(line(1, 'β')).segments[0], id: `1:${column}`, column });
  const c = await open(book, [hit('70a', [0, 1, 2, 3]), hit('70b', [0]), hit('70c', [0])], '&so=freq');
  expect([...c.querySelectorAll('.inst-ref')].map(text)).toEqual(['70b1', '70c1', '70a1']);
});

// Ruled 13 Nov: a group is headed by one spelling, its commonest; a tie goes
// to the first met. A merged passage counts each spelling it holds.
it('heads a merged passage holding one form with one spelling, its commonest', async () => {
  const c = await open(bookOf(line(1, 'ἐστί ἐστι')), [hit('70a', [0, 1])], '&v=form');
  expect(text(c.querySelector('.group-label'))).toBe('ἐστί');
});
it('counts a grave as the acute when it heads a group', async () => {
  const c = await open(bookOf(line(1, 'ἐστι ἐστί ἐστὶ')), [hit('70a', [0, 1, 2])], '&v=form');
  expect([...c.querySelectorAll('.group-label')].map(text)).toEqual(['ἐστί']);
});

it('gives pager arrows 44px targets and keeps the glyph and status in place', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles/b-search.css'), 'utf8');
  const rule = (name: string) => css.match(new RegExp(`\\.search-page \\.${name} \\{([^}]+)\\}`))![1];
  expect(rule('pager-btn')).toMatch(/min-width:\s*44px/);
  expect(rule('pager-btn')).toMatch(/height:\s*44px/);
  expect(rule('pager-arrow')).toMatch(/width:\s*10px; height:\s*10px/);
  // Each button grows outwards by 12px; its inner edge stays beside the status.
  expect(css).toMatch(/\.pager-btn:first-child\s*\{[^}]*margin-left:\s*-12px/);
  expect(css).toMatch(/\.pager-next\s*\{[^}]*margin-right:\s*-12px/);
});
