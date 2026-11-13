// S4a item 0 (Codex's review of S2): leaving Greek for English drops a picked
// dictionary word with the Lemma switch, as it drops typed Greek; Both keeps it.
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData } from '../lib/data';

const { fixtureBook } = vi.hoisted(() => ({
  fixtureBook: {
    book: 1,
    segments: [{
      id: 'seg1',
      column: '70a',
      greek: [{ n: 1, text: 'λόγος', tokens: [{ t: 'λόγος', o: 0, k: 'logos' }] }],
      english: { text: 'Word.', notes: [], markers: [], bekker: [{ n: 1, offset: 0, real: true }] },
      chapterStarts: [],
    }],
  } satisfies BookData,
}));

vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return {
    ...actual,
    search: vi.fn(async () => ({
      results: [{ work: 'EN', meta: { id: 'seg1', book: 1, column: '70a' }, grkMatch: true, engMatch: false, grkPositions: [0] }],
      failedWorks: [],
    })),
    searchCombo: vi.fn(async () => ({ results: [], failedWorks: [] })),
    searchPhraseVariants: vi.fn(),
    speakerRoster: vi.fn(async () => []),
  };
});

vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchBook: vi.fn(async () => fixtureBook),
    fetchChapters: vi.fn(async () => ({ '1': [{ column: '70a', chapter: '70', line: '1' }] })),
    fetchLemmaPickerShard: vi.fn(async (letter: string) => (letter === 'l' ? { logos: { n: 2483, c: [{ h: 'λόγος', k: 'lo/gos', s: 'logos' }] } } : {})),
    fetchLemmaGlosses: vi.fn(async () => []),
  };
});

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

const tab = (name: string) => screen.getByRole('group', { name: 'Search in' }).querySelector(`button:nth-child(${['Greek', 'English', 'Both'].indexOf(name) + 1})`) as HTMLButtonElement;
const engBox = () => document.querySelector('#eng-input') as HTMLInputElement;
const greekBox = () => document.querySelector('#grk-input') as HTMLInputElement | null;

async function openLogos() {
  window.history.replaceState(null, '', '/search?l=logos');
  const { search } = await import('../lib/search');
  render(Search);
  await vi.waitFor(() => expect(search).toHaveBeenCalled());
  await vi.waitFor(() => expect(greekBox()!.value).toBe('λόγος'));
  vi.mocked(search).mockClear();
  return vi.mocked(search);
}

describe('a picked dictionary word and the language tabs', () => {
  it('English drops the pick and the Lemma switch: virtue searches virtue alone', async () => {
    const search = await openLogos();
    await fireEvent.click(tab('English'));
    expect(tab('English')).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.input(engBox(), { target: { value: 'virtue' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    const call = search.mock.calls[0];
    expect(call[0]).toBe('');          // no Greek
    expect(call[1]).toBe('virtue');
    expect(call[6]).not.toBe('headword');
    expect(window.location.search).toBe('?e=virtue');
    // Back to Greek: the switch is off, the box empty.
    await fireEvent.click(tab('Greek'));
    expect(screen.getByRole('button', { name: 'Lemma' })).toHaveAttribute('aria-pressed', 'false');
    expect(greekBox()!.value).toBe('');
  });

  it('Both keeps the pick and the switch: λόγος and virtue together', async () => {
    const search = await openLogos();
    await fireEvent.click(tab('Both'));
    expect(screen.getByRole('button', { name: 'Lemma' })).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.input(engBox(), { target: { value: 'virtue' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    const call = search.mock.calls[0];
    expect(call[0]).toBe('logos');
    expect(call[1]).toBe('virtue');
    expect(call[6]).toBe('headword');
    expect(new URLSearchParams(window.location.search).get('l')).toBe('logos');
  });

  it('Greek keeps the pick and the switch', async () => {
    const search = await openLogos();
    await fireEvent.click(tab('Greek'));
    expect(screen.getByRole('button', { name: 'Lemma' })).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    expect(search.mock.calls[0][0]).toBe('logos');
    expect(search.mock.calls[0][6]).toBe('headword');
    expect(window.location.search).toBe('?l=logos');
  });
});
