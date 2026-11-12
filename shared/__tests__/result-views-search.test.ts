// The results page's views and grammar facets: the same hits grouped by
// work, by form or by grammar, and narrowed by the
// readings of each Greek hit without searching again. The counting, filtering
// and grammar lookup are tested in result-views.test.ts.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, GreekLine } from '../lib/data';
import type { HitForms, HitGrammar, Reading, SearchResult } from '../lib/search';
import { getWork } from '../lib/works';

const { book } = vi.hoisted(() => {
  const line = (n: number, text: string): GreekLine => ({
    n, text, tokens: text.split(' ').map((t, i) => ({ t, o: i * 2, k: t })),
  });
  // Every book of every work reads the same, so a hit is made by its position.
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
  // A view that never asks for the grammar leaves its answer queued.
  const { greekHitGrammar } = await import('../lib/search');
  vi.mocked(greekHitGrammar).mockReset();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

const at = (work: string, column: string, grkPositions: number[], b = 1): SearchResult => ({
  work, meta: { id: `${b}:${column}`, book: b, column }, grkMatch: true, engMatch: false, grkPositions,
});
const PRES_IND: Reading = { tense: ['pres'], mood: ['ind'], voice: ['act'], person: ['3rd'], number: ['sg'] };
const GEN_SG_FEM: Reading = { case: ['gen'], number: ['sg'], gender: ['fem'] };
const DAT_SG_FEM: Reading = { case: ['dat'], number: ['sg'], gender: ['fem'] };
const DAT_PL_FEM: Reading = { case: ['dat'], number: ['pl'], gender: ['fem'] };
const ESTI = [PRES_IND];
const THS = [GEN_SG_FEM, DAT_SG_FEM];
const TAIS = [DAT_PL_FEM];

// EN 70a: ἐστί τῆς ἐστι; 70b: ταῖς. Int 70a: ἐστί τῆς. Six hits.
const RESULTS = [at('EN', '70a', [0, 1, 3]), at('EN', '70b', [1]), at('Int', '70a', [0, 1])];
const FORMS: HitForms = {
  byResult: new Map([['EN:1:70a', ['esti', 'ths', 'esti']], ['EN:1:70b', ['tais']], ['Int:1:70a', ['esti', 'ths']]]),
  headwords: new Map(), failedWorks: [],
};
const GRAMMAR: HitGrammar = {
  byResult: new Map([['EN:1:70a', [ESTI, THS, ESTI]], ['EN:1:70b', [TAIS]], ['Int:1:70a', [ESTI, THS]]]),
  failedWorks: [],
};

async function open(
  url: string,
  { results = RESULTS, forms = FORMS, grammar = GRAMMAR }: { results?: SearchResult[]; forms?: HitForms; grammar?: HitGrammar } = {},
) {
  const { search, greekHitForms, greekHitGrammar } = await import('../lib/search');
  vi.mocked(search).mockResolvedValueOnce({ results, failedWorks: [] });
  vi.mocked(greekHitForms).mockResolvedValueOnce(forms);
  vi.mocked(greekHitGrammar).mockResolvedValueOnce(grammar);
  window.history.replaceState(null, '', url);
  const page = render(Search);
  // Settled once the switch is drawn and the first page's groups are in.
  await screen.findByRole('group', { name: 'Group the hits' });
  await vi.waitFor(() => expect(page.container.querySelectorAll('.group-head').length).toBeGreaterThan(0));
  return page;
}
const status = () => screen.getByRole('status');
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
// A group head's parts, the caret left out, one space between.
const heads = (c: HTMLElement) => [...c.querySelectorAll('.group-head')].map(h =>
  [...h.querySelectorAll('span:not(.caret)')].map(text).filter(Boolean).join(' '));
// A facet run as "Case dat 3 gen 2".
const run = (g: Element | null) => g ? [g.querySelector('.gx-head'), ...g.querySelectorAll('label')].map(text).join(' ') : '';
// The view is a radio in the "Group by" menu.
const viewButton = (name: string) =>
  within(screen.getByRole('group', { name: 'Group the hits' })).getByRole('radio', { name });
// Every heading starts open, in every view (John, 2026-11-10): no hit waits
// behind a click.
function expectAllOpen(c: HTMLElement) {
  expect(c.querySelectorAll('.group-head').length).toBeGreaterThan(0);
  expect(c.querySelectorAll('.group-head[aria-expanded="false"]')).toHaveLength(0);
}
// Each instance by its link and its marked Greek, which no two share.
const instances = (c: HTMLElement) => [...c.querySelectorAll('li.instance')].map(li =>
  `${li.querySelector('.inst-ref')?.getAttribute('href')} ${li.querySelector('.inst-snippet')?.innerHTML.trim()}`).sort();
const facetRow = () => screen.getByRole('group', { name: 'Narrow by grammar' });
const formRows = (panel: HTMLElement) => [...panel.querySelectorAll('label')].map(label =>
  `${text(label)}${(label.querySelector('input') as HTMLInputElement).checked ? ' ✓' : ''}`);
const G = `/search?g=${encodeURIComponent('εἰμί')}`;

describe('Search.svelte: views', () => {
  it('shows the same hits in every view, and marks the view in force', async () => {
    const { container } = await open(G);
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    expect(viewButton('By work')).toBeChecked();
    expectAllOpen(container);
    const shown = instances(container);
    expect(shown).toHaveLength(6);
    for (const name of ['By form', 'Grammar', 'By work']) {
      await fireEvent.click(viewButton(name));
      await vi.waitFor(() => expect(viewButton(name)).toBeChecked());
      // The menu's own value follows the view in force, not the click.
      expect(text(viewButton(name).closest('details')!.querySelector('summary b'))).toBe(name.replace(/^By /, ''));
      for (const other of ['By work', 'By form', 'Grammar'].filter(n => n !== name)) {
        expect(viewButton(other)).not.toBeChecked();
      }
      expectAllOpen(container);
      expect(instances(container)).toEqual(shown);
    }
    expect(status()).toHaveTextContent('6 instances');
  });

  it('by form: a group per form, its spellings and count, and every citation names its work', async () => {
    const { container } = await open(G);
    await fireEvent.click(viewButton('By form'));
    await vi.waitFor(() => expect(heads(container)).toEqual([
      'ἐστί · ἐστι 3 instances', 'τῆς 2 instances', 'ταῖς 1 instance',
    ]));
    expect(window.location.search).toContain('v=form');
    expectAllOpen(container);
    const first = container.querySelector('.chapter-group')!;
    // Corpus order within the group: the Int comes before the EN.
    expect([...first.querySelectorAll('.inst-ref')].map(text)).toEqual([
      `${getWork('Int')!.abbr} 70a1`, `${getWork('EN')!.abbr} 70a1`, `${getWork('EN')!.abbr} 70a1`,
    ]);
    // Back to works: the citation is the section alone again.
    await fireEvent.click(viewButton('By work'));
    expectAllOpen(container);
    expect(text(container.querySelector('.inst-ref'))).toBe('70a1');
  });

  // John, 2026-11-10: the Stephanus page headings "just add clicks". The hits
  // are listed plainly under their work, and the work's heading opens and
  // shuts; a work of one book drops its "Book 1".
  it('by work, the default: a heading per work and book that opens and shuts, and no Stephanus headings', async () => {
    const results = [at('Meta', '70a', [0, 1], 1), at('Meta', '70b', [1], 1), at('Meta', '70a', [3], 2), at('EN', '70b', [1])];
    const { container } = await open(G, { results, forms: { byResult: new Map(), headwords: new Map(), failedWorks: [] } });
    await vi.waitFor(() => expect(status()).toHaveTextContent('5 instances'));
    expect(viewButton('By work')).toBeChecked();
    const labels = getWork('Meta')!.bookLabels;
    // The EN comes first in the corpus; the heads are the work headings.
    expect(heads(container)).toEqual([
      `Metaphysics Book ${labels[0]} 3 instances`, `Metaphysics Book ${labels[1]} 1 instance`, 'Nicomachean Ethics Book I 1 instance',
    ]);
    // Each heading holds its own button, and the button names its work.
    expect([...container.querySelectorAll('.book-header')].map(h => {
      const head = h.querySelector('button.group-head');
      return head ? `${text(head.querySelector('.work-name'))}|${text(head.querySelector('.book-name'))}` : null;
    })).toEqual([`Metaphysics|Book ${labels[0]}`, `Metaphysics|Book ${labels[1]}`, 'Nicomachean Ethics|Book I']);
    expect(text(container.querySelector('.sx-results'))).not.toMatch(/Stephanus/i);
    expect(container.querySelectorAll('.chapter-group')).toHaveLength(3);
    // Every hit shows, each with its section; Met 70a's two words are an
    // instance each.
    expectAllOpen(container);
    expect([...container.querySelectorAll('.inst-ref')].map(text)).toEqual(['70a1', '70a1', '70b1', '70a1', '70b1']);
    // The work heading shuts its hits and opens them again.
    const laws1 = container.querySelectorAll('.group-head')[1];
    await fireEvent.click(laws1);
    expect(laws1).toHaveAttribute('aria-expanded', 'false');
    expect([...container.querySelectorAll('.inst-ref')].map(text)).toEqual(['70a1', '70a1', '70b1', '70b1']);
    await fireEvent.click(laws1);
    expect(laws1).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelectorAll('.inst-ref')).toHaveLength(5);
  });

  it('reads an old address with v=work as the default view', async () => {
    const { container } = await open(`${G}&v=work`);
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    expect(viewButton('By work')).toBeChecked();
    expect(within(screen.getByRole('group', { name: 'Group the hits' })).getAllByRole('radio').map(r => r.closest('label')!.textContent!.trim()))
      .toEqual(['By work', 'By form', 'Grammar']);
    expect([...container.querySelectorAll('.book-header .work-name')].map(text)).toEqual(['De Interpretatione', 'Nicomachean Ethics']);
  });

  it('grammar: each group prints its readings, and the facets list what is present with counts', async () => {
    const { greekHitGrammar } = await import('../lib/search');
    const { container } = await open(G);
    expect(greekHitGrammar).not.toHaveBeenCalled();
    await fireEvent.click(viewButton('Grammar'));
    await vi.waitFor(() => expect(heads(container)).toEqual([
      'ἐστί · ἐστι sg pres ind act 3rd 3 instances',
      'τῆς gen sg fem · dat sg fem 2 instances',
      'ταῖς dat pl fem 1 instance',
    ]));
    expect(greekHitGrammar).toHaveBeenCalledWith(RESULTS);
    const row = facetRow();
    const runs = [...row.querySelectorAll('.gx-group')].map(run);
    expect(runs).toEqual([
      'Case dat 3 gen 2', 'Number sg 5 pl 1', 'Gender fem 3', 'Tense pres 3',
      'Mood ind 3', 'Voice act 3', 'Person 3rd 3',
    ]);
    expect(within(row).getByRole('checkbox', { name: 'Case dat' })).not.toBeChecked();
  });
});

describe('Search.svelte: grammar facets', () => {
  it('narrows the hits and every count at once, writes gf, and searches nothing', async () => {
    const { search } = await import('../lib/search');
    const { container } = await open(`${G}&v=grammar`);
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    await fireEvent.click(within(facetRow()).getByRole('checkbox', { name: 'Gender fem' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('3 instances'));
    await vi.waitFor(() => expect(heads(container)).toEqual(['τῆς gen sg fem · dat sg fem 2 instances', 'ταῖς dat pl fem 1 instance']));
    const works = screen.getByRole('group', { name: 'Show hits from one work' });
    expect(within(works).getAllByRole('button').map(text)).toEqual(['Nicomachean Ethics2', 'De Interpretatione1']);
    expect(formRows(screen.getByRole('group', { name: 'Greek forms found' }))).toEqual(['της 2 ✓', 'ταις 1 ✓']);
    // Counted before the facets: the other values are still there to tick.
    expect(run(facetRow().querySelector('.gx-group'))).toBe('Case dat 3 gen 2');
    expect(new URLSearchParams(window.location.search).get('gf')).toBe('gender.fem');
    expect(search).toHaveBeenCalledTimes(1);

    await fireEvent.click(within(facetRow()).getByRole('checkbox', { name: 'Gender fem' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    expect(window.location.search).not.toContain('gf=');
  });

  // Options B1 and A1 (2026-11-10): Part of speech heads the grammar facets,
  // in readers' words, and Morpheus's word-class tag is never offered — an
  // old link's `gf=marker.…` is dropped rather than filtering unseen.
  it.skip('lists Part of speech first, in readers\' words, and drops the old word-class tag', async () => {
    // Only ταῖς carries the tag: were it still applied, 1 hit would show.
    const tag = (r: Reading, pos: string[], marker?: string): Reading => ({ ...r, pos, ...(marker ? { marker: [marker] } : {}) });
    const grammar: HitGrammar = {
      byResult: new Map([
        ['EN:1:70a', [[tag(PRES_IND, ['verb'])], [tag(GEN_SG_FEM, ['article'])], [tag(PRES_IND, ['verb'])]]],
        ['EN:1:70b', [[tag(DAT_PL_FEM, ['adj', 'pronoun'], 'adverb')]]],
        ['Int:1:70a', [[tag(PRES_IND, ['verb'])], [tag(GEN_SG_FEM, ['article'])]]],
      ]),
      failedWorks: [],
    };
    await open(`${G}&v=grammar&gf=marker.adverb`, { grammar });
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    const groups = [...facetRow().querySelectorAll('.gx-group')];
    expect(run(groups[0])).toBe('Part of speech verb 3 article 2 adjective 1 pronoun 1');
    expect(groups.map(g => text(g.querySelector('.gx-head')))).not.toContain('marker');
  });

  it('lets an ambiguous token through on any reading, and says it is one of several', async () => {
    const { container } = await open(`${G}&gf=case.dat`);
    await vi.waitFor(() => expect(status()).toHaveTextContent('3 instances'));
    expectAllOpen(container);
    // τῆς is gen or dat; ταῖς only dat.
    const rows = [...container.querySelectorAll('li.instance')].map(li =>
      `${text(li.querySelector('mark'))}: ${text(li.querySelector('.inst-oneof'))}`);
    expect(rows).toEqual(['τῆς: one of 2 readings', 'τῆς: one of 2 readings', 'ταῖς: ']);
    // The facet ticked in the address bar is shown, in the page view too.
    expect(within(facetRow()).getByRole('checkbox', { name: 'Case dat' })).toBeChecked();
  });

  it('keeps the facets across a change of view', async () => {
    const { container } = await open(`${G}&v=grammar`);
    await vi.waitFor(() => expect(facetRow()).toBeTruthy());
    await fireEvent.click(within(facetRow()).getByRole('checkbox', { name: 'Case gen' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('2 instances'));
    await fireEvent.click(viewButton('By form'));
    await vi.waitFor(() => expect(heads(container)).toEqual(['τῆς 2 instances']));
    expect(status()).toHaveTextContent('2 instances');
    expect(within(facetRow()).getByRole('checkbox', { name: 'Case gen' })).toBeChecked();
    const p = new URLSearchParams(window.location.search);
    expect([p.get('v'), p.get('gf')]).toEqual(['form', 'case.gen']);
  });

  it('restores the view and the facets from the address bar', async () => {
    const { greekHitGrammar } = await import('../lib/search');
    const { container } = await open(`${G}&v=form&gf=number.pl`);
    await vi.waitFor(() => expect(status()).toHaveTextContent('1 instance'));
    expect(viewButton('By form')).toBeChecked();
    expect(heads(container)).toEqual(['ταῖς 1 instance']);
    expect(greekHitGrammar).toHaveBeenCalledTimes(1);
  });

  it('counts returned hits and facets while ignoring speaker parameters', async () => {
    const { search } = await import('../lib/search');
    // What the engine returns under the filter: Socrates' ἐστί and τῆς.
    const spoken = [{ ...at('EN', '70a', [0, 1]), speakers: ['Socrates', 'Socrates'] }];
    const grammar: HitGrammar = { byResult: new Map([['EN:1:70a', [ESTI, THS]]]), failedWorks: [] };
    const { container } = await open(`${G}&sp=only&sn=Socrates&v=grammar`, { results: spoken, grammar });
    await vi.waitFor(() => expect(status()).toHaveTextContent('2 instances'));
    expect(vi.mocked(search).mock.calls[0][8]).toBeUndefined();
    await vi.waitFor(() => expect(run(facetRow().querySelector('.gx-group'))).toBe('Case dat 1 gen 1'));
    await fireEvent.click(within(facetRow()).getByRole('checkbox', { name: 'Case gen' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('1 instance'));
    expectAllOpen(container);
    expect(text(container.querySelector('li.instance .inst-speaker'))).toBe('Socrates');
  });

  it('says so when the grammar did not load, and Try again reruns only the lookup', async () => {
    const { search, greekHitForms, greekHitGrammar } = await import('../lib/search');
    vi.mocked(search).mockResolvedValueOnce({ results: RESULTS, failedWorks: [] });
    vi.mocked(greekHitForms).mockResolvedValueOnce(FORMS);
    vi.mocked(greekHitGrammar).mockRejectedValueOnce(new Error('HTTP 500 for EN/grammar-col.bin'));
    window.history.replaceState(null, '', `${G}&gf=case.dat`);
    const { container } = render(Search);
    // The facet in the address bar cannot narrow anything: every hit shows.
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    const warning = await vi.waitFor(() => {
      const el = [...container.querySelectorAll('.sx-note.warn')].find(n => /grammar/i.test(n.textContent ?? ''));
      if (!el) throw new Error('no warning yet');
      return el as HTMLElement;
    });
    expect(warning).toHaveTextContent('The grammar of this result did not load, so the hits are not narrowed.');
    vi.mocked(greekHitGrammar).mockResolvedValueOnce(GRAMMAR);
    await fireEvent.click(within(warning).getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('3 instances'));
    expect(search).toHaveBeenCalledTimes(1);
    expect(greekHitGrammar).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.sx-note.warn')).toBeNull();
  });

  it('names the works whose grammar did not load', async () => {
    const grammar: HitGrammar = { byResult: new Map([...GRAMMAR.byResult].filter(([k]) => k.startsWith('EN'))), failedWorks: ['Int'] };
    const { container } = await open(`${G}&v=grammar`, { grammar });
    await vi.waitFor(() => expect(container.querySelector('.sx-note.warn')).toHaveTextContent('The grammar in De Interpretatione did not load.'));
  });

  it('keeps a lookup that a widening which found nothing passed by', async () => {
    const { search, greekHitForms, greekHitGrammar, searchPhraseVariants } = await import('../lib/search');
    vi.mocked(search).mockResolvedValueOnce({ results: RESULTS, failedWorks: [] });
    let formsIn!: (forms: HitForms) => void;
    let grammarIn!: (grammar: HitGrammar) => void;
    vi.mocked(greekHitForms).mockReturnValueOnce(new Promise(resolve => { formsIn = resolve; }));
    vi.mocked(greekHitGrammar).mockReturnValueOnce(new Promise(resolve => { grammarIn = resolve; }));
    window.history.replaceState(null, '', `/search?g=${encodeURIComponent('τῆς ἐστι')}&v=grammar`);
    render(Search);
    await vi.waitFor(() => expect(status()).toHaveTextContent('6 instances'));
    // Both lookups are still out when the reader asks to widen, and widening
    // has nothing to offer: the results on screen are the same ones.
    vi.mocked(searchPhraseVariants).mockResolvedValueOnce({ results: [], failedWorks: [], readings: [], productive: [] } as never);
    await fireEvent.click(screen.getByRole('button', { name: 'Find this phrase in any inflection' }));
    await vi.waitFor(() => expect(searchPhraseVariants).toHaveBeenCalled());
    formsIn(FORMS);
    grammarIn(GRAMMAR);
    // Their forms and readings still arrive.
    await screen.findByRole('group', { name: 'Greek forms found' });
    expect(within(await screen.findByRole('group', { name: 'Narrow by grammar' })).getByRole('checkbox', { name: 'Case dat' })).toBeInTheDocument();
  });
});

// An ambiguous hit says so in a whole section too, and in a hit opened with
// "more": one hit, its note as on its own; several, each note with its word.
describe('Search.svelte: the notes of a whole section', () => {
  const note = (li: Element) => text(li.querySelector('.inst-oneof'));
  // EN 70a: τῆς gen or dat, λόγος nom or dat.
  const TWO = {
    results: [at('EN', '70a', [1, 2])],
    forms: { byResult: new Map([['EN:1:70a', ['ths', 'logos']]]), headwords: new Map(), failedWorks: [] } as HitForms,
    grammar: { byResult: new Map([['EN:1:70a', [THS, [{ case: ['nom', 'dat'] }]]]]), failedWorks: [] } as HitGrammar,
  };

  it('a section holding one ambiguous hit carries its note', async () => {
    const { container } = await open(`${G}&gf=case.dat&ctx=s`);
    await vi.waitFor(() => expect(status()).toHaveTextContent('3 instances'));
    expectAllOpen(container);
    await vi.waitFor(() => expect([...container.querySelectorAll('li.instance')].map(note))
      .toEqual(['one of 2 readings', 'one of 2 readings', '']));
  });

  it('a section holding several names the word each note is about', async () => {
    const { container } = await open(`${G}&gf=case.dat&ctx=s`, TWO);
    await vi.waitFor(() => expect(status()).toHaveTextContent('2 instances'));
    expectAllOpen(container);
    await vi.waitFor(() => expect([...container.querySelectorAll('li.instance')].map(note))
      .toEqual(['τῆς: one of 2 readings · λόγος: case dat or nom']));
  });

  it('a hit opened with "more" keeps its note and adds the others now marked', async () => {
    const { container } = await open(`${G}&gf=case.dat`, TWO);
    await vi.waitFor(() => expect(status()).toHaveTextContent('2 instances'));
    expectAllOpen(container);
    const [li] = container.querySelectorAll('li.instance');
    await vi.waitFor(() => expect(note(li)).toBe('one of 2 readings'));
    await fireEvent.click(li.querySelector('button.inst-more')!);
    await vi.waitFor(() => expect(note(li)).toBe('one of 2 readings · λόγος: case dat or nom'));
  });
});
