// Every search hit shows the Greek and the aligned English, whichever was
// searched (John, 2026-11-09). The units and lookups are tested in
// paired-hit.test.ts; this is what the results page draws from them.
import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import type { BookData, FlowTurn, GreekLine, Segment } from '../lib/data';
import type { SearchResult } from '../lib/search';

// The book of paired-hit.test.ts: three sections of EN, five turns.
//   T0  70a line 1          Rackham "One two three."        Ross "Uno dos."
//   T1  70a line 2 → 70b η  Rackham "Four five | six seven eight"   Ross "Cuatro cinco | seis"
//   T2  70b θ → 70c λ       two stacked speeches: "Nine ten." "Eleven | twelve thirteen"
//   T3  no Greek            "Residual words here"
//   T4  70c μ               "Last."
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
      '1': [{ column: '70a', chapter: '70', line: '1' }, { column: '70b', chapter: '70', line: '1' }, { column: '70c', chapter: '70', line: '1' }],
    })),
  };
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

const at = (column: string, r: Partial<SearchResult>): SearchResult => ({
  work: 'EN', meta: { id: `1:${column}`, book: 1, column },
  grkMatch: false, engMatch: false, grkPositions: [], ...r,
});

// Runs the search in `url` over `results` and hands back the instances drawn.
// The settle point is the count in the status line, then the book fetch; a
// case that draws nothing fails on its first lookup, not by passing early.
// `total` is the hits (Greek words only in a Greek or Both search), or the
// bar's text where an English-only search of EN, which has two translations,
// shows chapters and no hit total (John, 15-16 Nov).
async function instances(url: string, results: SearchResult[], total: number | string) {
  const { search } = await import('../lib/search');
  const { fetchBook } = await import('../lib/data');
  vi.mocked(search).mockResolvedValueOnce({ results, failedWorks: [] });
  window.history.replaceState(null, '', url);
  const { container } = render(Search);
  await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(typeof total === 'number' ? `${total} hit` : total));
  await vi.waitFor(() => expect(fetchBook).toHaveBeenCalled());
  await vi.waitFor(() => expect(container.querySelector('.chapter-group')).not.toBeNull());
  expect(container.querySelectorAll('button.group-head[aria-expanded="false"]')).toHaveLength(0);
  const list = [...container.querySelectorAll('li.instance')];
  expect(list.length).toBeGreaterThan(0);
  return { container, list };
}
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const marks = (el: Element) => [...el.querySelectorAll('mark')].map(m => m.textContent);

