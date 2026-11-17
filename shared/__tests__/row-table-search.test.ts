// The row table (lib/row-table) against the rows the page draws: each case
// runs a search through Search.svelte with the table in force, and the page
// compares every book it reads with the table's count of it (bookRows), and
// says so on the console where they differ. Two books: one aligned by turns
// (paired-hit.test.ts's), one by Bekker ticks.
import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, FlowTurn, GreekLine, Segment } from '../lib/data';
import { chapterPlaces } from '../lib/chapter-pages';
import { countRows, encodeRowBook, type RowTable } from '../lib/row-table';
import { englishQueryUnits, type SearchResult } from '../lib/search';
import { getWork, searchableTranslations } from '../lib/works';

const { books, state } = vi.hoisted(() => {
  const line = (n: number, text: string): GreekLine => ({
    n, text, tokens: text.split(' ').map((t, i) => ({ t, o: i * 2, k: t })),
  });
  const turn = (t: Partial<FlowTurn>): FlowTurn => ({ s: null, d: null, g: null, e: null, p: false, ...t });
  const seg = (column: string, english: string, greek: GreekLine[], bekker?: { n: number; offset: number; real: boolean }[]): Segment => ({
    id: `1:${column}`, column, greek, english: { text: english, notes: [], markers: [], ...(bekker ? { bekker } : {}) },
  });
  // paired-hit.test.ts's book: three sections, five turns.
  const turns: BookData = {
    book: 1,
    segments: [
      seg('70a', 'One two three. Four five', [line(1, 'α β γ'), line(2, 'δ ε')]),
      seg('70b', 'six seven eight Nine ten. Eleven', [line(1, 'ζ η θ'), line(2, 'ι κ')]),
      seg('70c', 'twelve thirteen Residual words here Last.', [line(1, 'λ μ')]),
    ],
    turnFlow: {
      leadE: null,
      turns: [
        turn({ s: 'EN', g: { c: '70a', n: 1, o: 0 }, e: 'One two three.', es: [{ o: 0, c: '70a' }], p: true }),
        turn({ s: 'Socrates', g: { c: '70a', n: 2, o: 0 }, e: 'Four five six seven eight', es: [{ o: 10, c: '70b' }], p: true }),
        turn({ g: { c: '70b', n: 1, o: 4 }, e: '', sub: [
          { s: 'Socrates', d: 'Soc.', e: 'Nine ten.' },
          { s: 'EN', d: 'Men.', e: 'Eleven twelve thirteen', es: [{ o: 7, c: '70c' }] },
        ] }),
        turn({ s: 'EN', e: 'Residual words here' }),
        turn({ s: 'Socrates', g: { c: '70c', n: 1, o: 2 }, e: 'Last.', p: true }),
      ],
    },
  };
  // Eight lines a section, three words a line; the English ticked at lines
  // 1, 4 and 7, so its units are lines 1–3, 4–6 and 7–8.
  const greek = (from: number) => Array.from({ length: 8 }, (_, i) => line(i + 1, `${from + i}α ${from + i}β ${from + i}γ`));
  const eng = 'Virtue is a state. Of virtue there are two kinds. The virtue of character comes from habit.';
  const ticks = [{ n: 1, offset: 0, real: true }, { n: 4, offset: 19, real: false }, { n: 7, offset: 48, real: false }];
  const bekker: BookData = {
    book: 1,
    segments: [seg('1103a', eng, greek(10), ticks), seg('1103b', eng, greek(20), ticks)],
  };
  return { books: { turns, bekker }, state: { book: turns as BookData, table: null as RowTable | null } };
});

vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return {
    ...actual,
    search: vi.fn(async () => ({ results: [], failedWorks: [] })),
    searchCombo: vi.fn(async () => ({ results: [], failedWorks: [] })),
    searchPhraseVariants: vi.fn(),
    speakerRoster: vi.fn(async () => []),
  };
});

vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchBook: vi.fn(async () => state.book),
    fetchChapters: vi.fn(async () => ({
      '1': state.book.segments.map(s => ({ column: s.column, chapter: '1', line: '1' })),
    })),
    loadRowTable: vi.fn(async () => {
      if (!state.table) throw new Error('no table');
      return state.table;
    }),
  };
});

