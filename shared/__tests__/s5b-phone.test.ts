// S5b, the phone's results (HANDOFF-SEARCH-BUILD §5.7, §5.9; round 34
// r34-11 to r34-13, p03, p04, q07 to q12, s01, s02): the results bar, the
// Filter and View sheets, the word sheet, and sideways; and three findings of
// Codex's review of S4b (the word's focus on a phone, 44px targets at every
// width, one breakpoint with no gap).
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, GreekLine } from '../lib/data';
import type { SearchResult } from '../lib/search';

const { book } = vi.hoisted(() => {
  const line = (n: number, text: string): GreekLine => ({
    n, text, tokens: text.split(' ').map((t, i) => ({ t, o: i * 2, k: t })),
  });
  const book = (n: number): BookData => ({
    book: n,
    segments: [
      { id: `${n}:70a`, column: '70a', greek: [line(1, 'ἀρετὴ λόγος ἐστι')], english: { text: 'One two three', notes: [], markers: [] } },
    ],
  });
  return { book };
});

vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return {
    ...actual,
    search: vi.fn(async () => ({ results: [], failedWorks: [] })),
    searchCombo: vi.fn(async () => ({ results: [], failedWorks: [] })),
    greekHitForms: vi.fn(async () => ({ byResult: new Map(), headwords: new Map(), failedWorks: [] })),
    greekHitGrammar: vi.fn(async () => ({ byResult: new Map(), failedWorks: [] })),
    speakerRoster: vi.fn(async () => []),
  };
});
const SHARDS = vi.hoisted((): Record<string, Record<string, { n: number; c: { h: string; k: string; s?: string }[] }>> => ({
  a: { areth: { n: 967, c: [{ h: 'ἀρετή', k: 'a)reth/', s: 'arete' }] } },
  e: { ecis: { n: 547, c: [{ h: 'ἕξις', k: 'e(/cis', s: 'hexis' }] } },
}));
vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  const sections = [{ column: '70a', chapter: '70', line: '1' }];
  return {
    ...actual,
    fetchBook: vi.fn(async (_work: string, n: number) => book(n)),
    fetchChapters: vi.fn(async () => ({ '1': sections })),
    fetchLemmaPickerShard: vi.fn(async (letter: string) => SHARDS[letter] ?? {}),
    fetchLemmaGlosses: vi.fn(async () => []),
    fetchLemmata: vi.fn(async () => ({ 'a)reth/': { slug: 'arete', head: 'ἀρετή', count: 678 } })),
    fetchLsjHeads: vi.fn(async () => ({})),
    lookupWord: vi.fn(async () => ({ analyses: [{ lemma: 'a)reth/', gloss: 'goodness, excellence', parse: 'fem nom/voc sg', lsj: ['a)reth/'] }], lsj: [] })),
  };
});

const RESULTS: SearchResult[] = [
  { work: 'EN', meta: { id: '1:70a', book: 1, column: '70a' }, grkMatch: true, engMatch: false, grkPositions: [0] },
  { work: 'Int', meta: { id: '1:70a', book: 1, column: '70a' }, grkMatch: true, engMatch: false, grkPositions: [0] },
];
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

