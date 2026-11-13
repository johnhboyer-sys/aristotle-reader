// The results page, set B (John, 2026-11-10): the four display settings
// (Group by, Sort, Context, Per page) leave the side column for a bar of
// one-line menus over the hits, built as the search form's menus are; the
// Grammar row follows Forms, each category a line of chips. Since S4b (round
// 34) the rail lists every work and form, each list in a box of its own that
// scrolls, at full-size rows; "This search" is the narrow screen's sheet's.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, GreekLine } from '../lib/data';
import type { HitForms, HitGrammar, Reading, SearchResult } from '../lib/search';

// 70a runs on past its last hit, so that "1 line" shows less of it than
// "3 lines" does.
const { book } = vi.hoisted(() => {
  const line = (n: number, text: string): GreekLine => ({
    n, text, tokens: text.split(' ').map((t, i) => ({ t, o: i * 2, k: t })),
  });
  const book = (n: number): BookData => ({
    book: n,
    segments: [
      { id: `${n}:70a`, column: '70a', greek: [line(1, 'ἐστί τῆς λόγος ἐστι α β γ δ ε ζ η θ ι κ λ μ')], english: { text: 'One two three four', notes: [], markers: [] } },
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

// EN 70a: ἐστί τῆς ἐστι; 70b: ταῖς. Int 70a: ἐστί τῆς. Six hits.
const RESULTS = [at('EN', '70a', [0, 1, 3]), at('EN', '70b', [1]), at('Int', '70a', [0, 1])];
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
// Seven works, two hits in each of two sections: 28 hits, fourteen forms.
const WORKS = ['Euthyphro', 'DA', 'Int', 'Cat', 'Cratylus', 'EN', 'Meta'];
const LETTERS = ['a', 'b', 'g', 'd', 'e', 'z', 'h', 'q', 'i', 'k', 'l', 'm', 'n', 'c'];
const WIDE = WORKS.flatMap(w => [at(w, '70a', [0, 1]), at(w, '70b', [0, 1])]);
const WIDE_FORMS: HitForms = {
  byResult: new Map(WIDE.map((r, i) => [`${r.work}:${r.meta.id}`, [LETTERS[(2 * i) % 14], LETTERS[(2 * i + 1) % 14]]])),
  headwords: new Map(), failedWorks: [],
};

async function open(url: string, results: SearchResult[] = RESULTS, forms: HitForms = FORMS) {
  const { search, greekHitForms, greekHitGrammar } = await import('../lib/search');
  vi.mocked(search).mockResolvedValueOnce({ results, failedWorks: [] });
  vi.mocked(greekHitForms).mockResolvedValueOnce(forms);
  vi.mocked(greekHitGrammar).mockResolvedValueOnce(GRAMMAR);
  window.history.replaceState(null, '', url);
  const page = render(Search);
  await screen.findByRole('group', { name: 'Per page' });
  await vi.waitFor(() => expect(page.container.querySelectorAll('.group-head, .cite').length).toBeGreaterThan(0));
  return page;
}
const status = () => screen.getByRole('status');
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
// "This search" is at the head of the Filter sheet's menu (round 34 has no
// summary in the rail), and only while something is chosen.
async function openSheet() {
  if (screen.queryByRole('dialog', { name: 'Filter' })) return;
  await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
  await screen.findByRole('dialog', { name: 'Filter' });
}
const summary = () => screen.getByRole('group', { name: 'This search' });
const chosen = () => [...(screen.queryByRole('group', { name: 'This search' })?.querySelectorAll('li') ?? [])].map(li => text(li.querySelector('span')));
const remove = (what: string) => within(summary()).getByRole('button', { name: `Remove ${what}` });
const MENUS = ['Group by', 'Sort', 'Context', 'Per page'];
const menu = (legend: string) => screen.getByRole('group', { name: legend }).closest('details')!;
const value = (legend: string) => text(menu(legend).querySelector('summary b'));
const radio = (legend: string, name: string) =>
  within(screen.getByRole('group', { name: legend })).getByRole('radio', { name }) as HTMLInputElement;
const checked = (legend: string) => (within(screen.getByRole('group', { name: legend })).getAllByRole('radio') as HTMLInputElement[])
  .filter(r => r.checked).map(r => text(r.closest('label')));
const G = `/search?g=${encodeURIComponent('εἰμί')}`;

describe('Search.svelte: the display bar', () => {
  it('holds the four menus and the top pager over the hits, none of them in the side column or the sheet', async () => {
    // 28 hits at 20 a page: two pages, so the top pager is drawn.
    const { container } = await open(`${G}&ps=20`, WIDE, WIDE_FORMS);
    const main = container.querySelector('.sx-main')!;
    const bar = main.querySelector(':scope > .sx-display')!;
    expect(bar).not.toBeNull();
    expect(main.firstElementChild).toBe(bar);
    for (const legend of MENUS) {
      const m = menu(legend);
      expect(bar.contains(m)).toBe(true);
      expect(m.tagName).toBe('DETAILS');
      expect(m.querySelector('summary b')).not.toBeNull();
    }
    expect(bar.querySelector('nav.pager[aria-label="Result pages"]')).not.toBeNull();
    const side = screen.getByRole('complementary', { name: 'Refine results' });
    for (const name of MENUS) expect(within(side).queryByRole('group', { name })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Filter' });
    for (const name of MENUS) expect(within(sheet).queryByRole('group', { name })).toBeNull();
  });

  const cases = [
    { legend: 'Group by', label: 'By form', b: 'form', param: 'v=form', entry: 'By form', back: 'By work', backB: 'work' },
    { legend: 'Sort', label: 'Commonest form first', b: 'Commonest form first', param: 'so=freq', entry: 'Commonest form first', back: 'Bekker order', backB: 'Bekker order' },
    { legend: 'Context', label: '1 line', b: '1 line', param: 'ctx=1', entry: '1 line', back: '3 lines', backB: '3 lines' },
    { legend: 'Per page', label: 'Citations only', b: 'citations only', param: 'ps=c', entry: 'Citations only', back: '40', backB: '40' },
  ];
  for (const c of cases) {
    it(`"${c.legend}": a radio applies at once, without a new search, and the summary's × sets it back`, async () => {
      const { search } = await import('../lib/search');
      const { container } = await open(G);
      expect(value(c.legend)).toBe(c.backB);
      expect(checked(c.legend)).toEqual([c.back]);
      // Every heading starts open: nothing to click before reading the hits.
      expect(container.querySelectorAll('button.group-head[aria-expanded="false"]')).toHaveLength(0);
      const before = container.querySelector('.sx-results')!.innerHTML;
      menu(c.legend).open = true;
      await fireEvent.click(radio(c.legend, c.label));
      await vi.waitFor(() => expect(window.location.search).toContain(c.param));
      await vi.waitFor(() => expect(container.querySelector('.sx-results')!.innerHTML).not.toBe(before));
      expect(checked(c.legend)).toEqual([c.label]);
      expect(value(c.legend)).toBe(c.b);
      // Shut after a choice.
      expect(menu(c.legend).open).toBe(false);
      // Not summed up in the rail; on the sheet.
      expect(screen.queryByRole('group', { name: 'This search' })).toBeNull();
      await openSheet();
      expect(chosen()).toEqual([c.entry]);
      expect(search).toHaveBeenCalledTimes(1);
      await fireEvent.click(remove(c.entry));
      await vi.waitFor(() => expect(window.location.search).not.toContain(c.param));
      expect(checked(c.legend)).toEqual([c.back]);
      expect(value(c.legend)).toBe(c.backB);
      expect(chosen()).toEqual([]);
      expect(search).toHaveBeenCalledTimes(1);
    });
  }

  it('stays open while the arrow keys step through its choices, and Enter shuts it', async () => {
    await open(G);
    const m = menu('Sort');
    m.open = true;
    // An arrow key moves the choice: the browser follows it with the change.
    await fireEvent.keyDown(radio('Sort', 'Bekker order'), { key: 'ArrowDown' });
    await fireEvent.click(radio('Sort', 'Works A–Z'));
    await vi.waitFor(() => expect(window.location.search).toContain('so=work'));
    expect(m.open).toBe(true);
    await fireEvent.keyDown(radio('Sort', 'Works A–Z'), { key: 'ArrowDown' });
    await fireEvent.click(radio('Sort', 'Forms A–Z'));
    await vi.waitFor(() => expect(window.location.search).toContain('so=form'));
    expect(m.open).toBe(true);
    // fireEvent returns false when the key's own action was stopped: left to
    // run, the Enter reaches the menu's button and opens the menu again.
    expect(await fireEvent.keyDown(radio('Sort', 'Forms A–Z'), { key: 'Enter' })).toBe(false);
    expect(m.open).toBe(false);
    expect(document.activeElement).toBe(m.querySelector('summary'));
    // A click after that shuts the menu as before.
    m.open = true;
    await fireEvent.click(radio('Sort', 'Bekker order'));
    await vi.waitFor(() => expect(window.location.search).not.toContain('so='));
    expect(m.open).toBe(false);
  });

  it('an arrow key that changed nothing does not hold the next choice open', async () => {
    await open(G);
    // Ctrl+arrow moves no radio, so no change follows the key.
    menu('Sort').open = true;
    await fireEvent.keyDown(radio('Sort', 'Bekker order'), { key: 'ArrowDown', ctrlKey: true });
    await new Promise(r => setTimeout(r, 0));
    const m = menu('Context');
    m.open = true;
    await fireEvent.click(radio('Context', '1 line'));
    await vi.waitFor(() => expect(window.location.search).toContain('ctx=1'));
    expect(m.open).toBe(false);
    expect(document.activeElement).toBe(m.querySelector('summary'));
  });

  it('under citations only holds just the Per page menu', async () => {
    const { container } = await open(`${G}&ps=c`);
    const bar = container.querySelector('.sx-main > .sx-display')!;
    expect([...bar.querySelectorAll('legend')].map(text)).toEqual(['Per page']);
    expect(value('Per page')).toBe('citations only');
  });

  it('is not drawn when nothing is found', async () => {
    const { search } = await import('../lib/search');
    vi.mocked(search).mockResolvedValueOnce({ results: [], failedWorks: [] });
    window.history.replaceState(null, '', G);
    const { container } = render(Search);
    await vi.waitFor(() => expect(status()).toHaveTextContent('No passages found.'));
    expect(container.querySelector('.sx-display')).toBeNull();
  });
});

// Below 1100px (P4, John 2026-11-10): one row, the count, then a filter icon
// and a sort icon; between 600 and 1100 the pager's arrows sit before them.
// Which of these a width shows is the stylesheet's (tested below).
describe('Search.svelte: the reference column', () => {
  it('is the narrow one in By work only', async () => {
    const { container } = await open(G);
    const hits = () => [...container.querySelectorAll('.sx-results')].find(el => el.querySelector('li.instance'))!;
    expect(hits()).toHaveClass('by-work');
    menu('Group by').open = true;
    await fireEvent.click(radio('Group by', 'By form'));
    await vi.waitFor(() => expect(hits()).not.toHaveClass('by-work'));
  });

  it('keeps the wide column while a reading is ticked, whose note stands under the reference', async () => {
    const { container } = await open(`${G}&gf=case.gen`);
    expect(container.querySelector('.inst-oneof')).not.toBeNull();
    const hits = [...container.querySelectorAll('.sx-results')].find(el => el.querySelector('li.instance'))!;
    expect(hits).not.toHaveClass('by-work');
  });

  it('keeps the wide column when a hit carries its speaker\'s name under the reference', async () => {
    const spoken = RESULTS.map(r => ({ ...r, speakers: r.grkPositions.map(() => 'Thrasymachus') }));
    const { container } = await open(`${G}&sp=only&sn=Thrasymachus`, spoken);
    expect(container.querySelector('.inst-speaker')).toHaveTextContent('Thrasymachus');
    const hits = [...container.querySelectorAll('.sx-results')].find(el => el.querySelector('li.instance'))!;
    expect(hits).not.toHaveClass('by-work');
  });
});

describe('Search.svelte: the count row', () => {
  const bar = (c: HTMLElement) => c.querySelector('.result-bar')!;
  const names = (c: HTMLElement) => [...bar(c).children].map(el => el.getAttribute('aria-label') ?? text(el));

  // S5b (§5.7, r34-11): the pager's page between its arrows, and View in
  // place of the sort icon; a display setting is View's, not Filter's.
  it('holds the count, Save, the pager, Filter and View, in that order', async () => {
    const { container } = await open(`${G}&ps=20`, WIDE, WIDE_FORMS);
    expect(names(container)).toEqual(['28 instances · page 1 of 2', 'Save search', 'Previous page', '1/2', 'Next page', 'Filter', 'View, 20 per page']);
    // Each is an icon; Save, Filter and View an icon over its label.
    for (const b of bar(container).querySelectorAll('button')) expect(b.querySelector('svg')).not.toBeNull();
    expect([...bar(container).querySelectorAll('.sx-lab')].map(text)).toEqual(['Save search', 'Filter', 'View']);
    // A red dot on View while it is not the default.
    expect(bar(container).querySelector('.sx-view .sx-dot')).not.toBeNull();
    // The pager over the hits names its arrows the same way (S4a): these are the count row's.
    const row = within(bar(container) as HTMLElement);
    expect(row.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await fireEvent.click(row.getByRole('button', { name: 'Next page' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('page 2 of 2'));
    // Both wait while the page loads.
    await vi.waitFor(() => expect(row.getByRole('button', { name: 'Previous page' })).not.toBeDisabled());
    expect(row.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('has no arrows for one page', async () => {
    const { container } = await open(G);
    expect(names(container)).toEqual(['6 instances', 'Save search', 'Filter', 'View']);
    expect(bar(container).querySelector('.sx-dot')).toBeNull();
  });

  it('tells the count how long it is, so it can shrink to fit', async () => {
    const { container } = await open(`${G}&ps=20`, WIDE, WIDE_FORMS);
    const count = container.querySelector<HTMLElement>('.result-count')!;
    expect(count.style.getPropertyValue('--n')).toBe(String('28 instances · page 1 of 2'.length));
    expect(count).toHaveAttribute('title', '28 instances · page 1 of 2');
  });
});

describe('Search.svelte: the rail\'s lists', () => {
  // Round 34 (§8 item 5): the list whole, in a box that scrolls; no "more".
  it('Works lists every work with hits, by count, in a box of its own', async () => {
    await open(G, WIDE, WIDE_FORMS);
    const works = screen.getByRole('group', { name: 'Show hits from one work' });
    expect(text(works.querySelector('.k'))).toBe('Works with hits by count');
    const box = works.querySelector(':scope > .sx-list')!;
    expect(box.querySelectorAll('button.i')).toHaveLength(7);
    expect(works.querySelectorAll('button.i')).toHaveLength(7);
    expect(within(works).queryByRole('button', { name: /more$|^fewer$/ })).toBeNull();
  });

  it('draws the chosen work in its place, with its ×, and choosing it again lifts it', async () => {
    const { search } = await import('../lib/search');
    await open(`${G}&wf=Meta`, WIDE, WIDE_FORMS);
    const works = screen.getByRole('group', { name: 'Show hits from one work' });
    expect(works.querySelectorAll('button.i')).toHaveLength(7);
    const on = within(works).getByRole('button', { pressed: true });
    expect(text(on.querySelector('.i-t'))).toBe('Metaphysics');
    expect(on.querySelector('.i-x')).toHaveTextContent('×');
    expect(on.querySelector('.i-x')).toHaveAttribute('aria-hidden', 'true');
    expect(works.querySelectorAll('.i-x')).toHaveLength(1);
    await fireEvent.click(on);
    await vi.waitFor(() => expect(status()).toHaveTextContent('28 instances'));
    expect(window.location.search).not.toContain('wf=');
    expect(works.querySelectorAll('.i-x')).toHaveLength(0);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('Forms lists every form in a box of its own, with Deselect all and Apply outside it', async () => {
    await open(G, WIDE, WIDE_FORMS);
    const forms = await screen.findByRole('group', { name: 'Greek forms found' });
    const list = forms.querySelector('.fx-list')!;
    expect(list).not.toBeNull();
    expect(list.querySelectorAll('input[type="checkbox"]')).toHaveLength(14);
    expect(forms.querySelectorAll('input[type="checkbox"]')).toHaveLength(14);
    expect([...forms.querySelectorAll('button.more')].map(text)).toEqual(['Deselect all', 'Apply']);
    for (const name of ['Deselect all', 'Apply']) expect(list.contains(within(forms).getByRole('button', { name }))).toBe(false);
  });
});

describe('Search.svelte: the Grammar row', () => {
  it('follows the Forms row, a line of tick boxes per category, and still narrows the hits', async () => {
    await open(`${G}&v=grammar`);
    const forms = await screen.findByRole('group', { name: 'Greek forms found' });
    const grammar = await screen.findByRole('group', { name: 'Narrow by grammar' });
    expect(forms.nextElementSibling).toBe(grammar);
    for (const g of grammar.querySelectorAll('.gx-group')) {
      const boxes = [...g.querySelectorAll('input[type="checkbox"]')];
      expect(boxes.length).toBeGreaterThan(0);
      const line = g.querySelector('.gx-chips')!;
      expect(line).not.toBeNull();
      for (const b of boxes) expect(line.contains(b) && b.closest('label')?.parentElement).toBe(line);
    }
    await fireEvent.click(within(grammar).getByRole('checkbox', { name: 'Case gen' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('2 instances'));
  });
});

// The test environment lays nothing out, so these read the rules.
describe('set B\'s rules', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const SEARCH = readFileSync(resolve(here, '../components/Search.svelte'), 'utf-8');
  const style = SEARCH.slice(SEARCH.lastIndexOf('<style')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
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
  // Rules at the top level of the stylesheet: @media blocks cut out.
  function topLevel(css: string): string {
    let out = '', depth = 0, inMedia = false;
    for (let i = 0; i < css.length; i++) {
      if (!inMedia && css.startsWith('@media', i)) { inMedia = true; depth = 0; }
      if (inMedia) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) inMedia = false;
        continue;
      }
      out += css[i];
    }
    return out;
  }
  const rules = (css: string) => [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
  const find = (css: string, sel: string) => rules(css).filter(r => r.sel.split(',').map(s => s.trim()).includes(sel));
  // The rail and the sheet live in b-search.css since S4b; several @media
  // blocks share a query there, so a query's rules are all of its blocks.
  const B = readFileSync(resolve(here, '../styles/b-search.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  function blocks(css: string, query: RegExp): string {
    const g = new RegExp(query.source, 'g');
    const found = [...css.matchAll(g)].map(m => block(css.slice(m.index), query));
    if (!found.length) throw new Error(`no ${query}`);
    return found.join(' ');
  }
  const DESK = /@media \(min-width: 961px\) \{/;
  // S5b: the narrow rules are the desktop's query turned round (Codex's
  // review of S4b, finding 3).
  const NARROW = /@media not all and \(min-width: 961px\) \{/;

  it('keeps every row of the rail a full-size target, and leaves none of its rules in the component', () => {
    const desk = blocks(B, DESK);
    // S5b (Codex's review of S4b, finding 2): 44px at every width.
    expect(find(desk, '.search-page .sx-row .i').some(r => /min-height:\s*44px/.test(r.body))).toBe(true);
    expect(find(desk, '.search-page .sx-forms .fx').some(r => /min-height:\s*44px/.test(r.body))).toBe(true);
    expect(find(desk, '.search-page .sx-forms .fx-foot .more').some(r => /min-height:\s*44px/.test(r.body))).toBe(true);
    expect(find(desk, '.search-page .sx-head-more .sx-link').some(r => /min-height:\s*44px/.test(r.body))).toBe(true);
    // The 30px rows a mouse once had are gone (round 34 draws 42px and 44px).
    expect(B).not.toMatch(/1\.875rem/);
    expect(B).not.toMatch(/pointer: fine/);
    // The sheet's targets are 44px too.
    expect(find(topLevel(B), '.search-page .sx-row .i').some(r => /min-height:\s*2\.75rem/.test(r.body))).toBe(true);
    expect(find(topLevel(B), '.search-page .sx-sum .x').some(r => /width:\s*2\.75rem/.test(r.body))).toBe(true);
    for (const sel of ['.sx-row .i', '.sx-layout', '.result-count', '.fx-list', '.sx-side']) expect(find(style, sel)).toEqual([]);
  });

  it('gives each rail list a box of set height that scrolls, shaded where more is hidden', () => {
    const desk = blocks(B, DESK);
    const box = rules(desk).filter(r => r.sel === '.search-page :is(.sx-list, .sx-forms .fx-list)').map(r => r.body).join(';');
    expect(box).toMatch(/overflow-y:\s*auto/);
    // The page goes on scrolling when a list ends.
    expect(box).not.toMatch(/overscroll-behavior/);
    // Two covers that travel with the list, two shades that stay at its edges.
    expect(box.match(/no-repeat local/g)).toHaveLength(2);
    expect(box.match(/radial-gradient\([^;]*?no-repeat scroll/g)).toHaveLength(2);
    // Seven 44px rows.
    expect(find(desk, '.search-page .sx-list').some(r => /max-height:\s*308px/.test(r.body))).toBe(true);
    expect(find(desk, '.search-page .sx-forms .fx-list').some(r => /max-height:\s*330px/.test(r.body))).toBe(true);
    // Unbounded only on the forms screen of the narrow sheet, which then
    // does not scroll itself: the list fills it, and no list scrolls inside
    // a sheet that also scrolls.
    const narrow = blocks(B, NARROW);
    const list = rules(B).filter(r => r.sel.split(',').map(x => x.trim()).some(x => /\.fx-list$/.test(x)));
    const unbounded = list.filter(r => /max-height:\s*none/.test(r.body));
    expect(unbounded.map(r => r.sel)).toEqual(['.search-page .sx-panel.open[data-screen="forms"] .fx-list']);
    expect(narrow).toContain(unbounded[0].sel);
    expect(find(narrow, '.search-page .sx-panel.open[data-screen="forms"]').some(r => /overflow:\s*hidden/.test(r.body))).toBe(true);
    // The headword holds the top of the box, and the box keeps it to itself:
    // without its own stacking context the headword paints over the sheet's
    // pinned header when the box passes under it.
    expect(find(topLevel(B), '.search-page .sx-forms .fx-head').some(r => /position:\s*sticky/.test(r.body) && /top:\s*0/.test(r.body))).toBe(true);
    expect(find(topLevel(B), '.search-page .fx-list').some(r => /isolation:\s*isolate/.test(r.body))).toBe(true);
  });

  it('draws the rail at 264px, 48px from the hits, the count in Oswald and red', () => {
    const desk = blocks(B, DESK);
    expect(find(desk, '.search-page .sx-layout').some(r => /grid-template-columns:\s*264px minmax\(0, 1fr\)/.test(r.body) && /column-gap:\s*48px/.test(r.body))).toBe(true);
    const n = find(desk, '.search-page .rc-n').map(r => r.body).join(';');
    expect(n).toMatch(/font:\s*700 56px\/\.95 var\(--tface\)/);
    expect(n).toMatch(/color:\s*var\(--red-ink\)/);
    // The pager is over the hits there, so the count does not repeat it.
    expect(find(desk, '.search-page .rc-p').some(r => /display:\s*none/.test(r.body))).toBe(true);
    // The word card replaces the lists while it is open.
    expect(find(desk, '.search-page .sx-side.wp-open > .sx-panel').some(r => /display:\s*none/.test(r.body))).toBe(true);
  });

  // S5b (§5.7, r34-11): the count over "instances", then icons over 14px
  // labels, one row over a 2px rule.
  it('lays the count row out as one line under 961px, each icon over its label', () => {
    const narrow = blocks(B, NARROW);
    expect(find(narrow, '.search-page .result-bar').some(r => /flex-wrap:\s*nowrap/.test(r.body) && /border-bottom:\s*2px solid var\(--ink\)/.test(r.body))).toBe(true);
    const count = find(narrow, '.search-page .result-count').map(r => r.body).join(';');
    expect(count).toMatch(/flex-direction:\s*column/);
    expect(count).toMatch(/min-width:\s*0/);
    expect(count).toMatch(/font:\s*600 14px/);
    // The number in Oswald and red, smaller as it grows longer.
    const n = find(narrow, '.search-page .rc-n').map(r => r.body).join(';');
    expect(n).toMatch(/font:\s*700 min\(46px, calc\(150px \/ var\(--d, 3\)\)\)\/\.95 var\(--tface\)/);
    expect(n).toMatch(/color:\s*var\(--red-ink\)/);
    // The display menus are in View there; Export is too, and the
    // inflection search is in Filter.
    expect(find(narrow, '.search-page .sopt.sx-display').some(r => /display:\s*none/.test(r.body))).toBe(true);
    expect(rules(narrow).filter(r => r.sel.includes('.search-page .sx-head-more .sx-link:is(.export-btn, .sx-variants)')).some(r => /display:\s*none/.test(r.body))).toBe(true);
    // The icons: no box, a 44px target or more, never shrunk, the label 14px.
    const icon = rules(narrow).filter(r => r.sel === '.search-page :is(.sx-icon, .sx-save)').map(r => r.body).join(';');
    expect(icon).toMatch(/border:\s*0/);
    expect(icon).toMatch(/height:\s*52px/);
    expect(icon).toMatch(/min-width:\s*50px/);
    expect(icon).toMatch(/flex:\s*none/);
    expect(icon).toMatch(/flex-direction:\s*column/);
    expect(icon).toMatch(/font:\s*600 14px/);
    expect(find(narrow, '.search-page .sx-pg').some(r => /font:\s*600 14px/.test(r.body))).toBe(true);
    // A desktop has its rail and its menus, so no icons and no page in the row.
    expect(find(blocks(B, DESK), '.search-page .sx-icon').some(r => /display:\s*none/.test(r.body))).toBe(true);
    expect(rules(blocks(B, DESK)).filter(r => r.sel === '.search-page :is(.sx-pg, .sx-save .sx-ico)').some(r => /display:\s*none/.test(r.body))).toBe(true);
  });

  it('gives a hit’s reference a narrow column in By work, where it is only the section', () => {
    // John, 2026-11-10: "too much blank space" beside "2a". S4a moved the
    // results' rules to b-search.css, at round 34's widths: 84px by work,
    // 104px where the place names its work, 20px to the text.
    expect(find(topLevel(B), '.search-page .instance').some(r => /grid-template-columns:\s*104px minmax\(0, 1fr\)/.test(r.body) && /column-gap:\s*20px/.test(r.body))).toBe(true);
    expect(find(topLevel(B), '.search-page .sx-results.by-work .instance').some(r => /grid-template-columns:\s*84px minmax\(0, 1fr\)/.test(r.body))).toBe(true);
    // An upright phone keeps one column, the reference over the text, in
    // every view; sideways keeps the reference column (r34-13, S5b).
    expect(find(blocks(B, NARROW), '.search-page .sx-results.by-work .instance').some(r => /grid-template-columns:\s*minmax\(0, 1fr\)/.test(r.body))).toBe(true);
    expect(B).toMatch(/@media not all and \(max-height: 500px\) \{ \.search-page \.instance, \.search-page \.sx-results\.by-work \.instance \{ grid-template-columns: minmax\(0, 1fr\)/);
    // None of it is left in the component.
    expect(find(style, '.instance')).toEqual([]);
  });

  it('marks a ticked grammar value without colour where colours are forced', () => {
    const forced = block(B, /@media \(forced-colors: active\)/);
    expect(find(forced, '.search-page .gx-chip.on').some(r => /text-decoration:\s*underline/.test(r.body))).toBe(true);
  });

  it.skip('does not print the menus', () => {
    const CSS = readFileSync(resolve(here, '../styles/global.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
    const hidden = rules(block(CSS, /@media print/))
      .filter(r => /display:\s*none/.test(r.body)).flatMap(r => r.sel.split(',').map(s => s.trim()));
    expect(hidden).toContain('.search-page .sx-display');
  });
});