const tableOf = (book: BookData): RowTable => ({ v: 1, books: { '1': encodeRowBook(book, searchableTranslations(getWork('EN')!)) } });
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => {
  warn.mockRestore();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

const at = (column: string, r: Partial<SearchResult>): SearchResult => ({
  work: 'EN', meta: { id: `1:${column}`, book: 1, column },
  grkMatch: false, engMatch: false, grkPositions: [], ...r,
});
const mismatches = () => warn.mock.calls.filter((c: unknown[]) => /the row table counts/.test(String(c[0])));

// Runs the search with the table in force; the rows drawn, once the page has
// read its book.
async function rows(book: BookData, url: string, results: SearchResult[], table: RowTable | null = tableOf(book)) {
  const { search } = await import('../lib/search');
  const { fetchBook, loadRowTable } = await import('../lib/data');
  state.book = book;
  state.table = table;
  vi.mocked(search).mockResolvedValueOnce({ results, failedWorks: [] });
  window.history.replaceState(null, '', url);
  const { container } = render(Search);
  await vi.waitFor(() => expect(fetchBook).toHaveBeenCalled());
  await vi.waitFor(() => expect(container.querySelectorAll('li.instance').length).toBeGreaterThan(0));
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).not.toMatch(/of …/));
  // The table was asked for and answered: a case where it was not would pass
  // without comparing anything.
  expect(loadRowTable).toHaveBeenCalled();
  return container.querySelectorAll('li.instance').length;
}

const greekWord = 'g=' + encodeURIComponent('α');
const cases: [string, keyof typeof books, string, SearchResult[]][] = [
  ['turns: Greek words sharing a turn and a passage', 'turns', greekWord, [at('70a', { grkMatch: true, grkPositions: [0, 1, 3] })]],
  ['turns: Greek and English in one unit', 'turns', `${greekWord}&e=four`, [at('70a', {
    grkMatch: true, engMatch: true, grkPositions: [0, 3], engHits: [{ translation: 'rackham', positions: [3] }] })]],
  ['turns: English in a turn with no Greek', 'turns', 'e=residual', [at('70c', {
    engMatch: true, engHits: [{ translation: 'rackham', positions: [2] }] })]],
  ['turns: hits in three sections', 'turns', `${greekWord}&e=six`, [
    at('70a', { grkMatch: true, grkPositions: [4] }),
    at('70b', { grkMatch: true, engMatch: true, grkPositions: [0, 3], engHits: [{ translation: 'rackham', positions: [0, 3] }] }),
    at('70c', { grkMatch: true, grkPositions: [1] })]],
  ['ticks: Greek words on lines 1, 2 and 7', 'bekker', greekWord, [at('1103a', { grkMatch: true, grkPositions: [0, 4, 19] })]],
  ['ticks: English joining the Greek of its unit, and alone in another', 'bekker', `${greekWord}&e=virtue`, [
    at('1103a', { grkMatch: true, engMatch: true, grkPositions: [1], engHits: [{ translation: 'rackham', positions: [0, 5, 11] }] }),
    at('1103b', { engMatch: true, engHits: [{ translation: 'rackham', positions: [11] }] })]],
  ['ticks: a run of several words', 'bekker', `${greekWord}&gm=phrase`, [
    at('1103a', { grkMatch: true, grkPositions: [3, 4, 9, 10], windows: [[3, 4], [9, 10]] })]],
];

describe('the row table counts the rows the page draws', () => {
  for (const [name, book, query, results] of cases) {
    for (const ctx of ['1', '3', 's']) {
      it(`${name}, context ${ctx}`, async () => {
        const drawn = await rows(books[book], `/search?${query}&ctx=${ctx}`, results);
        expect(drawn).toBeGreaterThan(0);
        expect(mismatches()).toEqual([]);
        // And the count itself, as the page asked for it (no offsets: each
        // hit in its outline chapter).
        const eng = new URLSearchParams(query).get('e') ?? '';
        expect(countRows(results, tableOf(books[book]).books['1'], {
          context: ctx as '1' | '3' | 's', places: chapterPlaces(new Map()), translations: searchableTranslations(getWork('EN')!),
          chapterSection: false, lookup: () => ({ chapter: '1' }), engUnits: englishQueryUnits(eng), engPhrase: false,
        })).toBe(drawn);
      });
    }
  }

  it('reads every book, and draws the same rows, where the table disagrees with the book', async () => {
    const results = [at('1103a', { grkMatch: true, engMatch: true, grkPositions: [1], engHits: [{ translation: 'rackham', positions: [0] }] })];
    const right = await rows(books.bekker, `/search?${greekWord}&e=virtue`, results);
    expect(mismatches()).toEqual([]);
    document.body.innerHTML = '';
    // Every English word in a unit of its own: the English no longer joins the Greek.
    const wrong = tableOf(books.bekker);
    const seg = wrong.books['1'].s[0];
    seg.e = { ...seg.e, rackham: [999, 1000, 999] };
    wrong.books['1'].u[999] = 0;
    const drawn = await rows(books.bekker, `/search?${greekWord}&e=virtue`, results, wrong);
    await vi.waitFor(() => expect(mismatches()).toHaveLength(1));
    await vi.waitFor(() => expect(document.querySelectorAll('li.instance')).toHaveLength(right));
    expect(drawn).toBeGreaterThan(0);
  });
});
