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

async function open(query: string) {
  const { fetchBook, fetchChapters } = await import('../lib/data');
  const { search } = await import('../lib/search');
  vi.mocked(fetchBook).mockResolvedValue(BOOK);
  vi.mocked(fetchChapters).mockResolvedValue({ '1': COLUMNS.map(column => ({ column, chapter: '1', line: '1', bekker: column })) });
  vi.mocked(search).mockResolvedValue({ results: RESULTS, failedWorks: [] });
  window.history.replaceState(null, '', `/search?e=virtue&t=rackham${query}`);
  const page = render(Search);
  await vi.waitFor(() => expect(page.container.querySelector('li.instance')).not.toBeNull());
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
  expect([...c.querySelectorAll('li.instance .inst-en')].map(text).every(t => /Moral virtue/.test(t))).toBe(true);
  // Named among the filters chosen, with the way back.
  const chosen = screen.queryByRole('group', { name: 'This search' }) ?? (await fireEvent.click(screen.getByRole('button', { name: /^Filter/ })), await screen.findByRole('group', { name: 'This search' }));
  expect(within(chosen).getByRole('button', { name: 'Remove 1 phrase set aside' })).toBeInTheDocument();
  if (screen.queryByRole('dialog', { name: 'Filter' })) await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await fireEvent.click(within(list()).getByRole('button', { name: 'Clear' }));
  await vi.waitFor(() => expect(status()).toContain('12 hits'));
  expect(new URLSearchParams(window.location.search).get('xp')).toBeNull();
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
