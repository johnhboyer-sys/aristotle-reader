// S3, the proximity editor (HANDOFF-SEARCH-BUILD §5.5, round 34 d06-d28,
// n01-n08): the summary sentence and its links, the editor's terms, joiners
// and targets, the pending state, and the keyboard.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
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
    lemmaOptions: vi.fn(async (folds: string[]) => folds.map((f) => (f === 'arethn' ? ['areth'] : []))),
  };
});

const SHARDS: Record<string, Record<string, { n: number; c: { h: string; k: string; s?: string }[] }>> = {
  a: { areth: { n: 967, c: [{ h: 'ἀρετή', k: 'a)reth/', s: 'arete' }] } },
  e: { ecis: { n: 547, c: [{ h: 'ἕξις', k: 'e(/cis', s: 'hexis' }] } },
  h: { hdonh: { n: 658, c: [{ h: 'ἡδονή', k: 'h(donh/', s: 'hedone' }] } },
};
vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchBook: vi.fn(async () => fixtureBook.book),
    fetchChapters: vi.fn(async () => ({ '1': [{ column: '70a', chapter: '1', line: '1' }] })),
    fetchLemmaPickerShard: vi.fn(async (letter: string) => SHARDS[letter] ?? {}),
    fetchLemmaGlosses: vi.fn(async () => []),
  };
});

