// Where a hit is drawn is where it is counted: four regressions of the
// chapter-aware results page (Search.svelte).
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, GreekLine } from '../lib/data';
import type { SearchResult } from '../lib/search';

vi.mock('../lib/search', async original => ({
  ...await original<typeof import('../lib/search')>(),
  search: vi.fn(), searchPhraseVariants: vi.fn(), loadOffsets: vi.fn(async () => null),
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
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();
const book = (greek: GreekLine[], english: string): BookData => ({ book: 1, segments: [{
  id: '1:70a', column: '70a', greek,
  english: { text: english, notes: [], markers: [], bekker: [{ n: greek[0].n, offset: 0, real: true }] },
}] });
// Chapter 2 starts at token `second` of a 22-token section.
const offsetsOf = (second: number) => ({ token_count: 22, seg_base_offset: [0],
  segments: [{ book: 1, column: '70a', line_runs: Array.from({ length: 22 }, (_, i) => [i + 1, 1]) }],
  book_bounds: [{ book: 1, start: 0 }], chapter_bounds: [
    { book: 1, chapter: '1', start: 0, accuracy: 'exact' },
    { book: 1, chapter: '2', start: second, accuracy: 'exact' },
  ] }) as never;
const base = { work: 'EN', meta: { id: '1:70a', book: 1, column: '70a' } };

async function open(b: BookData, results: SearchResult[], query: string) {
  const { fetchBook, fetchChapters } = await import('../lib/data');
  const { search } = await import('../lib/search');
  vi.mocked(fetchBook).mockResolvedValue(b);
  vi.mocked(fetchChapters).mockResolvedValue({ '1': [{ column: '70a', chapter: '1', line: '1', bekker: '70a' }] });
  vi.mocked(search).mockResolvedValue({ results, failedWorks: [] });
  window.history.replaceState(null, '', `/search?${query}`);
  const page = render(Search);
  await vi.waitFor(() => expect(page.container.querySelector('li.instance')).not.toBeNull());
  return page.container;
}
const headings = (c: Element) => [...c.querySelectorAll('.sx-chap')].map(text);

// 1. A Both phrase search, then "any inflection": the widened results are
// Greek alone, and the chapter join must not drop them for want of English.
it('shows the widened results of a Both search, not "No passages found."', async () => {
  const { loadOffsets, searchPhraseVariants } = await import('../lib/search');
  vi.mocked(loadOffsets).mockResolvedValue(offsetsOf(20));
  vi.mocked(searchPhraseVariants).mockResolvedValue({
    results: [{ ...base, grkMatch: true, engMatch: false, grkPositions: [1] }],
    readings: [['logos', 'areth']], productive: [['logos', 'areth']], cappedFrom: 0, failedWorks: [],
  } as Awaited<ReturnType<typeof searchPhraseVariants>>);
  const both = { ...base, grkMatch: true, engMatch: true, grkPositions: [0],
    engHits: [{ translation: 'english', positions: [0] }] };
  const c = await open(book([line(1, 'λόγος ἀρετή')], 'Virtue here.'), [both as SearchResult],
    `g=${encodeURIComponent('λόγος ἀρετή')}&gm=phrase&e=virtue`);
  await fireEvent.click(await screen.findByRole('button', { name: 'Find this phrase in any inflection' }));
  await vi.waitFor(() => expect(searchPhraseVariants).toHaveBeenCalled());
  // Settled once the widened result (ἀρετή marked, where the Both result
  // marked λόγος) is drawn, or once the page says it found nothing.
  const marks = () => [...c.querySelectorAll('li.instance mark')].map(m => m.textContent);
  await vi.waitFor(() => expect(marks().includes('ἀρετή') || /No passages found/.test(c.textContent ?? '')).toBe(true));
  expect(c.textContent).not.toMatch(/No passages found/);
  expect(marks()).toContain('ἀρετή');
});

// 2. A unit a chapter starts in is one row under each chapter, and each row
// marks only the word it counts.
it('marks only its own word in each half of a unit split by a chapter start', async () => {
  const { loadOffsets, loadEngChapters } = await import('../lib/search');
  vi.mocked(loadOffsets).mockResolvedValue(offsetsOf(20));
  vi.mocked(loadEngChapters).mockResolvedValue({ english: { '0': [[0, '1'], [2, '2']] } });
  const r: SearchResult = { ...base, grkMatch: false, engMatch: true, grkPositions: [],
    engHits: [{ translation: 'english', positions: [0, 2] }] };
  const c = await open(book([line(1, 'α')], 'Virtue here. Virtue there.'), [r], 'e=virtue');
  await vi.waitFor(() => expect(c.querySelectorAll('li.instance')).toHaveLength(2));
  expect(headings(c)).toEqual(['Chapter 1', 'Chapter 2']);
  const rows = [...c.querySelectorAll('li.instance')];
  expect(rows.map(i => i.querySelectorAll('.inst-en mark').length)).toEqual([1, 1]);
});

// 3. An English phrase is counted at its first word and drawn there: one
// chapter, though its second word stands in the next.
it('draws an English phrase under the chapter it counts in', async () => {
  const { loadOffsets, loadEngChapters } = await import('../lib/search');
  vi.mocked(loadOffsets).mockResolvedValue(offsetsOf(20));
  vi.mocked(loadEngChapters).mockResolvedValue({ english: { '0': [[0, '1'], [1, '2']] } });
  const r: SearchResult = { ...base, grkMatch: false, engMatch: true, grkPositions: [],
    engHits: [{ translation: 'english', positions: [0, 1], matches: [0] }] };
  const c = await open(book([line(1, 'α')], 'One two three.'), [r], 'e=%22one%20two%22&em=phrase');
  await vi.waitFor(() => expect(headings(c).length).toBeGreaterThan(0));
  expect(headings(c)).toEqual(['Chapter 1']);
  expect(text(document.body)).toMatch(/1 chapter\b/);
});

// 4. Whole section: one section, a Greek hit in each of its two chapters,
// is filed once under each.
it('files a whole section under each chapter it has a hit in', async () => {
  const { loadOffsets } = await import('../lib/search');
  vi.mocked(loadOffsets).mockResolvedValue(offsetsOf(10));
  const r: SearchResult = { ...base, grkMatch: true, engMatch: false, grkPositions: [3, 15] };
  const c = await open(book(Array.from({ length: 22 }, (_, i) => line(i + 1, 'α')), 'One.'),
    [r], 'g=α&ctx=s&ps=20');
  await vi.waitFor(() => expect(headings(c)).toEqual(['Chapter 1', 'Chapter 2']));
  expect(c.querySelectorAll('li.instance')).toHaveLength(2);
  expect([...c.querySelectorAll('li.instance')].map(i => i.querySelectorAll('.greek mark').length)).toEqual([1, 1]);
});

// 5. A work whose chapter data did not load is counted by book, and the page
// says so (Codex review, 16 Nov).
it('warns when a work\'s chapters did not load', async () => {
  const { loadOffsets } = await import('../lib/search');
  vi.mocked(loadOffsets).mockRejectedValue(new Error('no offsets.json'));
  const r: SearchResult = { ...base, grkMatch: true, engMatch: false, grkPositions: [0] };
  const c = await open(book([line(1, 'λόγος ἀρετή')], 'Virtue here.'), [r], 'g=λόγος');
  await vi.waitFor(() => expect(c.querySelector('.sx-note.warn')).toHaveTextContent(/The chapters of .+ did not load/));
});

// 6. A whole section split by a chapter start: each row marks the English of
// its own chapter only (Codex review 2, 16 Nov).
it('marks only its own chapter\'s English in each row of a split section', async () => {
  const { loadOffsets, loadEngChapters } = await import('../lib/search');
  vi.mocked(loadOffsets).mockResolvedValue(offsetsOf(10));
  vi.mocked(loadEngChapters).mockResolvedValue({ english: { '0': [[0, '1'], [2, '2']] } });
  const r: SearchResult = { ...base, grkMatch: true, engMatch: true, grkPositions: [3, 15],
    engHits: [{ translation: 'rackham', positions: [0, 2] }] };
  const c = await open(book(Array.from({ length: 22 }, (_, i) => line(i + 1, 'α')), 'Virtue one. Virtue two.'),
    [r], 'g=α&e=virtue&ctx=s&ps=20');
  await vi.waitFor(() => expect(headings(c)).toEqual(['Chapter 1', 'Chapter 2']));
  const rows = [...c.querySelectorAll('li.instance')];
  expect(rows).toHaveLength(2);
  expect(rows.map(i => [...i.querySelectorAll('.inst-en mark')].map(m => m.textContent))).toEqual([['Virtue'], ['Virtue']]);
  expect(rows.map(i => i.querySelectorAll('.greek mark').length)).toEqual([1, 1]);
});

// 7. Two runs of a phrase overlap across a chapter start: the shared word is
// marked in both rows (Codex review 2, 16 Nov).
it('marks a word two overlapping phrase runs share in each run\'s row', async () => {
  const { loadOffsets, loadEngChapters } = await import('../lib/search');
  vi.mocked(loadOffsets).mockResolvedValue(offsetsOf(20));
  vi.mocked(loadEngChapters).mockResolvedValue({ english: { '0': [[0, '1'], [1, '2']] } });
  const r: SearchResult = { ...base, grkMatch: false, engMatch: true, grkPositions: [],
    engHits: [{ translation: 'english', positions: [0, 1, 2], matches: [0, 1] }] };
  const c = await open(book([line(1, 'α')], 'Ha ha ha.'), [r], 'e=%22ha%20ha%22&em=phrase');
  await vi.waitFor(() => expect(headings(c)).toEqual(['Chapter 1', 'Chapter 2']));
  const rows = [...c.querySelectorAll('li.instance')];
  expect(rows.map(i => [...i.querySelectorAll('.inst-en mark')].map(m => m.textContent).join(' ').trim().toLowerCase()))
    .toEqual(['ha ha', 'ha ha']);
});

// 8. Two terms, one a word and one two words, side by side across a chapter
// start: the second term's words are not marked in the first's row (Codex
// review 3, 16 Nov).
it('does not stretch a one-word term over the next term\'s words', async () => {
  const { loadOffsets, loadEngChapters } = await import('../lib/search');
  vi.mocked(loadOffsets).mockResolvedValue(offsetsOf(20));
  vi.mocked(loadEngChapters).mockResolvedValue({ english: { '0': [[0, '1'], [1, '2']] } });
  const r: SearchResult = { ...base, grkMatch: false, engMatch: true, grkPositions: [],
    engHits: [{ translation: 'english', positions: [0, 1, 2], matches: [0, 1] }] };
  const c = await open(book([line(1, 'α')], 'Virtue well-being.'), [r], `e=${encodeURIComponent('virtue well-being')}`);
  await vi.waitFor(() => expect(headings(c)).toEqual(['Chapter 1', 'Chapter 2']));
  const rows = [...c.querySelectorAll('li.instance')];
  expect(rows.map(i => [...i.querySelectorAll('.inst-en mark')].map(m => m.textContent).join(' ').trim().toLowerCase()))
    .toEqual(['virtue', 'well being']);
});
