// The results page's side column (John, 2026-11-09: "Controls + summary").
// The controls sit in one place, labelled "Refine results": a column beside
// the hits on a wide screen, a sheet opened by the filter icon on a narrow
// one. "This search" lists what narrows or changes the results, each with a
// button that undoes it: since S4b (round 34) only at the head of the sheet's
// menu, as the rail has no summary. The controls themselves are tested where
// they were before (result-views-search, form-panel-search, ...); this file
// tests the column, the summary and the sheet.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, GreekLine } from '../lib/data';
import type { HitForms, HitGrammar, Reading, SearchResult } from '../lib/search';

const { book } = vi.hoisted(() => {
  const line = (n: number, text: string): GreekLine => ({
    n, text, tokens: text.split(' ').map((t, i) => ({ t, o: i * 2, k: t })),
  });
  const book = (n: number): BookData => ({
    book: n,
    segments: [
      { id: `${n}:70a`, column: '70a', greek: [line(1, 'ἐστί τῆς λόγος ἐστι')], english: { text: 'One two three four', notes: [], markers: [] } },
      { id: `${n}:70b`, column: '70b', greek: [line(1, 'καί ταῖς')], english: { text: 'five six', notes: [], markers: [] } },
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
  const sections = [{ column: '70a', chapter: '70', line: '1' }, { column: '70b', chapter: '70', line: '1' }];
  return {
    ...actual,
    fetchBook: vi.fn(async (_work: string, n: number) => book(n)),
    fetchChapters: vi.fn(async () => ({ '1': sections, '2': sections })),
  };
});

afterEach(async () => {
  const { greekHitGrammar } = await import('../lib/search');
  vi.mocked(greekHitGrammar).mockReset();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

const at = (work: string, column: string, grkPositions: number[]): SearchResult => ({
  work, meta: { id: `1:${column}`, book: 1, column }, grkMatch: true, engMatch: false, grkPositions,
});
const PRES_IND: Reading = { tense: ['pres'], mood: ['ind'], voice: ['act'], person: ['3rd'], number: ['sg'] };
const GEN_SG_FEM: Reading = { case: ['gen'], number: ['sg'], gender: ['fem'] };
const DAT_SG_FEM: Reading = { case: ['dat'], number: ['sg'], gender: ['fem'] };
const DAT_PL_FEM: Reading = { case: ['dat'], number: ['pl'], gender: ['fem'] };

// EN 70a: ἐστί τῆς ἐστι; 70b: ταῖς. Int 70a: ἐστί τῆς. Six hits, two of
// them genitive.
const RESULTS = [at('EN', '70a', [0, 1, 3]), at('EN', '70b', [1]), at('Int', '70a', [0, 1])];
// The same, with English: EN 70a in Rackham, 70b in Ross, Int 70a in
// Cooke. Nine hits; held to Rackham, only EN 70a is left, four.
const BILINGUAL: SearchResult[] = [
  { ...at('EN', '70a', [0, 1, 3]), engMatch: true, engHits: [{ translation: 'rackham', positions: [0] }] },
  { ...at('EN', '70b', [1]), engMatch: true, engHits: [{ translation: 'ross', positions: [0] }] },
  { ...at('Int', '70a', [0, 1]), engMatch: true, engHits: [{ translation: 'cooke', positions: [0] }] },
];
const FORMS: HitForms = {
  byResult: new Map([['EN:1:70a', ['esti', 'ths', 'esti']], ['EN:1:70b', ['tais']], ['Int:1:70a', ['esti', 'ths']]]),
  headwords: new Map(), failedWorks: [],
};
const GRAMMAR: HitGrammar = {
  byResult: new Map([
    ['EN:1:70a', [[PRES_IND], [GEN_SG_FEM, DAT_SG_FEM], [PRES_IND]]],
    ['EN:1:70b', [[DAT_PL_FEM]]],
    ['Int:1:70a', [[PRES_IND], [GEN_SG_FEM, DAT_SG_FEM]]],
  ]),
  failedWorks: [],
};

async function answer(results: SearchResult[] = RESULTS) {
  const { search, greekHitForms, greekHitGrammar } = await import('../lib/search');
  vi.mocked(search).mockResolvedValueOnce({ results, failedWorks: [] });
  vi.mocked(greekHitForms).mockResolvedValueOnce(FORMS);
  vi.mocked(greekHitGrammar).mockResolvedValueOnce(GRAMMAR);
}
async function open(url: string, results: SearchResult[] = RESULTS) {
  await answer(results);
  window.history.replaceState(null, '', url);
  const page = render(Search);
  // Settled once the results' controls and the first page's hits are drawn.
  await screen.findByRole('group', { name: 'Per page' });
  await vi.waitFor(() => expect(page.container.querySelectorAll('.group-head, .cite').length).toBeGreaterThan(0));
  return page;
}
const status = () => screen.getByRole('status');
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const summary = () => screen.getByRole('group', { name: 'This search' });
const chosen = () => [...(screen.queryByRole('group', { name: 'This search' })?.querySelectorAll('li') ?? [])].map(li => text(li.querySelector('span')));
const remove = (what: string) => within(summary()).getByRole('button', { name: `Remove ${what}` });
// The summary is the Filter sheet's: open it, and shut it to read the rail.
async function openSheet() {
  if (screen.queryByRole('dialog', { name: 'Filter' })) return;
  await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
  await screen.findByRole('dialog', { name: 'Filter' });
}
// A new search shuts the sheet; read the summary with the sheet open again.
async function sheetChosen() {
  await openSheet();
  return chosen();
}
async function shutSheet() {
  await fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter' })).getByRole('button', { name: 'Close' }));
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}
// What a control has chosen: its pressed buttons, or, in a display menu, its
// checked radio by its label.
const pressed = (group: string) =>
  [...screen.getByRole('group', { name: group }).querySelectorAll('button[aria-pressed="true"], input[type="radio"]:checked')]
    .map(el => text(el.closest('label') ?? el));
const G = `/search?g=${encodeURIComponent('εἰμί')}`;

describe('Search.svelte: the side column', () => {
  // The display settings are not in it: they are the menus over the hits
  // (set B, John 2026-11-10; search-display-bar.test.ts).
  it('holds every filter of the results in one landmark, "Refine results"', async () => {
    const { container } = await open(`${G}&v=grammar`);
    await screen.findByRole('group', { name: 'Greek forms found' });
    await screen.findByRole('group', { name: 'Narrow by grammar' });
    const side = screen.getByRole('complementary', { name: 'Refine results' });
    for (const name of ['Show hits from one work', 'Greek forms found', 'Narrow by grammar']) {
      expect(within(side).getByRole('group', { name })).toBeInTheDocument();
    }
    for (const name of ['Group by', 'Sort', 'Context', 'Per page']) {
      expect(within(side).queryByRole('group', { name })).toBeNull();
    }
    // Export is under the count, at the rail's head (r34-02), not among the filters.
    expect(within(side).queryByRole('button', { name: 'Export results as CSV' })).toBeNull();
    expect(container.querySelector('.sx-head')!.contains(screen.getByRole('button', { name: 'Export results as CSV' }))).toBe(true);
    // The hits are not in it.
    expect(side.querySelector('.group-head')).toBeNull();
  });

  it('shows the count once, and the status region still announces it', async () => {
    const { container } = await open(G);
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    // The number and its word are spans of one line (r34-02: the number large).
    const shown = container.querySelectorAll('.result-count');
    expect(shown).toHaveLength(1);
    expect(text(shown[0])).toBe('6 instances');
    expect(text(shown[0].querySelector('.rc-n'))).toBe('6');
    expect(text(shown[0].querySelector('.rc-w'))).toBe('instances');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('says "of N · restore all forms" under the count while forms are set aside, and restores them', async () => {
    const { search } = await import('../lib/search');
    const { container } = await open(`${G}&xf=ths`);
    await vi.waitFor(() => expect(status()).toHaveTextContent('4 instances'));
    const of = container.querySelector('.sx-head .sx-of')!;
    expect(text(of)).toBe('of 6 · restore all forms');
    await fireEvent.click(within(of as HTMLElement).getByRole('button', { name: 'restore all forms' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    expect(window.location.search).not.toContain('xf=');
    expect(container.querySelector('.sx-of')).toBeNull();
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('lists every translation with hits, by count, in a box of its own', async () => {
    await open(`${G}&e=one`, BILINGUAL);
    const trans = screen.getByRole('group', { name: 'Show English hits from one translation' });
    expect(text(trans.querySelector('.k'))).toBe('Translations by count');
    const box = trans.querySelector(':scope > .sx-list')!;
    expect(box.querySelectorAll('button.i')).toHaveLength(3);
    expect(within(trans).queryByRole('button', { name: /more$|^fewer$/ })).toBeNull();
    await fireEvent.click(within(trans).getByRole('button', { name: /^Rackham/ }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('4 instances'));
    expect(within(trans).getByRole('button', { pressed: true }).querySelector('.i-x')).toHaveTextContent('×');
  });
});

describe('Search.svelte: "This search"', () => {
  it('is not in the rail, and is not on the sheet for a plain search', async () => {
    await open(G);
    expect(screen.queryByRole('group', { name: 'This search' })).toBeNull();
    await openSheet();
    expect(screen.queryByRole('group', { name: 'This search' })).toBeNull();
  });

  it('lists exactly what narrows or changes the results, in the order of the controls', async () => {
    await open(`${G}&e=one&t=rackham&wf=EN&xf=tais&gf=case.gen&v=form&so=form&ctx=1&ps=20&sp=only&sn=EN`, BILINGUAL);
    await vi.waitFor(() => expect(status()).toHaveTextContent(/\d+ instances?/));
    // Round 34: the rail undoes each where it is set, with no summary.
    expect(screen.queryByRole('group', { name: 'This search' })).toBeNull();
    await openSheet();
    await vi.waitFor(() => expect(chosen()).toEqual([
      'Nicomachean Ethics', 'Rackham', '1 form set aside', 'Case gen', 'By form', 'Forms A–Z', '1 line', '20 a page',
    ]));
    for (const what of chosen()) expect(remove(what)).toHaveTextContent('×');
    expect(within(summary()).getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
  });

  it('names the other choices as their controls do', async () => {
    await open(`${G}&wf=EN&ps=c&ctx=s&sp=except&sn=EN,Socrates`);
    await openSheet();
    await vi.waitFor(() => expect(chosen()).toEqual(['Nicomachean Ethics', 'Whole section', 'Citations only']));
  });

  it('offers no "Clear all" for one thing', async () => {
    await open(`${G}&wf=EN`);
    await openSheet();
    expect(chosen()).toEqual(['Nicomachean Ethics']);
    expect(within(summary()).queryByRole('button', { name: 'Clear all' })).toBeNull();
  });

  // Each removal: the hits, the address and the control all go back, and
  // nothing is searched again.
  const cases: { what: string; url: string; results?: SearchResult[]; before: string; after: string; param: string; control: () => void }[] = [
    {
      what: 'Nicomachean Ethics', url: `${G}&wf=EN`, before: '4 instances', after: '6 instances', param: 'wf=',
      control: () => expect(pressed('Show hits from one work')).toEqual([]),
    },
    {
      what: 'Rackham', url: `${G}&e=one&t=rackham`, results: BILINGUAL, before: '4 instances', after: '9 instances', param: 't=',
      control: () => expect(pressed('Show English hits from one translation')).toEqual([]),
    },
    {
      what: '1 form set aside', url: `${G}&xf=ths`, before: '4 instances', after: '6 instances', param: 'xf=',
      control: () => {
        const boxes = within(screen.getByRole('group', { name: 'Greek forms found' })).getAllByRole('checkbox') as HTMLInputElement[];
        expect(boxes.map(b => b.checked)).toEqual([true, true, true]);
      },
    },
    {
      what: 'Case gen', url: `${G}&v=grammar&gf=case.gen`, before: '2 instances', after: '6 instances', param: 'gf=',
      control: () => {
        expect((within(screen.getByRole('group', { name: 'Narrow by grammar' })).getByRole('checkbox', { name: 'Case gen' }) as HTMLInputElement).checked).toBe(false);
        // The view, also chosen, stays.
        expect(pressed('Group by')).toEqual(['By grammar']);
      },
    },
    {
      what: 'By form', url: `${G}&v=form`, before: '6 instances', after: '6 instances', param: 'v=',
      control: () => expect(pressed('Group by')).toEqual(['By work']),
    },
    {
      what: 'Forms A–Z', url: `${G}&so=form`, before: '6 instances', after: '6 instances', param: 'so=',
      control: () => expect(pressed('Sort')).toEqual(['Bekker order']),
    },
    {
      what: '1 line', url: `${G}&ctx=1`, before: '6 instances', after: '6 instances', param: 'ctx=',
      control: () => expect(pressed('Context')).toEqual(['3 lines']),
    },
    {
      what: '20 a page', url: `${G}&ps=20`, before: '6 instances', after: '6 instances', param: 'ps=',
      control: () => expect(pressed('Per page')).toEqual(['40']),
    },
    {
      what: 'Citations only', url: `${G}&ps=c`, before: '6 instances', after: '6 instances', param: 'ps=',
      control: () => expect(pressed('Per page')).toEqual(['40']),
    },
  ];
  for (const c of cases) {
    it(`undoes "${c.what}" alone, without a new search`, async () => {
      const { search } = await import('../lib/search');
      await open(c.url, c.results);
      await vi.waitFor(() => expect(status()).toHaveTextContent(c.before));
      expect(window.location.search).toContain(c.param);
      await openSheet();
      const others = chosen().filter(w => w !== c.what);
      await fireEvent.click(remove(c.what));
      await vi.waitFor(() => expect(status()).toHaveTextContent(c.after));
      expect(window.location.search).not.toContain(c.param);
      expect(chosen()).toEqual(others);
      // The control, in the rail again once the sheet is shut.
      await shutSheet();
      c.control();
      expect(search).toHaveBeenCalledTimes(1);
    });
  }

  it('clears everything at once, without a new search', async () => {
    const { search } = await import('../lib/search');
    await open(`${G}&wf=EN&xf=tais&v=grammar&gf=case.gen&so=form&ctx=1&ps=20`);
    await vi.waitFor(() => expect(status()).toHaveTextContent('1 instance'));
    await openSheet();
    await fireEvent.click(within(summary()).getByRole('button', { name: 'Clear all' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    expect(chosen()).toEqual([]);
    expect(window.location.search).toBe(`?g=${encodeURIComponent('εἰμί')}`);
    expect(pressed('Group by')).toEqual(['By work']);
    expect(pressed('Per page')).toEqual(['40']);
    expect(search).toHaveBeenCalledTimes(1);
  });


});

// Below 1100px the column is a sheet, opened by the filter icon on the count
// row (P4, John 2026-11-10): a menu of the filters with "This search" at its
// head, each filter on a full screen of its own. The sort icon opens a second
// sheet of the display settings.
describe('Search.svelte: the Filter sheet', () => {
  const filter = () => screen.getByRole('button', { name: /^Filter/ });
  const sortBtn = () => screen.getByRole('button', { name: 'Sort and display' });

  it('says how many things are chosen, on a badge and in its name', async () => {
    await open(`${G}&wf=EN&v=form`);
    expect(filter()).toHaveAccessibleName('Filter, 2 chosen');
    expect(text(filter().querySelector('.sx-badge'))).toBe('2');
  });

  it('has no badge when nothing is chosen, and the icons carry no words', async () => {
    await open(G);
    expect(filter()).toHaveAccessibleName('Filter');
    expect(filter().querySelector('.sx-badge')).toBeNull();
    expect(text(filter())).toBe('');
    expect(text(sortBtn())).toBe('');
  });

  it('opens as a modal dialog with focus inside, and Escape shuts it and hands focus back', async () => {
    await open(G);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(filter()).toHaveAttribute('aria-expanded', 'false');
    await fireEvent.click(filter());
    const sheet = await screen.findByRole('dialog', { name: 'Filter' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(filter()).toHaveAttribute('aria-expanded', 'true');
    await vi.waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    await fireEvent.keyDown(document.activeElement ?? sheet, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(filter());
    // Shut, the controls are the side column again.
    expect(screen.getByRole('complementary', { name: 'Refine results' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Show hits from one work' })).toBeInTheDocument();
  });

  it('shuts on Close and on the backdrop', async () => {
    const { container } = await open(G);
    await fireEvent.click(filter());
    const sheet = await screen.findByRole('dialog', { name: 'Filter' });
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(filter());
    await fireEvent.click(filter());
    await screen.findByRole('dialog', { name: 'Filter' });
    await fireEvent.click(container.querySelector('.sx-scrim')!);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(filter());
  });

  it('lists the filters as a menu, each with what is set, and no filter itself', async () => {
    await open(`${G}&v=grammar`);
    await fireEvent.click(filter());
    const sheet = await screen.findByRole('dialog', { name: 'Filter' });
    const rows = within(sheet).getAllByRole('button', { name: /›$/ }).map(text);
    expect(rows).toEqual(['Works All 2 ›', 'Forms All 3 ›', 'Grammar Any ›']);
    for (const name of ['Show hits from one work', 'Greek forms found', 'Narrow by grammar']) {
      expect(within(sheet).queryByRole('group', { name })).toBeNull();
    }
    expect(within(sheet).getByRole('button', { name: 'Show 6 hits' })).toBeInTheDocument();
  });

  it('puts "This search" at the head of the menu when something is chosen, and only then', async () => {
    await open(`${G}&wf=EN`);
    await fireEvent.click(filter());
    let sheet = await screen.findByRole('dialog', { name: 'Filter' });
    const sum = within(sheet).getByRole('group', { name: 'This search' });
    expect(sheet.querySelector('.sx-menu')!.compareDocumentPosition(sum) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(chosen()).toEqual(['Nicomachean Ethics']);
    expect(text(within(sheet).getByRole('button', { name: /^Works/ }))).toBe('Works Nicomachean Ethics ›');
    await fireEvent.click(remove('Nicomachean Ethics'));
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    sheet = screen.getByRole('dialog', { name: 'Filter' });
    expect(within(sheet).queryByRole('group', { name: 'This search' })).toBeNull();
  });

  it('opens a filter on a screen of its own, and Back returns to the menu', async () => {
    const { search } = await import('../lib/search');
    await open(G);
    await fireEvent.click(filter());
    let sheet = await screen.findByRole('dialog', { name: 'Filter' });
    await fireEvent.click(within(sheet).getByRole('button', { name: /^Works/ }));
    sheet = await screen.findByRole('dialog', { name: 'Works' });
    await vi.waitFor(() => expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: '‹ Filter' })));
    expect(within(sheet).queryByRole('button', { name: /^Forms/ })).toBeNull();
    // A choice applies at once, and the screen stays.
    await fireEvent.click(within(within(sheet).getByRole('group', { name: 'Show hits from one work' })).getByRole('button', { name: /^Nicomachean Ethics/ }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('4 instances'));
    expect(screen.getByRole('dialog', { name: 'Works' })).toBeInTheDocument();
    expect(window.location.search).toContain('wf=EN');
    expect(search).toHaveBeenCalledTimes(1);
    await fireEvent.click(within(sheet).getByRole('button', { name: '‹ Filter' }));
    sheet = await screen.findByRole('dialog', { name: 'Filter' });
    await vi.waitFor(() => expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: /^Works/ })));
    expect(text(document.activeElement)).toBe('Works Nicomachean Ethics ›');
  });

  it('keeps Deselect all and Apply at the foot of the forms screen', async () => {
    await open(G);
    await fireEvent.click(filter());
    await fireEvent.click(within(await screen.findByRole('dialog', { name: 'Filter' })).getByRole('button', { name: /^Forms/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Forms' });
    const foot = sheet.querySelector('.sx-foot')!;
    expect([...foot.querySelectorAll('button')].map(text)).toEqual(['Deselect all', 'Apply']);
    expect(within(sheet).getAllByRole('checkbox')).toHaveLength(3);
  });

  it('clears the grammar from its screen', async () => {
    await open(`${G}&v=grammar`);
    await fireEvent.click(filter());
    await fireEvent.click(within(await screen.findByRole('dialog', { name: 'Filter' })).getByRole('button', { name: /^Grammar/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Grammar' });
    const clear = within(sheet).getByRole('button', { name: 'Clear' });
    expect(clear).toBeDisabled();
    await fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Case gen' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('2 instances'));
    expect(clear).not.toBeDisabled();
    await fireEvent.click(clear);
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    expect(window.location.search).not.toContain('gf=');
  });

  it('shuts from "Show N hits" and hands focus back', async () => {
    await open(G);
    await fireEvent.click(filter());
    const sheet = await screen.findByRole('dialog', { name: 'Filter' });
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Show 6 hits' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(filter());
  });
});

describe('Search.svelte: the Sort sheet', () => {
  const sortBtn = () => screen.getByRole('button', { name: 'Sort and display' });

  it('holds Sort, then Group by, Context and Per page, as the site\'s square boxes', async () => {
    await open(G);
    await fireEvent.click(sortBtn());
    const sheet = await screen.findByRole('dialog', { name: 'Sort and display' });
    const legends = [...sheet.querySelectorAll('fieldset legend')].map(text);
    expect(legends).toEqual(['Sort', 'Group by', 'Context', 'Per page']);
    for (const fs of sheet.querySelectorAll('fieldset')) {
      for (const r of fs.querySelectorAll('input[type="radio"]')) expect(r.closest('label')).toHaveClass('ck');
    }
    const on = [...sheet.querySelectorAll<HTMLInputElement>('input:checked')].map(i => text(i.closest('label')));
    expect(on).toEqual(['Bekker order', 'By work', '3 lines', '40']);
    expect(within(sheet).queryByRole('group', { name: 'Show hits from one work' })).toBeNull();
  });

  it('applies a choice at once, stays open, and hands focus back when shut', async () => {
    const { search } = await import('../lib/search');
    await open(G);
    await fireEvent.click(sortBtn());
    const sheet = await screen.findByRole('dialog', { name: 'Sort and display' });
    await fireEvent.click(within(sheet).getByRole('radio', { name: 'By form' }));
    await vi.waitFor(() => expect(window.location.search).toContain('v=form'));
    expect(screen.getByRole('dialog', { name: 'Sort and display' })).toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(1);
    await fireEvent.keyDown(document.activeElement ?? sheet, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(sortBtn());
  });

  it('keeps Tab inside: a radio group is one stop, its checked radio', async () => {
    await open(G);
    await fireEvent.click(sortBtn());
    const sheet = await screen.findByRole('dialog', { name: 'Sort and display' });
    // "40" is the last stop: Tab skips the unchecked "100" and "Citations only".
    const forty = within(sheet).getByRole('radio', { name: '40' });
    forty.focus();
    await fireEvent.keyDown(forty, { key: 'Tab' });
    expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: 'Close' }));
    await fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(forty);
  });

  it('hands focus to the menus over the hits when the window widens past the sheet', async () => {
    const wide: ((e: { matches: boolean }) => void)[] = [];
    const spy = vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => ({
      matches: false, media, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false,
      addEventListener: (_: string, f: (e: { matches: boolean }) => void) => { wide.push(f); },
      removeEventListener() {},
    }) as unknown as MediaQueryList);
    try {
      const { container } = await open(G);
      await fireEvent.click(sortBtn());
      const sheet = await screen.findByRole('dialog', { name: 'Sort and display' });
      within(sheet).getByRole('radio', { name: 'By form' }).focus();
      for (const f of wide) f({ matches: true });
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await vi.waitFor(() => expect(document.activeElement).toBe(container.querySelector('.sx-display summary')));
    } finally {
      spy.mockRestore();
    }
  });

  it('offers only Per page for a list of citations', async () => {
    await open(`${G}&ps=c`);
    await fireEvent.click(sortBtn());
    const sheet = await screen.findByRole('dialog', { name: 'Sort and display' });
    expect([...sheet.querySelectorAll('fieldset legend')].map(text)).toEqual(['Per page']);
  });
});

// The test environment lays nothing out, so these read the rules.
describe('the side column\'s rules', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const SEARCH = readFileSync(resolve(here, '../components/Search.svelte'), 'utf-8');
  const style = SEARCH.slice(SEARCH.lastIndexOf('<style')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  // The body of the first @media block whose query matches.
  function block(css: string, query: RegExp): string {
    const m = query.exec(css);
    if (!m) throw new Error(`no ${query}`);
    let depth = 0;
    for (let i = css.indexOf('{', m.index); i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', m.index) + 1, i);
    }
    throw new Error('unclosed block');
  }
  const rules = (css: string) => [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));

  // Since S4b the rail's rules are in b-search.css. The rail scrolls with the
  // page, as round 34 draws it, and runs the results' height; the word card
  // in it is what stays in view, with its own scroll.
  it('holds the word card in view on a desktop, with its own scroll', () => {
    const B = readFileSync(resolve(here, '../styles/b-search.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
    const desk = [...B.matchAll(/@media \(min-width: 961px\) \{/g)].map(m => block(B.slice(m.index), /@media/)).join(' ');
    const card = rules(desk).find(r => r.sel === '.search-page .word-rail');
    expect(card?.body).toMatch(/position:\s*sticky/);
    expect(card?.body).toMatch(/overflow-y:\s*auto/);
    expect(card?.body).toMatch(/max-height:\s*calc\(100vh/);
    const side = rules(desk).find(r => r.sel === '.search-page .sx-side');
    expect(side?.body).not.toMatch(/position:\s*sticky|align-self|max-height/);
    expect(rules(desk).find(r => r.sel === '.search-page .sx-layout')?.body).not.toMatch(/align-items/);
    expect(style).not.toMatch(/\.sx-side/);
  });

  it.skip('does not print', () => {
    const CSS = readFileSync(resolve(here, '../styles/global.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
    const hidden = rules(block(CSS, /@media print/))
      .filter(r => /display:\s*none/.test(r.body)).flatMap(r => r.sel.split(',').map(s => s.trim()));
    for (const sel of ['.search-page .sx-panel', '.search-page .sx-icon', '.search-page .sx-scrim']) expect(hidden).toContain(sel);
  });
});

describe('Search.svelte: the Filter sheet and the page behind it', () => {
  const refine = () => screen.getByRole('button', { name: /^Filter/ });

  it('holds the page still while it is open', async () => {
    await open(G);
    await fireEvent.click(refine());
    await screen.findByRole('dialog', { name: 'Filter' });
    expect(document.documentElement.style.overflow).toBe('hidden');
    await fireEvent.keyDown(window, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('is shut when the results it refined are gone, and stays shut for the next search', async () => {
    const { search } = await import('../lib/search');
    const { container } = await open(G);
    await fireEvent.click(refine());
    await screen.findByRole('dialog', { name: 'Filter' });
    // Back, to no search at all.
    window.history.pushState(null, '', '/search');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(container.querySelector('li.instance')).toBeNull());
    await vi.waitFor(() => expect(document.documentElement.style.overflow).toBe(''));
    vi.mocked(search).mockResolvedValueOnce({ results: RESULTS, failedWorks: [] });
    await fireEvent.input(screen.getByLabelText('Greek'), { target: { value: 'εἰμί' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Search.svelte: the sidebar and widened results', () => {
  const PHRASE = `/search?g=${encodeURIComponent('τῆς ἐστι')}`;
  const widened = { results: RESULTS, failedWorks: [], readings: [['x']], productive: [['x']] };
  const widen = async () => {
    await fireEvent.click(screen.getByRole('button', { name: 'Find this phrase in any inflection' }));
  };

  it('lets the page go when the request behind an open sheet fails', async () => {
    const { searchPhraseVariants } = await import('../lib/search');
    await open(PHRASE);
    await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Filter' });
    expect(document.documentElement.style.overflow).toBe('hidden');
    vi.mocked(searchPhraseVariants).mockRejectedValueOnce(new Error('the index did not load'));
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Find this phrase in any inflection' }));
    // The error takes the results, and the sheet with them, off the page.
    await screen.findByText('the index did not load');
    await vi.waitFor(() => expect(document.documentElement.style.overflow).toBe(''));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('goes back to the menu, focus with it, when the screen open loses its filter', async () => {
    const { searchPhraseVariants } = await import('../lib/search');
    await open(PHRASE);
    await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
    let sheet = await screen.findByRole('dialog', { name: 'Filter' });
    let done!: (v: unknown) => void;
    vi.mocked(searchPhraseVariants).mockReturnValueOnce(new Promise(r => { done = r; }) as never);
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Find this phrase in any inflection' }));
    await fireEvent.click(within(sheet).getByRole('button', { name: /^Forms/ }));
    sheet = await screen.findByRole('dialog', { name: 'Forms' });
    await vi.waitFor(() => expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: '‹ Filter' })));
    // Widened results have no form list: the Forms screen has nothing to show.
    done(widened);
    sheet = await screen.findByRole('dialog', { name: 'Filter' });
    await vi.waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
  });

  it('"Clear all" leaves none of the old filters in the address bar', async () => {
    const { searchPhraseVariants } = await import('../lib/search');
    await open(`${PHRASE}&sp=only&sn=EN&wf=EN&v=form&ctx=1`);
    vi.mocked(searchPhraseVariants).mockResolvedValueOnce(widened as never);
    await widen();
    await vi.waitFor(() => expect(searchPhraseVariants).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => expect(await sheetChosen()).toEqual(['By form', '1 line']));
    vi.mocked(searchPhraseVariants).mockResolvedValueOnce(widened as never);
    await fireEvent.click(within(summary()).getByRole('button', { name: 'Clear all' }));
    expect(searchPhraseVariants).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => expect(await sheetChosen()).toEqual([]));
    expect(window.location.search).toBe(`?g=${encodeURIComponent('τῆς ἐστι')}`);
  });
});

describe('Search.svelte: removing the chapter limit', () => {
  const CX = '/search?c=f:logos&c=f:logos&cx=0';
  async function chapter(extra = '') {
    const { searchCombo, greekHitForms } = await import('../lib/search');
    vi.mocked(greekHitForms).mockResolvedValue(FORMS);
    vi.mocked(searchCombo).mockResolvedValue({ results: BILINGUAL, failedWorks: [] });
    window.history.replaceState(null, '', CX + extra);
    const page = render(Search);
    // "Within a chapter" is undone from the sheet's summary (S4b).
    await vi.waitFor(async () => {
      await openSheet();
      expect(screen.getByRole('button', { name: 'Remove Within a chapter' })).toBeInTheDocument();
    });
    await vi.waitFor(() => expect(page.container.querySelector('li.instance')).not.toBeNull());
    return page;
  }
  it('keeps work, translation and display filters', async () => {
    await chapter('&e=one&wf=EN&t=rackham&ctx=1&ps=100');
    await fireEvent.click(remove('Within a chapter'));
    await vi.waitFor(async () => expect(await sheetChosen()).toEqual(['Nicomachean Ethics', 'Rackham', '1 line', '100 a page']));
    await vi.waitFor(() => expect(new URLSearchParams(location.search).get('t')).toBe('rackham'));
    expect(new URLSearchParams(location.search).get('wf')).toBe('EN');
  });
  it('runs the submitted slots after an input edit', async () => {
    await chapter();
    const { searchCombo } = await import('../lib/search');
    const before = structuredClone(vi.mocked(searchCombo).mock.calls[0]);
    await fireEvent.input(screen.getByLabelText('English'), {target:{value:'never submitted'}});
    await fireEvent.click(remove('Within a chapter'));
    await vi.waitFor(() => expect(searchCombo).toHaveBeenCalledTimes(2));
    expect(vi.mocked(searchCombo).mock.calls[1][0]).toEqual(before[0]);
    expect(location.search).not.toContain('never');
  });
  it('does not show a chip for an unsubmitted checkbox edit', async () => {
    await chapter();
    await fireEvent.click(remove('Within a chapter'));
    await vi.waitFor(async () => expect(await sheetChosen()).toEqual([]));
    // The editor is shut on a proximity search from the address (S3).
    await fireEvent.click(screen.getByRole('button', {name:'Change'}));
    await fireEvent.click(screen.getByRole('checkbox', {name:'Keep hits that cross a chapter'}));
    expect(await sheetChosen()).toEqual([]);
  });
  it('clear all resets the chapter checkbox and address', async () => {
    await chapter('&wf=EN&ctx=1');
    await fireEvent.click(within(summary()).getByRole('button',{name:'Clear all'}));
    await vi.waitFor(async () => expect(await sheetChosen()).toEqual([]));
    await fireEvent.click(screen.getByRole('button', {name:'Change'}));
    expect(screen.getByRole('checkbox',{name:'Keep hits that cross a chapter'})).toBeChecked();
    expect(location.search).not.toContain('cx='); expect(location.search).not.toContain('wf=');
  });
  it('keeps forms set aside', async () => {
    await chapter('&g=logos&xf=esti');
    await fireEvent.click(remove('Within a chapter'));
    await vi.waitFor(() => expect(location.search).toContain('xf=esti'));
  });
  it('keeps facets while their readings load', async () => {
    const { greekHitGrammar } = await import('../lib/search');
    vi.mocked(greekHitGrammar).mockResolvedValue(GRAMMAR);
    await chapter('&gf=case.gen');
    await fireEvent.click(remove('Within a chapter'));
    await vi.waitFor(() => expect(location.search).toContain('gf=case.gen'));
    await vi.waitFor(async () => expect(await sheetChosen()).toContain('Case gen'));
  });
  it('does not apply kept filters to a newer search', async () => {
    await chapter('&wf=EN');
    const { searchCombo } = await import('../lib/search');
    let done!: (v: any) => void;
    vi.mocked(searchCombo).mockReturnValueOnce(new Promise(resolve => {done=resolve;}));
    await fireEvent.click(remove('Within a chapter'));
    await vi.waitFor(() => expect(searchCombo).toHaveBeenCalledTimes(2));
    // A newer search while that one runs. Proximity holds the Greek box (it
    // shows the terms, read-only), so the search goes through the form.
    await fireEvent.submit(document.querySelector('form.search-form')!);
    await vi.waitFor(() => expect(searchCombo).toHaveBeenCalledTimes(3));
    await vi.waitFor(async () => expect(await sheetChosen()).toEqual([]));
    done({results:BILINGUAL,failedWorks:[]});
    await new Promise(resolve => setTimeout(resolve,30));
    expect(await sheetChosen()).toEqual([]); expect(location.search).not.toContain('wf=');
  });
});
