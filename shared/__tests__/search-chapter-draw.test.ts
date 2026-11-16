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

// 9–11. The switch: and | and/or | or (John, 16 Nov). Chapter 1 has Greek
// (token 3) and English (word 0); chapter 2 has Greek alone (token 15).
const splitOf = (c: Element) => [...c.querySelectorAll('.sx-split .i')]
  .map(i => `${text(i.querySelector('.i-t'))} ${text(i.querySelector('small'))}${i.classList.contains('off') ? ' off' : ''}`);
async function openSplit(op: string) {
  const { loadOffsets, loadEngChapters } = await import('../lib/search');
  vi.mocked(loadOffsets).mockResolvedValue(offsetsOf(10));
  vi.mocked(loadEngChapters).mockResolvedValue({ english: { '0': [[0, '1'], [2, '2']] } });
  const r: SearchResult = { ...base, grkMatch: true, engMatch: true, grkPositions: [3, 15],
    engHits: [{ translation: 'rackham', positions: [0] }] };
  return open(book(Array.from({ length: 22 }, (_, i) => line(i + 1, 'α')), 'Virtue one. Two.'), [r], `g=α&e=virtue${op}`);
}
it('"and" counts the chapters with both, and lights only that row', async () => {
  const c = await openSplit('');
  await vi.waitFor(() => expect(splitOf(c)).toEqual(['Greek and English 1', 'Greek only 1 off', 'English only 0 off']));
  expect(text(c.querySelector('.result-count'))).toMatch(/^1 chapter\s*1 hit\b/);
  expect(text(c.querySelector('details.opt.join summary b'))).toBe('and');
});
it('"and/or" (op=or) counts every chapter with a hit', async () => {
  const c = await openSplit('&op=or');
  await vi.waitFor(() => expect(splitOf(c)).toEqual(['Greek and English 1', 'Greek only 1', 'English only 0']));
  expect(text(c.querySelector('.result-count'))).toMatch(/^2 chapters\s*2 hits\b/);
  expect(text(c.querySelector('details.opt.join summary b'))).toBe('and/or');
});
it('"or" (op=xor) counts the chapters with one language, not both', async () => {
  const c = await openSplit('&op=xor');
  await vi.waitFor(() => expect(splitOf(c)).toEqual(['Greek and English 1 off', 'Greek only 1', 'English only 0']));
  expect(text(c.querySelector('.result-count'))).toMatch(/^1 chapter\s*1 hit\b/);
  expect(text(c.querySelector('details.opt.join summary b'))).toBe('or');
  expect(headings(c)).toEqual(['Chapter 2']);
});

// 12. A new search opens on "and/or" (John, 16 Nov): typed into a blank page
// and run with the switch untouched, it counts every chapter with a hit, and
// its link names the op.
it('runs a new Greek and English search as "and/or" by default', async () => {
  const { loadOffsets, loadEngChapters, search } = await import('../lib/search');
  const { fetchBook, fetchChapters } = await import('../lib/data');
  vi.mocked(loadOffsets).mockResolvedValue(offsetsOf(10));
  vi.mocked(loadEngChapters).mockResolvedValue({ english: { '0': [[0, '1'], [2, '2']] } });
  vi.mocked(fetchBook).mockResolvedValue(book(Array.from({ length: 22 }, (_, i) => line(i + 1, 'α')), 'Virtue one. Two.'));
  vi.mocked(fetchChapters).mockResolvedValue({ '1': [{ column: '70a', chapter: '1', line: '1', bekker: '70a' }] });
  vi.mocked(search).mockResolvedValue({ results: [{ ...base, grkMatch: true, engMatch: true, grkPositions: [3, 15],
    engHits: [{ translation: 'rackham', positions: [0] }] }], failedWorks: [] });
  window.history.replaceState(null, '', '/search');
  const { container: c } = render(Search);
  await fireEvent.input(c.querySelector('#grk-input')!, { target: { value: 'α' } });
  await fireEvent.input(c.querySelector('#eng-input')!, { target: { value: 'virtue' } });
  await vi.waitFor(() => expect(text(c.querySelector('details.opt.join summary b'))).toBe('and/or'));
  await fireEvent.click(c.querySelector('button.search-btn')!);
  await vi.waitFor(() => expect(text(c.querySelector('.result-count'))).toMatch(/^2 chapters\s*2 hits\b/));
  expect(new URLSearchParams(window.location.search).get('op')).toBe('or');
});

