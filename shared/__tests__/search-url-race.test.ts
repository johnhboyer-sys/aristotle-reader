import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import { fetchLemmaPickerShard } from '../lib/data';
import { lemmaOptions, search } from '../lib/search';
import type { SearchResult } from '../lib/search';

vi.mock('../lib/data', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/data')>(),
  fetchLemmaPickerShard: vi.fn(),
  fetchBook: vi.fn(async () => ({ book: 1, segments: [{
    id: '1:70a', column: '70a', greek: [],
    english: { text: 'Virtue wins.', notes: [], markers: [] },
  }] })),
  fetchChapters: vi.fn(async () => ({ '1': [{ column: '70a', chapter: '1', line: '1' }] })),
  loadRowTable: vi.fn(async () => null),
}));

vi.mock('../lib/search', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/search')>(),
  lemmaOptions: vi.fn(async () => [['noos']]),
  search: vi.fn(async () => ({ results: [], failedWorks: [] })),
  greekHitForms: vi.fn(async () => ({ byResult: new Map(), headwords: new Map(), failedWorks: [] })),
  greekHitGrammar: vi.fn(async () => ({ byResult: new Map(), failedWorks: [] })),
  speakerRoster: vi.fn(async () => []),
  loadOffsets: vi.fn(async () => null),
  loadEngChapters: vi.fn(async () => ({})),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  const result: SearchResult = {
    work: 'EN', meta: { id: '1:70a', book: 1, column: '70a' },
    grkMatch: false, grkPositions: [], engMatch: true,
    engHits: [{ translation: 'english', positions: [0] }],
  };
  vi.mocked(search).mockResolvedValue({ results: [result], failedWorks: [] });
  window.history.replaceState(null, '', `/search?l=${encodeURIComponent('νοῦς')}`);
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

async function startSlowUrl() {
  const lookup = deferred<Awaited<ReturnType<typeof fetchLemmaPickerShard>>>();
  vi.mocked(fetchLemmaPickerShard).mockImplementation(() => lookup.promise);
  render(Search);
  await vi.waitFor(() => expect(fetchLemmaPickerShard).toHaveBeenCalledWith('n'));
  expect(search).not.toHaveBeenCalled();
  return lookup;
}

async function expectVirtueSearch() {
  await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
  expect(vi.mocked(search).mock.calls[0].slice(0, 2)).toEqual(['', 'virtue']);
  // The status changes only after the search has applied its results.
  await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 chapter'));
  await vi.waitFor(() => expect(document.querySelector('.sx-main')).toHaveTextContent('Virtue wins.'));
  expect(screen.getByRole('textbox', { name: 'English' })).toHaveValue('virtue');
  expect(screen.getByRole('combobox', { name: 'Greek' })).toHaveValue('');
  expect(screen.queryByRole('alert')).toBeNull();
}

async function finishStaleUrl(lookup: Awaited<ReturnType<typeof startSlowUrl>>) {
  lookup.resolve({ noos: { n: 1, c: [{ h: 'νοῦς', k: 'noos' }] } });
  // Exercise the real resolver all the way through the map and the second
  // picker check. Then drain its continuation before checking for stale work.
  await vi.waitFor(() => expect(lemmaOptions).toHaveBeenCalledWith(['nous']));
  await vi.waitFor(() => expect(vi.mocked(fetchLemmaPickerShard).mock.calls.length).toBeGreaterThanOrEqual(2));
  await new Promise<void>((done) => setTimeout(done, 0));
  await tick();
  await expectVirtueSearch();
  expect(window.location.search).toBe('?e=virtue');
}

describe('Search.svelte: URL lookup races', () => {
  it('keeps URL B after its search finishes and URL A’s headword lookup resolves', async () => {
    const lookup = await startSlowUrl();
    window.history.replaceState(null, '', '/search?e=virtue');
    await fireEvent(window, new PopStateEvent('popstate'));
    await expectVirtueSearch();

    await finishStaleUrl(lookup);
  });

  it('keeps a manual search started while URL A’s headword lookup is pending', async () => {
    const lookup = await startSlowUrl();
    const english = screen.getByRole('textbox', { name: 'English' });
    await fireEvent.input(english, { target: { value: 'virtue' } });
    await fireEvent.submit(english.closest('form')!);
    await expectVirtueSearch();

    await finishStaleUrl(lookup);
  });
});
