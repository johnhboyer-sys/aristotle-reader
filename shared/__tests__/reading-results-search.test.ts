// Reading the results (PR 3), as the page draws them: a Greek word opens its
// card, the Context, Sort and Page-size controls, a proximity hit's span, and
// printing. The pure parts are tested in reading-results.test.ts.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, FlowTurn, GreekLine, Segment } from '../lib/data';
import type { SearchResult } from '../lib/search';
import { getWork } from '../lib/works';

// The book of paired-hit.test.ts (EN 70a–c, five turns, Rackham and a
// turn-aligned Ross), and after it plain sections 71a … 99a, one to a
// Stephanus page, for paging; 98a holds repeated forms out of Greek order,
// ω β ω α β ω, for sorting, each 26 words from the next so no two hits
// share a passage (S4a joins those that do); 99a is long, for the context windows: 31 Greek
// words κ0 … κ30, and 61 English words of five letters, "virtu" the 31st.
// Every work and book reads the same.
//   T0  70a line 1          Rackham "One two three."        Ross "Uno dos."
//   T1  70a line 2 → 70b η  Rackham "Four five | six seven eight"   Ross "Cuatro cinco | seis"
//   T2  70b θ → 70c λ       two stacked speeches: "Nine ten." "Eleven | twelve thirteen"
//   T3  no Greek            "Residual words here"
//   T4  70c μ               "Last."
const { fixture, COLUMNS } = vi.hoisted(() => {
  const line = (n: number, text: string): GreekLine => ({
    n, text, tokens: text.split(' ').map((t, i) => ({ t, o: i * 2, k: `${t}-key` })),
  });
  const seg = (column: string, english: string, ...greek: GreekLine[]): Segment => ({
    id: `1:${column}`, column, greek, english: { text: english, notes: [], markers: [] },
  });
  const turn = (t: Partial<FlowTurn>): FlowTurn => ({ s: null, d: null, g: null, e: null, p: false, ...t });
  const extra = Array.from({ length: 27 }, (_, i) => `${71 + i}a`);
  const LONG_GREEK = Array.from({ length: 31 }, (_, i) => `κ${i}`).join(' ');
  const word = (i: number) => `w${String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26))}xx`;
  const LONG_ENGLISH = Array.from({ length: 61 }, (_, i) => (i === 30 ? 'virtu' : word(i))).join(' ');
  const fixture: BookData = {
    book: 1,
    segments: [
      seg('70a', 'One two three. Four five', line(1, 'α β γ'), line(2, 'δ ε')),
      seg('70b', 'six seven eight Nine ten. Eleven', line(1, 'ζ η θ'), line(2, 'ι κ')),
      seg('70c', 'twelve thirteen Residual words here Last.', line(1, 'λ μ')),
      ...extra.map(c => seg(c, 'Plain words', line(1, 'ο π ρ'))),
      seg('98a', 'Plain words', line(1, ['ω', 'β', 'ω', 'α', 'β', 'ω'].join(` ${Array(25).fill('ν').join(' ')} `))),
      seg('99a', LONG_ENGLISH, line(1, LONG_GREEK)),
    ],
    turnFlow: {
      leadE: null,
      turns: [
        turn({ s: 'EN', g: { c: '70a', n: 1, o: 0 }, e: 'One two three.', es: [{ o: 0, c: '70a' }], p: true,
          alt: { ross: { e: 'Uno dos.' } } }),
        turn({ s: 'Socrates', g: { c: '70a', n: 2, o: 0 }, e: 'Four five six seven eight', es: [{ o: 10, c: '70b' }], p: true,
          alt: { ross: { e: 'Cuatro cinco seis', es: [{ o: 13, c: '70b' }] } } }),
        turn({ g: { c: '70b', n: 1, o: 4 }, e: '', sub: [
          { s: 'Socrates', d: 'Soc.', e: 'Nine ten.' },
          { s: 'EN', d: 'Men.', e: 'Eleven twelve thirteen', es: [{ o: 7, c: '70c' }] },
        ] }),
        turn({ s: 'EN', e: 'Residual words here' }),
        turn({ s: 'Socrates', g: { c: '70c', n: 1, o: 2 }, e: 'Last.', p: true }),
        ...extra.map(c => turn({ s: 'Socrates', g: { c, n: 1, o: 0 }, e: 'Plain words', p: true })),
        turn({ s: 'Socrates', g: { c: '98a', n: 1, o: 0 }, e: 'Plain words', p: true }),
        turn({ s: 'Socrates', g: { c: '99a', n: 1, o: 0 }, e: LONG_ENGLISH, p: true }),
      ],
    },
  };
  return { fixture, COLUMNS: ['70a', '70b', '70c', ...extra, '98a', '99a'] };
});

vi.mock('../components/WordPopup.svelte', async () => ({ default: (await import('./stubs/WordPopupStub.svelte')).default }));
vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return {
    ...actual,
    search: vi.fn(async () => ({ results: [], failedWorks: [] })),
    searchCombo: vi.fn(async () => ({ results: [], failedWorks: [] })),
    greekHitForms: vi.fn(async () => ({ byResult: new Map(), headwords: new Map(), failedWorks: [] })),
    greekHitGrammar: vi.fn(async () => ({ byResult: new Map(), failedWorks: [] })),
    searchPhraseVariants: vi.fn(),
    speakerRoster: vi.fn(async () => []),
    loadOffsets: vi.fn(async () => {
      let base = 0;
      const segments = fixture.segments.map(s => ({ book: 1, column: s.column, line_runs: s.greek.map(l => [l.n, l.tokens.length] as [number, number]) }));
      const starts = segments.map(s => { const start = base; base += s.line_runs.reduce((n, l) => n + l[1], 0); return start; });
      return { token_count: base, segments, seg_base_offset: starts, book_bounds: [{ book: 1, start: 0 }], turn_bounds: [],
        chapter_bounds: segments.flatMap((s, i) => i && parseInt(s.column) === parseInt(segments[i-1].column) ? [] : [{ book: 1, chapter: String(parseInt(s.column)), start: starts[i], accuracy: 'exact' }]) };
    }),
  };
});
vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  const sections = COLUMNS.map(column => ({ column, chapter: String(parseInt(column, 10)), line: '1' }));
  return {
    ...actual,
    fetchBook: vi.fn(async () => fixture),
    fetchChapters: vi.fn(async () => ({ '1': sections, '2': sections })),
  };
});

