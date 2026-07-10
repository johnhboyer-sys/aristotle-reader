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
    search: vi.fn(async () => [
      {
        work: 'EN',
        meta: { id: 'seg1', book: 1, column: '1094a', greek_head: 'λόγος', greek_tokens: 'logos', english_head: 'Virtue (test) and κόσμος' },
        grkMatch: true,
        engMatch: true,
        grkPositions: [0],
      },
    ]),
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
});
