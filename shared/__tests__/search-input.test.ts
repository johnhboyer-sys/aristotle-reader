// PR 6, Input: dictionary-word suggestions under the Greek box, the
// on-screen Greek keyboard, and the "Case exact" filter.
import axe from 'axe-core';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData } from '../lib/data';

const { fixtureBook } = vi.hoisted(() => ({
  fixtureBook: {
    book: 1,
    segments: [
      {
        id: 'seg1',
        column: '70a',
        greek: [
          { n: 1, text: 'Σωκράτης σωκράτης Σωκρατης', tokens: [{ t: 'Σωκράτης', o: 0, k: 'swkraths' }, { t: 'σωκράτης', o: 9, k: 'swkraths' }, { t: 'Σωκρατης', o: 18, k: 'swkraths' }] },
        ],
        english: { text: 'Socrates.', notes: [], markers: [], bekker: [{ n: 1, offset: 0, real: true }] },
        chapterStarts: [],
      },
    ],
  } satisfies BookData,
}));

vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return {
    ...actual,
    // Positions 0 and 1 by default; with the speaker filter, EN's words,
    // which are 1 and 2 (σωκράτης, Σωκρατης).
    search: vi.fn(async (...args: unknown[]) => ({
      results: [{ work: 'EN', meta: { id: 'seg1', book: 1, column: '70a' }, grkMatch: true, engMatch: false,
        grkPositions: (args[8] as { names?: string[] } | undefined)?.names?.includes('EN') ? [1, 2] : [0, 1] }],
      failedWorks: [],
    })),
    searchCombo: vi.fn(async () => ({ results: [], failedWorks: [] })),
    searchPhraseVariants: vi.fn(),
    speakerRoster: vi.fn(async () => []),
  };
});

