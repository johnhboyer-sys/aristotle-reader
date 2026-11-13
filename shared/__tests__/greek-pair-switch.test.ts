import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Search from '../components/Search.svelte';
import type { BookData, FlowTurn, GreekLine, Segment } from '../lib/data';
import type { SearchResult } from '../lib/search';

// Two aligned translations, with gaps in Ross.
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
  if (process.env.PAIR_TIMING) return actual;
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
  if (process.env.PAIR_TIMING) return actual;
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
  if (process.env.PAIR_TIMING) return actual;
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

async function draw(url: string, results: SearchResult[], total: number, props: Record<string, unknown> = {}) {
  const { search } = await import('../lib/search');
  vi.mocked(search).mockResolvedValueOnce({ results, failedWorks: [] });
  window.history.replaceState(null, '', url);
  const { container } = render(Search, { props });
  await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`${total} instance`));
  await vi.waitFor(() => expect(container.querySelector('li.instance')).not.toBeNull());
  return { container, list: () => [...container.querySelectorAll('li.instance')] };
}
const G = (q: string) => `/search?g=${encodeURIComponent(q)}`;

describe.skipIf(!!process.env.PAIR_TIMING)('Greek-only paired translations', () => {
  const hit = [at('70a', { grkMatch: true, grkPositions: [0] })];

  it('shows names in work order, defaults to the reference, and switches text', async () => {
    const { list } = await draw(G('α'), hit, 1);
    const pair = list()[0].querySelector('.inst-pair')!;
    const names = [...pair.querySelectorAll<HTMLButtonElement>('button.tr-name')];
    expect(names.map(text)).toEqual(['Rackham', 'Ross']);
    expect(names.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(pair.querySelector('.inst-pair-text')).toHaveTextContent('One two three.');
    await fireEvent.click(names[1]);
    expect(pair.querySelector('.inst-pair-text')).toHaveTextContent('Uno dos.');
    expect(names[1]).toHaveAttribute('aria-pressed', 'true');
    expect(names[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it('defaults to the narrowed translation', async () => {
    const { list } = await draw(`${G('α')}&e=plain&op=or&t=ross`, [...hit, at('71a', { engMatch: true, engHits: [{ translation: 'ross', positions: [0] }] })], 2);
    const pair = list()[0].querySelector('.inst-pair')!;
    expect(pair.querySelector('.inst-pair-text')).toHaveTextContent('Uno dos.');
    expect(pair.querySelector('button[aria-pressed="true"]')).toHaveTextContent('Ross');
  });

  it('shows a lone translation as plain text', async () => {
    const { list } = await draw(G('α'), [{ ...hit[0], work: 'Cat' }], 1);
    const pair = list()[0].querySelector('.inst-pair')!;
    expect(pair.querySelector('span.tr-name')).toHaveTextContent('Edghill');
    expect(pair.querySelector('button.tr-name')).toBeNull();
  });

  it('leaves out translations with no text in the unit', async () => {
    const { list } = await draw(G('θ'), [at('70b', { grkMatch: true, grkPositions: [2] })], 1);
    const pair = list()[0].querySelector('.inst-pair')!;
    expect(pair.querySelector('span.tr-name')).toHaveTextContent('Rackham');
    expect(pair.querySelector('button')).toBeNull();
  });

  it('lets only the reference borrow text from a nearby unit', async () => {
    const { fetchBook } = await import('../lib/data');
    const book = structuredClone(fixture);
    book.segments[0].english.text = 'Four five';
    book.turnFlow!.turns[0].e = null;
    vi.mocked(fetchBook).mockResolvedValueOnce(book);
    const { list } = await draw(G('α'), hit, 1);
    const pair = list()[0].querySelector('.inst-pair')!;
    expect(pair.querySelector('.inst-pair-text')).toHaveTextContent('Four five');
    expect(pair.querySelector('button[aria-pressed="true"]')).toHaveTextContent('Rackham');
  });

  it('falls back to the first translation with text when the reference has none', async () => {
    const { fetchBook } = await import('../lib/data');
    const book = structuredClone(fixture);
    for (const seg of book.segments) seg.english.text = '';
    for (const turn of book.turnFlow!.turns) {
      turn.e = null;
      for (const sub of turn.sub ?? []) sub.e = null;
    }
    vi.mocked(fetchBook).mockResolvedValueOnce(book);
    const { list } = await draw(G('α'), hit, 1);
    const li = list()[0];
    expect(li.querySelector('.inst-pair-text')).toHaveTextContent('Uno dos.');
    expect(li.querySelector('span.tr-name')).toHaveTextContent('Ross');
    await fireEvent.click(li.querySelector('.inst-more')!);
    expect(li.querySelector('.inst-pair-text')).toHaveTextContent('Uno dos. Cuatro cinco');
    expect(li.querySelector('span.tr-name')).toHaveTextContent('Ross');
  });

  it('switches in an opened section and keeps the choice when closed', async () => {
    const { list } = await draw(G('α'), hit, 1);
    const li = list()[0];
    await fireEvent.click(li.querySelector('.inst-more')!);
    const pair = li.querySelector('.inst-pair')!;
    const ross = [...pair.querySelectorAll('button')].find(b => text(b) === 'Ross')!;
    expect(ross).toBeDefined();
    await fireEvent.click(ross);
    expect(pair.querySelector('.inst-pair-text')).toHaveTextContent('Uno dos. Cuatro cinco');
    expect(ross).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(li.querySelector('.inst-less')!);
    expect(li.querySelector('.inst-pair-text')).toHaveTextContent('Uno dos.');
  });
});

it.skipIf(!process.env.PAIR_TIMING || !existsSync('../build/dist/EN/book-01.json'))('times the real Greek results render', async () => {
  const dist = resolve('../build/dist');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = String(url).split('/data/')[1]?.split('?')[0];
    try {
      const bytes = readFileSync(`${dist}/${path}`);
      return { ok: true, status: 200, json: async () => JSON.parse(bytes.toString()), text: async () => bytes.toString(),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    } catch { return { ok: false, status: 404 }; }
  }));
  try {
    for (let i = 0; i < 4; i++) {
      window.history.replaceState(null, '', '/search?g=ἀρετή&w=EN');
      const start = performance.now();
      const page = render(Search);
      await vi.waitFor(() => expect(page.container.querySelector('li.instance')).not.toBeNull(), { timeout: 120000, interval: 5 });
      appendFileSync('/private/tmp/search-pair-timing.txt', `${process.env.PAIR_TIMING} render ${i + 1}: ${(performance.now() - start).toFixed(1)} ms\n`);
      page.unmount();
    }
  } finally { vi.unstubAllGlobals(); }
}, 120000);