describe('Search.svelte: a Greek hit shows its English', () => {
  it("prints the turn's English, cut to the section, under the hit", async () => {
    // δ: Socrates' turn, which runs on into 70b.
    const { list } = await instances(`/search?g=${encodeURIComponent('δ')}`,
      [at('70a', { grkMatch: true, grkPositions: [3] })], 1);
    expect(list).toHaveLength(1);
    expect(marks(list[0])).toEqual(['δ']);
    const pair = list[0].querySelector('.inst-pair');
    expect(pair).not.toBeNull();
    expect(pair).toHaveAttribute('lang', 'en');
    // Not the whole section ("One two three. Four five"), nor the whole turn.
    expect(text(pair!.querySelector('.inst-pair-text'))).toBe('Four five');
    // Each available translation has a switch under the English.
    const label = pair!.querySelector('.tr-names')!;
    expect([...label.querySelectorAll('button')].map(text)).toEqual(['Rackham', 'Ross']);
    expect(label.querySelector('button[aria-pressed="true"]')).toHaveTextContent('Rackham');
    expect(label.previousElementSibling).toBe(pair!.querySelector('.inst-pair-text'));
    expect(pair!.querySelector('mark')).toBeNull();
  });

  it('prints the English once where two hits in a row share a unit', async () => {
    // α and β are one turn; δ is the next. α and β share a passage and a
    // turn: one instance, both marked (S4a). δ's passage overlaps theirs,
    // but its turn is another, and its English is its own.
    const { list } = await instances(`/search?g=${encodeURIComponent('α')}`,
      [at('70a', { grkMatch: true, grkPositions: [0, 1, 3] })], 3);
    expect(list).toHaveLength(2);
    expect(list.map(li => marks(li.querySelector('.inst-snippet.greek')!))).toEqual([['α', 'β'], ['δ']]);
    expect(list.map(li => text(li.querySelector('.inst-pair-text')))).toEqual(['One two three.', 'Four five']);
  });

  it('uses the translator chip in force, and the reference translation without one', async () => {
    // Greek α (turn 0); Rackham "four" and Ross "cuatro" (turn 1).
    const results = [at('70a', {
      grkMatch: true, engMatch: true, grkPositions: [0],
      engHits: [{ translation: 'rackham', positions: [3] }, { translation: 'ross', positions: [2] }],
    })];
    const url = `/search?g=${encodeURIComponent('α')}&e=four+cuatro&em=any`;
    // Both search: the hits are the Greek word alone, whatever the English adds.
    const plain = await instances(url, results, 1);
    expect(text(plain.list[0].querySelector('.inst-pair-text'))).toBe('One two three.');
    expect(plain.list[0].querySelector('.inst-pair button[aria-pressed="true"]')).toHaveTextContent('Rackham');
    // The English hit is one instance for the unit, one translation shown and
    // a switch for each translation with hits there, in the side column's order.
    expect(plain.list).toHaveLength(2);
    expect([...plain.list[1].querySelectorAll('.tr-names button')].map(text)).toEqual(['Rackham', 'Ross']);
    expect(text(plain.list[1].querySelector('.inst-pair'))).toBe('δ ε');
    plain.container.remove();

    const chip = await instances(`${url}&t=ross`, results, 1);
    const pair = chip.list[0].querySelector('.inst-pair')!;
    expect(text(pair.querySelector('.inst-pair-text'))).toBe('Uno dos.');
    expect(pair.querySelector('button[aria-pressed="true"]')).toHaveTextContent('Ross');
    // The reference opens the reader at the hit.
    expect(chip.list[0].querySelector('.inst-ref')!.getAttribute('href')).toContain('loc=70a');
  });
});

describe('Search.svelte: an English hit shows its Greek', () => {
  it("prints the Greek of the turn the word stands in, unmarked", async () => {
    // "nine": the first stacked speech of the row whose Greek is θ ι κ.
    const { list } = await instances('/search?e=nine',
      [at('70b', { engMatch: true, engHits: [{ translation: 'rackham', positions: [3] }] })], '1 chapter');
    expect(list).toHaveLength(1);
    expect(marks(list[0].querySelector('.inst-en')!)).toEqual(['Nine']);
    const pair = list[0].querySelector('.inst-pair');
    expect(pair).not.toBeNull();
    expect(pair).toHaveAttribute('lang', 'grc');
    // Not the section's first words (ζ η), which are another turn's.
    expect(text(pair)).toBe('θ ι κ');
    expect(pair!.querySelector('mark')).toBeNull();
  });

  it("gives each turn's match its own instance and Greek", async () => {
    // "eight" (turn 1) and "nine" (turn 2) are in one section.
    const { list, container } = await instances('/search?e=eight+nine&em=any',
      [at('70b', { engMatch: true, engHits: [{ translation: 'rackham', positions: [2, 3] }] })], '1 chapter');
    expect(list.map(li => text(li.querySelector('.inst-pair')))).toEqual(['ζ η', 'θ ι κ']);
    // Each passage stops at its turn: neither shows the other's word.
    expect(list.map(li => text(li.querySelector('.inst-en .inst-snippet')))).toEqual(['six seven eight', 'Nine ten. Eleven']);
    expect(list.map(marks)).toEqual([['eight'], ['Nine']]);
    // An English-only search of two translations draws no hit count on a heading.
    expect(container.querySelector('.group-count')).toBeNull();
  });

  it('cites a turn-aligned hit at the section its words fall in', async () => {
    // Ross's "seis" is filed under 70a, where the turn starts; it is in 70b.
    const { list } = await instances('/search?e=seis',
      [at('70a', { engMatch: true, engHits: [{ translation: 'ross', positions: [4] }] })], '1 chapter');
    expect(text(list[0].querySelector('.inst-ref'))).toBe('70b');
    expect(marks(list[0])).toEqual(['seis']);
    expect(text(list[0].querySelector('.inst-pair'))).toBe('ζ η');
    // The reference opens the reader in the translation shown, at its section.
    expect(list[0].querySelector('.inst-ref')!.getAttribute('href')).toContain('loc=70b');
    expect(list[0].querySelector('.inst-ref')!.getAttribute('href')).toContain('trans=ross');
  });
});