// Keys under l: λόγος is the commonest, then λογόω, λογισμός; λαμβάνω does
// not start with "log". Keys under y for ψυχή.
const SHARDS: Record<string, Record<string, { n: number; c: { h: string; k: string; s?: string }[] }>> = {
  l: {
    logismos: { n: 74, c: [{ h: 'λογισμός', k: 'logismo/s', s: 'logismos' }] },
    logos: { n: 2483, c: [{ h: 'λόγος', k: 'lo/gos', s: 'logos' }] },
    logow: { n: 516, c: [{ h: 'λογόω', k: 'logo/w', s: 'logoo' }] },
    rackhamanw: { n: 3000, c: [{ h: 'λαμβάνω', k: 'rackhama/nw', s: 'rackhamano' }] },
  },
  y: { yuxh: { n: 1026, c: [{ h: 'ψυχή', k: 'yuxh/', s: 'psyche' }] } },
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

// Anything not mocked above is not found, rather than asked of the network.
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

const greekBox = () => document.querySelector('#grk-input') as HTMLInputElement;
async function type(value: string, caret = value.length) {
  const el = greekBox();
  el.focus();
  el.value = value;
  el.setSelectionRange(caret, caret);
  await fireEvent.input(el);
}
const list = () => screen.findByRole('listbox', { name: 'Dictionary words' });
const heads = (lb: HTMLElement) => within(lb).getAllByRole('option').map((o) => o.querySelector('.hw')?.textContent);
const key = (k: string) => fireEvent.keyDown(greekBox(), { key: k });

describe('Search: dictionary words under the Greek box', () => {
  it('lists headword, count and gloss as you type, commonest first', async () => {
    render(Search);
    await type('log');
    const lb = await list();
    expect(heads(lb)).toEqual(['λόγος', 'λογόω', 'λογισμός']);
    const first = within(lb).getAllByRole('option')[0];
    expect(first.querySelector('.ct')).toHaveTextContent('2,483');
    await vi.waitFor(() => expect(first.querySelector('.gl')).toHaveTextContent('word; speech'));
    expect(greekBox()).toHaveAttribute('role', 'combobox');
    expect(greekBox()).toHaveAttribute('aria-expanded', 'true');
    expect(greekBox()).toHaveAttribute('aria-controls', lb.id);
  });

  it('walks the list with Up and Down, and Esc shuts it leaving the text', async () => {
    render(Search);
    await type('log');
    const lb = await list();
    const opts = within(lb).getAllByRole('option');
    await key('ArrowDown');
    expect(greekBox()).toHaveAttribute('aria-activedescendant', opts[0].id);
    expect(opts[0]).toHaveAttribute('aria-selected', 'true');
    await key('ArrowDown');
    expect(greekBox()).toHaveAttribute('aria-activedescendant', opts[1].id);
    await key('ArrowUp');
    expect(greekBox()).toHaveAttribute('aria-activedescendant', opts[0].id);
    await key('ArrowUp');
    expect(greekBox()).toHaveAttribute('aria-activedescendant', opts[2].id);
    await key('Escape');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(greekBox()).toHaveAttribute('aria-expanded', 'false');
    expect(greekBox().value).toBe('log');
  });

  it('Enter on a highlighted word puts it in the box, caret after it, and does not search (John, 2026-11-11)', async () => {
    const { search } = await import('../lib/search');
    const { container } = render(Search);
    await type('log');
    await list();
    await key('ArrowDown');
    await key('Enter');
    await vi.waitFor(() => expect(greekBox().value).toBe('λόγος'));
    expect(greekBox().selectionStart).toBe(5);
    expect(greekBox().selectionEnd).toBe(5);
    expect(document.activeElement).toBe(greekBox());
    expect(screen.queryByRole('listbox')).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(search).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
    expect(container.querySelector('.lemma-panel .lpsel .hw')).toBeNull();
    // The Search button then runs it, as typed.
    await fireEvent.submit(document.querySelector('form.search-form')!);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(vi.mocked(search).mock.calls[0][0]).toBe('λόγος');
  });

  it('a click picks too, in place of the word typed', async () => {
    const { search } = await import('../lib/search');
    render(Search);
    await type('log');
    const lb = await list();
    await fireEvent.click(within(lb).getAllByRole('option')[1]);
    await vi.waitFor(() => expect(greekBox().value).toBe('λογόω'));
    expect(greekBox().selectionStart).toBe(5);
    expect(document.activeElement).toBe(greekBox());
    expect(screen.queryByRole('listbox')).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(search).not.toHaveBeenCalled();
  });

  it('Enter with nothing highlighted searches what was typed', async () => {
    const { search } = await import('../lib/search');
    render(Search);
    await type('log');
    await list();
    await key('Enter');
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    expect(vi.mocked(search).mock.calls[0].slice(0, 1)).toEqual(['log']);
    expect(vi.mocked(search).mock.calls[0][6]).toBe('lemma');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it.each([['a wildcard', 'log*'], ['a one-letter wildcard', 'lo?os'], ['a second word', 'log kai']])(
    'offers nothing for %s', async (_label, text) => {
      render(Search);
      await type('log');
      await list();
      await type(text);
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(greekBox()).toHaveAttribute('aria-expanded', 'false');
    });

  it('works beside the Beta Code box, which keeps converting and the caret', async () => {
    render(Search);
    await fireEvent.click(document.querySelector('button.tog')!);
    await type('lo/g');
    expect(greekBox().value).toBe('λόγ');
    expect(greekBox().selectionStart).toBe(3);
    expect(heads(await list())).toEqual(['λόγος', 'λογόω', 'λογισμός']);
  });

  it('drops the old list the moment the text changes: Enter acts on the new text', async () => {
    const { search } = await import('../lib/search');
    const { fetchLemmaPickerShard } = await import('../lib/data');
    const fetchShard = vi.mocked(fetchLemmaPickerShard);
    const orig = fetchShard.getMockImplementation()!;
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    fetchShard.mockImplementation(async (letter: string) => {
      if (letter === 'y') await held;
      return orig(letter);
    });
    try {
      render(Search);
      await type('log');
      await list();
      await key('ArrowDown');
      await type('ψ');
      // The y shard is still on its way: no list, nothing highlighted.
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(greekBox()).not.toHaveAttribute('aria-activedescendant');
      await key('Enter');
      await vi.waitFor(() => expect(search).toHaveBeenCalled());
      expect(vi.mocked(search).mock.calls[0][0]).toBe('ψ');
      release();
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByRole('listbox')).toBeNull();
    } finally {
      release();
      fetchShard.mockImplementation(orig);
    }
  });

  it.each([['historyUndo'], ['historyRedo']])('an undo or redo refreshes the list (%s)', async (inputType) => {
    render(Search);
    await type('log');
    await list();
    const el = greekBox();
    el.value = '';
    await fireEvent.input(el, { inputType });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(el).toHaveAttribute('aria-expanded', 'false');
  });

  it('Back or Forward shuts the list over the restored search', async () => {
    window.history.replaceState(null, '', `/search?g=${encodeURIComponent('Σωκράτης')}`);
    render(Search);
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('instances'));
    await type('log');
    await list();
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('listbox')).toBeNull();
    // Back to the empty page, where no search runs.
    await type('log');
    await list();
    window.history.replaceState(null, '', '/search');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('has no serious axe violations with the list open', async () => {
    const { container } = render(Search);
    await type('log');
    await list();
    await key('ArrowDown');
    const results = await axe.run(container);
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});

describe('Search: the Greek keyboard', () => {
  const kbdButton = () => screen.getByRole('button', { name: 'Greek keyboard' });
  const pad = () => screen.getByRole('group', { name: 'Greek keyboard' });
  const press = (name: string) => fireEvent.click(within(pad()).getByRole('button', { name }));

  it('opens under the box and types ψυχή into it, the search reading it', async () => {
    const { search } = await import('../lib/search');
    render(Search);
    expect(kbdButton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Greek keyboard' })).toBeNull();
    await fireEvent.click(kbdButton());
    expect(kbdButton()).toHaveAttribute('aria-expanded', 'true');
    for (const k of ['ψ', 'υ', 'χ', 'η']) await press(k);
    await press('acute');
    expect(greekBox().value).toBe('ψυχή');
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    expect(vi.mocked(search).mock.calls[0][0]).toBe('ψυχή');
  });

  it('combines marks with the letter before the caret, and backspace takes a letter', async () => {
    render(Search);
    await fireEvent.click(kbdButton());
    for (const k of ['α', 'iota subscript', 'acute', 'rough breathing']) await press(k);
    expect(greekBox().value).toBe('ᾅ');
    await press('space');
    await press('λ');
    expect(greekBox().value).toBe('ᾅ λ');
    await press('backspace');
    await press('backspace');
    expect(greekBox().value).toBe('ᾅ');
    await press('backspace');
    expect(greekBox().value).toBe('');
  });

  it('types at the caret, not at the end', async () => {
    render(Search);
    await type('λγος', 1);
    await fireEvent.click(kbdButton());
    await press('ο');
    expect(greekBox().value).toBe('λογος');
    await press('acute');
    expect(greekBox().value).toBe('λόγος');
    expect(greekBox().selectionStart).toBe(2);
  });

  it('Esc and the close key shut it and hand focus back to the box', async () => {
    render(Search);
    await fireEvent.click(kbdButton());
    within(pad()).getByRole('button', { name: 'λ' }).focus();
    await fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Greek keyboard' })).toBeNull();
    expect(document.activeElement).toBe(greekBox());
    await fireEvent.click(kbdButton());
    await press('close');
    expect(screen.queryByRole('group', { name: 'Greek keyboard' })).toBeNull();
    expect(document.activeElement).toBe(greekBox());
  });

  it('is a sheet from the bottom on a phone, and a panel under the box elsewhere', async () => {
    const page = render(Search);
    await fireEvent.click(kbdButton());
    expect(pad()).toHaveClass('gk');
    expect(pad()).not.toHaveClass('gk-sheet');
    page.unmount();
    const spy = vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => ({
      matches: media.includes('680px'), media, onchange: null, addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    }) as unknown as MediaQueryList);
    try {
      render(Search);
      await fireEvent.click(kbdButton());
      expect(pad()).toHaveClass('gk-sheet');
    } finally {
      spy.mockRestore();
    }
  });

  it('a pick from the list shuts it, the word in the box and focus kept, caret after it (John, 2026-11-11)', async () => {
    const { search } = await import('../lib/search');
    render(Search);
    await fireEvent.click(kbdButton());
    await type('log');
    const lb = await list();
    expect(pad()).toContainElement(lb);
    await fireEvent.click(within(lb).getAllByRole('option')[0]);
    await vi.waitFor(() => expect(greekBox().value).toBe('λόγος'));
    expect(screen.queryByRole('group', { name: 'Greek keyboard' })).toBeNull();
    expect(kbdButton()).toHaveAttribute('aria-expanded', 'false');
    expect(greekBox()).not.toHaveAttribute('inputmode');
    expect(document.activeElement).toBe(greekBox());
    expect(greekBox().selectionStart).toBe(5);
    expect(greekBox().selectionEnd).toBe(5);
    await new Promise((r) => setTimeout(r, 20));
    expect(search).not.toHaveBeenCalled();
  });

  it('on a phone, Enter on a highlighted word shuts the sheet too', async () => {
    const spy = vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => ({
      matches: media.includes('680px'), media, onchange: null, addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    }) as unknown as MediaQueryList);
    try {
      render(Search);
      await fireEvent.click(kbdButton());
      expect(pad()).toHaveClass('gk-sheet');
      await type('log');
      await list();
      await key('ArrowDown');
      await key('Enter');
      await vi.waitFor(() => expect(greekBox().value).toBe('λόγος'));
      expect(screen.queryByRole('group', { name: 'Greek keyboard' })).toBeNull();
      expect(document.activeElement).toBe(greekBox());
      expect(greekBox().selectionStart).toBe(5);
    } finally {
      spy.mockRestore();
    }
  });

  it('names the keyboard it controls only while it is there', async () => {
    render(Search);
    expect(kbdButton()).not.toHaveAttribute('aria-controls');
    await fireEvent.click(kbdButton());
    expect(kbdButton()).toHaveAttribute('aria-controls', pad().id);
    await press('close');
    expect(kbdButton()).not.toHaveAttribute('aria-controls');
  });

  it('has no serious axe violations when open', async () => {
    const { container } = render(Search);
    await fireEvent.click(kbdButton());
    const results = await axe.run(container);
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});

describe('Search: "Case exact"', () => {
  // The fixture's hits are Σωκράτης (position 0) and σωκράτης (position 1);
  // Σωκρατης (position 2, no accent) is a hit only where a test says so.
  // Each case waits for the hits to draw, so no <mark> means filtered.
  async function marksFor(url: string): Promise<string[]> {
    const { fetchBook } = await import('../lib/data');
    window.history.replaceState(null, '', url);
    const { container } = render(Search);
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/\d+ instances?/));
    await vi.waitFor(() => expect(fetchBook).toHaveBeenCalled());
    await vi.waitFor(() => expect(container.querySelector('.inst-body')).not.toBeNull());
    return [...container.querySelectorAll('mark')].map((m) => m.textContent ?? '');
  }
  const g = (q: string) => `/search?g=${encodeURIComponent(q)}`;

  it('is off by default: both cases are hits', async () => {
    expect(await marksFor(g('Σωκράτης'))).toEqual(['Σωκράτης', 'σωκράτης']);
  });

  it('on, a capitalised name finds only the capitalised token', async () => {
    expect(await marksFor(`${g('Σωκράτης')}&cs=1`)).toEqual(['Σωκράτης']);
    // The count is the filtered one, said plainly (audit, 2026-11-11).
    expect(screen.getByRole('status')).toHaveTextContent('1 instance');
    expect(screen.getByRole('status')).not.toHaveTextContent('before');
  });

  it('on, a lower-case query finds only the lower-case token', async () => {
    expect(await marksFor(`${g('σωκράτης')}&cs=1`)).toEqual(['σωκράτης']);
  });

  it.each([['*swkra/ths', 'Σωκράτης'], ['swkraths', 'σωκράτης'], ['*sw*', 'Σωκράτης']])(
    'reads Beta Code %s by its * capital', async (q, want) => {
      expect(await marksFor(`${g(q)}&cs=1`)).toEqual([want]);
    });

  it('ignores accents unless they are exact too', async () => {
    expect(await marksFor(`${g('Σωκρατης')}&cs=1`)).toEqual(['Σωκράτης']);
  });

  it('with accents exact too, both must hold', async () => {
    // All three are hits: σωκράτης fails the case, Σωκρατης the accent.
    const { search } = await import('../lib/search');
    vi.mocked(search).mockImplementationOnce(async () => ({
      results: [{ work: 'EN', meta: { id: 'seg1', book: 1, column: '70a' }, grkMatch: true, engMatch: false, grkPositions: [0, 1, 2] }],
      failedWorks: [],
    }));
    expect(await marksFor(`${g('Σωκράτης')}&cs=1&acc=1`)).toEqual(['Σωκράτης']);
  });

  it('applies while ignoring an unsupported speaker parameter', async () => {
    const { search } = await import('../lib/search');
    // The speaker parameter is ignored; case still keeps the capital hit.
    expect(await marksFor(`${g('Σωκράτης')}&cs=1&sp=only&sn=EN`)).toEqual(['Σωκράτης']);
    expect(vi.mocked(search).mock.calls[0][8]).toBeUndefined();
  });

  it('is a one-tap switch beside Accents, on every width, and its choice goes in the address (John, 2026-11-11)', async () => {
    const { search } = await import('../lib/search');
    render(Search);
    const sw = screen.getByRole('button', { name: /^Case / });
    expect(sw.closest('details')).toBeNull();
    expect(sw.previousElementSibling).toHaveTextContent(/^Accents/);
    expect(sw).toHaveTextContent('Case ignored');
    expect(sw).toHaveAttribute('aria-pressed', 'false');
    expect(sw.querySelector('svg')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Match case exactly' })).toBeNull();
    await fireEvent.click(sw);
    expect(sw).toHaveTextContent('Case exact');
    expect(sw).toHaveAttribute('aria-pressed', 'true');
    await type('Σωκράτης');
    await key('Escape');
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    expect(window.location.search).toBe(`?g=${encodeURIComponent('Σωκράτης')}&cs=1`);
  });

  it('Accents is a one-tap switch too, read from the address and written back (John, 2026-11-11)', async () => {
    const { search } = await import('../lib/search');
    render(Search);
    const sw = screen.getByRole('button', { name: /^Accents / });
    expect(sw.closest('details')).toBeNull();
    expect(sw).toHaveTextContent('Accents ignored');
    expect(sw).toHaveAttribute('aria-pressed', 'false');
    expect(sw.querySelector('svg')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Match accents exactly' })).toBeNull();
    await fireEvent.click(sw);
    expect(sw).toHaveTextContent('Accents exact');
    expect(sw).toHaveAttribute('aria-pressed', 'true');
    await type('λόγος');
    await key('Escape');
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    expect(new URLSearchParams(window.location.search).get('acc')).toBe('1');
    await fireEvent.click(sw);
    expect(sw).toHaveTextContent('Accents ignored');
    expect(sw).toHaveAttribute('aria-pressed', 'false');
  });
});
