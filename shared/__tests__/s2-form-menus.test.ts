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

describe('the menus', () => {
  it('each has its name as a title and a gloss under every choice', () => {
    render(Search);
    const glosses = (d: HTMLDetailsElement) => [...d.querySelectorAll('.opt-gloss')].map((g) => g.textContent?.trim());
    expect(menu('Match').querySelector('legend')).toHaveTextContent('Match');
    expect(glosses(menu('Match'))).toEqual(['every word, anywhere in the passage', 'at least one of them', 'these words, in this order']);
    expect(menu('Form').querySelector('legend')).toHaveTextContent('Form');
    expect(glosses(menu('Form'))).toEqual(['ἀρετή finds ἀρετῆς and ἀρετάς', 'this spelling and no other', 'λογ finds λόγος and ἀναλογία']);
    expect(inMenu().querySelector('legend')).toHaveTextContent('In');
    expect(glosses(inMenu())).toEqual(['dubious and spurious included', `the ${AUTHENTIC_IDS.length} authentic works only`, 'pick works from the list']);
    // A gloss describes its radio; it is not part of the radio's name.
    const any = screen.getByLabelText('Any word') as HTMLInputElement;
    expect(document.getElementById(any.getAttribute('aria-describedby')!)).toHaveTextContent('at least one of them');
  });

  it('Esc shuts the open menu and gives the focus back to its trigger', async () => {
    render(Search);
    const m = menu('Match');
    await openMenu(m);
    (screen.getByLabelText('Any word') as HTMLInputElement).focus();
    await fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(m.open).toBe(false);
    expect(document.activeElement).toBe(m.querySelector('summary'));
  });

  it('a click outside shuts it; one menu is open at a time', async () => {
    render(Search);
    const match = menu('Match');
    const form = menu('Form');
    await openMenu(match);
    await openMenu(form);
    expect(match.open).toBe(false);
    expect(form.open).toBe(true);
    await fireEvent.click(document.querySelector('.sx-hint')!);
    expect(form.open).toBe(false);
  });

  it('holds its choices as one radio group, which the arrow keys walk', () => {
    // The arrow keys are the browser's own over a radio group: one name, one
    // fieldset, nothing in the way of the keys.
    render(Search);
    for (const d of [menu('Match'), menu('Form'), inMenu()]) {
      const radios = [...d.querySelectorAll<HTMLInputElement>('input[type=radio]')];
      expect(radios.length).toBe(3);
      expect(new Set(radios.map((r) => r.name)).size).toBe(1);
      expect(new Set(radios.map((r) => r.closest('fieldset'))).size).toBe(1);
      const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      radios[0].dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
  });
});

describe('In: all works, authentic works, or a choice', () => {
  it('Authentic works selects the authentic works and searches them as w=auth', async () => {
    const { search } = await import('../lib/search');
    render(Search);
    expect(inMenu().querySelector('summary')).toHaveTextContent(/^In all works$/);
    await fireEvent.click(within(inMenu()).getByLabelText('Authentic works'));
    expect(inMenu().querySelector('summary')).toHaveTextContent(/^In authentic works$/);
    expect((within(inMenu()).getByLabelText('Authentic works') as HTMLInputElement).checked).toBe(true);
    await type('λόγος');
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    expect(vi.mocked(search).mock.calls[0][5]).toEqual(ALL.filter((id) => AUTHENTIC_IDS.includes(id)));
    expect(new URLSearchParams(window.location.search).get('w')).toBe('auth');
    await fireEvent.click(within(inMenu()).getByLabelText('All works'));
    expect(inMenu().querySelector('summary')).toHaveTextContent(/^In all works$/);
  });

  it('opens w=auth as authentic works', async () => {
    window.history.replaceState(null, '', '/search?g=logos&w=auth');
    const { search } = await import('../lib/search');
    render(Search);
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    expect(inMenu().querySelector('summary')).toHaveTextContent(/^In authentic works$/);
    expect((within(inMenu()).getByLabelText('Authentic works') as HTMLInputElement).checked).toBe(true);
  });

  it('reads the mock-up’s old exclusion list as the pick it is, the Isagoge kept', async () => {
    window.history.replaceState(null, '', `/search?g=logos&w=-${MOCK_NOT.join(',')}`);
    const { search } = await import('../lib/search');
    render(Search);
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    expect(inMenu().querySelector('summary')).toHaveTextContent(`In ${ALL.length - MOCK_NOT.length} of ${ALL.length}`);
    expect((within(inMenu()).getByLabelText('Authentic works') as HTMLInputElement).checked).toBe(false);
  });

  it('Choose works… opens the picker, In showing open while it is; Done shuts it and returns to In', async () => {
    const { container } = render(Search);
    const m = inMenu();
    await openMenu(m);
    await fireEvent.click(within(m).getByLabelText('Choose works…'));
    expect(m.open).toBe(false);
    expect(m).toHaveClass('picking');
    const panel = container.querySelector('#works-panel') as HTMLElement;
    expect(panel.hidden).toBe(false);
    // The radios still say what is selected: all of them.
    expect((within(m).getByLabelText('All works') as HTMLInputElement).checked).toBe(true);
    expect(within(panel).getByText(`${WORKS.length} of ${WORKS.length} works`)).toBeInTheDocument();
    const tabs = within(panel).getByRole('group', { name: 'Filter works by authorship status' });
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual(['All', `Authentic${AUTHENTIC_IDS.length}`, 'Dubious3', 'Spurious13']);
    await fireEvent.click(within(tabs).getByRole('button', { name: /^Authentic/ }));
    expect(inMenu().querySelector('summary')).toHaveTextContent(/^In authentic works$/);
    expect(within(panel).getByText(`${AUTHENTIC_IDS.length} of ${WORKS.length} works`)).toBeInTheDocument();
    await fireEvent.click(within(panel).getAllByRole('button', { name: 'Only these 6' })[0]);
    expect(inMenu().querySelector('summary')).toHaveTextContent(/^In 6 of \d+$/);
    await fireEvent.click(within(panel).getByRole('button', { name: 'Done' }));
    expect(panel.hidden).toBe(true);
    expect(m).not.toHaveClass('picking');
    expect(document.activeElement).toBe(m.querySelector('summary'));
  });

  it('Find a work narrows the list by title', async () => {
    const { container } = render(Search);
    await fireEvent.click(within(inMenu()).getByLabelText('Choose works…'));
    const panel = container.querySelector('#works-panel') as HTMLElement;
    await fireEvent.input(within(panel).getByRole('searchbox', { name: 'Find a work' }), { target: { value: 'ethic' } });
    expect([...panel.querySelectorAll('.work-chip')].map((b) => b.textContent))
      .toEqual(['Nicomachean Ethics', 'Eudemian Ethics']);
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
    await fireEvent.click(screen.getByRole('button', { name: 'Lemma' }));
    await type('log');
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
    await fireEvent.click(screen.getByRole('button', { name: 'Lemma' }));
    await type('log');
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
    expect((container.querySelector('details.combo-panel') as HTMLDetailsElement).open).toBe(true);
    expect(container.querySelector('.lemma-panel')).toBeNull();
  });

  it('Keyboard and Beta Code sit on the Greek field’s line', () => {
    render(Search);
    const row = greekBox().closest('.sq-row')!;
    expect(within(row as HTMLElement).getByRole('button', { name: 'Greek keyboard' })).toHaveTextContent('Keyboard');
    expect(within(row as HTMLElement).getByRole('button', { name: 'β Beta Code' })).toBeInTheDocument();
  });
});
