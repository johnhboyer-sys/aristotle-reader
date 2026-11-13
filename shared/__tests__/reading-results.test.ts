// Reading the results (PR 3), the pure parts: the English window, a
// section's text in one translation, the order of a results page, and a
// proximity search's windows. What the page draws from them is tested in
// reading-results-search.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookData, FlowTurn, GreekLine, Segment } from '../lib/data';
import { englishSnippets } from '../lib/english-hit';
import { excludeForms } from '../lib/form-panel';
import { pairUnits, sectionEnglish } from '../lib/paired-hit';
import { orderHits, refine } from '../lib/result-views';
import { searchCombo, type ComboOptions, type HitForms, type SearchResult } from '../lib/search';

describe('englishSnippets: the window', () => {
  // Words of five letters and a space: every word starts six characters on.
  const name = (i: number) => `w${String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26))}xx`;
  const words = Array.from({ length: 41 }, (_, i) => (i === 20 ? 'virtu' : name(i)));
  const texts = [words.join(' ')];
  const count = (html: string) => html.replace(/<[^>]+>/g, '').replace(/…/g, '').trim().split(/\s+/).length;

  it('is 140 characters either side by default, as before', () => {
    const [html] = englishSnippets(texts, [20], [['virtu']], false);
    expect(html).toContain('<mark>virtu</mark>');
    expect(englishSnippets(texts, [20], [['virtu']], false, false, undefined, 140)).toEqual([html]);
    // 140 characters is 23 words back, more than there are: the text's head.
    expect(html.startsWith(`${name(0)} `)).toBe(true);
  });

  it('takes a narrower window, and still never leaves its piece', () => {
    const [html] = englishSnippets(texts, [20], [['virtu']], false, false, undefined, 50);
    // 50 characters: back to the word starting 50 before, on to the word
    // ending 50 after; the passage is cut at both ends.
    expect(count(html)).toBe(16);
    expect(html.startsWith(`… ${name(12)} `)).toBe(true);
    expect(html.endsWith(` ${name(27)} …`)).toBe(true);
    const pieces = ['one two', 'three virtu four', 'five'];
    expect(englishSnippets(pieces, [3], [['virtu']], false, false, undefined, 500)).toEqual(['three <mark>virtu</mark> four']);
  });
});

// The book of paired-hit.test.ts: three sections of EN, five turns.
const line = (n: number, text: string): GreekLine => ({
  n, text, tokens: text.split(' ').map((t, i) => ({ t, o: i * 2, k: t })),
});
const seg = (column: string, english: string, ...greek: GreekLine[]): Segment => ({
  id: `1:${column}`, column, greek, english: { text: english, notes: [], markers: [] },
});
const turn = (t: Partial<FlowTurn>): FlowTurn => ({ s: null, d: null, g: null, e: null, p: false, ...t });
const BOOK: BookData = {
  book: 1,
  segments: [
    seg('70a', 'One two three. Four five', line(1, 'α β γ'), line(2, 'δ ε')),
    seg('70b', 'six seven eight Nine ten. Eleven', line(1, 'ζ η θ'), line(2, 'ι κ')),
    seg('70c', 'twelve thirteen Residual words here Last.', line(1, 'λ μ')),
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
    ],
  },
};
const LAMB = { id: 'rackham', slot: 'english' as const };
const JOWETT = { id: 'ross', slot: 'overlay' as const };

describe('sectionEnglish', () => {
  const ix = pairUnits(BOOK, [LAMB, JOWETT]);
  const [a, b, c] = BOOK.segments;

  it("is the reference translation's text of the section", () => {
    expect(sectionEnglish(ix, a, LAMB)).toBe('One two three. Four five');
    expect(sectionEnglish(ix, c, LAMB)).toBe('twelve thirteen Residual words here Last.');
  });

  it("is a turn-aligned translation's words that fall in the section, not those filed under it", () => {
    // Turn 1's Ross is filed under 70a, where its Greek starts; "seis" falls in 70b.
    expect(sectionEnglish(ix, a, JOWETT)).toBe('Uno dos. Cuatro cinco');
    expect(sectionEnglish(ix, b, JOWETT)).toBe('seis');
    expect(sectionEnglish(ix, c, JOWETT)).toBe('');
  });

  it('reads a section-cut overlay off the segment', () => {
    const own: Segment = { ...a, overlays: { taylor: [{ chapter: '70a', text: 'First piece.', cont: false }, { chapter: '70a', text: 'Second.', cont: true }] } };
    const book = { ...BOOK, segments: [own, b, c] };
    expect(sectionEnglish(pairUnits(book, [LAMB, { id: 'taylor', slot: 'overlay' }]), own, { id: 'taylor', slot: 'overlay' }))
      .toBe('First piece. Second.');
  });
});

