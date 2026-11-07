// The reader for a chapter.section work (the Athenian Constitution): chapter N
// is the synthetic column "Na", each Greek "line" a whole section. Everything
// new hangs off that scheme; the same assertions pin a Bekker work and the
// Isagoge to what they rendered before.
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Reader from '../components/Reader.svelte';
import CommandPalette from '../components/CommandPalette.svelte';
import Search from '../components/Search.svelte';
import { englishWords } from '../lib/search';
import type { BookData } from '../lib/data';

const { ATHPOL } = vi.hoisted(() => ({
  ATHPOL: {
    id: 'AthPol', title: 'Athenian Constitution', abbr: 'Ath. Pol.', author: 'Aristotle',
    books: 1, bookLabels: ['I'], greekEdition: 'Oppermann',
    greekSource: { short: 'Oppermann', full: 'Oppermann (Teubner, 1928)' },
    translations: [{ id: 'kenyon', name: 'F. G. Kenyon (Oxford, 1920)', short: 'Kenyon', slot: 'english' as const }],
    blurb: '', citation: { scheme: 'chapter-section' as const },
  },
}));

// The registry entry lands with the data (a separate gate), so the fixture is
// served beside the real works without touching WORKS.
vi.mock('../lib/works', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/works')>();
  return {
    ...actual,
    WORKS: [...actual.WORKS, ATHPOL],
    getWork: (id: string) => (id === 'AthPol' ? ATHPOL : actual.getWork(id)),
  };
});

vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return {
    ...actual,
    search: vi.fn(),
    searchCombo: vi.fn(async () => ({ results: [], failedWorks: [] })),
    searchPhraseVariants: vi.fn(),
    loadOffsets: vi.fn(async () => { throw new Error('no offsets.json'); }),
  };
});

vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchQuotations: vi.fn(async () => []),
    fetchFigures: vi.fn(async () => ({})),
    fetchSidenotes: vi.fn(async () => ({})),
    fetchBekkerIndex: vi.fn(async () => ({
      '56a': [{ work: 'AthPol', book: 1, lo: 1, hi: 7 }],
      '1103a': [{ work: 'EN', book: 2, lo: 1, hi: 34 }],
    })),
    fetchLemmata: vi.fn(async () => ({})),
    fetchBook: vi.fn(),
    fetchChapters: vi.fn(),
  };
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

// One chapter as one column: seven sections, one real English tick each.
function book(column: string, chapter: string, span: string): BookData {
  const sections = [1, 2, 3, 4, 5, 6, 7];
  const text = sections.map(n => `Section ${n} text.`).join(' ');
  return {
    book: 1,
    segments: [{
      id: `seg-${column}`,
      column,
      greek: sections.map(n => ({ n, text: 'λόγος', tokens: [{ t: 'λόγος', o: 0, k: 'logos' }] })),
      english: {
        text, notes: [], markers: [],
        bekker: sections.map(n => ({ n, offset: text.indexOf(`Section ${n}`), real: true })),
      },
      chapterStarts: [{ chapter, beforeLine: 1, wordIndex: 0, engOffset: 0, bekker: span }],
    }],
  };
}

const lineNums = (c: HTMLElement) =>
  [...c.querySelectorAll('.greek-line .line-num')].map(e => e.textContent);

