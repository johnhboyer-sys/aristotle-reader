// Saved searches (PR 8, ruling 4): Save beside the result count, and the
// Saved page's Open, Rename, Note, Delete, Copy link, Export and Import.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import SavedSearches from '../components/SavedSearches.svelte';
import type { BookData, GreekLine } from '../lib/data';
import type { SearchResult } from '../lib/search';
import { addSaved, exportSaved, listSaved } from '../lib/saved-searches';

const { book } = vi.hoisted(() => {
  const line = (n: number, text: string): GreekLine => ({
    n, text, tokens: text.split(' ').map((t, i) => ({ t, o: i * 2, k: t })),
  });
  const book = (n: number): BookData => ({
    book: n,
    segments: [
      { id: `${n}:70a`, column: '70a', greek: [line(1, 'ψυχή τε καί')], english: { text: 'soul and', notes: [], markers: [] } },
    ],
  });
  return { book };
});

vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return {
    ...actual,
    search: vi.fn(async () => ({ results: [], failedWorks: [] })),
    greekHitForms: vi.fn(async () => ({ byResult: new Map(), headwords: new Map(), failedWorks: [] })),
    greekHitGrammar: vi.fn(async () => ({ byResult: new Map(), failedWorks: [] })),
    searchCombo: vi.fn(async () => ({ results: [], failedWorks: [] })),
    searchPhraseVariants: vi.fn(),
    speakerRoster: vi.fn(async () => []),
  };
});
vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchBook: vi.fn(async (_work: string, n: number) => book(n)),
    fetchChapters: vi.fn(async () => ({ '1': [{ column: '70a', chapter: '70', line: '1' }] })),
  };
});

const RESULTS: SearchResult[] = [
  { work: 'EN', meta: { id: '1:70a', book: 1, column: '70a' }, grkMatch: true, engMatch: false, grkPositions: [0] },
];
const G = `/search?g=${encodeURIComponent('ψυχή')}`;
const SOC = `${G}&sp=only&sn=Socrates`;

async function open(url: string) {
  const { search } = await import('../lib/search');
  vi.mocked(search).mockResolvedValueOnce({ results: RESULTS, failedWorks: [] });
  window.history.replaceState(null, '', url);
  const page = render(Search);
  // Settled: the count is in the status line.
  await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/1 instance/));
  return page;
}
const block = () => vi.spyOn(window, 'localStorage', 'get')
  .mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

// As a full store: reads work, every write throws QuotaExceededError.
function fill() {
  const real = window.localStorage;
  const full = {
    getItem: (k: string) => real.getItem(k),
    removeItem: (k: string) => real.removeItem(k),
    setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
  } as unknown as Storage;
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue(full);
}

