// The English phrase list (John, 16 Nov): three-word runs around the hits,
// five hits or more, each set aside by a tick; every count follows, the rows
// keep their places, and the address keeps what is set aside.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData } from '../lib/data';
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

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
// Twelve sections of the Ethics, Rackham's English: six "in virtue of", six "moral virtue".
const IN = 'He acts in virtue of the soul.';
const MORAL = 'Moral virtue is the best.';
const COLUMNS = Array.from({ length: 12 }, (_, i) => `70${String.fromCharCode(97 + i)}`);
const BOOK: BookData = { book: 1, segments: COLUMNS.map((column, i) => ({
  id: `1:${column}`, column, greek: [{ n: 1, text: 'α', tokens: [{ t: 'α', o: 0, k: 'α' }] }],
  english: { text: i < 6 ? IN : MORAL, notes: [], markers: [], bekker: [{ n: 1, offset: 0, real: true }] },
})) };
const RESULTS: SearchResult[] = COLUMNS.map((column, i) => ({
  work: 'EN', meta: { id: `1:${column}`, book: 1, column }, grkMatch: false, engMatch: true, grkPositions: [],
  engHits: [{ translation: 'rackham', positions: [i < 6 ? 3 : 1] }],
}));

async function open(query: string, book = BOOK, results = RESULTS, eng = 'virtue', show = true) {
  const { fetchBook, fetchChapters } = await import('../lib/data');
  const { search } = await import('../lib/search');
  vi.mocked(fetchBook).mockResolvedValue(book);
  vi.mocked(fetchChapters).mockResolvedValue({ '1': COLUMNS.map(column => ({ column, chapter: '1', line: '1', bekker: column })) });
  vi.mocked(search).mockResolvedValue({ results, failedWorks: [] });
  window.history.replaceState(null, '', `/search?e=${encodeURIComponent(eng)}&t=rackham${query}`);
  const page = render(Search);
  await vi.waitFor(() => expect(page.container.querySelector('li.instance')).not.toBeNull());
  // The list's words are read when it is opened (John, 17 Nov).
  const opener = [...page.container.querySelectorAll('.sx-phr button')].find(b => b.textContent === 'Show');
  if (show && opener) await fireEvent.click(opener);
  return page.container;
}
const list = () => screen.getByRole('group', { name: 'English phrases' });
const rows = () => [...list().querySelectorAll('label.fx')].map(l =>
  `${text(l.querySelector('.ph-t'))} ${text(l.querySelector('small'))}${(l.querySelector('input') as HTMLInputElement).checked ? ' x' : ''}`);
const status = () => text(screen.getByRole('status'));

it('lists the three-word runs around the hits, five or more, most first then A–Z', async () => {
  await open('');
  await vi.waitFor(() => expect(rows()).toEqual([
    'acts in virtue 6', 'in virtue of 6', 'moral virtue is 6', 'virtue is the 6', 'virtue of the 6',
  ]));
  expect(status()).toContain('12 hits');
});

it('sets a phrase aside at a tick: its hits leave every count, the rows that overlap it fall, none moves', async () => {
  const c = await open('');
  await vi.waitFor(() => expect(rows()).toHaveLength(5));
  await fireEvent.click(within(list()).getByRole('checkbox', { name: 'Exclude in virtue of' }));
  await vi.waitFor(() => expect(status()).toContain('6 hits'));
  expect(rows()).toEqual([
    'acts in virtue 0', 'in virtue of 6 x', 'moral virtue is 6', 'virtue is the 6', 'virtue of the 0',
  ]);
  expect(new URLSearchParams(window.location.search).get('xp')).toBe('in virtue of');
  // The rows are drawn again once the count has moved.
  await vi.waitFor(() => {
    const shown = [...c.querySelectorAll('li.instance .inst-en')].map(text);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every(t => /Moral virtue/.test(t))).toBe(true);
  });
  // Named among the filters chosen, with the way back.
  const chosen = screen.queryByRole('group', { name: 'This search' }) ?? (await fireEvent.click(screen.getByRole('button', { name: /^Filter/ })), await screen.findByRole('group', { name: 'This search' }));
  expect(within(chosen).getByRole('button', { name: 'Remove 1 phrase set aside' })).toBeInTheDocument();
  if (screen.queryByRole('dialog', { name: 'Filter' })) await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await fireEvent.click(within(list()).getByRole('button', { name: 'Clear' }));
  await vi.waitFor(() => expect(status()).toContain('12 hits'));
  expect(new URLSearchParams(window.location.search).get('xp')).toBeNull();
});

