// John, 13 Nov (on d10-near-change): "after a search, the proximity search
// menu should collapse. otherwise, it takes up so much screen real estate."
// The editor's Search, when it runs, folds the editor to its one-line
// summary, as Close does; a Search it refuses leaves it open.
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData } from '../lib/data';

const fixtureBook = vi.hoisted(() => ({
  book: {
    book: 1,
    segments: [{
      id: 'seg1',
      column: '70a',
      greek: [{ n: 1, text: 'ἀρετή', tokens: [{ t: 'ἀρετή', o: 0, k: 'a)reth/' }] }],
      english: { text: 'Virtue.', notes: [], markers: [], bekker: [{ n: 1, offset: 0, real: true }] },
      chapterStarts: [],
    }],
  } satisfies BookData,
}));

const HIT = { work: 'EN', meta: { id: 'seg1', book: 1, column: '70a' }, grkMatch: true, engMatch: false, grkPositions: [0], windows: [[0]] };
vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return {
    ...actual,
    search: vi.fn(async () => ({ results: [HIT], failedWorks: [] })),
    searchCombo: vi.fn(async () => ({ results: [HIT], failedWorks: [] })),
    searchPhraseVariants: vi.fn(),
    speakerRoster: vi.fn(async () => []),
    greekHitForms: vi.fn(async () => ({ byResult: new Map(), headwords: new Map(), failedWorks: [] })),
    greekHitGrammar: vi.fn(async () => ({ byResult: new Map(), failedWorks: [] })),
  };
});
vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchBook: vi.fn(async () => fixtureBook.book),
    fetchChapters: vi.fn(async () => ({ '1': [{ column: '70a', chapter: '1', line: '1' }] })),
    fetchLemmaPickerShard: vi.fn(async (letter: string) => ({
      a: { areth: { n: 967, c: [{ h: 'ἀρετή', k: 'a)reth/' }] } },
      e: { ecis: { n: 547, c: [{ h: 'ἕξις', k: 'e(/cis' }] } },
    } as Record<string, object>)[letter] ?? {}),
    fetchLemmaGlosses: vi.fn(async () => []),
  };
});

// Desktop by default; phone() makes every max-width: 960px query match.
let wide = true;
beforeEach(() => {
  wide = true;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response);
  vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => ({
    matches: wide ? media === '(min-width: 961px)' : /max-width:\s*(960|680)px/.test(media),
    media, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

const prox = () => screen.getByRole('button', { name: /^Proximity/ });
const editor = () => screen.queryByRole('group', { name: 'Proximity search' });
const summary = () => document.querySelector('#advanced-tools .prox-sum')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const links = () => [...document.querySelectorAll('#advanced-tools .prox-links :is(button, a)')].map((x) => x.textContent);
const relation2 = (value: string) => fireEvent.change(screen.getByRole('combobox', { name: 'Relation of term 2' }), { target: { value } });
const editorSearch = () => document.querySelector<HTMLButtonElement>('#advanced-tools button.prox-search')!;
async function arrive(qs: string) {
  window.history.replaceState(null, '', `/search?${qs}`);
  render(Search);
  const { searchCombo } = await import('../lib/search');
  await vi.waitFor(() => expect(searchCombo).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(summary()).not.toBeNull());
  await screen.findByRole('button', { name: 'Change' });
  await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/\d+ chapters?/));
}
async function searched(n: number) {
  const { searchCombo } = await import('../lib/search');
  await vi.waitFor(() => expect(searchCombo).toHaveBeenCalledTimes(n));
}

describe("the editor's Search", () => {
  it('runs the edited search and folds the editor to its summary (keyboard: focus to Change)', async () => {
    await arrive('c=l:areth&c=l:ecis&cw=10');
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(editor()).not.toBeNull();
    await relation2('before');
    // A keyboard press of a button (Enter or Space) clicks it with detail 0.
    await fireEvent.click(editorSearch(), { detail: 0 });
    await searched(2);
    const { searchCombo } = await import('../lib/search');
    expect(vi.mocked(searchCombo).mock.calls[1][0][1]).toMatchObject({ relation: 'before' });
    await vi.waitFor(() => expect(editor()).toBeNull());
    expect(summary()).toBe('ἕξις before ἀρετή, within 10 words');
    expect(links()).toEqual(['Turn off', 'Change', 'Guide']);
    expect(prox()).toHaveAttribute('aria-expanded', 'false');
    expect(new URLSearchParams(location.search).getAll('c')).toEqual(['l:areth', 'lb:ecis']);
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change' })));
  });

  it('folds it after a mouse or tap Search too', async () => {
    await arrive('c=l:areth&c=l:ecis');
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await relation2('after');
    await fireEvent.click(editorSearch(), { detail: 1 });
    await searched(2);
    await vi.waitFor(() => expect(editor()).toBeNull());
    expect(links()).toEqual(['Turn off', 'Change', 'Guide']);
  });

  it('leaves the editor open, its message shown, when it refuses the search', async () => {
    await arrive('c=l:areth&c=l:ecis');
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Remove term 2' }));
    await fireEvent.click(editorSearch(), { detail: 0 });
    await new Promise((r) => setTimeout(r, 20));
    await searched(1);
    expect(editor()).not.toBeNull();
    expect(document.querySelector('#advanced-tools .prox-pend')).toHaveTextContent(/^Add a second term$/);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('leaves the editor open when the engine finds nothing to narrow the search (Codex R12)', async () => {
    await arrive('c=l:areth&c=l:ecis');
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await relation2('before');
    const { searchCombo } = await import('../lib/search');
    vi.mocked(searchCombo).mockResolvedValueOnce({ results: [], failedWorks: [], unnarrowed: true } as never);
    await fireEvent.click(editorSearch(), { detail: 0 });
    await searched(2);
    await new Promise((r) => setTimeout(r, 50));
    expect(editor()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('refuses an empty editor opened from Proximity, and leaves it open', async () => {
    render(Search);
    await fireEvent.click(prox());
    await fireEvent.click(editorSearch(), { detail: 1 });
    await new Promise((r) => setTimeout(r, 20));
    const { searchCombo } = await import('../lib/search');
    expect(searchCombo).not.toHaveBeenCalled();
    expect(editor()).not.toBeNull();
    expect(document.querySelector('#advanced-tools .prox-pend')).toHaveTextContent(/^Add two terms$/);
  });

  it('on a phone, takes the pinned bar and its reserved space with it, and opens nothing else', async () => {
    wide = false;
    await arrive('c=l:areth&c=l:ecis');
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(document.querySelector('.prox-go')).not.toBeNull();
    expect(document.querySelector<HTMLElement>('.search-page')!.style.getPropertyValue('--prox-bar-height')).not.toBe('');
    await relation2('before');
    await fireEvent.click(editorSearch(), { detail: 1 });
    await searched(2);
    await vi.waitFor(() => expect(editor()).toBeNull());
    expect(document.querySelector('.prox-go')).toBeNull();
    expect(document.querySelector<HTMLElement>('.search-page')!.style.getPropertyValue('--prox-bar-height')).toBe('');
    expect(screen.queryByRole('button', { name: /^Options/ })).toBeNull();
    expect(links()).toEqual(['Turn off', 'Change', 'Guide']);
  });
});