beforeEach(() => localStorage.clear());
afterEach(async () => {
  const { speakerRoster } = await import('../lib/search');
  vi.mocked(speakerRoster).mockImplementation(async () => []);
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('Search.svelte: Save beside the count', () => {
  it('sits in the count row and turns to Saved ✓, keeping the page URL', async () => {
    const { container } = await open(G);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.closest('.result-bar')).toBe(container.querySelector('.result-count')!.closest('.result-bar'));
    expect(save.previousElementSibling).toBe(container.querySelector('.result-count'));
    await fireEvent.click(save);
    expect(save).toHaveTextContent('Saved ✓');
    expect(save).not.toBeDisabled();
    expect(listSaved()!.map((e) => e.url)).toEqual([window.location.pathname + window.location.search]);
    expect(listSaved()![0].name).toBe('ψυχή');
  });

  it('shows Saved ✓ at once for a URL already saved', async () => {
    addSaved(G);
    await open(G);
    expect(screen.getByRole('button', { name: 'Saved ✓' })).not.toBeDisabled();
  });

  it.skip('a speaker-filtered search saved and reopened keeps its filter', async () => {
    const { search, speakerRoster } = await import('../lib/search');
    vi.mocked(speakerRoster).mockResolvedValue([{ work: 'EN', loaded: true, speakers: [{ name: 'Socrates', turns: 1 }] }] as never);
    const first = await open(SOC);
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    first.unmount();
    const saved = listSaved()![0];
    expect(saved.name).toBe('ψυχή · spoken by Socrates');
    const p = new URL(saved.url, 'https://x.invalid').searchParams;
    expect([p.get('sp'), p.get('sn')]).toEqual(['only', 'Socrates']);
    // Reopen: the Saved page's Open goes to that URL, and the search page
    // read from it has the filter on, and knows it is saved.
    window.history.replaceState(null, '', '/saved');
    const page = render(SavedSearches);
    const href = (await screen.findByRole('link', { name: 'Open' })).getAttribute('href')!;
    expect(href).toBe(saved.url);
    page.unmount();
    await open(href);
    expect(screen.getByRole('button', { name: /Spoken by/ })).toHaveTextContent(/only Socrates/i);
    // Both runs, the saved one and the reopened one, searched as Socrates only.
    expect(vi.mocked(search).mock.calls.map((c) => c[8])).toEqual([
      { mode: 'only', names: ['Socrates'] }, { mode: 'only', names: ['Socrates'] },
    ]);
    expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeInTheDocument();
  });

  it('a blocked store hides Save, and search still runs', async () => {
    block();
    const { container } = await open(G);
    expect(container.querySelector('.result-count')).toHaveTextContent('1 instance');
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
  });

  it('links to the Saved page from the search form', () => {
    render(Search);
    expect(screen.getByRole('link', { name: 'Saved searches' })).toHaveAttribute('href', '/saved');
  });
});

describe('SavedSearches.svelte: the Saved page', () => {
  const entry = () => screen.getAllByRole('listitem')[0];

  it('lists a saved search under the one label, and opens it', async () => {
    addSaved(G, undefined, new Date('2026-11-10T12:00:00Z'));
    render(SavedSearches);
    expect(await screen.findByText('Kept in this browser.')).toBeInTheDocument();
    expect(text(entry().querySelector('h2'))).toBe('ψυχή');
    expect(entry()).toHaveTextContent('Saved 10 Nov 2026');
    expect(within(entry()).getByRole('link', { name: 'Open' })).toHaveAttribute('href', G);
  });

  it('renames, notes and deletes', async () => {
    addSaved(G);
    render(SavedSearches);
    await fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    await fireEvent.input(name, { target: { value: 'Soul' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(text(entry().querySelector('h2'))).toBe('Soul');
    expect(listSaved()![0].name).toBe('Soul');

    await fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    await fireEvent.input(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'Cat first' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(entry()).toHaveTextContent('Cat first');
    expect(listSaved()![0].note).toBe('Cat first');

    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(listSaved()).toEqual([]);
  });

  it('copies the full link, or shows it selected when there is no clipboard', async () => {
    addSaved(G);
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(SavedSearches);
    await fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Link copied.'));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${G}`);

    writeText.mockRejectedValueOnce(new Error('denied'));
    await fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    const box = await screen.findByRole('textbox', { name: 'Link' }) as HTMLInputElement;
    expect(box.value).toBe(`${window.location.origin}${G}`);
    await vi.waitFor(() => expect(document.activeElement).toBe(box));
  });

  it('imports an exported file into a cleared store, and reports a bad one', async () => {
    addSaved(SOC);
    const file = exportSaved(listSaved()!);
    localStorage.clear();
    render(SavedSearches);
    await screen.findByText('No saved searches.');
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    const upload = async (body: string) => {
      Object.defineProperty(input, 'files', { value: [new File([body], 'saved.json', { type: 'application/json' })], configurable: true });
      await fireEvent.change(input);
    };
    await upload(file);
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Imported 1 search.'));
    expect(within(entry()).getByRole('link', { name: 'Open' })).toHaveAttribute('href', SOC);

    await upload('{"nope": true}');
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('That file is not a saved-searches file.'));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('a blocked store shows one plain line and no controls', async () => {
    block();
    render(SavedSearches);
    expect(await screen.findByText('Saved searches are unavailable in this browser.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Kept in this browser.')).toBeNull();
  });

  it('Export attaches its link to the document before clicking it', async () => {
    addSaved(G);
    const attached: boolean[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      attached.push(document.body.contains(this));
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    render(SavedSearches);
    await fireEvent.click(await screen.findByRole('button', { name: 'Export' }));
    expect(attached).toEqual([true]);
    // Removed and revoked a moment later, not in the click's own turn: Safari
    // and some Firefox versions cancel a download whose URL is revoked at once.
    expect(revoke).not.toHaveBeenCalled();
    expect(document.querySelector('a[download]')).not.toBeNull();
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:x'), { timeout: 3000 });
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('a full store still lists its searches, and a failed write says so', async () => {
    addSaved(G);
    fill();
    render(SavedSearches);
    expect(await screen.findByText('Kept in this browser.')).toBeInTheDocument();
    expect(text(entry().querySelector('h2'))).toBe('ψυχή');
    await fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    await fireEvent.input(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'x' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('status')).toHaveTextContent('Not saved — browser storage full');
  });
});

describe('Search.svelte: Save, review fixes', () => {
  it('a search reached by ?q= saves once, named from the query', async () => {
    await open('/search?q=soul');
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeInTheDocument();
    expect(listSaved()!.map((e) => [e.url, e.name])).toEqual([['/search?e=soul', 'soul']]);
  });

  it('Save keeps focus, stays enabled, and announces', async () => {
    const { container } = await open(G);
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    await fireEvent.click(save);
    expect(save).toHaveTextContent('Saved ✓');
    expect(save).not.toBeDisabled();
    expect(document.activeElement).toBe(save);
    expect(container.querySelector('.sx-save-live')).toHaveAttribute('aria-live', 'polite');
    expect(container.querySelector('.sx-save-live')).toHaveTextContent('Search saved.');
  });

  it('a full store: Save is offered, and a failed save says so', async () => {
    fill();
    const { container } = await open(G);
    const save = screen.getByRole('button', { name: 'Save' });
    await fireEvent.click(save);
    expect(save).toHaveTextContent('Not saved — browser storage full');
    expect(container.querySelector('.sx-save-live')).toHaveTextContent('Not saved — browser storage full');
    expect(listSaved()).toEqual([]);
  });
});