it('reads no phrase until the list is opened', async () => {
  const { fetchBook } = await import('../lib/data');
  const c = await open('', BOOK, RESULTS, 'virtue', false);
  await new Promise(r => setTimeout(r, 50));
  const reads = vi.mocked(fetchBook).mock.calls.length;
  expect(c.querySelectorAll('.sx-phr label.fx')).toHaveLength(0);
  await fireEvent.click(within(list()).getByRole('button', { name: 'Show' }));
  await vi.waitFor(() => expect(rows()).toHaveLength(5));
  expect(vi.mocked(fetchBook).mock.calls.length).toBeGreaterThan(reads);
  expect(within(list()).queryByRole('button', { name: 'Show' })).toBeNull();
});

it('reads what the address sets aside before the first page is drawn', async () => {
  await open('&xp=in%20virtue%20of');
  await vi.waitFor(() => expect(status()).toContain('6 hits'));
  await vi.waitFor(() => expect(rows()).toContain('in virtue of 6 x'));
});

it('offers no list for an exact-phrase search', async () => {
  const c = await open('&em=phrase');
  await new Promise(r => setTimeout(r, 50));
  expect(c.querySelector('.sx-phr')).toBeNull();
});

// On the phone: the Filter button's badge counts a phrase set aside, and the
// sheet's menu opens the list on a screen of its own.
it('counts a phrase set aside on Filter, and opens the list from the sheet', async () => {
  await open('&xp=in%20virtue%20of');
  await vi.waitFor(() => expect(status()).toContain('6 hits'));
  // The translation chosen and the phrase set aside.
  expect(screen.getByRole('button', { name: /^Filter/ })).toHaveAccessibleName('Filter, 2 chosen');
  await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
  const sheet = await screen.findByRole('dialog', { name: 'Filter' });
  const nav = within(sheet).getByRole('button', { name: /^Phrases/ });
  expect(text(nav)).toBe('Phrases 1 set aside ›');
  await fireEvent.click(nav);
  await vi.waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Phrases' })).getByRole('group', { name: 'English phrases' })).toBeInTheDocument());
});

// Codex's review of C. Every section: "in virtue of" and "moral virtue" in one passage.
const bookOf = (english: string): BookData => ({ ...BOOK, segments: BOOK.segments.map(sg => ({ ...sg, english: { ...sg.english!, text: english } })) });
const resultsOf = (hit: (i: number) => { positions: number[]; matches?: number[] }): SearchResult[] => RESULTS.map((r, i) => ({ ...r, engHits: [{ translation: 'rackham', ...hit(i) }] }));

it('marks only the hits left where a row keeps one', async () => {
  // he acts in virtue(3) of the soul and moral virtue(9) too
  const c = await open('', bookOf('He acts in virtue of the soul and moral virtue too.'), resultsOf(() => ({ positions: [3, 9] })));
  await vi.waitFor(() => expect(status()).toContain('24 hits'));
  await vi.waitFor(() => expect(rows()).toContain('in virtue of 12'));
  const marks = () => [...c.querySelectorAll('li.instance .inst-en')].map(el => el.querySelectorAll('mark').length);
  expect(marks().every(n => n === 2)).toBe(true);
  await fireEvent.click(within(list()).getByRole('checkbox', { name: 'Exclude in virtue of' }));
  await vi.waitFor(() => expect(status()).toContain('12 hits'));
  await vi.waitFor(() => expect(marks().length && marks().every(n => n === 1)).toBe(true));
});

it('sets aside the words of a search with a term of several words', async () => {
  // he acts in virtue(3) of coming(5) to(6) be(7): "virtue" and "coming-to-be", each a run.
  await open('', bookOf('He acts in virtue of coming to be.'), resultsOf(() => ({ positions: [3, 5, 6, 7], matches: [3, 5] })), 'virtue coming-to-be');
  await vi.waitFor(() => expect(status()).toContain('24 hits'));
  await vi.waitFor(() => expect(rows()).toContain('in virtue of 12'));
  await fireEvent.click(within(list()).getByRole('checkbox', { name: 'Exclude in virtue of' }));
  await vi.waitFor(() => expect(status()).toContain('12 hits'));
});

// Codex's second look at C: a term of several words is one hit, at its first
// word, in the list as on the page.
it('counts a run of a term of several words once, at its first word', async () => {
  // he acts in virtue of coming(5) to(6) be(7)
  await open('', bookOf('He acts in virtue of coming to be.'), resultsOf(() => ({ positions: [5, 6, 7], matches: [5] })), 'coming-to-be');
  await vi.waitFor(() => expect(status()).toContain('12 hits'));
  await vi.waitFor(() => expect(rows()).toEqual(['coming to be 12', 'of coming to 12', 'virtue of coming 12']));
});