describe('Reader, chapter-section scheme', () => {
  it('drops the column label and the chapter span, and numbers every section', async () => {
    window.history.replaceState(null, '', '/AthPol');
    const { container } = render(Reader, { props: { work: 'AthPol', bookNum: 1, bookData: book('49a', '49', '49a1–7') } });
    await screen.findAllByText('λόγος');
    expect(container.querySelector('.seg-ref')).toBeNull();
    expect(container.querySelector('.chapter-bekker')).toBeNull();
    expect(container.querySelector('.chapter-label')?.textContent).toBe('Chapter 49');
    expect(lineNums(container)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(container.querySelector('.reader-body')?.classList.contains('chapter-section')).toBe(true);
    // Line anchors and the URL hash keep the synthetic column.
    expect(container.querySelector('#L49a-3')).not.toBeNull();
  });

  // A section is taller than the band the scroll spy reads, so a jump must put
  // its top exactly at the reading area's top (the controls strip's bottom):
  // any of the section before still showing there and the spy cites that one.
  afterEach(() => { vi.restoreAllMocks(); });
  // A fake page: `docTop` is an element's position in the document, scrollY
  // moves with scrollTo/scrollBy, and the controls strip ends at 275px until
  // the page scrolls, then sticks at 251px, as it does in the browser.
  function layout(docTop: (el: Element) => number | undefined) {
    let y = 0;
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const at = docTop(this);
      const top = at === undefined ? 0 : at - y;
      const bottom = this.classList.contains('reader-controls') ? (y > 0 ? 251 : 275) : top;
      return { top, bottom, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} } as DOMRect;
    });
    vi.spyOn(window, 'scrollTo').mockImplementation(((o: ScrollToOptions) => { y = o.top ?? y; }) as typeof window.scrollTo);
    vi.spyOn(window, 'scrollBy').mockImplementation(((_x: number, dy: number) => { y += dy; }) as typeof window.scrollBy);
    return () => y;
  }

  it('puts the cited section exactly at the top of the reading area', async () => {
    const scrollY = layout(el => (el.id === 'L49a-3' ? 5000 : undefined));
    window.history.replaceState(null, '', '/AthPol?loc=49a:3');
    render(Reader, { props: { work: 'AthPol', bookNum: 1, bookData: book('49a', '49', '49a1–7') } });
    // Measured once the controls have stuck (251), not at the top of the page (275).
    await vi.waitFor(() => expect(scrollY()).toBe(5000 - 251));
  });

  it('with the Greek hidden, a citation jump opens at the English section tick', async () => {
    // The Greek line exists but is hidden: scrolling it into view goes nowhere.
    const scrollY = layout(el =>
      el.classList.contains('bk-num') && el.textContent?.trim() === '3' ? 3000 : undefined);
    window.history.replaceState(null, '', '/AthPol?loc=49a:3&view=english');
    render(Reader, { props: { work: 'AthPol', bookNum: 1, bookData: book('49a', '49', '49a1–7') } });
    await vi.waitFor(() => expect(scrollY()).toBe(3000 - 251));
  });
});

// Arm the scroll spy in English-only view and report what it watches; `fire`
// marks one watched element as at the top of the reading area.
async function englishSpy(work: string, bookData: BookData) {
  const observers: { cb: IntersectionObserverCallback; els: Element[] }[] = [];
  vi.stubGlobal('IntersectionObserver', class {
    els: Element[] = [];
    constructor(cb: IntersectionObserverCallback) { observers.push({ cb, els: this.els }); }
    observe(el: Element) { this.els.push(el); }
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  });
  localStorage.setItem('reader-view', 'english');
  const { container } = render(Reader, { props: { work, bookNum: 1, bookData } });
  await screen.findAllByText('λόγος');
  await new Promise(r => setTimeout(r, 0));   // the mount's jump timer adds the arm listener
  window.dispatchEvent(new Event('scroll'));
  const spy = observers[observers.length - 1];
  const fire = (el: Element) => spy.cb(
    [{ target: el, isIntersecting: true, boundingClientRect: { top: 100 } } as unknown as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
  return { container, watched: spy?.els ?? [], fire };
}

describe('Reader scroll spy with the Greek hidden', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('watches English section ticks and saves the section, for chapter-section', async () => {
    window.history.replaceState(null, '', '/AthPol');
    const { watched, fire } = await englishSpy('AthPol', book('49a', '49', '49a1–7'));
    expect(watched.map(e => e.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    fire(watched[2]);
    expect(window.location.hash).toBe('#49a3');
    expect(localStorage.getItem('reader-loc-AthPol')).toBe('49a3');
  });

  it('still watches whole columns for a Bekker work', async () => {
    window.history.replaceState(null, '', '/EN/book/1');
    const { watched, fire } = await englishSpy('EN', book('1094a', '1', '1094a1–7'));
    expect(watched.map(e => e.id)).toEqual(['col-1094a']);
    fire(watched[0]);
    expect(window.location.hash).toBe('#1094a');
  });
});

describe('Reader, unchanged for Bekker and Busse works', () => {
  it('keeps the column label, chapter span and every-fifth numbering for a Bekker work', async () => {
    window.history.replaceState(null, '', '/EN/book/1');
    const { container } = render(Reader, { props: { work: 'EN', bookNum: 1, bookData: book('1094a', '1', '1094a1–7') } });
    await screen.findAllByText('λόγος');
    expect(container.querySelector('.seg-ref')?.textContent?.trim()).toBe('1094a');
    expect(container.querySelector('.chapter-bekker')?.textContent).toBe('(1094a1–7)');
    expect(lineNums(container)).toEqual(['1', '', '', '', '5', '', '']);
    expect(container.querySelector('.reader-body')?.classList.contains('chapter-section')).toBe(false);
  });

  it('still centres a Bekker citation jump', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    window.history.replaceState(null, '', '/EN/book/1?loc=1094a:3');
    render(Reader, { props: { work: 'EN', bookNum: 1, bookData: book('1094a', '1', '1094a1–7') } });
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0]).toMatchObject({ block: 'center' });
  });

  it('keeps the Isagoge as it was: no column label, no span, no line numbers', async () => {
    window.history.replaceState(null, '', '/Isa/book/1');
    const { container } = render(Reader, { props: { work: 'Isa', bookNum: 1, bookData: book('1a', '1', '1a1–7') } });
    await screen.findAllByText('λόγος');
    expect(container.querySelector('.seg-ref')).toBeNull();
    expect(container.querySelector('.chapter-bekker')).toBeNull();
    expect(lineNums(container)).toEqual(['', '', '', '', '', '', '']);
    const body = container.querySelector('.reader-body')!;
    expect(body.classList.contains('busse')).toBe(true);
    expect(body.classList.contains('chapter-section')).toBe(false);
  });
});