// The desktop editor (round 34, d06): the desktop's query matches. (S5b: a
// screen that matches no query is a narrow one, as b-search.css draws it.)
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response);
  vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => ({
    matches: media === '(min-width: 961px)', media, onchange: null, addListener() {}, removeListener() {},
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
const terms = () => [...document.querySelectorAll<HTMLElement>('#advanced-tools .combo-slot')];
const summary = () => document.querySelector('.prox-sum')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const select = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement;
const pick = async (name: string, value: string) => fireEvent.change(select(name), { target: { value } });
async function arrive(qs: string) {
  window.history.replaceState(null, '', `/search?${qs}`);
  const page = render(Search);
  const { searchCombo } = await import('../lib/search');
  await vi.waitFor(() => expect(searchCombo).toHaveBeenCalled());
  await vi.waitFor(() => expect(summary()).not.toBeNull());
  await screen.findByRole('button', { name: 'Search' });
  return page;
}
const lastSlots = async () => {
  const { searchCombo } = await import('../lib/search');
  return vi.mocked(searchCombo).mock.calls.at(-1)![0];
};

describe('a proximity search from the address', () => {
  it('shows its sentence with Turn off, Change and Guide, the editor shut, and a dot on Proximity', async () => {
    await arrive('c=l:areth&c=l:ecis&c=lb:hdonh&cw=10');
    expect(summary()).toBe('ἕξις near ἀρετή, ἡδονή before ἀρετή, within 10 words');
    expect(editor()).toBeNull();
    expect(prox()).toHaveAttribute('aria-expanded', 'false');
    expect(prox().querySelector('.prox-dot')).not.toBeNull();
    expect(prox()).toHaveAccessibleName('Proximity search, on');
    const links = document.querySelector('.prox-links')!;
    expect([...links.querySelectorAll('button, a')].map((x) => x.textContent)).toEqual(['Turn off', 'Change', 'Guide']);
    // The top Search stays while the editor is shut.
    expect(screen.getByRole('button', { name: 'Search' }).closest('#advanced-tools')).toBeNull();
  });

  it('names an or-joined term, a target, and the works', async () => {
    await arrive('c=l:areth&c=l:ecis&c=lo:hdonh&cw=10&w=auth');
    expect(summary()).toBe('either ἕξις or ἡδονή near ἀρετή, within 10 words, in authentic works');
  });

  it('Turn off goes back to the search the boxes hold, or none', async () => {
    await arrive('c=l:areth&c=l:ecis');
    await fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await vi.waitFor(() => expect(summary()).toBeNull());
    expect(location.search).toBe('');
    expect(prox().querySelector('.prox-dot')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(prox()));
  });
});

// John, 12 Nov: the box shows the terms, "; " between them, at full ink and
// read-only while proximity is live; Turn off gives the box back.
describe('the search box while proximity is live', () => {
  const box = () => document.getElementById('grk-input') as HTMLInputElement;
  const keyboard = () => screen.getByRole('button', { name: 'Greek keyboard' });
  const beta = () => screen.getByRole('button', { name: /Beta Code/ });

  it('shows the terms in term order, an or-run as one item, a grammar term as its description', async () => {
    await arrive('c=l:areth&c=l:ecis&c=lo:hdonh&c=g:case.gen,number.pl&cw=10');
    await vi.waitFor(() => expect(box().value).toBe('ἀρετή; ἕξις or ἡδονή; genitive plural'));
    expect(box()).toBeDisabled();
    expect(box()).toHaveAttribute('lang', 'grc');
    expect(keyboard()).toBeDisabled();
    expect(beta()).toBeDisabled();
  });

  it('shows the terms on the English tab too', async () => {
    await arrive('c=l:areth&c=l:ecis');
    await fireEvent.click(screen.getByRole('button', { name: 'English', pressed: false }));
    await vi.waitFor(() => expect(box().value).toBe('ἀρετή; ἕξις'));
    expect(box().closest('.sq-row')).not.toHaveAttribute('hidden');
  });

  it('Turn off gives back the empty box and its tools', async () => {
    await arrive('c=l:areth&c=l:ecis');
    await vi.waitFor(() => expect(box().value).toBe('ἀρετή; ἕξις'));
    await fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await vi.waitFor(() => expect(summary()).toBeNull());
    expect(box().value).toBe('');
    expect(box()).not.toBeDisabled();
    expect(box()).toHaveAttribute('placeholder', 'e.g. τέχνη');
    expect(keyboard()).not.toBeDisabled();
    expect(beta()).not.toBeDisabled();
  });

  it('shows the open editor\'s terms once they make a search, and keeps the typed query for after', async () => {
    window.history.replaceState(null, '', '/search');
    render(Search);
    await fireEvent.input(box(), { target: { value: 'ἀρετή' } });
    await fireEvent.click(prox());
    // Term 1 takes the query; one term is no search, so the box is the page's.
    await vi.waitFor(() => expect(within(terms()[0]).getByText('ἀρετή')).toBeInTheDocument());
    expect(box().value).toBe('ἀρετή');
    expect(box()).not.toBeDisabled();
    await pick('Kind for term 2', 'grammatical');
    await fireEvent.click(within(screen.getByRole('group', { name: 'Case' })).getByRole('button', { name: 'acc' }));
    await vi.waitFor(() => expect(box().value).toBe('ἀρετή; accusative'));
    expect(box()).toBeDisabled();
    // Shut, nothing searched: the box is the page's again.
    await fireEvent.click(prox());
    await vi.waitFor(() => expect(box()).not.toBeDisabled());
    expect(box().value).toBe('ἀρετή');
  });

  it('shuts the Greek keyboard when proximity takes the box', async () => {
    window.history.replaceState(null, '', '/search');
    render(Search);
    await fireEvent.click(keyboard());
    expect(document.getElementById('grk-keys')).not.toBeNull();
    window.history.pushState(null, '', '/search?c=l:areth&c=l:ecis');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(box().value).toBe('ἀρετή; ἕξις'));
    expect(document.getElementById('grk-keys')).toBeNull();
  });
});

describe('the editor', () => {
  it('opens from Change with Close in its place; one Search, its own; Match and Form step back', async () => {
    await arrive('c=l:areth&c=l:ecis');
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(editor()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    const searches = screen.getAllByRole('button', { name: 'Search' });
    expect(searches).toHaveLength(1);
    expect(searches[0].closest('#advanced-tools')).not.toBeNull();
    expect(document.querySelector('.sopt')).toHaveClass('prox-editing');
    // Column heads on term 1's line; term 2 reads "and", near, ἀρετή, any form, Remove.
    expect([...terms()[0].querySelectorAll('.prox-colh')].map((h) => h.textContent)).toEqual(['Term 1', 'Relation', 'Kind', 'Distance']);
    expect(select('Join term 2 to term 1').value).toBe('and');
    expect(select('Relation of term 2').value).toBe('near');
    const target = select('Term 2 is measured from');
    expect(target.selectedOptions[0].textContent).toBe('ἀρετή');
    expect(select('Kind for term 2').selectedOptions[0].textContent).toBe('any form');
    expect(screen.getByRole('button', { name: 'Remove term 2' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Distance in words' })).toHaveValue(5);
  });

  it('marks an edit as not searched until its Search, and dims the results', async () => {
    await arrive('c=l:areth&c=l:ecis&cw=10');
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(document.querySelector('.prox-pend')).toBeNull();
    await pick('Relation of term 2', 'before');
    expect(summary()).toBe('Last search · ἕξις near ἀρετή, within 10 words');
    expect(document.querySelector('.prox-pend')).toHaveTextContent('Not searched yet: ἕξις before ἀρετή, within 10 words');
    expect(document.querySelector('main')).toHaveClass('prox-pending');
    // Before or after set the order: the lock gives way to a line.
    expect(screen.queryByRole('checkbox', { name: 'In this order' })).toBeNull();
    expect(screen.getByText('Order set by before or after')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(async () => expect((await lastSlots())[1]).toMatchObject({ relation: 'before' }));
    await vi.waitFor(() => expect(document.querySelector('.prox-pend')).toBeNull());
    expect(summary()).toBe('ἕξις before ἀρετή, within 10 words');
    expect(new URLSearchParams(location.search).getAll('c')).toEqual(['l:areth', 'lb:ecis']);
  });

  it('joins a term by "or": its relation reads "as term n", and the engine gets one term', async () => {
    await arrive('c=l:areth&c=l:ecis&c=l:hdonh&cw=10');
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await pick('Join term 3 to term 2', 'or');
    expect(within(terms()[2]).getByText('as term 2')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Relation of term 3' })).toBeNull();
    expect(terms()[1]).toHaveClass('prox-run');
    expect(terms()[2]).toHaveClass('prox-run');
    expect(terms()[0]).not.toHaveClass('prox-run');
    expect(document.querySelector('.prox-pend')).toHaveTextContent('Not searched yet: either ἕξις or ἡδονή near ἀρετή, within 10 words');
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(async () => expect(await lastSlots()).toEqual([
      { kind: 'lemma', terms: ['areth'], relation: 'near' },
      { kind: 'lemma', terms: ['ecis'], relation: 'near' },
      { kind: 'lemma', terms: ['hdonh'], relation: 'near', or: true },
    ]));
    expect(new URLSearchParams(location.search).getAll('c')).toEqual(['l:areth', 'l:ecis', 'lo:hdonh']);
  });

  it('measures a term from an earlier one, named by its word', async () => {
    await arrive('c=l:areth&c=l:ecis&c=l:hdonh&cw=5');
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    const target = select('Term 3 is measured from');
    expect([...target.options].map((o) => o.textContent)).toEqual(['ἀρετή', 'ἕξις']);
    await fireEvent.change(target, { target: { value: target.options[1].value } });
    expect(document.querySelector('.prox-pend')).toHaveTextContent('ἕξις near ἀρετή, ἡδονή near ἕξις, within 5 words');
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(async () => expect((await lastSlots())[2]).toEqual({ kind: 'lemma', terms: ['hdonh'], relation: 'near', target: 1 }));
    expect(new URLSearchParams(location.search).getAll('c')).toEqual(['l:areth', 'l:ecis', 'l2:hdonh']);
    // A NOT term is no word of the match: it is never offered as a target.
    await pick('Relation of term 2', 'not');
    expect([...select('Term 3 is measured from').options].map((o) => o.textContent)).toEqual(['ἀρετή']);
  });

  it('a grammar term shows every category as chips, one value each', async () => {
    await arrive('c=l:areth&c=g:case.gen,number.pl&cw=3');
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(within(terms()[1]).getByText('genitive plural')).toBeInTheDocument();
    const caseRow = screen.getByRole('group', { name: 'Case' });
    expect(within(caseRow).getAllByRole('button').map((b) => b.textContent)).toEqual(['nom', 'gen', 'dat', 'acc', 'voc']);
    expect(within(caseRow).getByRole('button', { name: 'gen' })).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(within(caseRow).getByRole('button', { name: 'dat' }));
    expect(within(caseRow).getByRole('button', { name: 'gen' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(terms()[1]).getByText('dative plural')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /part of speech/i })).toBeNull();
  });

  it('Add term adds a fresh empty term; it copies nothing', async () => {
    await arrive('c=l:areth&c=f:ἕξις');
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(select('Kind for term 2').value).toBe('form');
    await fireEvent.click(screen.getByRole('button', { name: 'Add term' }));
    expect(terms()).toHaveLength(3);
    expect(select('Kind for term 3').value).toBe('lemma');
    expect(select('Relation of term 3').value).toBe('near');
    const field = screen.getByRole('searchbox', { name: 'Term 3: a dictionary word' }) as HTMLInputElement;
    expect(field.value).toBe('');
    expect(field.placeholder).toBe('e.g. ἡδονή');
    expect(document.activeElement).toBe(field);
  });

  it('Escape closes it and the focus goes back to Proximity', async () => {
    render(Search);
    await fireEvent.click(prox());
    expect(editor()).not.toBeNull();
    (screen.getByRole('combobox', { name: 'Kind for term 1' }) as HTMLElement).focus();
    await fireEvent.keyDown(window, { key: 'Escape' });
    await tick();
    expect(editor()).toBeNull();
    expect(document.activeElement).toBe(prox());
  });
});

describe('term 1 and the page query', () => {
  it('takes the typed word when the editor opens on it, as its dictionary word', async () => {
    render(Search);
    await fireEvent.input(screen.getByLabelText('Greek'), { target: { value: 'ἀρετή' } });
    await fireEvent.click(prox());
    await vi.waitFor(() => expect(terms()[0].querySelector('.lpsel .hw')).toHaveTextContent('ἀρετή'));
    expect(within(terms()[0]).getByText('967')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Term 2: a dictionary word' })).toHaveValue('');
  });

  it('reads an inflected word as the dictionary word it is a form of, and two words as two terms', async () => {
    render(Search);
    await fireEvent.input(screen.getByLabelText('Greek'), { target: { value: 'ἀρετήν ἕξις' } });
    await fireEvent.click(prox());
    await vi.waitFor(() => expect(terms()[1].querySelector('.lpsel .hw')).toHaveTextContent('ἕξις'));
    expect(terms()[0].querySelector('.lpsel .hw')).toHaveTextContent('ἀρετή');
  });

  it('leaves a filled editor alone', async () => {
    await arrive('c=l:ecis&c=l:hdonh');
    await fireEvent.input(screen.getByLabelText('Greek'), { target: { value: 'ἀρετή' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(terms()[0].querySelector('.lpsel .hw')).toHaveTextContent('ἕξις');
  });
});

// Codex review of S3 (a31ffeb4b3), findings 4 and 5.
describe('editing after review', () => {
  it('removing an or-member keeps a term measured from it with the members left', async () => {
    // d is measured from c, which is joined to b by "or". Remove c: d stays with b.
    await arrive('c=l:a&c=l:b&c=lo:c&c=l3:d');
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Remove term 3' }));
    expect(select('Term 3 is measured from').selectedOptions[0].textContent).toBe('b');
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(async () => expect((await lastSlots()).map((s) => [s.terms![0], s.target ?? 0])).toEqual([['a', 0], ['b', 0], ['d', 1]]));
    expect(new URLSearchParams(location.search).getAll('c')).toEqual(['l:a', 'l:b', 'l2:d']);
  });

  it('an edit that leaves no complete search is still pending, and Search says what is missing', async () => {
    await arrive('c=l:areth&c=l:ecis');
    const { searchCombo } = await import('../lib/search');
    const calls = vi.mocked(searchCombo).mock.calls.length;
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Remove term 2' }));
    expect(summary()).toBe('Last search · ἕξις near ἀρετή, within 5 words');
    expect(document.querySelector('main')).toHaveClass('prox-pending');
    expect(document.querySelector('.prox-pend')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(document.querySelector('.prox-pend')).toHaveTextContent(/^Add a second term$/);
    await new Promise((r) => setTimeout(r, 20));
    expect(vi.mocked(searchCombo).mock.calls.length).toBe(calls);
    expect(new URLSearchParams(location.search).getAll('c')).toEqual(['l:areth', 'l:ecis']);
    expect(document.querySelector('main')).toHaveClass('prox-pending');
    // Adding a term back: the line goes, and the edit is a search again.
    await fireEvent.click(screen.getByRole('button', { name: 'Add term' }));
    expect(document.querySelector('.prox-pend')).toBeNull();
  });
});