afterEach(async () => {
  const { greekHitGrammar } = await import('../lib/search');
  vi.mocked(greekHitGrammar).mockReset();
  const { fetchBook } = await import('../lib/data');
  vi.mocked(fetchBook).mockReset().mockResolvedValue(fixture);
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

const at = (column: string, r: Partial<SearchResult>, work = 'EN'): SearchResult => ({
  work, meta: { id: `1:${column}`, book: 1, column },
  grkMatch: false, engMatch: false, grkPositions: [], ...r,
});
const grk = (column: string, grkPositions: number[], work = 'EN', more: Partial<SearchResult> = {}) =>
  at(column, { grkMatch: true, grkPositions, ...more }, work);
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const marks = (el: Element) => [...el.querySelectorAll('mark')].map(m => m.textContent);
const status = () => screen.getByRole('status');

// Every heading starts open, in every view (John, 2026-11-10).
async function expectAllOpen(c: HTMLElement) {
  for (const row of c.querySelectorAll<HTMLButtonElement>('.sx-para[aria-expanded="false"]')) await fireEvent.click(row);
  expect(c.querySelectorAll('button.group-head').length).toBeGreaterThan(0);
  expect(c.querySelectorAll('button.group-head[aria-expanded="false"]')).toHaveLength(0);
}
// Runs the search in `url` over `results`. Settled once the status line holds
// the count and the first page's groups are drawn, every group open.
async function open(url: string, results: SearchResult[], total: number, { combo = false } = {}) {
  const { search, searchCombo } = await import('../lib/search');
  vi.mocked(combo ? searchCombo : search).mockResolvedValueOnce({ results, failedWorks: [] });
  window.history.replaceState(null, '', url);
  const page = render(Search);
  await vi.waitFor(() => expect(status()).toHaveTextContent(new RegExp(`${total} (?:instance|hits)`)));
  await vi.waitFor(() => expect(page.container.querySelector('.chapter-group')).not.toBeNull());
  await expectAllOpen(page.container);
  return page;
}
const items = (c: HTMLElement) => [...c.querySelectorAll('li.instance')];
const G = (q: string) => `/search?g=${encodeURIComponent(q)}`;

describe('Search.svelte: a Greek word opens its card', () => {
  it('opens the card for the word clicked, marked or not, and closes it', async () => {
    const { container } = await open(G('δ'), [grk('70a', [3])], 1);
    const [li] = items(container);
    expect(marks(li)).toEqual(['δ']);
    expect(container.querySelector('.word-sidebar')).toBeNull();
    // The marked word is a word button too.
    const hit = li.querySelector('mark')!.closest('button.gw')!;
    expect(hit).not.toBeNull();
    await fireEvent.click(hit);
    const card = await vi.waitFor(() => container.ownerDocument.querySelector('.word-sidebar')!);
    expect(card).toHaveAttribute('data-work', 'EN');
    expect(JSON.parse(card.getAttribute('data-token')!)).toEqual(fixture.segments[0].greek[1].tokens[0]);
    // Another word in the same hit: the card is now that word's.
    const other = [...li.querySelectorAll('button.gw')].find(b => text(b) === 'β')!;
    await fireEvent.click(other);
    await vi.waitFor(() => expect(JSON.parse(container.ownerDocument.querySelector('.word-sidebar')!.getAttribute('data-token')!))
      .toEqual(fixture.segments[0].greek[0].tokens[1]));
    await fireEvent.click(within(container.ownerDocument.querySelector('.word-sidebar') as HTMLElement).getByRole('button', { name: 'Close' }));
    await vi.waitFor(() => expect(container.ownerDocument.querySelector('.word-sidebar')).toBeNull());
  });

  it('opens it from the Greek printed under an English hit', async () => {
    // "seven" is Socrates' turn in 70b, whose Greek there is ζ η.
    const { container } = await open('/search?e=seven', [at('70b', { engMatch: true, engHits: [{ translation: 'rackham', positions: [1] }] })], 1);
    const pair = items(container)[0].querySelector('.inst-pair.greek')!;
    expect(text(pair)).toBe('ζ η');
    const words = [...pair.querySelectorAll('button.gw')];
    expect(words.map(text)).toEqual(['ζ', 'η']);
    await fireEvent.click(words[1]);
    const card = await vi.waitFor(() => container.ownerDocument.querySelector('.word-sidebar')!);
    expect(JSON.parse(card.getAttribute('data-token')!)).toEqual(fixture.segments[1].greek[0].tokens[1]);
  });
});

describe('Search.svelte: the card goes with its hits', () => {
  const card = (c: HTMLElement) => c.ownerDocument.querySelector('.word-sidebar');
  const openCard = async (c: HTMLElement) => {
    await fireEvent.click(items(c)[0].querySelector('button.gw')!);
    await vi.waitFor(() => expect(card(c)).not.toBeNull());
  };

  it('closes when Back leads to an empty search', async () => {
    const { container } = await open(G('δ'), [grk('70a', [3])], 1);
    await openCard(container);
    window.history.pushState(null, '', '/search');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(container.querySelector('li.instance')).toBeNull());
    expect(card(container)).toBeNull();
  });

  it('does not outlive a page change that was still loading when it opened', async () => {
    const { fetchBook } = await import('../lib/data');
    const MANY = Array.from({ length: 27 }, (_, i) => grk(`${71 + i}a`, [0, 1, 2]));
    const { container } = await open(G('ο'), MANY, 81);
    // The next page's book is slow: the old hits are still on screen.
    let bookIn!: (book: typeof fixture) => void;
    vi.mocked(fetchBook).mockReturnValueOnce(new Promise(resolve => { bookIn = resolve; }));
    await fireEvent.click(within(container.querySelector('.pager')! as HTMLElement).getByRole('button', { name: /Next/ }));
    await openCard(container);
    bookIn(fixture);
    await vi.waitFor(() => expect(text(container.querySelector('.pager-status'))).toBe('Page 2 of 3'));
    expect(card(container)).toBeNull();
    vi.mocked(fetchBook).mockReset().mockResolvedValue(fixture);
  });

  it('closes on a change of page, and of sort', async () => {
    const MANY = Array.from({ length: 27 }, (_, i) => grk(`${71 + i}a`, [0, 1, 2]));
    const { container } = await open(G('ο'), MANY, 81);
    await openCard(container);
    await fireEvent.click(within(container.querySelector('.pager')! as HTMLElement).getByRole('button', { name: /Next/ }));
    await vi.waitFor(() => expect(text(container.querySelector('.pager-status'))).toBe('Page 2 of 3'));
    expect(card(container)).toBeNull();
    await expectAllOpen(container);
    await openCard(container);
    await fireEvent.click(within(screen.getByRole('group', { name: 'Sort' })).getByRole('radio', { name: 'Forms A–Z' }));
    await vi.waitFor(() => expect(card(container)).toBeNull());
  });
});

// The words a passage prints, its marks and cut marks left out.
const wordsIn = (el: Element | null) => text(el).replace(/…/g, '').trim().split(/\s+/);
const control = (name: string) => screen.getByRole('group', { name });
// The display settings are radios in a menu, each named by its label.
const press = (group: string, name: string) => fireEvent.click(within(control(group)).getByRole('radio', { name }));
const options = (group: string) => (within(control(group)).getAllByRole('radio') as HTMLInputElement[])
  .map(r => [text(r.closest('label')), String(r.checked)]);

describe('Search.svelte: context', () => {
  it('offers 1 line, 3 lines and the whole section, 3 lines in force', async () => {
    const { search } = await import('../lib/search');
    await open(G('κ15'), [grk('99a', [15])], 1);
    const row = control('Context');
    expect(options('Context')).toEqual([
      ['1 line', 'false'], ['3 lines', 'true'], ['Whole section', 'false'], ['Citations only', 'false'],
    ]);
    for (const r of within(row).getAllByRole('radio')) expect(r.closest('label')!.className).toContain('ck');
    await press('Context', '1 line');
    await vi.waitFor(() => expect(within(row).getByRole('radio', { name: '1 line' })).toBeChecked());
    expect(window.location.search).toContain('ctx=1');
    await press('Context', '3 lines');
    await vi.waitFor(() => expect(window.location.search).not.toContain('ctx='));
    // A setting of the results: nothing is searched again.
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('Greek: 12 words either side under 3 lines, 4 under 1 line, the whole section under the third', async () => {
    const { container } = await open(G('κ15'), [grk('99a', [15])], 1);
    const greek = () => items(container)[0].querySelector('.inst-snippet.greek');
    expect(wordsIn(greek())).toEqual(Array.from({ length: 25 }, (_, i) => `κ${i + 3}`));
    expect(text(greek()).startsWith('… κ3')).toBe(true);
    expect(text(greek()).endsWith('κ27 …')).toBe(true);
    await press('Context', '1 line');
    await vi.waitFor(() => expect(wordsIn(greek())).toEqual(Array.from({ length: 9 }, (_, i) => `κ${i + 11}`)));
    await press('Context', 'Whole section');
    await vi.waitFor(() => expect(wordsIn(greek())).toHaveLength(31));
    expect(text(greek())).not.toContain('…');
    expect(marks(items(container)[0])).toEqual(['κ15']);
  });

  it('English: a single Greek line gives the same word budget in either context', async () => {
    const hit = at('99a', { engMatch: true, engHits: [{ translation: 'rackham', positions: [30] }] });
    const { container } = await open('/search?e=virtu', [hit], 1);
    const passage = () => items(container)[0].querySelector('.inst-rows .inst-snippet');
    expect(wordsIn(passage())).toHaveLength(43);
    // Cut at word boundaries, each cut a spaced ellipsis, never "..." (§7.5).
    expect(text(passage())).toMatch(/^… \S.*\S …$/);
    expect(text(passage())).not.toContain('...');
    await press('Context', '1 line');
    await vi.waitFor(() => expect(wordsIn(passage())).toHaveLength(43));
    expect(marks(items(container)[0].querySelector('.inst-rows')!)).toEqual(['virtu']);
  });

  it('whole section: one instance per section, both sides whole, every hit marked, the counts unchanged', async () => {
    const { container } = await open(G('α'), [grk('70a', [0, 3]), grk('70b', [1])], 3);
    expect(items(container)).toHaveLength(3);
    const counts = () => [...container.querySelectorAll('.group-count')].map(text);
    expect(counts()).toEqual(['3 instances']);
    await press('Context', 'Whole section');
    await vi.waitFor(async () => {
      await expectAllOpen(container);
      expect(items(container)).toHaveLength(2);
    });
    expect(status()).toHaveTextContent(/3 (?:instances?|hits)/);
    expect(counts()).toEqual(['3 instances']);
    expect(window.location.search).toContain('ctx=s');
    const [a, b] = items(container);
    expect(text(a.querySelector('.inst-ref'))).toBe('70a');
    expect(text(a.querySelector('.inst-snippet.greek'))).toBe('α β γ δ ε');
    expect(marks(a)).toEqual(['α', 'δ']);
    // The citation names every Greek hit of the section.
    expect(a.querySelector('.inst-ref')!.getAttribute('href')).toContain('hlt=70a:0,3');
    // A Greek search: the section's English, unmarked, in the reference translation.
    expect(text(a.querySelector('.inst-pair'))).toBe('One two three. Four five Rackham· Ross');
    expect(a.querySelector('.inst-pair mark')).toBeNull();
    expect(text(b.querySelector('.inst-snippet.greek'))).toBe('ζ η θ ι κ');
    expect(marks(b)).toEqual(['η']);
    expect(text(b.querySelector('.inst-pair'))).toBe('six seven eight Nine ten. Eleven Rackham· Ross');
    // No "more" on a whole section.
    expect(container.querySelector('.inst-more')).toBeNull();
  });

  // By grammar is a dictionary word's (John, 13 Nov): the headword (here a
  // fold standing in for one) over a row per form, each row as a form's group.
  for (const [v, url, groups] of [
    ['form', `${G('α')}&e=one+two+three&v=form`, ['α 4 instances', 'δ 1 instance', 'η 1 instance']],
    ['grammar', '/search?l=a&e=one+two+three&v=grammar', ['α 6 instances', 'α 4 instances', 'δ 1 instance', 'η 1 instance']],
  ] as const) {
    it(`whole section, ${v} view: one instance per section and form, the counts as under 3 lines`, async () => {
      // 70a: α (carrying Rackham's three words) and δ; 70b: η.
      const results = [
        at('70a', { grkMatch: true, engMatch: true, grkPositions: [0, 3], engHits: [{ translation: 'rackham', positions: [0, 1, 2] }] }),
        grk('70b', [1]),
      ];
      const { container } = await open(url, results, 6);
      const heads = () => [...container.querySelectorAll('.group-head')].map(h =>
        `${text(h.querySelector('.group-label'))} ${text(h.querySelector('.group-count'))}`);
      const before = heads();
      expect(before).toEqual(groups);
      await press('Context', 'Whole section');
      await vi.waitFor(async () => {
        await expectAllOpen(container);
        expect(items(container)[0].querySelector('.inst-more')).toBeNull();
      });
      expect(heads()).toEqual(before);
      const [a, d, h] = items(container);
      // Each the whole section, its own form marked; the English once, on the first.
      expect(text(a.querySelector('.inst-snippet.greek'))).toBe('α β γ δ ε');
      expect(marks(a.querySelector('.inst-snippet.greek')!)).toEqual(['α']);
      expect(marks(a.querySelector('.inst-rows')!)).toEqual(['One', 'two', 'three']);
      expect(text(d.querySelector('.inst-snippet.greek'))).toBe('α β γ δ ε');
      expect(marks(d)).toEqual(['δ']);
      expect(d.querySelector('.inst-rows')).toBeNull();
      expect(text(d.querySelector('.inst-pair'))).toBe('One two three. Four five Rackham· Ross');
      expect(marks(h)).toEqual(['η']);
      expect(status()).toHaveTextContent('2 passages · 6 hits');
      // The work view: one instance per section, as before.
      await press('Group by', 'By work');
      await vi.waitFor(async () => {
        await expectAllOpen(container);
        expect(items(container)).toHaveLength(2);
      });
      expect(marks(items(container)[0].querySelector('.inst-snippet.greek')!)).toEqual(['α', 'δ']);
      expect([...container.querySelectorAll('.group-count')].map(text)).toEqual(['6 instances']);
    });
  }

  it("whole section: a translation's row is the section its words fall in", async () => {
    // α and Rackham's "Four" in 70a; Ross's "seis", filed under 70a with its
    // turn, falls in 70b.
    const hit = at('70a', {
      grkMatch: true, engMatch: true, grkPositions: [0],
      engHits: [{ translation: 'rackham', positions: [3] }, { translation: 'ross', positions: [4] }],
    });
    const url = `${G('α')}&e=four+seis&em=any&ctx=s`;
    const { container } = await open(url, [hit], 3);
    const [a, b] = items(container);
    expect(items(container)).toHaveLength(2);
    expect(marks(a)).toEqual(['α', 'Four']);
    expect([...a.querySelectorAll('.inst-rows')].map(text)).toEqual(['One two three. Four five Rackham']);
    expect(text(b.querySelector('.inst-ref'))).toBe('70b');
    expect(text(b.querySelector('.inst-snippet.greek'))).toBe('ζ η θ ι κ');
    expect([...b.querySelectorAll('.inst-rows')].map(text)).toEqual(['seis Ross']);
    expect(marks(b)).toEqual(['seis']);
    expect(status()).toHaveTextContent(/3 (?:instances?|hits)/);
    expect([...container.querySelectorAll('.group-count')].map(text)).toEqual(['3 instances']);
  });

  it('more: opens one hit to its whole section on both sides, marks kept; less puts it back', async () => {
    const { container } = await open(G('α'), [grk('70a', [0, 3])], 2);
    const [a, b] = items(container);
    const before = [a.innerHTML, b.innerHTML];
    const more = a.querySelector('button.inst-more')!;
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(text(more)).toBe('Show the whole section');
    await fireEvent.click(more);
    await vi.waitFor(() => expect(more).toHaveAttribute('aria-expanded', 'true'));
    expect(text(more)).toBe('Show less');
    // The opened hit's head row: where it is, and a second way back (r34-06).
    expect(text(a.querySelector('.inst-ohead span'))).toBe(`${getWork('EN')!.title} · Book I`);
    expect(a.querySelector('.inst-ohead button')).toHaveTextContent('Show less');
    expect(text(a.querySelector('.inst-snippet.greek'))).toBe('α β γ δ ε');
    expect(marks(a)).toEqual(['α', 'δ']);
    expect(text(a.querySelector('.inst-pair'))).toBe('One two three. Four five Rackham· Ross');
    expect(b.innerHTML).toBe(before[1]);
    expect(window.location.search).not.toContain('ctx');
    await fireEvent.click(a.querySelector('.inst-ohead button')!);
    await vi.waitFor(() => expect(text(more)).toBe('Show the whole section'));
    expect(a.innerHTML).toBe(before[0]);
  });

  it('whole section: the English marks the words the results hold, not every match in the section', async () => {
    const { fetchBook } = await import('../lib/data');
    const book = structuredClone(fixture);
    // EN's turn, filed under 70a, puts Ross's "virtue" in 70b; Socrates'
    // turn, filed under 70b, says "virtue" too. Under Socrates alone the
    // index holds only his.
    book.turnFlow!.turns[1] = { ...book.turnFlow!.turns[1], s: 'EN', alt: { ross: { e: 'Cuatro cinco virtue', es: [{ o: 13, c: '70b' }] } } };
    book.turnFlow!.turns[2] = { ...book.turnFlow!.turns[2], s: 'Socrates', alt: { ross: { e: 'Nueve virtue.' } } };
    vi.mocked(fetchBook).mockResolvedValue(book);
    const hit = at('70b', { engMatch: true, engHits: [{ translation: 'ross', positions: [1] }] });
    const { container } = await open('/search?e=virtue&sp=only&sn=Socrates', [hit], 1);
    const [li] = items(container);
    expect(marks(li)).toEqual(['virtue']);
    // "more": the section, its one hit marked.
    await fireEvent.click(li.querySelector('button.inst-more')!);
    await vi.waitFor(() => expect(text(li.querySelector('.inst-rows'))).toBe('virtue Nueve virtue. Ross'));
    expect(li.querySelector('.inst-rows')!.innerHTML).toContain('virtue Nueve <mark>virtue</mark>.');
    expect(marks(li)).toEqual(['virtue']);
    // The whole section: the same.
    await press('Context', 'Whole section');
    await vi.waitFor(() => expect(items(container)[0].querySelector('.inst-more')).toBeNull());
    await expectAllOpen(container);
    const [s] = items(container);
    expect(text(s.querySelector('.inst-rows'))).toBe('virtue Nueve virtue. Ross');
    expect(marks(s)).toEqual(['virtue']);
    expect(s.querySelector('.inst-rows')!.innerHTML).toContain('virtue Nueve <mark>virtue</mark>.');
    expect(status()).toHaveTextContent('1 instance');
    expect([...container.querySelectorAll('.group-count')].map(text)).toEqual(['1 instance']);
    vi.mocked(fetchBook).mockReset().mockResolvedValue(fixture);
  });

  it('keeps the speaker filter: who speaks, and the counts', async () => {
    const results = [grk('70a', [0, 3], 'EN', { speakers: ['EN', 'Socrates'] })];
    const { container } = await open(`${G('α')}&sp=only&sn=EN,Socrates&ctx=s`, results, 2);
    expect(items(container)).toHaveLength(1);
    expect(text(items(container)[0].querySelector('.inst-speaker'))).toBe('EN · Socrates');
    expect(status()).toHaveTextContent('2 instances');
  });
});

describe('Search.svelte: sort', () => {
  // EN 98a: ω0 β1 ω2 α3 β4 ω5, 26 words apart; Met 98a: ω0. The EN comes
  // first in the corpus.
  const SPREAD = 26;
  const RESULTS = [grk('98a', [0, 1, 2, 3, 4, 5].map(k => k * SPREAD)), grk('98a', [0], 'Meta')];
  // Each hit as work:its place among 98a's six, in the order drawn.
  const order = (c: HTMLElement) => items(c).map(li =>
    `${li.querySelector('.inst-ref')!.getAttribute('href')!.includes('/Meta/') ? 'Meta' : 'EN'}:${Number((li.querySelector('mark')!.closest('button') as HTMLElement).dataset.i) / SPREAD}`);
  const heads = (c: HTMLElement) => [...c.querySelectorAll('.group-label')].map(text);
  const sorted = async (c: HTMLElement, name: string) => {
    await press('Sort', name);
    await vi.waitFor(() => expect(within(control('Sort')).getByRole('radio', { name })).toBeChecked());
    await expectAllOpen(c);
  };

  it('offers four orders, Bekker order in force, and writes so= without searching again', async () => {
    const { search } = await import('../lib/search');
    const { container } = await open(G('ω'), RESULTS, 7);
    expect(options('Sort')).toEqual([
      ['Bekker order', 'true'], ['Works A–Z', 'false'], ['Forms A–Z', 'false'], ['Commonest form first', 'false'],
    ]);
    expect(order(container)).toEqual(['Meta:0', 'EN:0', 'EN:1', 'EN:2', 'EN:3', 'EN:4', 'EN:5']);
    await sorted(container, 'Forms A–Z');
    expect(window.location.search).toContain('so=form');
    await sorted(container, 'Bekker order');
    expect(window.location.search).not.toContain('so=');
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('page view: by work reorders the works; by form and by frequency the hits in each group', async () => {
    const { container } = await open(G('ω'), RESULTS, 7);
    expect([...container.querySelectorAll('.work-name')].map(text)).toEqual([getWork('Meta')!.title, getWork('EN')!.title]);
    await sorted(container, 'Works A–Z');
    expect([...container.querySelectorAll('.work-name')].map(text)).toEqual([getWork('Meta')!.title, getWork('EN')!.title]);
    expect(order(container)).toEqual(['Meta:0', 'EN:0', 'EN:1', 'EN:2', 'EN:3', 'EN:4', 'EN:5']);
    await sorted(container, 'Forms A–Z');
    expect(order(container)).toEqual(['Meta:0', 'EN:3', 'EN:1', 'EN:4', 'EN:0', 'EN:2', 'EN:5']);
    // Counted over the page: ω has four hits, β two, α one.
    await sorted(container, 'Commonest form first');
    expect(order(container)).toEqual(['Meta:0', 'EN:0', 'EN:2', 'EN:5', 'EN:1', 'EN:4', 'EN:3']);
    expect(status()).toHaveTextContent('7 instances');
  });

  it('form view: the groups follow the sort', async () => {
    const { container } = await open(`${G('ω')}&v=form`, RESULTS, 7);
    expect(heads(container)).toEqual(['ω', 'β', 'α']);
    await sorted(container, 'Forms A–Z');
    expect(heads(container)).toEqual(['α', 'β', 'ω']);
    await sorted(container, 'Commonest form first');
    expect(heads(container)).toEqual(['ω', 'β', 'α']);
    // By work: the groups as by default, and in each the hits by work.
    await sorted(container, 'Works A–Z');
    expect(heads(container)).toEqual(['ω', 'β', 'α']);
    expect(order(container).slice(0, 4)).toEqual(['Meta:0', 'EN:0', 'EN:2', 'EN:5']);
    expect(status()).toHaveTextContent('7 instances');
  });

  // A paradigm keeps its own order (John, 13 Nov: round B, option 2); the
  // sort orders the hits within each row. With no parse to go by, the rows
  // run by their hits.
  it('grammar view: the rows keep the paradigm\'s order under every sort', async () => {
    const { container } = await open('/search?l=w&v=grammar', RESULTS, 7);
    expect(heads(container)).toEqual(['ω', 'ω', 'β', 'α']);
    for (const so of ['Forms A–Z', 'Commonest form first', 'Works A–Z']) {
      await sorted(container, so);
      expect(heads(container)).toEqual(['ω', 'ω', 'β', 'α']);
    }
    expect(order(container).slice(0, 4)).toEqual(['Meta:0', 'EN:0', 'EN:2', 'EN:5']);
    expect(status()).toHaveTextContent('7 instances');
  });

  it('by form frequency counts Greek hits, not the English a hit carries; the counts stay', async () => {
    const { fetchBook } = await import('../lib/data');
    const book = structuredClone(fixture);
    // 70b's first line reads ω η ω.
    book.segments[1].greek[0] = { n: 1, text: 'ω η ω', tokens: [{ t: 'ω', o: 0, k: 'w' }, { t: 'η', o: 2, k: 'h' }, { t: 'ω', o: 4, k: 'w' }] };
    vi.mocked(fetchBook).mockResolvedValue(book);
    // α in 70a carries Rackham's three words of its turn; ω is two Greek hits in 70b.
    const results = [
      at('70a', { grkMatch: true, engMatch: true, grkPositions: [0], engHits: [{ translation: 'rackham', positions: [0, 1, 2] }] }),
      grk('70b', [0, 2]),
    ];
    const { container } = await open(`${G('α')}&e=one+two+three&so=freq`, results, 6);
    const drawn = () => items(container).map(li => `${text(li.querySelector('.inst-ref'))} ${text(li.querySelector('mark'))}`);
    expect(drawn()).toEqual(['70b1 ω', '70b1 ω', '70a1 α']);
    expect([...container.querySelectorAll('.group-count')].map(text)).toEqual(['6 instances']);
    await press('Group by', 'By form');
    await vi.waitFor(() => expect(heads(container)).toEqual(['ω', 'α']));
    // The heads still count every hit their group holds.
    expect([...container.querySelectorAll('.group-count')].map(text)).toEqual(['2 instances', '4 instances']);
    expect(status()).toHaveTextContent(/6 (?:instances?|hits)/);
    vi.mocked(fetchBook).mockReset().mockResolvedValue(fixture);
  });

  it('keeps the speaker filter', async () => {
    const results = [grk('98a', [0, 3].map(k => k * SPREAD), 'EN', { speakers: ['Socrates', 'Socrates'] })];
    const { container } = await open(`${G('ω')}&sp=only&sn=Socrates&so=form`, results, 2);
    expect(order(container)).toEqual(['EN:3', 'EN:0']);
    expect(items(container).map(li => text(li.querySelector('.inst-speaker')))).toEqual(['Socrates', 'Socrates']);
  });
});

describe('Search.svelte: page size', () => {
  // 71a … 97a, one to a Stephanus page, three hits each: 81 hits.
  const MANY = Array.from({ length: 27 }, (_, i) => grk(`${71 + i}a`, [0, 1, 2]));
  const pager = (c: HTMLElement) => text(c.querySelector('.pager-status'));

  it('20, 40 or 100 hits a page, breaking at Stephanus pages, back to the first page, with no new search', async () => {
    const { search } = await import('../lib/search');
    const { container } = await open(G('ο'), MANY, 81);
    expect(options('Per page')).toEqual([
      ['20', 'false'], ['40', 'true'], ['100', 'false'],
    ]);
    // 13 Stephanus pages of 3 hits fit in 40.
    expect(pager(container)).toBe('Page 1 of 3');
    await fireEvent.click(within(container.querySelector('.pager')! as HTMLElement).getByRole('button', { name: /Next/ }));
    await vi.waitFor(() => expect(pager(container)).toBe('Page 2 of 3'));
    await press('Per page', '20');
    await vi.waitFor(() => expect(pager(container)).toBe('Page 1 of 5'));
    expect(window.location.search).toContain('ps=20');
    // The context does not move a page break.
    await press('Context', 'Whole section');
    await vi.waitFor(() => expect(window.location.search).toContain('ctx=s'));
    await vi.waitFor(() => expect(pager(container)).toBe('Page 1 of 5'));
    await press('Per page', '100');
    await vi.waitFor(() => expect(container.querySelector('.pager')).toBeNull());
    expect(status()).toHaveTextContent('81 instances');
    await press('Per page', '40');
    await vi.waitFor(() => expect(pager(container)).toBe('Page 1 of 3'));
    expect(window.location.search).not.toContain('ps=');
    expect(search).toHaveBeenCalledTimes(1);
  });

  // EN 70a: α δ; 70b: η; Int 70a: α. Forms by the fold.
  const RESULTS = [grk('70a', [0, 3]), grk('70b', [1]), grk('70a', [0], 'Int')];
  const FORMS = {
    byResult: new Map([['EN:1:70a', ['a', 'd']], ['EN:1:70b', ['h']], ['Int:1:70a', ['a']]]),
    headwords: new Map(), failedWorks: [],
  };
  async function citations(url: string, results: SearchResult[], total: number) {
    const { search, greekHitForms } = await import('../lib/search');
    vi.mocked(search).mockResolvedValueOnce({ results, failedWorks: [] });
    vi.mocked(greekHitForms).mockResolvedValueOnce(FORMS);
    window.history.replaceState(null, '', url);
    const page = render(Search);
    await vi.waitFor(() => expect(status()).toHaveTextContent(new RegExp(`${total} (?:instance|hits)`)));
    await vi.waitFor(() => expect(page.container.querySelector('.cite')).not.toBeNull());
    return page;
  }
  // A work's name heads its first group; each book is named on its own line.
  const cites = (c: HTMLElement) => [...c.querySelectorAll('.cite-group')].map(g =>
    `${[g.querySelector('.book-header'), g.querySelector('.sx-book')].filter(Boolean).map(text).join(' ')}: ${[...g.querySelectorAll('.cite')].map(text).join(', ')}`);

  // S4a (handoff §7.6): a Greek hit is cited to its line, read off the
  // index's offsets; no book is fetched for it.
  it('citations only: every Greek hit\'s line with its count, linked, and no book fetched', async () => {
    const { fetchBook } = await import('../lib/data');
    const { container } = await citations(`${G('α')}&ps=c`, RESULTS, 4);
    expect(cites(container)).toEqual([`${getWork('Int')!.title}: 70a`, `${getWork('EN')!.title} Book I: 70a×2, 70b`]);
    const link = container.querySelector('.cite')!;
    expect(link.getAttribute('href')).toContain('/Int/book/1');
    expect(link.getAttribute('href')).toContain('hlt=70a:0');
    expect(link.getAttribute('href')).toContain('loc=70a:1');
    expect(fetchBook).not.toHaveBeenCalled();
    expect(container.querySelector('li.instance')).toBeNull();
    for (const name of ['Group by', 'Sort']) expect(screen.queryByRole('group', { name })).toBeNull();
    expect(control('Show hits from one work')).not.toBeNull();
    expect(within(control('Context')).getByRole('radio', { name: 'Citations only' })).toBeChecked();
  });

  it('citations only: the Forms panel still narrows the list', async () => {
    const { fetchBook } = await import('../lib/data');
    const { container } = await citations(`${G('α')}&ps=c`, RESULTS, 4);
    const forms = control('Greek forms found');
    await fireEvent.click(within(forms).getByRole('checkbox', { name: /δ/ }));
    await fireEvent.click(within(forms).getByRole('button', { name: 'Apply' }));
    await vi.waitFor(() => expect(status()).toHaveTextContent('3 instances'));
    expect(cites(container)).toEqual([`${getWork('Int')!.title}: 70a`, `${getWork('EN')!.title} Book I: 70a, 70b`]);
    expect(fetchBook).not.toHaveBeenCalled();
    // Back to hits: the books are fetched and the hits drawn.
    await press('Context', '3 lines');
    await vi.waitFor(() => expect(container.querySelector('.chapter-group')).not.toBeNull());
    expect(container.querySelector('.cite')).toBeNull();
  });

  it('citations only keeps the speaker filter', async () => {
    const results = [grk('70a', [0, 3], 'EN', { speakers: ['EN', 'Socrates'] })];
    const { container } = await citations(`${G('α')}&sp=only&sn=EN,Socrates&ps=c`, results, 2);
    expect(cites(container)).toEqual([`${getWork('EN')!.title} Book I: 70a×2`]);
  });
});

describe('Search.svelte: a proximity hit', () => {
  // α near δ: 70a α0 δ3 in one window; 99a κ5 κ7 in one window, κ20 in another.
  const RESULTS = [
    grk('70a', [0, 3], 'EN', { windows: [[0, 3]] }),
    grk('99a', [5, 7, 20], 'EN', { windows: [[5, 7], [20]] }),
  ];
  const URL = `/search?c=${encodeURIComponent('f:α')}&c=${encodeURIComponent('f:δ')}`;
  const prox = (li: Element) => [...li.querySelectorAll('.prox')].map(text);

  it('is one instance per window, every term marked inside one shaded span, each window counted once', async () => {
    const { container } = await open(URL, RESULTS, 3, { combo: true });
    const list = items(container);
    expect(list).toHaveLength(3);
    expect(marks(list[0])).toEqual(['α', 'δ']);
    expect(prox(list[0])).toEqual(['α β γ δ']);
    expect(list[0].querySelectorAll('.prox mark')).toHaveLength(2);
    expect(marks(list[1])).toEqual(['κ5', 'κ7']);
    expect(prox(list[1])).toEqual(['κ5 κ6 κ7']);
    // Centred on the window: 12 words before its first term, 12 after its last.
    expect(wordsIn(list[1].querySelector('.inst-snippet.greek'))[0]).toBe('κ0');
    expect(wordsIn(list[1].querySelector('.inst-snippet.greek')).at(-1)).toBe('κ19');
    expect(marks(list[2])).toEqual(['κ20']);
    expect(prox(list[2])).toEqual(['κ20']);
    expect(status()).toHaveTextContent('3 instances');
    // One heading, the EN's, counting the three windows (John, 2026-11-11).
    expect([...container.querySelectorAll('.group-count')].map(text)).toEqual(['3 instances']);
  });

  it('shows a window that runs on into the next section whole, every word marked', async () => {
    // ε ends 70a, ζ opens 70b: cited at 70a, ζ counted on from 70a's first as 5.
    const { container } = await open(URL, [grk('70a', [4, 5], 'EN', { windows: [[4, 5]] })], 1, { combo: true });
    const list = items(container);
    expect(list).toHaveLength(1);
    expect(marks(list[0])).toEqual(['ε', 'ζ']);
    expect(prox(list[0])).toEqual(['ε ζ']);
    // ζ is 70b's own first word, for its card.
    const zeta = list[0].querySelectorAll('mark')[1].closest('button')!;
    expect([zeta.dataset.s, zeta.dataset.i]).toEqual(['1:70b', '0']);
    expect(list[0].querySelector('.inst-ref')!.getAttribute('href')).toContain('hlt=70a:4,5');
  });

  it('whole section: a window that runs on into the next section carries on into it (John, 2026-11-11)', async () => {
    const { container } = await open(URL, [grk('70a', [4, 5], 'EN', { windows: [[4, 5]] })], 1, { combo: true });
    await press('Context', 'Whole section');
    await vi.waitFor(() => expect(items(container)[0].querySelector('.sec-on')).not.toBeNull());
    const [li] = items(container);
    expect(items(container)).toHaveLength(1);
    expect(text(li.querySelector('.inst-ref'))).toBe('70a');
    // 70a whole, then 70b under its letter, both words marked.
    expect(text(li.querySelector('.inst-snippet.greek'))).toBe('α β γ δ ε 70b ζ η θ ι κ');
    expect(marks(li)).toEqual(['ε', 'ζ']);
    const zeta = li.querySelectorAll('mark')[1].closest('button')!;
    expect([zeta.dataset.s, zeta.dataset.i]).toEqual(['1:70b', '0']);
    // The English goes as far as the Greek.
    expect(text(li.querySelector('.inst-pair'))).toBe('One two three. Four five 70b six seven eight Nine ten. Eleven Rackham· Ross');
    expect(status()).toHaveTextContent('1 instance');
  });

  it('whole section, form view: each form\'s English goes only as far as its own Greek (Codex review)', async () => {
    // α δ in 70a; ε ζ runs on into 70b. Under By form each is a view of its own.
    // An exact phrase: a proximity search is not offered By form (John, 13 Nov).
    const results = [grk('70a', [0, 3, 4, 5], 'EN', { windows: [[0, 3], [4, 5]] })];
    const { container } = await open(`${G('α δ')}&gm=phrase&v=form`, results, 2);
    await press('Context', 'Whole section');
    await vi.waitFor(() => expect(container.querySelector('.sec-on')).not.toBeNull());
    const views = items(container).map(li => [text(li.querySelector('.inst-snippet.greek')), text(li.querySelector('.inst-pair'))]);
    expect(views).toEqual([
      ['α β γ δ ε', 'One two three. Four five Rackham· Ross'],
      ['α β γ δ ε 70b ζ η θ ι κ', 'One two three. Four five 70b six seven eight Nine ten. Eleven Rackham· Ross'],
    ]);
  });

  it('whole section: a translation with no English for the cited section falls back, the label not standing alone (Codex review)', async () => {
    // λ μ is 70c, ο opens 71a; Ross, narrowed to by an English hit in 70a,
    // has nothing for 70c or 71a, so the plain English is Rackham's.
    const results = [
      grk('70c', [1, 2], 'EN', { windows: [[1, 2]] }),
      at('70a', { engMatch: true, engHits: [{ translation: 'ross', positions: [0] }] }),
    ];
    const { container } = await open(`${G('μ')}&e=uno&t=ross`, results, 2);
    await press('Context', 'Whole section');
    await vi.waitFor(() => expect(container.querySelector('.sec-on')).not.toBeNull());
    const li = items(container).find(x => text(x.querySelector('.inst-ref')) === '70c')!;
    expect(text(li.querySelector('.inst-pair'))).toBe('twelve thirteen Residual words here Last. 71a Plain words Rackham');
  });

  it('whole section: a window inside its section shows that section only', async () => {
    const { container } = await open(URL, [grk('70a', [0, 3], 'EN', { windows: [[0, 3]] })], 1, { combo: true });
    await press('Context', 'Whole section');
    await vi.waitFor(() => expect(text(items(container)[0].querySelector('.inst-snippet.greek'))).toBe('α β γ δ ε'));
    expect(items(container)[0].querySelector('.sec-on')).toBeNull();
  });

  it('keeps the speaker filter', async () => {
    const results = [grk('70a', [0, 3], 'EN', { windows: [[0, 3]], speakers: ['EN', 'EN'] })];
    const { container } = await open(`${URL}&sp=only&sn=EN`, results, 1, { combo: true });
    expect(items(container)).toHaveLength(1);
    expect(text(items(container)[0].querySelector('.inst-speaker'))).toBe('EN');
  });
});

describe('Search.svelte: the notes and speakers of a hit', () => {
  const PROX = `/search?c=${encodeURIComponent('f:α')}&c=${encodeURIComponent('f:δ')}`;
  const certain = { values: { case: ['nom'] }, certain: true };
  const open2 = { values: { case: ['gen', 'acc'] }, certain: false };

  it('a proximity window: the note of every term, with its word, and every speaker', async () => {
    const results = [grk('70a', [0, 3], 'EN', { windows: [[0, 3]], grammar: [certain, open2], speakers: ['EN', 'Socrates'] })];
    const { container } = await open(`${PROX}&sp=only&sn=EN,Socrates`, results, 1, { combo: true });
    const [li] = items(container);
    expect(text(li.querySelector('.inst-oneof'))).toBe('δ: genitive or accusative');
    expect(text(li.querySelector('.inst-speaker'))).toBe('EN · Socrates');
  });

  it('an English hit opened with "more" says which of the section\'s Greek hits are ambiguous', async () => {
    const { greekHitGrammar } = await import('../lib/search');
    // δ is genitive or dative; "one" is in the turn before it, in the same section.
    vi.mocked(greekHitGrammar).mockResolvedValue({
      byResult: new Map([['EN:1:70a', [[{ case: ['gen'] }, { case: ['dat'] }]]]]), failedWorks: [],
    });
    const results = [at('70a', { grkMatch: true, grkPositions: [3], engMatch: true, engHits: [{ translation: 'rackham', positions: [0] }] })];
    const { container } = await open(`${G('δ')}&e=one&gf=case.dat`, results, 2);
    const english = items(container).find(li => !li.querySelector('.inst-snippet.greek mark'))!;
    expect(text(english.querySelector('.inst-oneof'))).toBe('');
    await fireEvent.click(english.querySelector('button.inst-more')!);
    await vi.waitFor(() => expect(marks(english.querySelector('.inst-snippet.greek')!)).toEqual(['δ']));
    expect(text(english.querySelector('.inst-oneof'))).toBe('δ: one of 2 readings');
  });

  it('a whole section keeps a grammatical search\'s note: alone as it is, among several with its word', async () => {
    const { container } = await open(`${G('α')}&ctx=s`, [grk('70a', [0], 'EN', { grammar: [open2] }), grk('70b', [1, 3], 'EN', { grammar: [open2, certain] })], 3);
    expect(items(container).map(li => text(li.querySelector('.inst-oneof')))).toEqual(['genitive or accusative', 'η: genitive or accusative']);
  });
});

describe('Search.svelte: no setting changes a count', () => {
  // Each search in the views it is offered (John, 13 Nov): one word typed,
  // By form; a dictionary word, By grammar, whose rows add up to their headword.
  for (const [url, views] of [
    [`${G('α')}&e=one+two+three+seis&em=any`, ['By work', 'By form']],
    ['/search?l=a&e=one+two+three+seis&em=any', ['By work', 'By grammar']],
  ] as const) it(`the total, the side counts and the sum of the group counts, in every view, context and sort (${views[1]})`, async () => {
    const { greekHitForms } = await import('../lib/search');
    // 70a: α and δ, Rackham's three words, and Ross's "seis", which falls in
    // 70b; 70b: η; 98a: ω β ω. Ten hits in all.
    const results = [
      at('70a', {
        grkMatch: true, engMatch: true, grkPositions: [0, 3],
        engHits: [{ translation: 'rackham', positions: [0, 1, 2] }, { translation: 'ross', positions: [4] }],
      }),
      grk('70b', [1]),
      grk('98a', [0, 1, 2]),
    ];
    vi.mocked(greekHitForms).mockResolvedValueOnce({
      byResult: new Map([['EN:1:70a', ['a', 'd']], ['EN:1:70b', ['h']], ['EN:1:98a', ['w', 'b', 'w']]]),
      headwords: new Map(), failedWorks: [],
    });
    const { container } = await open(url, results, 10);
    const side = () => ['Show hits from one work', 'Show English hits from one translation', 'Greek forms found']
      .map(name => text(screen.queryByRole('group', { name })));
    await vi.waitFor(() => expect(side()[2]).not.toBe(''));
    const before = side();
    const count = (els: Iterable<Element>) => [...els].reduce((n, el) => n + parseInt(text(el), 10), 0);
    // The groups' heads; a paradigm's rows are counted against their headword.
    const sum = () => {
      for (const block of container.querySelectorAll('.book-section')) {
        const rows = block.querySelectorAll('h3 .group-count');
        if (rows.length) expect(count(rows)).toBe(count(block.querySelectorAll('h2 .group-count')));
      }
      return count(container.querySelectorAll('h2 .group-count'));
    };
    const pick = async (group: string, name: string) => {
      await press(group, name);
      await vi.waitFor(() => expect(within(control(group)).getByRole('radio', { name })).toBeChecked());
    };
    for (const cx of ['1 line', '3 lines', 'Whole section']) {
      await pick('Context', cx);
      for (const v of views) {
        await pick('Group by', v);
        for (const so of ['Bekker order', 'Works A–Z', 'Forms A–Z', 'Commonest form first']) {
          await pick('Sort', so);
          await vi.waitFor(() => expect(`${cx} ${v} ${so}: ${sum()}`).toBe(`${cx} ${v} ${so}: 10`));
          expect(status()).toHaveTextContent('3 passages · 10 hits');
          expect(side()).toEqual(before);
        }
      }
    }
  });
});

describe('Search.svelte: print', () => {
  it('opens every group of the page to print, and puts them back after', async () => {
    const { search } = await import('../lib/search');
    // Two works, each its own heading, both open; the reader shuts one.
    vi.mocked(search).mockResolvedValueOnce({ results: [grk('70a', [0, 3]), grk('70a', [0], 'Int')], failedWorks: [] });
    window.history.replaceState(null, '', G('α'));
    const { container } = render(Search);
    await vi.waitFor(() => expect(status()).toHaveTextContent('3 instances'));
    await vi.waitFor(() => expect(container.querySelectorAll('.group-head')).toHaveLength(2));
    const state = () => [...container.querySelectorAll('.group-head')].map(h => h.getAttribute('aria-expanded'));
    expect(state()).toEqual(['true', 'true']);
    await fireEvent.click(container.querySelectorAll('.group-head')[0]);
    expect(state()).toEqual(['false', 'true']);
    // The Int comes first: its one hit is shut away, the EN's two show.
    expect(items(container)).toHaveLength(2);
    window.dispatchEvent(new Event('beforeprint'));
    await vi.waitFor(() => expect(state()).toEqual(['true', 'true']));
    expect(items(container)).toHaveLength(3);
    window.dispatchEvent(new Event('afterprint'));
    await vi.waitFor(() => expect(state()).toEqual(['false', 'true']));
  });
});

// John, 2026-11-09: the note under the results was five lines of fine print.
// One plain line now: who, and the one thing a reader of the results must be
// told, that narrated works are not among them.
describe('Search.svelte: the Spoken by note', () => {
  const cast = (work: string, more: Record<string, unknown> = {}) =>
    ({ work, loaded: true, speakers: [{ name: 'Socrates', turns: 3 }], approximate: false, ...more });
  const note = (c: HTMLElement) => text([...c.querySelectorAll('.sx-note')]
    .find(n => text(n.querySelector('.k')) === 'Spoken by')?.querySelector('.k + span'));

  it('shows no speaker notice or panel for an unsupported speaker URL', async () => {
    const { container } = await open(`${G('α')}&sp=only&sn=Socrates`, [grk('70a', [0], 'EN')], 1);
    expect(note(container)).toBe('');
    expect(container.querySelector('#speaker-panel')).toBeNull();
  });

  it('ignores an except-speaker URL too', async () => {
    const { container } = await open(`${G('α')}&sp=except&sn=Socrates`, [grk('70a', [0], 'EN')], 1);
    expect(note(container)).toBe('');
    expect(container.querySelector('#speaker-panel')).toBeNull();
  });
});

describe('Search.svelte: the whole section keeps its punctuation', () => {
  it('prints the Greek as the page has it, marks and word buttons kept', async () => {
    const { fetchBook } = await import('../lib/data');
    const book = structuredClone(fixture);
    // "α, β· γ." : the tokens stand at 0, 3 and 6.
    book.segments[0].greek = [{ n: 1, text: 'α, β· γ.', tokens: [{ t: 'α', o: 0, k: 'a' }, { t: 'β', o: 3, k: 'b' }, { t: 'γ', o: 6, k: 'g' }] }];
    vi.mocked(fetchBook).mockResolvedValue(book);
    const { container } = await open(`${G('β')}&ctx=s`, [grk('70a', [1])], 1);
    const greek = items(container)[0].querySelector('.inst-snippet.greek')!;
    expect(text(greek)).toBe('α, β· γ.');
    expect(marks(greek)).toEqual(['β']);
    expect([...greek.querySelectorAll('button.gw')].map(text)).toEqual(['α', 'β', 'γ']);
    vi.mocked(fetchBook).mockReset().mockResolvedValue(fixture);
  });

  it('keeps each stop on the line of its word', async () => {
    const { fetchBook } = await import('../lib/data');
    const book = structuredClone(fixture);
    // An opening bracket, a comma, a raised point and a full stop.
    book.segments[0].greek = [{ n: 1, text: '[α, β· γ.', tokens: [{ t: 'α', o: 1, k: 'a' }, { t: 'β', o: 4, k: 'b' }, { t: 'γ', o: 7, k: 'g' }] }];
    vi.mocked(fetchBook).mockResolvedValue(book);
    const { container } = await open(`${G('β')}&ctx=s`, [grk('70a', [1])], 1);
    const greek = items(container)[0].querySelector('.inst-snippet.greek')!;
    // Every word is a button, and a line may break at a button's edge: a
    // word and its stops are held together.
    expect([...greek.querySelectorAll('.nb')].map(el => el.textContent)).toEqual(['[α,', 'β·', 'γ.']);
    expect(greek.textContent).toBe('[α, β· γ.');
    expect(marks(greek)).toEqual(['β']);
    vi.mocked(fetchBook).mockReset().mockResolvedValue(fixture);
  });

  it('joins the Greek under an English hit the same way', async () => {
    const { fetchBook } = await import('../lib/data');
    const book = structuredClone(fixture);
    // The first turn of 70a: its second printed line opens with the comma.
    book.segments[0].greek = [
      { n: 1, text: 'α', tokens: [{ t: 'α', o: 0, k: 'a' }] },
      { n: 2, text: ', β γ', tokens: [{ t: 'β', o: 2, k: 'b' }, { t: 'γ', o: 4, k: 'g' }] },
      { n: 3, text: 'δ ε', tokens: [{ t: 'δ', o: 0, k: 'd' }, { t: 'ε', o: 2, k: 'e' }] },
    ];
    book.turnFlow!.turns[1].g = { c: '70a', n: 3, o: 0 };
    vi.mocked(fetchBook).mockResolvedValue(book);
    const { container } = await open('/search?e=one', [at('70a', { engMatch: true, engHits: [{ translation: 'rackham', positions: [0] }] })], 1);
    const pair = items(container)[0].querySelector('.inst-pair')!;
    expect(pair.textContent).toBe('α, β γ');
    expect([...pair.querySelectorAll('.nb')].map(el => el.textContent)).toEqual(['α,']);
    vi.mocked(fetchBook).mockReset().mockResolvedValue(fixture);
  });

  it('does not part a stop from its word where a line begins with one', async () => {
    const { fetchBook } = await import('../lib/data');
    const book = structuredClone(fixture);
    // The printed line broke after α; its comma opens the next line.
    book.segments[0].greek = [
      { n: 1, text: 'α', tokens: [{ t: 'α', o: 0, k: 'a' }] },
      { n: 2, text: ', β· γ.', tokens: [{ t: 'β', o: 2, k: 'b' }, { t: 'γ', o: 5, k: 'g' }] },
    ];
    vi.mocked(fetchBook).mockResolvedValue(book);
    const { container } = await open(`${G('β')}&ctx=s`, [grk('70a', [1])], 1);
    expect(items(container)[0].querySelector('.inst-snippet.greek')!.textContent).toBe('α, β· γ.');
    vi.mocked(fetchBook).mockReset().mockResolvedValue(fixture);
  });
});

// The aligned alternate in this synthetic book uses the overlay slot.
vi.mock('../lib/works', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/works')>();
  return { ...actual, searchableTranslations: (work: import('../lib/works').Work) =>
    actual.searchableTranslations(work).map(t => t.id === 'ross' ? { ...t, slot: 'overlay' as const } : t) };
});
