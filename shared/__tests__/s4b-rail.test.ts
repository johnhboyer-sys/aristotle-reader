// S4b (round 34, d24): on a desktop the word card takes the rail's column
// (ruling 12). It replaces the lists while it is open, the word clicked stays
// marked, Close and Esc give the focus back to the word, and the card says
// "across Aristotle".
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import WordPopup from '../components/WordPopup.svelte';
import { parseInWords } from '../lib/proximity-sentence';
import type { BookData, GreekLine } from '../lib/data';
import type { SearchResult } from '../lib/search';

const { book } = vi.hoisted(() => {
  const line = (n: number, text: string): GreekLine => ({
    n, text, tokens: text.split(' ').map((t, i) => ({ t, o: i * 2, k: t })),
  });
  const book = (n: number): BookData => ({
    book: n,
    segments: [
      { id: `${n}:70a`, column: '70a', greek: [line(1, 'ἀρετὴ λόγος ἐστι')], english: { text: 'One two three', notes: [], markers: [] } },
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
    speakerRoster: vi.fn(async () => []),
  };
});
vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  const sections = [{ column: '70a', chapter: '70', line: '1' }];
  return {
    ...actual,
    fetchBook: vi.fn(async (_work: string, n: number) => book(n)),
    fetchChapters: vi.fn(async () => ({ '1': sections })),
    fetchLemmata: vi.fn(async () => ({ 'a)reth/': { slug: 'arete', head: 'ἀρετή', count: 678 } })),
    fetchLsjHeads: vi.fn(async () => ({})),
    lookupWord: vi.fn(async () => ({ analyses: [{ lemma: 'a)reth/', gloss: 'goodness, excellence', parse: 'fem nom/voc sg', lsj: ['a)reth/'] }], lsj: [] })),
  };
});

const RESULTS: SearchResult[] = [
  { work: 'EN', meta: { id: '1:70a', book: 1, column: '70a' }, grkMatch: true, engMatch: false, grkPositions: [0] },
  { work: 'Int', meta: { id: '1:70a', book: 1, column: '70a' }, grkMatch: true, engMatch: false, grkPositions: [0] },
];
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

// A desktop: the (min-width: 961px) query matches, nothing else does; or a
// narrow screen, where none does.
function screenOf(wide: boolean) {
  return vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => ({
    matches: wide && media === '(min-width: 961px)', media, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
}
const desktop = () => screenOf(true);
async function open(url = `/search?g=${encodeURIComponent('ἀρετή')}`) {
  const { search } = await import('../lib/search');
  vi.mocked(search).mockResolvedValueOnce({ results: RESULTS, failedWorks: [] });
  window.history.replaceState(null, '', url);
  const page = render(Search);
  await vi.waitFor(() => expect(page.container.querySelectorAll('li.instance button.gw').length).toBeGreaterThan(0));
  return page;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('Search.svelte: the word card on a desktop', () => {
  it('opens in the rail in place of the lists, marks the word, and Close brings the lists back', async () => {
    desktop();
    const { container } = await open();
    const side = container.querySelector('.sx-side')!;
    const word = container.querySelector<HTMLElement>('li.instance button.gw')!;
    expect(side).not.toHaveClass('wp-open');
    word.focus();
    await fireEvent.click(word);
    const card = await screen.findByRole('dialog', { name: 'Word analysis' });
    // In the rail's column, after its head, not a panel over the page.
    expect(side.contains(card)).toBe(true);
    expect(card).toHaveClass('word-rail');
    expect(side.querySelector('.sx-head')!.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(side).toHaveClass('wp-open');
    expect(word).toHaveClass('gw-on');
    // Its parts, as d24 draws them.
    await within(card).findByText('goodness, excellence');
    expect(text(card.querySelector('.popup-surface'))).toBe('ἀρετὴ');
    expect(text(card.querySelector('.lemma'))).toBe('from ἀρετή');
    expect(text(card.querySelector('.parse-rows dt'))).toBe('feminine nominative or vocative singular');
    expect(text(within(card).getByRole('link', { name: /Appears/ }))).toBe('Appears 678× across Aristotle →');
    const close = within(card).getByRole('button', { name: 'Close' });
    expect(text(close)).toBe('Close');
    // A click elsewhere leaves it open: it is part of the page, not a layer.
    await fireEvent.click(container.querySelector('.result-count')!);
    expect(screen.getByRole('dialog', { name: 'Word analysis' })).toBeInTheDocument();
    await fireEvent.click(close);
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Word analysis' })).toBeNull());
    expect(side).not.toHaveClass('wp-open');
    expect(word).not.toHaveClass('gw-on');
    expect(document.activeElement).toBe(word);
    expect(screen.getByRole('complementary', { name: 'Refine results' })).toBeInTheDocument();
  });

  it('moves to the next word clicked, marking it alone, and Esc returns the focus to it', async () => {
    desktop();
    const { container } = await open();
    const [first, second] = container.querySelectorAll<HTMLElement>('li.instance button.gw');
    await fireEvent.click(first);
    const card = await screen.findByRole('dialog', { name: 'Word analysis' });
    await fireEvent.click(second);
    expect(screen.getByRole('dialog', { name: 'Word analysis' })).toBe(card);
    expect(first).not.toHaveClass('gw-on');
    expect(second).toHaveClass('gw-on');
    await fireEvent.keyDown(window, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Word analysis' })).toBeNull());
    expect(second).not.toHaveClass('gw-on');
    expect(document.activeElement).toBe(second);
  });

  it('is the sidebar over the page below 961px, as before', async () => {
    screenOf(false);
    const { container } = await open();
    await fireEvent.click(container.querySelector<HTMLElement>('li.instance button.gw')!);
    const card = await screen.findByRole('dialog', { name: 'Word analysis' });
    expect(container.querySelector('.sx-side')!.contains(card)).toBe(false);
    expect(card).not.toHaveClass('word-rail');
    expect(text(within(card).getByRole('button', { name: 'Close' }))).toBe('×');
  });
});

describe('WordPopup outside the search page', () => {
  it('keeps its parse as the analyses write it, and its ×', async () => {
    const { container } = render(WordPopup, { props: { token: { t: 'ἀρετὴ', k: 'a)reth/' }, onClose() {} } });
    await screen.findByText('goodness, excellence');
    expect(text(container.querySelector('.parse-rows dt'))).toBe('fem nom/voc sg');
    expect(text(container.querySelector('.lemma'))).toBe('ἀρετή');
  });
});

describe('parseInWords', () => {
  it('spells out a parse in its own order, alternatives joined with "or"', () => {
    expect(parseInWords('fem nom/voc sg')).toBe('feminine nominative or vocative singular');
    expect(parseInWords('neut nom/voc/acc sg')).toBe('neuter nominative, vocative, or accusative singular');
    expect(parseInWords('pres ind mp 3rd sg')).toBe('present indicative middle or passive third person singular');
    // A word it does not know stays as it is.
    expect(parseInWords('adverbial')).toBe('adverbial');
  });
});
