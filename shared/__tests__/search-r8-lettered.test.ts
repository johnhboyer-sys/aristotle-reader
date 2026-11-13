import { render } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, GreekLine } from '../lib/data';
import { pairContext, pairGreekWindow, pairUnits, unitAtGreek } from '../lib/paired-hit';
import type { Offsets, SearchResult } from '../lib/search';

vi.mock('../lib/search', async original => ({
  ...await original<typeof import('../lib/search')>(),
  search: vi.fn(), loadOffsets: vi.fn(),
  greekHitForms: vi.fn(async () => ({ byResult: new Map(), headwords: new Map(), failedWorks: [] })),
  speakerRoster: vi.fn(async () => []),
}));
vi.mock('../lib/data', async original => ({
  ...await original<typeof import('../lib/data')>(),
  fetchBook: vi.fn(), fetchChapters: vi.fn(),
}));
afterEach(() => { vi.clearAllMocks(); window.history.replaceState(null, '', '/'); });

const line = (n: number, text: string, sub?: string): GreekLine => ({ n, sub, text,
  tokens: [...text.matchAll(/\S+/g)].map(m => ({ t: m[0], o: m.index!, k: m[0] })) });
const book: BookData = { book: 1, segments: [{
  id: '1:2b', column: '2b',
  greek: [line(5, 'πρίν'), line(6, 'ἄλφα'), line(6, 'βῆτα', 'a'), line(6, 'γάμμα', 'b'), line(7, 'μετά')],
  english: { text: 'Before alpha beta gamma after.', notes: [], markers: [], bekker: [{ n: 5, offset: 0, real: true }] },
}] };
const seg = book.segments[0];
const offsets: Offsets = { token_count: 5, seg_base_offset: [0], book_bounds: [{ book: 1, start: 0 }],
  segments: [{ book: 1, column: '2b', line_runs: [[5, 1], [6, 1], [6, 1, 'a'], [6, 1, 'b'], [7, 1]] }] };

it('keeps the suffix in paired spans and counts 6b as its own context line', () => {
  const ix = pairUnits(book, []);
  const unit = unitAtGreek(ix, seg, 3);
  expect(unit.greek.map(l => `${l.n}${l.sub ?? ''}`)).toEqual(['5', '6', '6a', '6b', '7']);
  expect(pairContext(ix, seg, unit, '3').greek.map(l => l.sub)).toEqual([undefined, undefined, 'a', 'b', undefined]);
  expect(pairGreekWindow(seg, unit, 6, '1', undefined, 'b').greek.map(l => l.text)).toEqual(['γάμμα']);
  expect(pairGreekWindow(seg, unit, 6, '3', undefined, 'b').greek.map(l => l.text)).toEqual(['βῆτα', 'γάμμα', 'μετά']);
});

it('keeps the lettered start when lastTok widens the window', () => {
  const ix = pairUnits(book, []);
  const unit = unitAtGreek(ix, seg, 3);
  expect(pairGreekWindow(seg, unit, 6, '1', 4, 'b').greek.map(l => `${l.n}${l.sub ?? ''}`))
    .toEqual(['6b', '7']);
});

async function open(positions: number[], params: string, data = book, index = offsets) {
  const { fetchBook, fetchChapters } = await import('../lib/data');
  const { search, loadOffsets } = await import('../lib/search');
  vi.mocked(fetchBook).mockResolvedValue(data);
  vi.mocked(fetchChapters).mockResolvedValue({ '1': [{ column: '2b', chapter: '1', line: '5', bekker: '2b' }] });
  vi.mocked(loadOffsets).mockResolvedValue(index);
  const result: SearchResult = { work: 'Int', meta: { id: seg.id, book: 1, column: seg.column },
    grkMatch: true, engMatch: false, grkPositions: positions };
  vi.mocked(search).mockResolvedValue({ results: [result], failedWorks: [] });
  window.history.replaceState(null, '', `/search?g=γάμμα${params}`);
  const page = render(Search);
  await vi.waitFor(() => expect(page.container.querySelector('.inst-ref, .cite')).not.toBeNull());
  return page;
}

it('shows and marks the matched word on 6b at Context 1 line', async () => {
  const { container } = await open([3], '&ctx=1');
  expect(container.querySelector('.inst-ref')).toHaveTextContent('2b6b');
  const snippet = container.querySelector('.inst-snippet.greek')!;
  expect([...snippet.querySelectorAll('button.gw')].map(el => el.textContent)).toEqual(['γάμμα']);
  expect(snippet.querySelector('mark')).toHaveTextContent('γάμμα');
});

it('sizes the paired English from the 40-word line 6b', async () => {
  const data: BookData = { book: 1, segments: [{ ...seg,
    greek: [line(6, 'ἄλφα'), line(6, Array(40).fill('γάμμα').join(' '), 'b')],
    english: { text: Array.from({ length: 100 }, (_, i) => `word${i}`).join(' '), notes: [], markers: [],
      bekker: [{ n: 6, offset: 0, real: true }] },
  }] };
  const index: Offsets = { ...offsets, token_count: 41,
    segments: [{ book: 1, column: '2b', line_runs: [[6, 1], [6, 40, 'b']] }] };
  const { container } = await open([1], '&ctx=1', data, index);
  const words = container.querySelector('.inst-pair-text')!.textContent!.match(/word\d+/g);
  expect(words).toHaveLength(56);
});

it('merges overlapping contexts without repeating or swapping 6, 6a, or 6b', async () => {
  const { container } = await open([1, 2, 3], '&ctx=3');
  expect(container.querySelectorAll('li.instance')).toHaveLength(1);
  const snippet = container.querySelector('.inst-snippet.greek')!;
  expect([...snippet.querySelectorAll('button.gw')].map(el => el.textContent))
    .toEqual(['πρίν', 'ἄλφα', 'βῆτα', 'γάμμα', 'μετά']);
  expect([...snippet.querySelectorAll('mark')].map(el => el.textContent)).toEqual(['ἄλφα', 'βῆτα', 'γάμμα']);
  expect([...snippet.querySelectorAll<HTMLElement>('button.gw')].map(el => el.dataset.i)).toEqual(['0', '1', '2', '3', '4']);
});

it('links the 6b citation to the same lettered reader target as its snippet', async () => {
  const snippets = await open([3], '&ctx=1');
  const href = snippets.container.querySelector('.inst-ref')!.getAttribute('href')!;
  expect(new URL(href, window.location.origin).searchParams.get('loc')).toBe('2b:6b');
  snippets.unmount();
  vi.mocked((await import('../lib/data')).fetchBook).mockClear();
  const citations = await open([3], '&ps=c');
  expect(citations.container.querySelector('.cite')).toHaveTextContent('2b6b');
  expect(citations.container.querySelector('.cite')).toHaveAttribute('href', href);
  expect((await import('../lib/data')).fetchBook).not.toHaveBeenCalled();
});