describe('orderHits', () => {
  // In Bekker order, as a page arrives. Forms are folded keys: β is b, γ g,
  // δ d, ξ c; Greek order is α β γ δ … ξ, not the Latin a b c d.
  const item = (id: string, work: string, form?: string, hits = 1) => ({ id, work, form, hits });
  const PAGE = [
    item('1', 'EN', 'd'), item('2', 'EN', 'c'), item('3', 'EN'),
    item('4', 'Int', 'b'), item('5', 'Int', 'd'), item('6', 'DA', 'c', 2),
    item('7', 'DA'), item('8', 'DA', 'd'),
  ];
  const title = (w: string) => w;
  const ids = (list: { id: string }[]) => list.map(x => x.id).join(' ');

  it('page: as they came', () => {
    expect(ids(orderHits(PAGE, 'page', title))).toBe('1 2 3 4 5 6 7 8');
  });
  it('work: by title, Bekker order inside each', () => {
    expect(ids(orderHits(PAGE, 'work', title))).toBe('6 7 8 1 2 3 4 5');
  });
  it('form: by form in Greek order, Bekker order inside, no Greek last', () => {
    // β (4), δ (1 5 8), ξ (2 6), then the hits with no form (3 7).
    expect(ids(orderHits(PAGE, 'form', title))).toBe('4 1 5 8 2 6 3 7');
  });
  it('freq: the commonest form first, counting hits, then by form; no Greek last', () => {
    // δ 3 hits, ξ 3 hits (one instance of 2), β 1: a tie goes by form.
    expect(ids(orderHits(PAGE, 'freq', title))).toBe('1 5 8 2 6 4 3 7');
    // Counted over what it is given to count, the whole page, when a group asks.
    const freq = new Map([['c', 9]]);
    expect(ids(orderHits(PAGE.slice(0, 2), 'freq', title, freq))).toBe('2 1');
  });
  it('is stable: equal keys keep their order', () => {
    const same = [item('a', 'EN', 'd'), item('b', 'EN', 'd'), item('c', 'EN', 'd')];
    for (const s of ['page', 'work', 'form', 'freq'] as const) expect(ids(orderHits(same, s, title))).toBe('a b c');
  });
});

describe('refine and excludeForms cut the windows in step', () => {
  const r: SearchResult = {
    work: 'EN', meta: { id: '1:70a', book: 1, column: '70a' }, grkMatch: true, engMatch: false,
    grkPositions: [2, 4, 6], windows: [[2, 4], [6]], speakers: ['EN', 'EN', 'Socrates'],
  };
  const forms: HitForms = { byResult: new Map([['EN:1:70a', ['a', 'b', 'a']]]), headwords: new Map(), failedWorks: [] };

  it('drops a removed position from its window', () => {
    const [left] = refine([r], { forms, excluded: new Set(['b']) }, 'and');
    expect(left.grkPositions).toEqual([2, 6]);
    expect(left.windows).toEqual([[2], [6]]);
    expect(left.speakers).toEqual(['EN', 'Socrates']);
    expect(excludeForms([r], forms, new Set(['b']), 'and')[0].windows).toEqual([[2], [6]]);
  });

  it('drops a window left empty', () => {
    const [left] = refine([r], { forms, excluded: new Set(['a']) }, 'and');
    expect(left.grkPositions).toEqual([4]);
    expect(left.windows).toEqual([[4]]);
    expect(excludeForms([r], forms, new Set(['a']), 'and')[0].windows).toEqual([[4]]);
  });

  it('leaves a result without windows without them', () => {
    const { windows: _, ...plain } = r;
    expect(refine([plain], { forms, excluded: new Set(['b']) }, 'and')[0]).not.toHaveProperty('windows');
    expect(excludeForms([plain], forms, new Set(['b']), 'and')[0]).not.toHaveProperty('windows');
  });
});