describe('⌘K palette, chapter-section citations', () => {
  const go = vi.fn();
  async function ask(work: string | null, q: string) {
    render(CommandPalette, { props: { work, onNavigate: go } });
    await fireEvent.keyDown(window, { key: 'k', metaKey: true });
    await fireEvent.input(await screen.findByRole('combobox'), { target: { value: q } });
  }
  const jumps = () => screen.queryAllByRole('option')
    .filter(o => /^Go to /.test(o.querySelector('.cp-label')?.textContent ?? ''));

  it('jumps to a section by work prefix, from anywhere', async () => {
    await ask(null, 'Ath. Pol. 56.6');
    await vi.waitFor(() => expect(jumps()).toHaveLength(1));
    expect(jumps()[0].textContent).toContain('Go to 56.6');
    await fireEvent.click(jumps()[0].querySelector('button')!);
    expect(go).toHaveBeenCalledWith('/AthPol/book/1?loc=56a:6');
  });

  it('offers no jump to a section the work does not have', async () => {
    await ask(null, 'Ath. Pol. 56.9');
    await screen.findByText(/Search the corpus for/);
    expect(jumps()).toHaveLength(0);
  });

  it('takes a bare section inside the work', async () => {
    await ask('AthPol', '56.6');
    await vi.waitFor(() => expect(jumps()).toHaveLength(1));
    await fireEvent.click(jumps()[0].querySelector('button')!);
    expect(go).toHaveBeenCalledWith('/AthPol/book/1?loc=56a:6');
  });

  it('leaves a Bekker citation as it was', async () => {
    await ask('EN', '1103a14');
    await vi.waitFor(() => expect(jumps()).toHaveLength(1));
    expect(jumps()[0].textContent).toContain('Go to 1103a14');
  });
});

describe('Search hits in a chapter-section work', () => {
  it('cites Greek and English hits by section, one English row per section', async () => {
    const { search } = await import('../lib/search');
    const { fetchBook, fetchChapters } = await import('../lib/data');
    const data = book('49a', '49', '49a1–7');
    vi.mocked(fetchBook).mockResolvedValue(data);
    vi.mocked(fetchChapters).mockResolvedValue({ '1': [{ chapter: '49', column: '49a', line: '1', bekker: '49a1–7' }] });
    // "text" in sections 2, 5 and 6: each section holds one, so the n-th is in section n.
    const words = englishWords(data.segments[0].english!.text);
    const texts = words.flatMap((w, i) => (w.word.toLowerCase() === 'text' ? [i] : []));
    const textIn = (n: number) => texts[n - 1];
    vi.mocked(search).mockResolvedValue({
      results: [{
        work: 'AthPol', meta: { id: 'seg-49a', book: 1, column: '49a' },
        grkMatch: true, engMatch: true, grkPositions: [2],
        engHits: [{ translation: 'kenyon', positions: [textIn(2), textIn(5), textIn(6)] }],
      }],
      failedWorks: [],
    } as never);
    window.history.replaceState(null, '', '/search?g=logos&e=text');
    const { container } = render(Search);
    const head = await screen.findByRole('button', { name: /Chapter 49/ });
    expect(container.querySelector('.group-bekker')).toBeNull();
    await fireEvent.click(head);
    const refs = [...container.querySelectorAll('.inst-ref')].map(a => a.textContent);
    expect(refs).toEqual(['49.2', '49.3', '49.5', '49.6']);
    const hrefs = [...container.querySelectorAll('.inst-ref')].map(a => a.getAttribute('href'));
    expect(hrefs.every(h => /loc=49a:\d$/.test(h ?? ''))).toBe(true);
  });
});
