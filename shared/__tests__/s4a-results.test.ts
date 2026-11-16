// S4a, the results list (round 34): chapter name lines (ruling 17), the
// translator names under the English (ruling 18), passages that share lines
// drawn once, and Bekker line numbers in an opened section (§7.5).
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, FlowTurn, GreekLine, Segment } from '../lib/data';
import type { SearchResult } from '../lib/search';

// The book of paired-hit-search.test.ts (EN 70a–c, five turns, Rackham and a
// turn-aligned Ross), and 71a, ten lines long, for the line numbers.
//   T0  70a line 1          Rackham "One two three."        Ross "Uno dos."
//   T1  70a line 2 → 70b η  Rackham "Four five | six seven eight"   Ross "Cuatro cinco | seis"
//   T2  70b θ → 70c λ       two stacked speeches: "Nine ten." "Eleven | twelve thirteen"
//   T3  no Greek            "Residual words here"
//   T4  70c μ               "Last."
//   T5  71a, lines 1–10     "Plain words"
const { fixture } = vi.hoisted(() => {
  const line = (n: number, text: string): GreekLine => ({
    n, text, tokens: text.split(' ').map((t, i) => ({ t, o: i * 2, k: t })),
  });
  const seg = (column: string, english: string, ...greek: GreekLine[]): Segment => ({
    id: `1:${column}`, column, greek, english: { text: english, notes: [], markers: [] },
  });
  const turn = (t: Partial<FlowTurn>): FlowTurn => ({ s: null, d: null, g: null, e: null, p: false, ...t });
  const fixture: BookData = {
    book: 1,
    segments: [
      seg('70a', 'One two three. Four five', line(1, 'α β γ'), line(2, 'δ ε')),
      seg('70b', 'six seven eight Nine ten. Eleven', line(1, 'ζ η θ'), line(2, 'ι κ')),
      seg('70c', 'twelve thirteen Residual words here Last.', line(1, 'λ μ')),
      seg('71a', 'Plain words', ...Array.from({ length: 10 }, (_, i) => line(i + 1, `ο${i + 1} π${i + 1}`))),
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
        turn({ s: 'Socrates', g: { c: '71a', n: 1, o: 0 }, e: 'Plain words', p: true }),
      ],
    },
  };
  return { fixture };
});

vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return {
    ...actual,
    search: vi.fn(async () => ({ results: [], failedWorks: [] })),
    searchCombo: vi.fn(async () => ({ results: [], failedWorks: [] })),
    searchPhraseVariants: vi.fn(),
    speakerRoster: vi.fn(async () => []),
  };
});
vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchBook: vi.fn(async () => fixture),
    fetchChapters: vi.fn(async () => ({
      '1': [
        { column: '70a', chapter: '7', line: '1' }, { column: '70b', chapter: '7', line: '1' },
        { column: '70c', chapter: '7', line: '1' }, { column: '71a', chapter: '8', line: '1' },
      ],
    })),
  };
});
// The aligned alternate in this synthetic book uses the overlay slot.
vi.mock('../lib/works', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/works')>();
  return { ...actual, searchableTranslations: (work: import('../lib/works').Work) =>
    actual.searchableTranslations(work).map(t => t.id === 'ross' ? { ...t, slot: 'overlay' as const } : t) };
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

const at = (column: string, r: Partial<SearchResult>): SearchResult => ({
  work: 'EN', meta: { id: `1:${column}`, book: 1, column },
  grkMatch: false, engMatch: false, grkPositions: [], ...r,
});
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const marks = (el: Element) => [...el.querySelectorAll('mark')].map(m => m.textContent);

async function draw(url: string, results: SearchResult[], total: number | string, props: Record<string, unknown> = {}) {
  const { search } = await import('../lib/search');
  vi.mocked(search).mockResolvedValueOnce({ results, failedWorks: [] });
  window.history.replaceState(null, '', url);
  const { container } = render(Search, { props });
  await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(typeof total === 'number' ? `${total} hit` : total));
  await vi.waitFor(() => expect(container.querySelector('li.instance')).not.toBeNull());
  return { container, list: () => [...container.querySelectorAll('li.instance')] };
}
const G = (q: string) => `/search?g=${encodeURIComponent(q)}`;

describe('Search.svelte S4a: a chapter name line over its hits (ruling 17)', () => {
  it('names each chapter, with its title where the corpus has one', async () => {
    const chapterTitles = { EN: { '1': { '7': 'The good for man' } } };
    const { container } = await draw(G('α'), [at('70a', { grkMatch: true, grkPositions: [0] }), at('71a', { grkMatch: true, grkPositions: [0] })], 2, { chapterTitles });
    const lines = [...container.querySelectorAll('h3.sx-chap')];
    expect(lines.map(l => text(l.querySelector('.sx-chap-n')))).toEqual(['Chapter 7', 'Chapter 8']);
    expect(text(lines[0].querySelector('.sx-chap-t'))).toBe('The good for man');
    // Chapter 8 has no title: the number alone.
    expect(lines[1].querySelector('.sx-chap-t')).toBeNull();
    // Each line stands over its own hits.
    expect(lines[0].closest('.run-heading')!.nextElementSibling!.querySelector('.inst-ref')).toHaveTextContent('70a');
    expect(lines[1].closest('.run-heading')!.nextElementSibling!.querySelector('.inst-ref')).toHaveTextContent('71a');
  });
});

