// S2, the search form and its menus (round 34): In with Authentic works and
// its w=auth address, the menus' keyboard, the Lemma switch, the keyboard
// layout. Capitals' removal is pinned in search-input.test.ts.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import { decodeSearchUrl, emptyUrlSearch, encodeSearchUrl, type UrlSearch } from '../lib/search-url';
import { AUTHENTIC_IDS, SEARCH_GROUPS, WORKS } from '../lib/works';
import { GREEK_KEYS, KEY_ROWS } from '../lib/greek-keys';
import type { BookData } from '../lib/data';

const ALL = WORKS.map((w) => w.id);
const base = (over: Partial<UrlSearch> = {}): UrlSearch => ({ ...emptyUrlSearch(ALL), ...over });
// The exclusion list the round-34 mock-up wrote for "authentic works".
const MOCK_NOT = ['Oec', 'MM', 'Prob', 'VV', 'DM', 'Mech', 'Col', 'Phgn', 'Plant', 'MXG', 'Aud', 'Lin', 'Spir', 'Vent', 'Mirab', 'RhetAl'];

describe('authentic works, from the authenticity flag', () => {
  it("are Aristotle's works with no flag or \"genuine\": none dubious, spurious, or by another author", () => {
    const flagged = WORKS.filter((w) => w.authenticity === 'dubious' || w.authenticity === 'spurious').map((w) => w.id);
    const others = WORKS.filter((w) => w.author !== 'Aristotle').map((w) => w.id);
    expect(flagged.length).toBeGreaterThan(0);
    expect(others).toEqual(['Isa']);
    expect(AUTHENTIC_IDS.length + flagged.length + others.length).toBe(WORKS.length);
    for (const id of [...flagged, ...others]) expect(AUTHENTIC_IDS).not.toContain(id);
    for (const w of WORKS) {
      if (w.author === 'Aristotle' && (!w.authenticity || w.authenticity === 'genuine')) expect(AUTHENTIC_IDS).toContain(w.id);
    }
  });

  it("today: 30, the mock-up's 16 exclusions plus Porphyry's Isagoge (John, 12 Nov)", () => {
    expect(AUTHENTIC_IDS).toHaveLength(30);
    expect(ALL.filter((id) => !AUTHENTIC_IDS.includes(id)).sort()).toEqual([...MOCK_NOT, 'Isa'].sort());
  });

  it('the works picker groups every work, the Isagoge under its author', () => {
    const ids = SEARCH_GROUPS.flatMap((g) => g.ids);
    expect([...ids].sort()).toEqual([...ALL].sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(SEARCH_GROUPS.at(-1)).toEqual({ ref: '', label: 'Porphyry', ids: ['Isa'] });
  });
});

describe('w=auth in the address', () => {
  it('is written for exactly the authentic works, and read back as them', () => {
    const qs = encodeSearchUrl(base({ grk: 'a', works: [...AUTHENTIC_IDS] }), ALL);
    expect(new URLSearchParams(qs).get('w')).toBe('auth');
    expect(decodeSearchUrl(qs, ALL).works).toEqual(ALL.filter((id) => AUTHENTIC_IDS.includes(id)));
    // In any order, as a selection is a set.
    expect(encodeSearchUrl(base({ grk: 'a', works: [...AUTHENTIC_IDS].reverse() }), ALL)).toBe('g=a&w=auth');
  });

  it('reads every older spelling of the same search as before', () => {
    const auth = decodeSearchUrl('?g=a&w=auth', ALL).works;
    // The mock-up's exclusion list predates the Isagoge ruling: it now reads as
    // what it says, those 16 left out and the Isagoge kept, not as w=auth.
    expect(decodeSearchUrl(`?g=a&w=-${MOCK_NOT.join(',')}`, ALL).works).toEqual([...auth, 'Isa'].sort((x, y) => ALL.indexOf(x) - ALL.indexOf(y)));
    expect(decodeSearchUrl(`?g=a&w=${AUTHENTIC_IDS.join(',')}`, ALL).works).toEqual(auth);
    // Lists and exclusions that are not the authentic works are untouched.
    expect(decodeSearchUrl('?g=a&w=EN,Pol', ALL).works).toEqual(['EN', 'Pol']);
    expect(decodeSearchUrl('?g=a&w=-Cat,Int', ALL).works).toEqual(ALL.filter((id) => id !== 'Cat' && id !== 'Int'));
    expect(encodeSearchUrl(base({ grk: 'a', works: ['EN', 'Pol'] }), ALL)).toBe('g=a&w=EN,Pol');
    expect(encodeSearchUrl(base({ grk: 'a', works: ALL.filter((id) => id !== 'Cat') }), ALL)).toBe('g=a&w=-Cat');
  });

  it('is not written for all works, a subset of them, or one work more', () => {
    expect(encodeSearchUrl(base({ grk: 'a' }), ALL)).toBe('g=a');
    expect(encodeSearchUrl(base({ grk: 'a', works: AUTHENTIC_IDS.slice(1) }), ALL)).not.toContain('w=auth');
    expect(encodeSearchUrl(base({ grk: 'a', works: [...AUTHENTIC_IDS, 'Oec'] }), ALL)).not.toContain('w=auth');
  });

  it('keeps the other parameters around it', () => {
    const s = decodeSearchUrl('?e=virtue&w=auth&wf=EN&ps=20', ALL);
    expect(s.eng).toBe('virtue');
    expect(s.workFilter).toBe('EN');
    expect(s.pageSize).toBe('20');
    expect(encodeSearchUrl(s, ALL)).toBe('e=virtue&ps=20&wf=EN&w=auth');
  });
});

describe('the keyboard layout (ruling 6)', () => {
  it('lays out every letter key once, in the three rows of Apple’s Greek keyboard', () => {
    const laid = KEY_ROWS.flatMap((r) => [...r]);
    expect(laid).toHaveLength(GREEK_KEYS.length);
    expect([...laid].sort()).toEqual([...GREEK_KEYS].sort());
    expect(KEY_ROWS.map((r) => [...r].length)).toEqual([9, 9, 7]);
  });
});

// ── The component ───────────────────────────────────────────────────────────

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

const SHARDS: Record<string, Record<string, { n: number; c: { h: string; k: string; s?: string }[] }>> = {
  l: {
    logos: { n: 2483, c: [{ h: 'λόγος', k: 'lo/gos', s: 'logos' }] },
    logow: { n: 516, c: [{ h: 'λογόω', k: 'logo/w', s: 'logoo' }] },
  },
};
vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchBook: vi.fn(async () => fixtureBook),
    fetchChapters: vi.fn(async () => ({ '1': [{ column: '70a', chapter: '70', line: '1' }] })),
    fetchLemmaPickerShard: vi.fn(async (letter: string) => SHARDS[letter] ?? {}),
    fetchLemmaGlosses: vi.fn(async (slug: string) => (slug === 'logos' ? ['word', 'speech'] : [])),
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

const greekBox = () => document.querySelector('#grk-input') as HTMLInputElement;
async function type(value: string) {
  const el = greekBox();
  el.focus();
  el.value = value;
  el.setSelectionRange(value.length, value.length);
  await fireEvent.input(el);
}
const menu = (title: string) => screen.getByText(title, { selector: 'summary' }).closest('details') as HTMLDetailsElement;
const inMenu = () => document.querySelector('details.opt-in') as HTMLDetailsElement;
async function openMenu(d: HTMLDetailsElement) {
  d.open = true;
  await fireEvent(d, new Event('toggle'));
}

describe('the 13 Nov form controls', () => {
  it('shows both fields and quiet tools above Greek, and waits for text before showing options', async () => {
    render(Search);
    expect(screen.getByLabelText('English')).toHaveValue('');
    expect(screen.queryByRole('group', { name: 'Search in' })).toBeNull();
    expect(document.querySelector('.d6-opts')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'In' })).toBeNull();
    await type('log');
    expect(document.querySelector('.d6-opts-g')).not.toBeNull();
    expect(document.querySelector('.d6-opts-e')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'In' })).toBeInTheDocument();
  });

  it('keeps the match and form menu names and values, and shuts them with Escape or Done', async () => {
    render(Search);
    await type('log');
    const menus = [...document.querySelectorAll<HTMLDetailsElement>('.phone-option')];
    expect(menus.map(d => d.querySelector('summary')!.textContent!.trim())).toEqual(['Greek match all words', 'Greek form any form']);
    for (const m of menus) {
      expect(m.querySelector('legend')).not.toBeNull();
      await openMenu(m);
      await fireEvent.keyDown(m.querySelector('input')!, { key: 'Escape' });
      expect(m.open).toBe(false);
      expect(m.querySelector('summary')).toHaveFocus();
      await openMenu(m);
      await fireEvent.click(m.querySelector('.sheet-done')!);
      expect(m.open).toBe(false);
    }
  });

  it('keeps one menu open, and a click outside shuts it', async () => {
    render(Search); await type('log');
    const [match, form] = [...document.querySelectorAll<HTMLDetailsElement>('.phone-option')];
    await openMenu(match); await openMenu(form);
    expect(match.open).toBe(false); expect(form.open).toBe(true);
    await fireEvent.click(document.querySelector('.sq-head')!);
    expect(form.open).toBe(false);
  });

  it('selects authentic works and searches them as w=auth', async () => {
    const { search } = await import('../lib/search');
    render(Search); await type('λόγος');
    await fireEvent.click(screen.getByRole('radio', { name: 'authentic works' }));
    await fireEvent.submit(document.querySelector('form')!);
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    expect(vi.mocked(search).mock.calls[0][5]).toEqual(ALL.filter(id => AUTHENTIC_IDS.includes(id)));
    expect(new URLSearchParams(location.search).get('w')).toBe('auth');
    await fireEvent.click(screen.getByRole('radio', { name: 'all works' }));
    expect(screen.getByRole('radio', { name: 'all works' })).toHaveAttribute('aria-checked', 'true');
  });

  it('reads w=auth and the old exclusion list as their own scopes', async () => {
    window.history.replaceState(null, '', '/search?g=logos&w=auth');
    const page = render(Search);
    await vi.waitFor(() => expect(screen.getByRole('radio', { name: 'authentic works' })).toHaveAttribute('aria-checked', 'true'));
    page.unmount();
    window.history.replaceState(null, '', `/search?g=logos&w=-${MOCK_NOT.join(',')}`);
    render(Search);
    await vi.waitFor(() => expect(screen.getByRole('radio', { name: 'choose works…' })).toHaveAttribute('aria-checked', 'true'));
  });

  it('opens and filters the works picker, and Done returns focus to its word', async () => {
    render(Search); await type('log');
    await fireEvent.click(screen.getByRole('radio', { name: 'choose works…' }));
    const panel = document.querySelector<HTMLElement>('#works-panel')!;
    expect(panel.hidden).toBe(false);
    await fireEvent.input(within(panel).getByRole('searchbox', { name: 'Find a work' }), { target: { value: 'ethic' } });
    expect([...panel.querySelectorAll('.work-chip')].map(b => b.textContent)).toEqual(['Nicomachean Ethics', 'Eudemian Ethics']);
    await fireEvent.click(within(panel).getByRole('button', { name: 'Done' }));
    expect(panel.hidden).toBe(true);
    expect(screen.getByRole('radio', { name: 'choose works…' })).toHaveFocus();
  });

  it('gives each desktop segment one tab stop, and arrows select and focus with wrapping', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(media => ({ matches: media === '(min-width: 961px)', media, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
    render(Search); await type('log');
    const group = screen.getByRole('radiogroup', { name: 'Greek match' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map(r => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    radios[0].focus();
    await fireEvent.keyDown(radios[0], { key: 'ArrowLeft' });
    expect(radios[2]).toHaveFocus(); expect(radios[2]).toHaveAttribute('aria-checked', 'true');
    expect(radios.map(r => r.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    await fireEvent.keyDown(radios[2], { key: 'ArrowRight' });
    expect(radios[0]).toHaveFocus();
    await fireEvent.keyDown(radios[0], { key: 'End' }); expect(radios[2]).toHaveFocus();
    await fireEvent.keyDown(radios[2], { key: 'Home' }); expect(radios[0]).toHaveFocus();
  });
});

describe('Lemma (ruling 5)', () => {
  it('on, the box asks for a dictionary word and its list opens at once, captioned', async () => {
    render(Search);
    await type('log');
    await screen.findByRole('listbox', { name: 'Dictionary words' });
    expect(document.querySelector('.gs-cap')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Lemma' }));
    expect(screen.getByRole('button', { name: 'Lemma' })).toHaveAttribute('aria-pressed', 'true');
    expect(greekBox()).toHaveAttribute('placeholder', 'a dictionary word, then pick it below');
    await screen.findByRole('listbox', { name: 'Dictionary words' });
    expect(document.querySelector('.gs-under .gs-cap')).toHaveTextContent('Lemma · Dictionary words');
    await fireEvent.click(screen.getByRole('button', { name: 'Lemma' }));
    expect(greekBox()).toHaveAttribute('placeholder', 'e.g. τέχνη');
  });

  it('a pick is the search: every form of that word, as ?l=', async () => {
    const { search } = await import('../lib/search');
    render(Search);
    await type('log');
    await fireEvent.click(screen.getByRole('button', { name: 'Lemma' }));
    const lb = await screen.findByRole('listbox', { name: 'Dictionary words' });
    await fireEvent.click(within(lb).getAllByRole('option')[0]);
    await vi.waitFor(() => expect(greekBox().value).toBe('λόγος'));
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    expect(vi.mocked(search).mock.calls[0][0]).toBe('logos');
    expect(vi.mocked(search).mock.calls[0][6]).toBe('headword');
    expect(window.location.search).toBe('?l=logos');
  });

  it('with no word picked, Search shows the list instead of searching', async () => {
    const { search } = await import('../lib/search');
    render(Search);
    await type('log');
    await fireEvent.click(screen.getByRole('button', { name: 'Lemma' }));
    await screen.findByRole('listbox', { name: 'Dictionary words' });
    await fireEvent.keyDown(greekBox(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByRole('listbox', { name: 'Dictionary words' });
    expect(search).not.toHaveBeenCalled();
  });

  it('an address with ?l= opens with Lemma on and the headword in the box', async () => {
    window.history.replaceState(null, '', '/search?l=logos');
    const { search } = await import('../lib/search');
    render(Search);
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Lemma' })).toHaveAttribute('aria-pressed', 'true');
    await vi.waitFor(() => expect(greekBox().value).toBe('λόγος'));
    // Editing the word unpicks it.
    await type('λόγο');
    await fireEvent.keyDown(greekBox(), { key: 'Escape' });
    vi.mocked(search).mockClear();
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(search).not.toHaveBeenCalled();
  });
});

describe('the form', () => {
  it('has no Advanced; Proximity opens the editor in one click', async () => {
    const { container } = render(Search);
    expect(screen.queryByRole('button', { name: /^Advanced/ })).toBeNull();
    const prox = screen.getByRole('button', { name: /^Proximity/ });
    expect(prox).toHaveAttribute('aria-expanded', 'false');
    await fireEvent.click(prox);
    expect(prox).toHaveAttribute('aria-expanded', 'true');
    // S3: the editor itself, no inner panel to open.
    expect(container.querySelector('#advanced-tools')).toContainElement(screen.getByRole('group', { name: 'Proximity search' }));
    expect(container.querySelector('.lemma-panel')).toBeNull();
  });

  it('Keyboard and Beta Code sit on the Greek field’s line', () => {
    render(Search);
    const row = document.querySelector('.sq-head.h-g')!;
    expect(within(row as HTMLElement).getByRole('button', { name: 'Greek keyboard' })).toHaveTextContent('Keyboard');
    expect(within(row as HTMLElement).getByRole('button', { name: 'β Beta Code' })).toBeInTheDocument();
  });
});

it('offers phrase widening for an exact phrase, without offering it for all words in any form', async () => {
  render(Search);
  await type('λόγος ἀρετή');
  expect(screen.queryByRole('button', { name: 'Find this phrase in any inflection' })).toBeNull();
  const match = document.querySelector<HTMLDetailsElement>('details:has(input[name=grkmode])')!;
  await fireEvent.click(within(match).getByRole('radio', { name: 'Exact phrase', hidden: true }));
  await fireEvent.submit(document.querySelector('form')!);
  expect(await screen.findByRole('button', { name: 'Find this phrase in any inflection' })).toBeInTheDocument();
});