// 13. "and" with no chapter holding both languages finds nothing, and the
// split still says where the hits are (Codex review, 16 Nov).
it('keeps the split rows when "and" finds no chapter with both', async () => {
  const { loadOffsets, loadEngChapters, search } = await import('../lib/search');
  const { fetchBook, fetchChapters } = await import('../lib/data');
  vi.mocked(loadOffsets).mockResolvedValue(offsetsOf(10));
  vi.mocked(loadEngChapters).mockResolvedValue({ english: { '0': [[0, '1'], [2, '2']] } });
  vi.mocked(fetchBook).mockResolvedValue(book(Array.from({ length: 22 }, (_, i) => line(i + 1, 'α')), 'Virtue one. Two.'));
  vi.mocked(fetchChapters).mockResolvedValue({ '1': [{ column: '70a', chapter: '1', line: '1', bekker: '70a' }] });
  // Greek in chapter 2 only; English in chapter 1 only.
  vi.mocked(search).mockResolvedValue({ results: [{ ...base, grkMatch: true, engMatch: true, grkPositions: [15],
    engHits: [{ translation: 'rackham', positions: [0] }] }], failedWorks: [] });
  window.history.replaceState(null, '', '/search?g=α&e=virtue&op=and');
  const { container: c } = render(Search);
  await vi.waitFor(() => expect(c.textContent).toMatch(/No passages found/));
  await vi.waitFor(() => expect(splitOf(c)).toEqual(['Greek and English 0', 'Greek only 1 off', 'English only 1 off']));
});

// 14–15. English searched: one list, a work with its chapters, under it each
// translation with its hits there (John, 16 Nov). Chapter 1 has Rackham's
// word 0; chapter 2 Ross's two words (Ross's slot has no chapter starts, so
// its words fall in the chapter the section's Greek opens in: chapter 1).
const nestOf = (c: Element) => [...c.querySelectorAll('.sx-nest .i:not(.i-all)')]
  .map(i => `${i.classList.contains('sub') ? '  ' : ''}${text(i.querySelector('.i-t'))} ${text(i.querySelector('small'))}`);
async function openNest() {
  const { loadOffsets, loadEngChapters } = await import('../lib/search');
  vi.mocked(loadOffsets).mockResolvedValue(offsetsOf(10));
  vi.mocked(loadEngChapters).mockResolvedValue({ english: { '0': [[0, '1'], [2, '2']] } });
  const r: SearchResult = { ...base, grkMatch: false, engMatch: true, grkPositions: [],
    engHits: [{ translation: 'rackham', positions: [0, 2] }, { translation: 'ross', positions: [1, 4, 6] }] };
  return open(book(Array.from({ length: 22 }, (_, i) => line(i + 1, 'α')), 'Virtue one. Virtue two.'), [r], 'e=virtue');
}
it('lists each work with its chapters, and its translations with their hits', async () => {
  const c = await openNest();
  await vi.waitFor(() => expect(nestOf(c)).toEqual(['Nicomachean Ethics 2 chap.', '  Ross 3', '  Rackham 2']));
  expect(c.querySelector('.sx-trans')).toBeNull();
});
it('narrows to a translation in its work, and lifts it when chosen again', async () => {
  const c = await openNest();
  await vi.waitFor(() => expect(nestOf(c)).toHaveLength(3));
  const ross = () => [...c.querySelectorAll<HTMLElement>('.sx-nest .i.sub')].find(i => /Ross/.test(i.textContent ?? ''))!;
  await fireEvent.click(ross());
  await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get('t')).toBe('ross'));
  expect(new URLSearchParams(window.location.search).get('wf')).toBe('EN');
  await vi.waitFor(() => expect(text(c.querySelector('.result-count'))).toMatch(/^1 chapter\s*3 hits\b/));
  expect(ross()).toHaveAttribute('aria-pressed', 'true');
  expect(nestOf(c)).toEqual(['Nicomachean Ethics 2 chap.', '  Ross 3', '  Rackham 2']);
  await fireEvent.click(ross());
  await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get('t')).toBeNull());
  expect(new URLSearchParams(window.location.search).get('wf')).toBeNull();
});

// 16. A translation chosen in no one work (an old link's t=): its row is on
// in its work, and choosing it lifts the filter (Codex review, 16 Nov).
it('marks a translation chosen across works, and lifts it when chosen', async () => {
  const { loadOffsets, loadEngChapters } = await import('../lib/search');
  vi.mocked(loadOffsets).mockResolvedValue(offsetsOf(10));
  vi.mocked(loadEngChapters).mockResolvedValue({ english: { '0': [[0, '1'], [2, '2']] } });
  const r: SearchResult = { ...base, grkMatch: false, engMatch: true, grkPositions: [],
    engHits: [{ translation: 'rackham', positions: [0, 2] }, { translation: 'ross', positions: [1, 4, 6] }] };
  const c = await open(book(Array.from({ length: 22 }, (_, i) => line(i + 1, 'α')), 'Virtue one. Virtue two.'), [r], 'e=virtue&t=ross');
  const ross = () => [...c.querySelectorAll<HTMLElement>('.sx-nest .i.sub')].find(i => /Ross/.test(i.textContent ?? ''))!;
  await vi.waitFor(() => expect(ross()).toHaveAttribute('aria-pressed', 'true'));
  await fireEvent.click(ross());
  await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get('t')).toBeNull());
  expect(new URLSearchParams(window.location.search).get('wf')).toBeNull();
});
