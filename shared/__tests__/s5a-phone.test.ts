// S5a, the phone search form (HANDOFF-SEARCH-BUILD §5.7, §5.9; round 34
// r34-10, p01, p02, p05, p06, q01-q05, q13, n05): Options folded under one
// link, the line that says what they are set to, the form's menus as sheets
// with a Done band, the open editor's sentence led by its distance, and the
// phone rules in b-search.css.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData } from '../lib/data';
import { proximitySentence, type SentenceTerm } from '../lib/proximity-sentence';

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

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

// A screen 960px wide or less: every query that names a max-width of 960px
// matches, as a phone's does.
function phone() {
  return vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => ({
    matches: /max-width:\s*960px/.test(media) || /max-width:\s*680px/.test(media),
    media, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }) as unknown as MediaQueryList);
}

const opts = () => screen.getByRole('button', { name: /^Options/ });
const prox = () => screen.getByRole('button', { name: /^Proximity/ });
const line = () => document.querySelector('.sopt-sum')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const sentence = () => document.querySelector('.prox-sum')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const menu = (name: RegExp) => [...document.querySelectorAll<HTMLDetailsElement>('.search-form details.opt')]
  .find((d) => name.test(d.querySelector('summary')!.textContent!.trim()))!;

describe('the sentence of a proximity search', () => {
  const T = (picked: string, relation: SentenceTerm['relation'] = 'near', target?: number): SentenceTerm =>
    ({ kind: 'lemma', text: '', picked: [picked], grammar: {}, relation, target });
  const heads = (k: string) => k;
  const terms = [T('ἀρετή'), T('ἕξις'), T('ἡδονή', 'before', 0)];
  const o = { window: 10, unit: 'words' as const, ordered: false };

  it('leads with the distance when asked, as the open editor on a phone reads it', () => {
    expect(proximitySentence(terms, o, heads, null)).toBe('ἕξις near ἀρετή, ἡδονή before ἀρετή, within 10 words');
    expect(proximitySentence(terms, o, heads, null, true)).toBe('within 10 words: ἕξις near ἀρετή, ἡδονή before ἀρετή');
    expect(proximitySentence(terms, { ...o, unit: 'line' }, heads, 'authentic works', true))
      .toBe('in the same line: ἕξις near ἀρετή, ἡδονή before ἀρετή, in authentic works');
    expect(proximitySentence(terms.slice(0, 2), { ...o, ordered: true }, heads, null, true))
      .toBe('within 10 words: ἕξις near ἀρετή, in this order');
  });

  it('has no distance to lead with for one term', () => {
    expect(proximitySentence([T('ἀρετή')], o, heads, null, true)).toBe('ἀρετή');
  });
});