// The proximity engine's windows, over combo.test.ts's layout: one work of 40
// tokens, book 1 = 0–19 (turns at 0 Socrates, 10 Glaucon), book 2 = 20–39.
describe('searchCombo: windows', () => {
  const meta = [
    { id: '1:327a', book: 1, column: '327a' },
    { id: '2:357a', book: 2, column: '357a' },
    { id: '2:357b', book: 2, column: '357b' },
  ];
  const offsets = {
    token_count: 40,
    seg_base_offset: [0, 20, 30],
    segments: [
      { book: 1, column: '327a', line_runs: [[1, 5], [2, 5], [3, 5], [4, 5]] },
      { book: 2, column: '357a', line_runs: [[1, 5], [2, 5]] },
      { book: 2, column: '357b', line_runs: [[1, 5], [2, 5]] },
    ],
    book_bounds: [{ book: 1, start: 0 }, { book: 2, start: 20 }],
    turn_bounds: [
      { book: 1, speaker: 'Socrates', start: 0, accuracy: 'exact' },
      { book: 1, speaker: 'Glaucon', start: 10, accuracy: 'exact' },
      { book: 2, speaker: 'Socrates', start: 20, accuracy: 'exact' },
      { book: 2, speaker: 'Glaucon', start: 30, accuracy: 'exact' },
    ],
  };
  const form: Record<string, [number, number][]> = {
    alpha: [[0, 2]], beta: [[0, 4]],
    pi: [[0, 2], [0, 6]], rho: [[0, 4]],
    sigma: [[0, 2], [0, 4]],
    mu: [[1, 9]], nu: [[2, 0]],
  };
  const json = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
  const opts = (over: Partial<ComboOptions> = {}): ComboOptions => ({ window: 5, unit: 'words', ordered: false, crossTurn: true, ...over });
  const slot = (...terms: string[]) => ({ kind: 'form' as const, terms });
  let n = 0;
  const work = () => `RRW${++n}`;   // the indexes are cached per work

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/meta.json')) return json(meta);
      if (path.endsWith('/offsets.json')) return json(offsets);
      if (path.endsWith('/greek_form.json')) return json(form);
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists each window\'s tokens, ascending', async () => {
    const { results } = await searchCombo([slot('beta'), slot('alpha')], opts(), [work()]);
    expect(results).toHaveLength(1);
    expect(results[0].grkPositions).toEqual([2, 4]);
    expect(results[0].windows).toEqual([[2, 4]]);
  });

  it('partitions the positions: a shared token goes to the first window', async () => {
    // π@2 and π@6 each find ρ@4.
    const { results } = await searchCombo([slot('pi'), slot('rho')], opts(), [work()]);
    expect(results[0].grkPositions).toEqual([2, 4, 6]);
    expect(results[0].windows).toEqual([[2, 4], [6]]);
    expect(results[0].windows!.flat().sort((a, b) => a - b)).toEqual(results[0].grkPositions);
  });

  it('leaves out a window with no token of its own', async () => {
    // σ@2 finds β@4; σ@4 finds β@4 again, which the first window holds.
    const { results } = await searchCombo([slot('sigma'), slot('beta')], opts(), [work()]);
    expect(results[0].grkPositions).toEqual([2, 4]);
    expect(results[0].windows).toEqual([[2, 4]]);
  });

  it('keeps a window across two sections whole, cited where it starts', async () => {
    const { results } = await searchCombo([slot('mu'), slot('nu')], opts(), [work()]);
    expect(results.map(r => [r.meta.column, r.grkPositions, r.windows])).toEqual([
      ['357a', [9, 10], [[9, 10]]],
    ]);
  });

  it('keeps the windows under a speaker filter', async () => {
    const only = await searchCombo([slot('pi'), slot('rho')], opts({ speaker: { mode: 'only', names: ['Socrates'] } }), [work()]);
    expect(only.results[0].windows).toEqual([[2, 4], [6]]);
    expect(only.results[0].speakers).toEqual(['Socrates', 'Socrates', 'Socrates']);
    const none = await searchCombo([slot('pi'), slot('rho')], opts({ speaker: { mode: 'only', names: ['Glaucon'] } }), [work()]);
    expect(none.results).toEqual([]);
  });
});