describe('Search.svelte S4a: the translations under the English (ruling 18)', () => {
  // Rackham's "four" and Ross's "cuatro" in 70a, turn 1; Ross's "seis", in
  // the same turn but in 70b, its own passage.
  const results = [at('70a', {
    engMatch: true,
    engHits: [{ translation: 'rackham', positions: [3] }, { translation: 'ross', positions: [2, 4] }],
  })];
  const url = '/search?e=four+cuatro+seis&em=any';
  // EN answers in two translations, so an English-only search shows chapters
  // and no hit total (John, 15-16 Nov); each translator's count is in the
  // names under the English.
  const BAR = '1 chapter';

  it('shows one English, the names of those with hits under it, the commonest first', async () => {
    const { list } = await draw(url, results, BAR);
    expect(screen.getByRole('status')).not.toHaveTextContent('hit');
    expect(list()).toHaveLength(2);
    const [li, seis] = list();
    // Ross has two hits on the page to Rackham's one, so leads, and is shown.
    const names = [...li.querySelectorAll<HTMLButtonElement>('.tr-names button.tr-name')];
    expect(names.map(text)).toEqual(['Ross', 'Rackham']);
    expect(names.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(li.querySelector('.tr-names')).toHaveAttribute('role', 'group');
    expect(li.querySelectorAll('.tr-names .tr-dot')).toHaveLength(1);
    expect(li.querySelectorAll('.inst-rows')).toHaveLength(1);
    expect(marks(li.querySelector('.inst-rows')!)).toEqual(['Cuatro']);
    // The names follow the English they name.
    expect(li.querySelector('.inst-rows .tr-names')!.previousElementSibling).toHaveClass('inst-snippet');
    // One translation with hits: its name alone, not a switch.
    expect(text(seis.querySelector('.tr-names'))).toBe('Ross');
    expect(seis.querySelector('.tr-names button')).toBeNull();
  });

  it('a name, clicked, shows its English with its hits marked, in that instance only', async () => {
    const { list } = await draw(url, results, BAR);
    const [li, seis] = list();
    await fireEvent.click(screen.getByRole('button', { name: 'Rackham' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Rackham' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: 'Ross' })).toHaveAttribute('aria-pressed', 'false');
    expect(marks(li.querySelector('.inst-rows')!)).toEqual(['Four']);
    expect(text(li.querySelector('.inst-rows .inst-snippet'))).toContain('Four five');
    // The Greek stays, once; the next passage keeps Ross.
    expect(li.querySelectorAll('.inst-pair[lang="grc"]')).toHaveLength(1);
    expect(marks(seis.querySelector('.inst-rows')!)).toEqual(['seis']);
  });

  it('marks words, never the space after them', async () => {
    const { container } = await draw(url, results, BAR);
    const all = [...container.querySelectorAll('mark')].map(m => m.textContent!);
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) expect(m).toBe(m.trim());
  });
});

describe('Search.svelte S4a: hits that share their lines are one instance', () => {
  it('draws α and β once, both marked, cited to the hit first in the line', async () => {
    const { list, container } = await draw(G('α'), [at('70a', { grkMatch: true, grkPositions: [0, 1] })], 2);
    expect(list()).toHaveLength(1);
    expect(marks(list()[0].querySelector('.inst-snippet.greek')!)).toEqual(['α', 'β']);
    expect(text(list()[0].querySelector('.inst-ref'))).toBe('70a1');
    expect(list()[0].querySelector('.inst-ref')!.getAttribute('href')).toContain('hlt=70a:0,1');
    // The counts are per hit, as before.
    expect(text(container.querySelector('.group-count'))).toBe('2 hits');
  });
});

describe('Search.svelte S4a: an opened section numbers its lines (§7.5)', () => {
  it('prints every fifth Bekker line number, hidden from a screen reader', async () => {
    const { list } = await draw(`${G('ο1')}&ctx=s`, [at('71a', { grkMatch: true, grkPositions: [0] })], 1);
    const greek = list()[0].querySelector('.inst-snippet.greek')!;
    const numbers = [...greek.querySelectorAll('.ln')];
    expect(numbers.map(text)).toEqual(['5', '10']);
    for (const n of numbers) expect(n).toHaveAttribute('aria-hidden', 'true');
    // Each number heads its own line.
    expect(numbers[0].nextElementSibling).toHaveTextContent('ο5');
  });

  it('draws no number in a three-line passage', async () => {
    const { list } = await draw(G('ο5'), [at('71a', { grkMatch: true, grkPositions: [8] })], 1);
    expect(list()[0].querySelector('.ln')).toBeNull();
  });
});

describe('Search.svelte S4a: the menus over the hits', () => {
  it('give each choice its gloss, word for word (§5.2)', async () => {
    const { container } = await draw(G('α'), [at('70a', { grkMatch: true, grkPositions: [0] })], 1);
    const menus = [...container.querySelectorAll('.sx-display details.opt')];
    const read = menus.map(d => [text(d.querySelector('legend')), ...[...d.querySelectorAll('.opt-row')].map(r =>
      [text(r.querySelector('label')), text(r.querySelector('.opt-gloss'))].filter(Boolean).join(': '))]);
    expect(read).toEqual([
      // One word as spelled: By grammar is a dictionary word's (John, 13 Nov).
      ['Group by', 'By work', 'By form'],
      ['Sort', 'Bekker order', 'Works A–Z', 'Forms A–Z', 'Commonest form first'],
      ['Context', '1 line', '3 lines', 'Whole section', 'Citations only'],
      ['Per page', '20', '40', '100'],
    ]);
  });
});