describe('Options, folded', () => {
  it('opens and shuts the options, and says what they are set to while shut', async () => {
    render(Search);
    expect(opts()).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('.sopt')).not.toHaveClass('opts-open');
    expect(line()).toBe('all words · any form · accents ignored · in all works');
    await fireEvent.click(opts());
    expect(opts()).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.sopt')).toHaveClass('opts-open');
    expect(line()).toBeNull();
    // A changed option reads in the line once they are shut.
    await fireEvent.click(screen.getByRole('button', { name: 'Accents' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Lemma' }));
    await fireEvent.click(opts());
    expect(line()).toBe('all words · any form · accents observed · by lemma · in all works');
  });

  it('shuts a menu left open when the options are folded', async () => {
    render(Search);
    await fireEvent.click(opts());
    const m = menu(/^Match/);
    m.open = true;
    await fireEvent.click(opts());
    expect(m.open).toBe(false);
  });

  it('is open with the proximity editor one at a time', async () => {
    render(Search);
    await fireEvent.click(opts());
    await fireEvent.click(prox());
    expect(prox()).toHaveAttribute('aria-expanded', 'true');
    expect(opts()).toHaveAttribute('aria-expanded', 'false');
    expect(line()).toBeNull();
    await fireEvent.click(opts());
    expect(opts()).toHaveAttribute('aria-expanded', 'true');
    expect(prox()).toHaveAttribute('aria-expanded', 'false');
  });

  it('says what English and Both search, each value once where the two agree', async () => {
    render(Search);
    await fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(line()).toBe('all words · any form · in all works');
    await fireEvent.click(screen.getByRole('button', { name: 'Both' }));
    expect(line()).toBe('all words · any form · accents ignored · both languages · in all works');
    await fireEvent.click(opts());
    await fireEvent.click(within(menu(/^English match/)).getByRole('radio', { name: 'Any word', hidden: true }));
    await fireEvent.click(opts());
    expect(line()).toBe('Greek all words · English any word · any form · accents ignored · both languages · in all works');
  });

  it('names the settings of the results that are not their defaults, in red', async () => {
    window.history.replaceState(null, '', `/search?g=${encodeURIComponent('ἀρετή')}&v=grammar&ps=c`);
    render(Search);
    await vi.waitFor(() => expect(document.querySelectorAll('.sopt-sum-v')).toHaveLength(2));
    expect([...document.querySelectorAll('.sopt-sum-v')].map((x) => x.textContent)).toEqual(['grouped by grammar', 'citations only']);
    expect(line()).toBe('all words · any form · accents ignored · in all works · grouped by grammar · citations only');
  });

  it('gives way to the sentence of a live proximity search', async () => {
    window.history.replaceState(null, '', '/search?c=l:areth&c=l:ecis&cw=10');
    render(Search);
    await vi.waitFor(() => expect(sentence()).not.toBeNull());
    expect(line()).toBeNull();
  });
});

describe('the form\'s menus as sheets', () => {
  it('gives each a head and a Done band that shuts it, focus back on its button', async () => {
    render(Search);
    const sheets = [...document.querySelectorAll('.search-form fieldset.opt-panel')];
    expect(sheets.length).toBeGreaterThan(0);
    for (const s of sheets) {
      expect(s).toHaveClass('sheet');
      expect(s.querySelector(':scope > legend')).toHaveClass('sheet-head');
      expect(s.querySelector(':scope > .sheet-foot > button.sheet-done')).toHaveTextContent('Done');
    }
    await fireEvent.click(opts());
    const m = menu(/^Form/);
    await fireEvent.click(m.querySelector('summary')!);
    m.open = true;
    await fireEvent.click(m.querySelector('.sheet-done')!);
    expect(m.open).toBe(false);
    expect(document.activeElement).toBe(m.querySelector('summary'));
  });
});

describe('the proximity editor on a phone', () => {
  it('leads its sentence with the distance while it is open, and names each control over it', async () => {
    phone();
    window.history.replaceState(null, '', '/search?c=l:areth&c=l:ecis&c=lb:hdonh&cw=10');
    render(Search);
    await vi.waitFor(() => expect(sentence()).toBe('ἕξις near ἀρετή, ἡδονή before ἀρετή, within 10 words'));
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(sentence()).toBe('within 10 words: ἕξις near ἀρετή, ἡδονή before ἀρετή');
    const slots = [...document.querySelectorAll('#advanced-tools .combo-slot')];
    expect(slots).toHaveLength(3);
    const names = (s: Element) => [...s.querySelectorAll('.prox-ml')].map((x) => x.textContent);
    expect(names(slots[0])).toEqual(['Kind', 'Distance']);
    expect(names(slots[1])).toEqual(['Relation', 'Kind']);
    // Seen, not heard: each control has its own name already.
    for (const x of document.querySelectorAll('.prox-ml')) expect(x).toHaveAttribute('aria-hidden', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(sentence()).toBe('ἕξις near ἀρετή, ἡδονή before ἀρετή, within 10 words');
  });
});

// The rules, read from the stylesheet. Comments out, whitespace folded.
describe('the phone rules in b-search.css', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const B = readFileSync(resolve(here, '../styles/b-search.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  // Every block opened by `query`, joined; each block cut at its matching brace.
  function blocks(query: string): string {
    const out: string[] = [];
    for (let i = B.indexOf(query); i >= 0; i = B.indexOf(query, i + 1)) {
      let depth = 0, j = B.indexOf('{', i);
      const from = j;
      for (; j < B.length; j++) { if (B[j] === '{') depth++; else if (B[j] === '}' && --depth === 0) break; }
      out.push(B.slice(from + 1, j));
    }
    if (!out.length) throw new Error(`no ${query}`);
    return out.join(' ');
  }
  const rule = (css: string, sel: string) => {
    const found = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].trim() === sel).map((m) => m[2]);
    if (!found.length) throw new Error(`no rule for ${sel}`);
    return found.join(';');
  };
  // S5b: the narrow rules are the desktop's query turned round, so no width
  // is neither (Codex's review of S4b, finding 3).
  const narrow = blocks('@media not all and (min-width: 961px) {');
  const desk = blocks('@media (min-width: 961px) {');

  it('draws the phone-only parts on no wide screen', () => {
    expect(rule(desk, '.search-page :is(.opts-toggle, .sopt-sum, .prox-ml, .sheet-foot)')).toMatch(/display:\s*none/);
  });

  it('pins the editor\'s Search to the foot of the screen, and keeps its height free under the editor', () => {
    const bar = rule(narrow, '.search-page .prox-go');
    expect(bar).toMatch(/position:\s*fixed/);
    expect(bar).toMatch(/bottom:\s*0/);
    expect(bar).toMatch(/left:\s*0/);
    expect(bar).toMatch(/right:\s*0/);
    expect(rule(narrow, '.search-page .prox:has(.prox-go)')).toMatch(/padding-bottom:\s*76px/);
    expect(rule(narrow, '.search-page .prox-go .prox-search')).toMatch(/height:\s*48px/);
  });

  it('puts each tool\'s icon over a 14px label, and the form\'s menus at the foot of the screen', () => {
    expect(rule(narrow, '.search-page .sq-tool')).toMatch(/flex-direction:\s*column/);
    expect(rule(narrow, '.search-page .sq-tool-l')).toMatch(/font:\s*600 14px/);
    const sheet = rule(narrow, '.search-page :is(.sheet, .search-form .opt-panel.sheet)');
    expect(sheet).toMatch(/position:\s*fixed/);
    // S5b (§5.9): the sheet ends where its foot band begins, and the band is
    // fixed to the foot of the screen, so no row scrolls behind it.
    expect(sheet).toMatch(/bottom:\s*var\(--sheet-foot\)/);
    const foot = rule(narrow, '.search-page .sheet-foot');
    expect(foot).toMatch(/position:\s*fixed/);
    expect(foot).toMatch(/bottom:\s*0/);
    expect(foot).toMatch(/height:\s*var\(--sheet-foot\)/);
    expect(rule(narrow, '.search-page .sheet-done')).toMatch(/height:\s*48px/);
  });

  it('sets no type under 14px and no control under 44px in what S5a draws', () => {
    const s5a = B.slice(B.indexOf('.search-page :is(.opts-toggle, .sopt-sum, .prox-ml, .sheet-foot)'), B.indexOf('.search-page .sx-try ul { grid-template-columns: 1fr; }'));
    expect(s5a.length).toBeGreaterThan(1000);
    const sizes = [...s5a.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(10);
    expect(sizes.filter((n) => n < 14)).toEqual([]);
    const heights = [...s5a.matchAll(/(?:^|[;{ ])(?:min-)?height:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(heights.filter((n) => n < 44 && n !== 16)).toEqual([]);
  });
});
