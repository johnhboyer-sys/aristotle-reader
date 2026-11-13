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

const form = (value: string) => document.querySelector<HTMLInputElement>(`input[name="matchmode"][value="${value}"]`)!;
const summary = () => form('form').closest('details')!.querySelector('summary b')!;
async function open(url = '/search') {
  window.history.replaceState(null, '', url);
  render(Search);
  if (url.includes('?')) {
    const { search } = await import('../lib/search');
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
  }
}

describe('Accents and Form', () => {
  it('turning Accents on sets any form to Only as I typed it', async () => {
    await open();
    expect(form('lemma')).toBeChecked();
    await fireEvent.click(screen.getByRole('button', { name: 'Accents' }));
    expect(form('form')).toBeChecked();
    expect(summary()).toHaveTextContent('as typed');
  });

  it('leaves Running text selected when Accents turns on', async () => {
    await open();
    await fireEvent.click(form('text'));
    await fireEvent.click(screen.getByRole('button', { name: 'Accents' }));
    expect(form('text')).toBeChecked();
    expect(summary()).toHaveTextContent('running text');
  });

  it('turning Accents off leaves Form unchanged', async () => {
    await open('/search?g=ἀρετή&acc=1&m=form');
    await fireEvent.click(screen.getByRole('button', { name: 'Accents' }));
    expect(form('form')).toBeChecked();
    expect(summary()).toHaveTextContent('as typed');
    await fireEvent.click(screen.getByRole('button', { name: 'Accents' }));
    await fireEvent.click(form('lemma'));
    await fireEvent.click(screen.getByRole('button', { name: 'Accents' }));
    expect(form('lemma')).toBeChecked();
  });

  it('keeps any form when the URL sets acc=1', async () => {
    await open('/search?g=ἀρετή&acc=1');
    expect(screen.getByRole('button', { name: 'Accents' })).toHaveAttribute('aria-pressed', 'true');
    expect(form('lemma')).toBeChecked();
    expect(summary()).toHaveTextContent('any form');
  });
});
