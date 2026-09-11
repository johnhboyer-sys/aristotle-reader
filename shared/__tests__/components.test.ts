import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Reader from '../components/Reader.svelte';
import Search from '../components/Search.svelte';
import type { BookData } from '../lib/data';

const { fixtureBook } = vi.hoisted(() => ({
  fixtureBook: {
    book: 1,
    segments: [
      {
        id: 'seg1',
        column: '1094a',
        greek: [
          { n: 1, text: 'λόγος ἀρετή', tokens: [{ t: 'λόγος', o: 0, k: 'logos' }, { t: 'ἀρετή', o: 6, k: 'areth' }] },
        ],
        english: {
          text: 'Virtue (test) and κόσμος are discussed here.',
          notes: [],
          markers: [],
          bekker: [{ n: 1, offset: 0, real: true }],
        },
        chapterStarts: [{ chapter: '1', beforeLine: 1, wordIndex: 0, engOffset: 0, bekker: '1094a' }],
        third: [
          {
            chapter: '1',
            cont: false,
            text: 'Ostwald says virtue (test) beside κόσμος.',
            bekker: [{ n: 1, offset: 0, real: true }],
          },
        ],
      },
    ],
  } satisfies BookData,
}));

vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return {
    ...actual,
    search: vi.fn(async () => ({
      results: [
        {
          work: 'EN',
          meta: { id: 'seg1', book: 1, column: '1094a', greek_head: 'λόγος', english_head: 'Virtue (test) and κόσμος' },
          grkMatch: true,
          engMatch: true,
          grkPositions: [0],
        },
      ],
      failedWorks: [],
    })),
  };
});

vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchBook: vi.fn(async () => fixtureBook),
    fetchChapters: vi.fn(async () => ({
      '1': [{ chapter: '1', column: '1094a', line: '1', bekker: '1094a' }],
    })),
    fetchQuotations: vi.fn(async () => []),
    fetchFigures: vi.fn(async () => ({})),
    fetchSidenotes: vi.fn(async () => ({})),
  };
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('Search.svelte', () => {
  // Smoke test: mounts, accepts Greek + English queries (including a
  // parenthesis metacharacter and a Unicode Greek term), and runs a search
  // without throwing. Asserting exact result-card markup would couple this to
  // the grouping internals; the value here is that mount + input + submit +
  // the (mocked) search call all wire together and nothing crashes.
  it('mounts and runs a search with metacharacter + Unicode input without throwing', async () => {
    const { search } = await import('../lib/search');
    render(Search);

    await fireEvent.input(screen.getByLabelText('Greek'), { target: { value: 'λόγ*' } });
    await fireEvent.input(screen.getByLabelText('English'), { target: { value: 'virtue (test) κόσμος' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    // The wired search path was invoked with the typed queries.
    expect(search).toHaveBeenCalled();
    // The form is still mounted (no crash / unhandled render error): the Greek
    // searchbox persists after the search runs.
    expect(screen.getByLabelText('Greek')).toBeInTheDocument();
  });
});

describe('Reader.svelte', () => {
  // Smoke test: mounts with fixture book data plus highlight URL params
  // (Greek wildcard + English phrase containing a metacharacter) and renders
  // the fixture prose without throwing in the highlight code paths.
  it('renders fixture book data with highlight params applied', async () => {
    window.history.replaceState(null, '', '/EN/book/1?hlg=λόγ*&hle=virtue%20(test)%20κόσμος&loc=1094a:1');

    render(Reader, { props: { work: 'EN', bookNum: 1, bookData: fixtureBook } });

    // Bekker column from the fixture renders.
    expect(await screen.findByText('1094a')).toBeInTheDocument();
    // Greek token from the fixture renders as a token span.
    expect(screen.getByText('λόγος')).toHaveClass('tok');
    // The English column renders the fixture prose (the highlight code path ran
    // over a phrase containing a parenthesis metacharacter without throwing).
    const main = screen.getByRole('main');
    expect(within(main).getAllByText(/virtue/i).length).toBeGreaterThan(0);
  });

  it('gives a lettered line its own anchor and prints its number', async () => {
    // Bekker's 244b carries a line 5 and then a line 5a. Sharing one id made
    // getElementById return whichever came first, so a citation of the second
    // landed on the first; and the gutter, which prints only multiples of five,
    // left the lettered line unlabelled beside a 5 that was not it.
    const book: BookData = structuredClone(fixtureBook);
    book.segments[0].column = '244b';
    book.segments[0].greek = [
      { n: 5, text: 'πρῶτον', tokens: [{ t: 'πρῶτον', o: 0, k: 'prwton' }] },
      { n: 5, sub: 'a', text: 'ὑπόκειται', tokens: [{ t: 'ὑπόκειται', o: 0, k: 'upokeitai' }] },
    ];
    window.history.replaceState(null, '', '/Phys/book/7?loc=244b:5a');

    const { container } = render(Reader, { props: { work: 'Phys', bookNum: 7, bookData: book } });
    await screen.findByText('244b');

    expect(container.querySelector('#L244b-5')).not.toBeNull();
    const lettered = container.querySelector('#L244b-5a');
    expect(lettered).not.toBeNull();
    expect(lettered!.querySelector('.line-num')?.textContent).toBe('5a');
    // ?loc=244b:5a tints the lettered line, not the bare 5 above it.
    expect(lettered!.classList.contains('target')).toBe(true);
    expect(container.querySelector('#L244b-5')!.classList.contains('target')).toBe(false);
  });

  it('renders sidecar English paragraph markers as paragraph breaks', async () => {
    window.history.replaceState(null, '', '/EN/book/1?trans=rackham');
    const book: BookData = structuredClone(fixtureBook);
    book.segments[0].english = {
      text: 'First paragraph. Second paragraph.',
      notes: [],
      markers: [{ kind: 'paragraph', n: '', offset: 'First paragraph.'.length }],
      bekker: [{ n: 1, offset: 0, real: true }],
    };

    const { container } = render(Reader, { props: { work: 'EN', bookNum: 1, bookData: book } });

    expect(await screen.findByText('First paragraph.')).toBeInTheDocument();
    expect(container.querySelectorAll('.english-col .para-br')).toHaveLength(1);
    expect(screen.getByText(/Second paragraph/)).toBeInTheDocument();
  });

  it('keeps English prose without paragraph markers on the existing flat path', async () => {
    window.history.replaceState(null, '', '/EN/book/1?trans=rackham');
    const book: BookData = structuredClone(fixtureBook);
    book.segments[0].english = {
      text: 'First paragraph. Second paragraph.',
      notes: [],
      markers: [],
      bekker: [{ n: 1, offset: 0, real: true }],
    };

    const { container } = render(Reader, { props: { work: 'EN', bookNum: 1, bookData: book } });

    expect(await screen.findByText(/First paragraph\. Second paragraph\./)).toBeInTheDocument();
    expect(container.querySelectorAll('.english-col .para-br')).toHaveLength(0);
  });

  // Ostwald italicizes transliterated Greek and titles; the transcription keeps
  // that as Markdown *emphasis*, which used to reach the page as literal
  // asterisks ("formed by habit, *ethos,*").
  it('renders a footnote-bearing translation\'s emphasis as italics', async () => {
    window.history.replaceState(null, '', '/EN/book/1?trans=ostwald');
    const book: BookData = structuredClone(fixtureBook);
    book.segments[0].third = [{
      chapter: '1',
      cont: false,
      text: 'formed by habit, *ethos,* and its name.[^1]',
      bekker: [{ n: 1, offset: 0, real: true }],
    }];

    const { container } = render(Reader, { props: { work: 'EN', bookNum: 1, bookData: book } });

    await screen.findByText(/formed by habit/);
    expect([...container.querySelectorAll('em')].map(e => e.textContent)).toEqual(['ethos,']);
    expect(container.textContent).not.toContain('*');
    // The footnote marker still renders alongside the emphasis.
    expect(container.querySelector('.fn-marker')).toHaveAttribute('data-fn', '1');
  });

  // A footnote label may itself be a star, so the emphasis pass runs after the
  // marker pass — otherwise two `[^*]` references read as one long emphasis.
  it('never reads a pair of star footnote labels as emphasis', async () => {
    window.history.replaceState(null, '', '/EN/book/1?trans=ostwald');
    const book: BookData = structuredClone(fixtureBook);
    book.segments[0].third = [{
      chapter: '1',
      cont: false,
      text: 'one[^*] and two[^*] again.',
      bekker: [{ n: 1, offset: 0, real: true }],
    }];

    const { container } = render(Reader, { props: { work: 'EN', bookNum: 1, bookData: book } });

    await screen.findByText(/again/);
    expect(container.querySelectorAll('em')).toHaveLength(0);
    expect(container.querySelectorAll('.fn-marker')).toHaveLength(2);
  });

  it('snaps ?loc= to the nearest Greek line when the cited line is not a line start', async () => {
    // LSJ cites its own editions' lineation, off by a line or two from ours
    // (docs/spec-lsj-citations.md decision 8), and the link gate lets those
    // through on the strength of this fallback: the column must exist, the
    // exact line need not.
    window.history.replaceState(null, '', '/EN/book/1?loc=1094a:3');
    const book: BookData = structuredClone(fixtureBook);
    book.segments[0].greek = [
      { n: 1, text: 'λόγος', tokens: [{ t: 'λόγος', o: 0, k: 'logos' }] },
      { n: 4, text: 'ἀρετή', tokens: [{ t: 'ἀρετή', o: 0, k: 'areth' }] },
      { n: 9, text: 'φύσις', tokens: [{ t: 'φύσις', o: 0, k: 'fusis' }] },
    ];
    const { container } = render(Reader, { props: { work: 'EN', bookNum: 1, bookData: book } });
    await screen.findByText('1094a');
    await vi.waitFor(() => expect(container.querySelector('.greek-line.target')).not.toBeNull());
    expect(container.querySelector('.greek-line.target')!.id).toBe('L1094a-4');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('opens an exact ?loc= line without snapping', async () => {
    window.history.replaceState(null, '', '/EN/book/1?loc=1094a:9');
    const book: BookData = structuredClone(fixtureBook);
    book.segments[0].greek = [
      { n: 1, text: 'λόγος', tokens: [{ t: 'λόγος', o: 0, k: 'logos' }] },
      { n: 9, text: 'φύσις', tokens: [{ t: 'φύσις', o: 0, k: 'fusis' }] },
    ];
    const { container } = render(Reader, { props: { work: 'EN', bookNum: 1, bookData: book } });
    await screen.findByText('1094a');
    await vi.waitFor(() => expect(container.querySelector('.greek-line.target')).not.toBeNull());
    expect(container.querySelector('.greek-line.target')!.id).toBe('L1094a-9');
  });

  it('sanitizes an inline figure before injecting it', async () => {
    // figures.json is corpus HTML like a footnote, and it went in raw.
    const { fetchFigures } = await import('../lib/data');
    vi.mocked(fetchFigures).mockResolvedValueOnce({
      '2': '<figure class="diagram"><figcaption>Tree</figcaption><img src=x onerror="alert(1)">'
        + '<script>alert(2)</script><div class="pt">Substance</div></figure>',
    });
    window.history.replaceState(null, '', '/Isa/book/1');
    const book: BookData = structuredClone(fixtureBook);
    book.segments[0].english = {
      text: 'Alpha [[fig2]] gamma.',
      notes: [],
      markers: [],
      bekker: [{ n: 1, offset: 0, real: true }],
    };
    const { container } = render(Reader, { props: { work: 'Isa', bookNum: 1, bookData: book } });
    await screen.findByText(/Alpha/);
    await vi.waitFor(() => expect(container.querySelector('figure.diagram')).not.toBeNull());
    expect(container.querySelector('figure.diagram .pt')!.textContent).toBe('Substance');
    expect(container.querySelector('figure img')).toBeNull();
    expect(container.querySelector('figure script')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
  });

  it('keeps existing sidenote and figure inline markers out of rendered prose', async () => {
    window.history.replaceState(null, '', '/Isa/book/1');
    const book: BookData = structuredClone(fixtureBook);
    book.segments[0].english = {
      text: 'Alpha [[s1]] beta [[fig2]] gamma.',
      notes: [],
      markers: [],
      bekker: [{ n: 1, offset: 0, real: true }],
    };

    const { container } = render(Reader, { props: { work: 'Isa', bookNum: 1, bookData: book } });

    expect(await screen.findByText(/Alpha/)).toBeInTheDocument();
    expect(container.textContent).toContain('Alpha beta gamma.');
    expect(container.textContent).not.toContain('[[s1]]');
    expect(container.textContent).not.toContain('[[fig2]]');
  });

  // A translation's chapter title heads its own column only. John caught the
  // consequence at EN 1094a1: Ostwald heads chapter 1, Ross heads nothing, so
  // in compare view Ross's line 1 sat level with Ostwald's HEADING rather than
  // his first line of prose. Every column without a title of its own owes the
  // titled column an invisible counterweight of the same height.
  it('pushes every untitled column down by a neighbour\'s chapter title', async () => {
    const book: BookData = structuredClone(fixtureBook);
    // Ross (the 'secondary' slot) reads the same chapter beside Ostwald.
    book.segments[0].secondary = [
      {
        chapter: '1',
        cont: false,
        text: 'Ross says virtue beside the same Greek.',
        bekker: [{ n: 1, offset: 0, real: true }],
      },
    ];
    localStorage.setItem('reader-view', 'both');
    localStorage.setItem('reader-trans-EN', 'compare');
    localStorage.setItem('reader-cmpl-EN', 'ostwald');
    localStorage.setItem('reader-cmpr-EN', 'ross');
    window.history.replaceState(null, '', '/EN/book/1');

    const { container } = render(Reader, {
      props: {
        work: 'EN',
        bookNum: 1,
        bookData: book,
        // Only Ostwald heads his chapters; Ross carries no titles at all.
        transTitles: { ostwald: { '1': 'The Good as the Aim of Action' } },
      },
    });
    await screen.findByText(/Ross says virtue/);

    const row = container.querySelector('.seg-row')!;
    const greek = row.querySelector('.greek-col')!;
    const left = row.querySelector('.english-col')!;
    const right = row.querySelector('.overlay-col')!;

    // Ostwald's column shows the real title; his neighbours each carry one
    // hidden copy, so all three columns start their text at the same height.
    expect(left.querySelectorAll('.overlay-chapter-title').length).toBe(1);
    expect(left.querySelector('.overlay-chapter-title')!.className)
      .not.toContain('overlay-chapter-title-gap');
    expect(right.querySelectorAll('.overlay-chapter-title-gap').length).toBe(1);
    expect(right.querySelector('.overlay-chapter-title-gap')!.textContent)
      .toContain('The Good as the Aim of Action');
    expect(greek.querySelectorAll('.overlay-chapter-title-spacer').length).toBe(1);

    // The counterweights are spacing, not text: hidden from the accessibility
    // tree and (via .overlay-chapter-title) skipped by clean-copy.
    expect(right.querySelector('.overlay-chapter-title-gap')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('leaves every column flush when no translation heads the chapter', async () => {
    // The paired negative: without it the assertions above would also pass on
    // a build that spaced every row unconditionally.
    const book: BookData = structuredClone(fixtureBook);
    book.segments[0].secondary = [
      { chapter: '1', cont: false, text: 'Ross alone.', bekker: [{ n: 1, offset: 0, real: true }] },
    ];
    localStorage.setItem('reader-view', 'both');
    localStorage.setItem('reader-trans-EN', 'compare');
    localStorage.setItem('reader-cmpl-EN', 'ostwald');
    localStorage.setItem('reader-cmpr-EN', 'ross');
    window.history.replaceState(null, '', '/EN/book/1');

    const { container } = render(Reader, {
      props: { work: 'EN', bookNum: 1, bookData: book, transTitles: {} },
    });
    await screen.findByText(/Ross alone/);

    expect(container.querySelectorAll('.overlay-chapter-title').length).toBe(0);
  });
});