describe('Search.svelte: Greek and English hits in one unit', () => {
  // θ and Rackham's "nine" are the same turn in 70b; ζ is the turn before.
  const results = [at('70b', {
    grkMatch: true, engMatch: true, grkPositions: [0, 2],
    engHits: [{ translation: 'rackham', positions: [3] }],
  })];
  const url = `/search?g=${encodeURIComponent('θ')}&e=nine`;

  it('become one instance, each side with its marks', async () => {
    // The hits are the two Greek words; "nine" adds none (John, 15-16 Nov).
    const { container, list } = await instances(url, results, 2);
    expect(container.querySelector('.rc-n')).toHaveTextContent(/^1$/);
    expect(container.querySelector('.rc-w')).toHaveTextContent(/^chapter$/);
    expect(container.querySelector('.rc-hits')).toHaveTextContent(/^2 hits$/);
    expect(list).toHaveLength(2);
    // ζ has no English partner: Greek, then its turn's English, unmarked.
    expect(marks(list[0])).toEqual(['ζ']);
    expect(text(list[0].querySelector('.inst-pair-text'))).toBe('six seven eight');
    // θ and "nine": one instance, no second row, no unmarked copy.
    expect(marks(list[1])).toEqual(['θ', 'Nine']);
    expect(list[1].querySelector('.inst-snippet.greek')).toHaveAttribute('lang', 'grc');
    expect(list[1].querySelector('.inst-en .tr-names')).toHaveTextContent(/^Rackham$/);
    expect(list[1].querySelector('.inst-pair')).toBeNull();
  });

  // A guard: the merge changes no count. Chapters (each work's book is one
  // here), and under "and/or" with Rackham chosen the Greek hits and
  // Rackham's (John, 17 Nov): the merged instance counts its two Greek words
  // and its one English word, as the two instances did apart.
  it('count what the two separate instances counted', async () => {
    // "Either language": under "both" the Int chapter, Greek only, would now
    // drop out (a Both "and" joins by chapter, John, 15 Nov).
    const crito = { ...at('70a', { grkMatch: true, grkPositions: [0] }), work: 'Int' };
    const { container } = await instances(`${url}&op=or&t=rackham`, [...results, crito], 4);
    expect(screen.getByRole('status')).toHaveTextContent('2 chapters · 4 hits');
    expect(container.querySelector('.rc-n')).toHaveTextContent(/^2$/);
    expect(container.querySelector('.rc-w')).toHaveTextContent(/^chapters$/);
    // Int sorts first; EN's page holds the pair's two Greek hits and "nine".
    expect([...container.querySelectorAll('.group-count')].map(text)).toEqual(['1 hit', '3 hits']);
    const works = screen.getByRole('group', { name: 'Show hits from one work or one translation' });
    // Each work its chapters, each translation its English hits (John, 16 Nov).
    expect(text(works)).toContain('Nicomachean Ethics1 chap. Rackham1');
    expect(text(works)).toContain('De Interpretatione1 chap.');
  });
});

// The aligned alternate in this synthetic book uses the overlay slot.
vi.mock('../lib/works', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/works')>();
  return { ...actual, searchableTranslations: (work: import('../lib/works').Work) =>
    actual.searchableTranslations(work).map(t => t.id === 'ross' ? { ...t, slot: 'overlay' as const } : t) };
});
