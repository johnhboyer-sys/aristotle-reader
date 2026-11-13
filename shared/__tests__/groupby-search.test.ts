// Group by, ruled (John, 13 Nov), as the page draws it: which groupings each
// search is offered, an address asking for another, the form key on a phrase,
// and By grammar as the headword over its paradigm, with readings that name
// their headword (new data) and readings that do not (old data).
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, GreekLine } from '../lib/data';
import type { HitForms, HitGrammar, Reading, SearchResult } from '../lib/search';

const { book } = vi.hoisted(() => {
  const line = (n: number, text: string): GreekLine => ({
    n, text, tokens: text.split(' ').map((t, i) => ({ t, o: i * 2, k: t })),
  });
  // 70a: three spellings of ἀρετή; 70b: the formula three ways.
  const book = (n: number): BookData => ({
    book: n,
    segments: [
      { id: `${n}:70a`, column: '70a', greek: [line(1, 'ἀρετή ἀρετῇ ἀρετὴ')], english: { text: 'One two three', notes: [], markers: [] } },
      { id: `${n}:70b`, column: '70b', greek: [line(1, 'τὸ τί ἦν εἶναι τοῦ τί ἦν εἶναι τῷ τί ἦν εἶναι')], english: { text: 'four five', notes: [], markers: [] } },
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
  return { ...actual, fetchBook: vi.fn(async (_w: string, n: number) => book(n)), fetchChapters: vi.fn(async () => ({ '1': sections })) };
});

afterEach(async () => {
  // A lookup a search never made (a proximity search's forms) leaves its
  // answer queued: drop it, or the next test reads it.
  const { search, searchCombo, greekHitForms, greekHitGrammar } = await import('../lib/search');
  for (const f of [search, searchCombo, greekHitForms, greekHitGrammar]) vi.mocked(f).mockReset();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

const at = (column: string, grkPositions: number[], over: Partial<SearchResult> = {}): SearchResult => ({
  work: 'EN', meta: { id: `1:${column}`, book: 1, column }, grkMatch: true, engMatch: false, grkPositions, ...over,
});
const ARETH = [at('70a', [0, 1, 2])];
const FORMS: HitForms = { byResult: new Map([['EN:1:70a', ['areth', 'areth', 'areth']]]), headwords: new Map([['areth', ['areth']]]), failedWorks: [] };
// ἀρετῇ is the noun's dative and two verb forms of ἀρετάω.
const NOM_SG: Reading = { case: ['nom', 'voc'], gender: ['fem'], number: ['sg'], lemma: ['areth'] };
const DAT_SG: Reading = { case: ['dat'], gender: ['fem'], number: ['sg'], lemma: ['areth'] };
const V_IND: Reading = { mood: ['ind'], number: ['sg'], person: ['2nd'], tense: ['pres'], voice: ['act'], lemma: ['aretaw'] };
const V_SUBJ: Reading = { mood: ['subj'], number: ['sg'], person: ['2nd'], tense: ['pres'], voice: ['act'], lemma: ['aretaw'] };
const old = (r: Reading): Reading => { const { lemma: _, ...rest } = r; return rest; };
const grammarOf = (map: (r: Reading) => Reading): HitGrammar => ({
  byResult: new Map([['EN:1:70a', [[NOM_SG].map(map), [DAT_SG, V_IND, V_SUBJ].map(map), [NOM_SG].map(map)]]]), failedWorks: [],
});

async function open(url: string, { results = ARETH, forms = FORMS, grammar = grammarOf(r => r), combo = false } = {}) {
  const { search, searchCombo, greekHitForms, greekHitGrammar } = await import('../lib/search');
  vi.mocked(combo ? searchCombo : search).mockResolvedValueOnce({ results, failedWorks: [] });
  vi.mocked(greekHitForms).mockResolvedValueOnce(forms);
  vi.mocked(greekHitGrammar).mockResolvedValueOnce(grammar);
  window.history.replaceState(null, '', url);
  const page = render(Search);
  await screen.findByRole('group', { name: 'Group by' });
  await vi.waitFor(() => expect(page.container.querySelectorAll('.group-head').length).toBeGreaterThan(0));
  return page;
}
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const heads = (c: HTMLElement) => [...c.querySelectorAll('.group-head')].map(h =>
  [...h.querySelectorAll('span:not(.caret)')].map(text).filter(Boolean).join(' '));
const menu = () => within(screen.getByRole('group', { name: 'Group by' })).getAllByRole('radio')
  .map(r => `${text(r.closest('label'))}${(r as HTMLInputElement).checked ? ' ✓' : ''}`);
const facetHeads = () => [...screen.getByRole('group', { name: 'Narrow by grammar' }).querySelectorAll('.gx-head')].map(text);
const g = (q: string) => `/search?g=${encodeURIComponent(q)}`;

describe('the groupings each search is offered', () => {
  const cases: [string, string, string[], boolean?][] = [
    ['one word, any form', g('ἀρετή'), ['By work ✓', 'By form']],
    ['one word, only as typed', `${g('ἀρετή')}&m=form`, ['By work ✓', 'By form']],
    ['an exact phrase', `${g('τὸ τί ἦν εἶναι')}&gm=phrase&m=form`, ['By work ✓', 'By form']],
    ['a dictionary word', '/search?l=areth', ['By work ✓', 'By grammar']],
    ['two dictionary words', '/search?l=areth,ecis', ['By work ✓', 'By grammar']],
    ['several words, Match "all"', g('ἀρετή ἕξις'), ['By work ✓']],
    ['several words, Match "any"', `${g('ἀρετή ἕξις')}&gm=any`, ['By work ✓']],
    ['a proximity search', '/search?c=l:areth&c=l:ecis', ['By work ✓'], true],
  ];
  for (const [name, url, want, combo] of cases) {
    it(`${name}: ${want.join(', ')}`, async () => {
      await open(url, { combo });
      expect(menu()).toEqual(want);
      // The phone's View sheet offers the same.
      await fireEvent.click(screen.getByRole('button', { name: /^View/ }));
      const sheet = await screen.findByRole('dialog', { name: 'View' });
      expect([...sheet.querySelector('fieldset')!.querySelectorAll('label')].map(text)).toEqual(want.map(w => w.replace(' ✓', '')));
    });
  }

  it('an address asking for a grouping not offered falls back to By work, and says so', async () => {
    const { container } = await open(`${g('ἀρετή ἕξις')}&v=form&ctx=1`);
    expect(menu()).toEqual(['By work ✓']);
    expect(container.querySelector('.work-name')).not.toBeNull();
    await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get('v')).toBeNull());
    expect(new URLSearchParams(window.location.search).get('ctx')).toBe('1');
  });

  it('so does By grammar asked of one word typed', async () => {
    await open(`${g('ἀρετή')}&v=grammar`);
    expect(menu()).toEqual(['By work ✓', 'By form']);
    await vi.waitFor(() => expect(window.location.search).not.toContain('v='));
  });
});

describe('By form, keyed as ruled', () => {
  it('a phrase groups on all its words: τὸ, τοῦ and τῷ τί ἦν εἶναι apart, never a grave shown', async () => {
    const results = [at('70b', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], { windows: [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]] })];
    const { container } = await open(`${g('τὸ τί ἦν εἶναι')}&gm=phrase&m=form&v=form`, { results });
    await vi.waitFor(() => expect(heads(container)).toEqual([
      'τό τί ἦν εἶναι 1 instance', 'τοῦ τί ἦν εἶναι 1 instance', 'τῷ τί ἦν εἶναι 1 instance',
    ]));
  });

  it('one word: the dative stands apart from the nominative, which is headed by its commonest spelling', async () => {
    const { container } = await open(`${g('ἀρετή')}&v=form`);
    await vi.waitFor(() => expect(heads(container)).toEqual(['ἀρετή 2 instances', 'ἀρετῇ 1 instance']));
  });
});

describe('By grammar: the headword over its paradigm', () => {
  it('new data: the verb’s parses are gone from the rows and the facets', async () => {
    const { container } = await open('/search?l=areth&v=grammar');
    await vi.waitFor(() => expect(heads(container)).toEqual([
      'αρετη 3 instances', 'Nominative or vocative singular ἀρετή 2 instances', 'Dative singular ἀρετῇ 1 instance',
    ]));
    await vi.waitFor(() => expect(facetHeads()).toEqual(['Case', 'Number', 'Gender']));
    // The note under a hit counts the noun's readings alone: ἀρετῇ is not
    // "one of 3 readings" under Case dat.
    await fireEvent.click(within(screen.getByRole('group', { name: 'Narrow by grammar' })).getByRole('checkbox', { name: 'Case dat' }));
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 instance'));
    expect(container.querySelector('.inst-oneof')).toBeNull();
  });

  it('a pick in the address in Beta Code with its marks reads the same rows, its label accented (Codex R14)', async () => {
    const { container } = await open('/search?l=' + encodeURIComponent('a)reth/') + '&v=grammar');
    await vi.waitFor(() => expect(heads(container)).toEqual([
      'ἀρετή 3 instances', 'Nominative or vocative singular ἀρετή 2 instances', 'Dative singular ἀρετῇ 1 instance',
    ]));
  });

  it('prints every row of the paradigm open, its hits with it (Codex R14)', async () => {
    const { container } = await open('/search?l=areth&v=grammar');
    await vi.waitFor(() => expect(heads(container)).toHaveLength(3));
    const shown = container.querySelectorAll('li.instance').length;
    expect(shown).toBeGreaterThan(0);
    window.dispatchEvent(new Event('beforeprint'));
    await new Promise(r => setTimeout(r, 0));
    expect(container.querySelectorAll('li.instance').length).toBe(shown);
    window.dispatchEvent(new Event('afterprint'));
  });

  it('old data: every reading of a spelling, as before', async () => {
    const { container } = await open('/search?l=areth&v=grammar', { grammar: grammarOf(old) });
    await vi.waitFor(() => expect(heads(container)).toEqual([
      'αρετη 3 instances',
      'Nominative or vocative singular ἀρετή 2 instances',
      'Dative singular or present active indicative, second singular or present active subjunctive, second singular ἀρετῇ 1 instance',
    ]));
    await vi.waitFor(() => expect(facetHeads()).toEqual(['Case', 'Number', 'Gender', 'Tense', 'Mood', 'Voice', 'Person']));
    await fireEvent.click(within(screen.getByRole('group', { name: 'Narrow by grammar' })).getByRole('checkbox', { name: 'Case dat' }));
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 instance'));
    expect(text(container.querySelector('.inst-oneof'))).toBe('one of 3 readings');
  });

  it('one word typed, any form: the facets offer its headwords’ readings alone', async () => {
    await open(`${g('ἀρετή')}&gf=case.dat`);
    await vi.waitFor(() => expect(facetHeads()).toEqual(['Case', 'Number', 'Gender']));
  });

  it('one word typed as spelled names no headword: every reading is offered', async () => {
    await open(`${g('ἀρετή')}&m=form&gf=case.dat`, { forms: { ...FORMS, headwords: new Map() } });
    await vi.waitFor(() => expect(facetHeads()).toEqual(['Case', 'Number', 'Gender', 'Tense', 'Mood', 'Voice', 'Person']));
  });
});