// A phone: the desktop's query does not match, nor does any other.
function phone() {
  return vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => ({
    matches: false, media, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
}
async function open(url = `/search?g=${encodeURIComponent('ἀρετή')}`) {
  const { search } = await import('../lib/search');
  vi.mocked(search).mockResolvedValueOnce({ results: RESULTS, failedWorks: [] });
  window.history.replaceState(null, '', url);
  const page = render(Search);
  await vi.waitFor(() => expect(page.container.querySelectorAll('li.instance button.gw').length).toBeGreaterThan(0));
  return page;
}
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

// Finding 1 of Codex's review of S4b.
describe('the word card on a phone gives the focus back to its own word', () => {
  for (const how of ['Escape', 'Close'] as const) {
    it(`after a second word is clicked, ${how} returns the focus to the second`, async () => {
      phone();
      const { container } = await open();
      const [first, second] = container.querySelectorAll<HTMLElement>('li.instance button.gw');
      first.focus();
      await fireEvent.click(first);
      const card = await screen.findByRole('dialog', { name: 'Word analysis' });
      second.focus();
      await fireEvent.click(second);
      expect(screen.getByRole('dialog', { name: 'Word analysis' })).toBe(card);
      if (how === 'Escape') await fireEvent.keyDown(window, { key: 'Escape' });
      else await fireEvent.click(within(card).getByRole('button', { name: 'Close' }));
      await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Word analysis' })).toBeNull());
      expect(document.activeElement).toBe(second);
    });
  }
});

// A screen of a given size, answering the media queries the page asks: width
// and height ranges, joined by "and", "not all and", and commas.
function sized(width: number, height = 844) {
  return vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => ({
    matches: mq(media, width, height), media, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
}
function mq(media: string, width: number, height: number): boolean {
  return media.split(',').some((q) => {
    let t = q.trim(), neg = false;
    if (t.startsWith('not all and ')) { neg = true; t = t.slice('not all and '.length); }
    const all = t.split(/\s+and\s+/).every((f) => {
      const m = /^\((min|max)-(width|height):\s*([\d.]+)px\)$/.exec(f.trim());
      if (m) { const v = m[2] === 'width' ? width : height; return m[1] === 'min' ? v >= +m[3] : v <= +m[3]; }
      if (f.trim() === '(orientation: landscape)') return width > height;
      if (f.trim() === '(pointer: coarse)' || f.trim() === '(forced-colors: active)' || f.trim() === '(prefers-reduced-motion: reduce)') return false;
      throw new Error(`no reading for ${f}`);
    });
    return neg ? !all : all;
  });
}

// Finding 3: the narrow and wide rules meet with no width between them.
describe('one breakpoint, every width on one side of it', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const B = readFileSync(resolve(here, '../styles/b-search.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
  const queries = [...new Set([...B.matchAll(/@media ([^{]+)\{/g)].map((m) => m[1].trim()).filter((q) => /96\d/.test(q)))];
  const WIDTHS = [320, 390, 599, 600, 844, 959, 960, 960.5, 960.98, 961, 1100, 1152];

  it('in b-search.css: the desktop rules and the narrow rules are one query and its opposite', () => {
    const desk = queries.filter((q) => /^\(min-width: 961px\)/.test(q));
    const narrow = queries.filter((q) => !desk.includes(q));
    expect(desk).toContain('(min-width: 961px)');
    expect(narrow.length).toBeGreaterThan(0);
    for (const w of WIDTHS) {
      const d = mq('(min-width: 961px)', w, 844);
      for (const q of narrow) expect([w, q, mq(q, w, 844)]).toEqual([w, q, !d]);
    }
  });

  it('in the page: at 960.5px the open editor is a narrow screen\'s', async () => {
    sized(960.5);
    window.history.replaceState(null, '', '/search?c=l:areth&c=l:ecis&cw=10');
    render(Search);
    await vi.waitFor(() => expect(document.querySelector('.prox-sum')).not.toBeNull());
    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(text(document.querySelector('.prox-sum'))).toBe('within 10 words: ἕξις near ἀρετή');
  });
});

// Finding 2: every target 44px or more, at every width (a touch screen may be
// wider than 960px). Each height under 44px set in b-search.css is a part of
// a target (an icon, a tick box inside its label, a switch's track) and is
// named here as one, or it fails.
describe('no target under 44px, at any width', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const B = readFileSync(resolve(here, '../styles/b-search.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  const PARTS = new Set([
    '.search-page .sq-glass', // the field's magnifier, drawn
    '.search-page .opt-switch .sw', '.search-page .opt-switch .sw::after', // a switch's track and knob; the switch is the target
    '.search-page :is(.search-form, .sx-display) .opt-panel .ck input', // a radio inside its 44px label
    '.search-page .gk-mm', // a mark drawn over its key
    '.search-page .work-chip::before', '.search-page .work-chip.on::after', // a work's tick, drawn
    '.search-page .advanced-trigger .prox-dot', // the dot on Proximity
    '.search-page .prox-lock input', '.search-page .prox-lock input:checked::after', // a tick box inside its label
    '.search-page .pager-arrow', '.search-page .group-head .caret::after', // chevrons inside their buttons
    '.search-page span.tr-name', // one translator's name: text, not a button
    '.search-page .cite-group .sx-book', // a book's name over its citations
    '.search-page .sx-badge', '.search-page .sx-dot', // marks on the Filter and View buttons
    '.search-page .sx-forms .fx input', '.search-page .gx-chip input', // tick boxes inside their 44px labels
    '.search-page .sx-row .i-x', // the × drawn inside the chosen work's bar
    '.search-page .sq-tool [lang="grc"]', // the β drawn over its label
    '.search-page .sx-ico', // an icon over its label
    '.search-page .rc-p', // the page, said to a screen reader and not drawn
    '.search-page .sx-panel.open .sx-row .i::before', // a work's ring inside its 44px row
    '.search-page .sx-panel.open .sx-forms .fx input', '.search-page .sx-seg .ck input', // tick boxes and radios inside 44px labels
  ]);
  // Known and not this stage's (the desktop proximity editor, round 34 d06,
  // and the field's clear button): reported as follow-ups.
  const LATER = new Set([
    '.search-page .query-input::-webkit-search-cancel-button',
    '.search-page .prox-head .prox-sel', '.search-page .prox-win', '.search-page .prox-chip',
  ]);
  it('holds for every rule', () => {
    const low: string[] = [];
    for (const m of B.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim();
      for (const h of m[2].matchAll(/(?:^|[;\s])((?:min-)?height):\s*([\d.]+)(px|rem)/g)) {
        const px = Number(h[2]) * (h[3] === 'rem' ? 16 : 1);
        if (px < 44 && !PARTS.has(sel) && !LATER.has(sel)) low.push(`${sel} ${h[1]} ${px}px`);
      }
    }
    expect(low).toEqual([]);
  });
});

// Sideways (s01, r34-13): Greek · English · Both is a menu on the field's row.
describe('the language menu, sideways', () => {
  it('is drawn only on a screen narrow and short, and switches the language', async () => {
    sized(844, 390);
    render(Search);
    const menu = document.querySelector<HTMLDetailsElement>('details.lang-menu')!;
    expect(menu).not.toBeNull();
    expect(text(menu.querySelector('summary'))).toBe('Greek search');
    const panel = menu.querySelector('fieldset.opt-panel.sheet')!;
    expect(text(panel.querySelector('legend.sheet-head'))).toBe('Search in');
    expect(panel.querySelector('.sheet-foot .sheet-done')).toHaveTextContent('Done');
    menu.open = true;
    await fireEvent.click(within(menu).getByRole('radio', { name: 'English' }));
    expect(within(document.querySelector<HTMLElement>('.lang-switch')!).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(text(menu.querySelector('summary'))).toBe('English search');
    expect(menu.open).toBe(false);
  });

  it('is not drawn upright, nor on a desktop', async () => {
    sized(390, 844);
    const a = render(Search);
    expect(document.querySelector('details.lang-menu')).toBeNull();
    a.unmount();
    sized(1152, 400);
    render(Search);
    expect(document.querySelector('details.lang-menu')).toBeNull();
  });
});

// §5.9: a sheet's rows end where its foot band begins.
describe('the foot band and the sheet above it', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const B = readFileSync(resolve(here, '../styles/b-search.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  const rule = (sel: string) => [...B.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].trim() === sel).map((m) => m[2]).join(';');
  it('measures the band as it is drawn: 12px, the 48px button, 12px, and its 1px rule', () => {
    expect(rule('.search-page')).toMatch(/--sheet-foot:\s*calc\(73px \+ env\(safe-area-inset-bottom\)\)/);
    const foot = rule('.search-page .sheet-foot');
    expect(foot).toMatch(/box-sizing:\s*border-box/);
    expect(foot).toMatch(/padding:\s*12px 18px calc\(12px \+ env\(safe-area-inset-bottom\)\)/);
    expect(foot).toMatch(/border-top:\s*1px solid/);
    expect(rule('.search-page .sheet-done')).toMatch(/height:\s*48px/);
    expect(rule('.search-page .sx-panel .sheet-foot .sheet-done')).toMatch(/height:\s*48px/);
  });
});

// What S5b draws sets no type under 14px and no control under 44px (the
// vision-impaired reader on a phone held sideways).
describe('the type and targets S5b draws', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const B = readFileSync(resolve(here, '../styles/b-search.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  const from = B.indexOf('.search-page .sx-layout { margin-top: 18px; }');
  const to = B.indexOf('@media (min-width: 961px) and (max-width: 1100px)');
  const s5b = B.slice(from, to);
  it('reads the block it means to', () => {
    expect(from).toBeGreaterThan(0);
    expect(s5b).toContain('.search-page .lang-menu');
    expect(s5b.length).toBeGreaterThan(5000);
  });
  it('sets every size at 14px or more', () => {
    const sizes = [...s5b.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(20);
    expect(sizes.filter((n) => n < 14)).toEqual([]);
  });
});
