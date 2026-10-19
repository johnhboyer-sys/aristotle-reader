import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Reader from '../components/Reader.svelte';
import Search from '../components/Search.svelte';
import type { BookData } from '../lib/data';
import { getWork, searchableTranslations } from '../lib/works';

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
          meta: { id: 'seg1', book: 1, column: '1094a' },
          grkMatch: true,
          engMatch: true,
          grkPositions: [0],
        },
      ],
      failedWorks: [],
    })),
    searchCombo: vi.fn(async () => ({ results: [], failedWorks: [] })),
    searchPhraseVariants: vi.fn(),
    // No work's chapter edges load in a test: pages fall back to whole books.
    loadOffsets: vi.fn(async () => { throw new Error('no offsets.json'); }),
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

  it('counts every English word, shows hits by work, and says so in a live region', async () => {
    const { search } = await import('../lib/search');
    const primary = searchableTranslations(getWork('EN')!)[0].id;
    const meta = { id: 'seg1', book: 1, column: '1094a', greek_head: 'λόγος', english_head: 'Virtue (test)' };
    vi.mocked(search).mockResolvedValueOnce({
      results: [
        // One Greek word and two English ones: three hits.
        { work: 'EN', meta, grkMatch: true, engMatch: true, grkPositions: [0], engHits: [{ translation: primary, positions: [0, 1] }] },
        { work: 'Meta', meta, grkMatch: true, engMatch: false, grkPositions: [0, 1] },
      ],
      failedWorks: [],
    });
    render(Search);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');

    await fireEvent.input(screen.getByLabelText('Greek'), { target: { value: 'λόγος' } });
    await fireEvent.input(screen.getByLabelText('English'), { target: { value: 'virtue test' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await vi.waitFor(() => expect(status).toHaveTextContent('5 instances'));
    const works = screen.getByRole('group', { name: 'Show hits from' });
    const en = within(works).getByRole('button', { name: /^EN/ });
    expect(en).toHaveTextContent('EN3');
    expect(within(works).getByRole('button', { name: /^Met\./ })).toHaveTextContent('Met.2');
    await vi.waitFor(() => expect(screen.getByText('3 instances')).toBeInTheDocument());

    await fireEvent.click(en);
    await vi.waitFor(() => expect(status).toHaveTextContent('3 instances'));
    expect(en).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Search.svelte in the address bar', () => {
  const at = (url: string) => window.history.replaceState(null, '', url);
  // Greek and English each have an "Any form" / "Only as I typed it" pair, so
  // a radio is named by its group as well.
  const checked = (name: string, group?: string) => (screen.getByLabelText(name,
    group ? { selector: `input[name="${group}"]` } : undefined) as HTMLInputElement).checked;

  it('restores every control from the URL and runs that search', async () => {
    const { search } = await import('../lib/search');
    at('/search?g=logos&gm=phrase&m=form&acc=1&e=virtue&em=any&op=or&w=EN,Pol');
    render(Search);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(search).toHaveBeenCalledWith('logos', 'virtue', 'phrase', 'any', 'or', ['EN', 'Pol'], 'form', true);
    expect(screen.getByLabelText('Greek')).toHaveValue('logos');
    expect(screen.getByLabelText('English')).toHaveValue('virtue');
    expect(checked('Only as I typed it', 'matchmode')).toBe(true);
    expect(checked('Any form of this word', 'engforms')).toBe(true);
    expect(checked('Match accents exactly')).toBe(true);
    expect(checked('Either query')).toBe(true);
  });

  it('runs the command palette hand-off with every default', async () => {
    const { search } = await import('../lib/search');
    at(`/search?g=${encodeURIComponent('λόγος')}`);
    render(Search);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(search).toHaveBeenCalledWith('λόγος', '', 'all', 'all', 'and', expect.any(Array), 'lemma', true);
  });

  it('restores English "only as I typed it", and writes it as ef=0', async () => {
    const { search } = await import('../lib/search');
    at('/search?e=virtue&ef=0');
    render(Search);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(search).toHaveBeenCalledWith('', 'virtue', 'all', 'all', 'and', expect.any(Array), 'lemma', false);
    expect(checked('Only as I typed it', 'engforms')).toBe(true);

    // Back to any form: the default, so ef leaves the URL.
    await fireEvent.click(screen.getByLabelText('Any form of this word', { selector: 'input[name="engforms"]' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(window.location.search).toBe('?e=virtue');
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(vi.mocked(search).mock.calls[1][7]).toBe(true);

    // And the back button restores ef=0.
    at('/search?e=virtue&ef=0');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(3));
    expect(vi.mocked(search).mock.calls[2][7]).toBe(false);
    expect(checked('Only as I typed it', 'engforms')).toBe(true);
  });

  it('pushes each search, and a repeat of it adds no entry', async () => {
    at('/search');
    const push = vi.spyOn(window.history, 'pushState');
    render(Search);
    await fireEvent.input(screen.getByLabelText('English'), { target: { value: 'practical wisdom' } });
    await fireEvent.click(screen.getByLabelText('Any word', { selector: 'input[name="engmode"]' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(window.location.search).toBe('?e=practical%20wisdom&em=any');
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled());
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it('replaces a ?q= arrival when the same search runs again, so Back leaves the page', async () => {
    const { search } = await import('../lib/search');
    at('/search?q=happiness');
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    render(Search);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(search).toHaveBeenCalledWith('', 'happiness', 'all', 'all', 'and', expect.any(Array), 'lemma', true);
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled());
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(window.location.search).toBe('?e=happiness');
    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalled();
    push.mockRestore();
    replace.mockRestore();
  });

  it('follows the back button, and clears the page on a URL with no search', async () => {
    const { search } = await import('../lib/search');
    at('/search?g=logos');
    render(Search);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));

    at('/search?e=soul&w=-Cat');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(vi.mocked(search).mock.calls[1].slice(0, 2)).toEqual(['', 'soul']);
    expect(vi.mocked(search).mock.calls[1][5]).not.toContain('Cat');
    expect(screen.getByLabelText('Greek')).toHaveValue('');

    at('/search');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(screen.getByLabelText('English')).toHaveValue(''));
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('restores a proximity search', async () => {
    const { searchCombo } = await import('../lib/search');
    at(`/search?c=l:logos&c=fa:${encodeURIComponent('ἀρετή')}&cu=line`);
    render(Search);
    await vi.waitFor(() => expect(searchCombo).toHaveBeenCalledTimes(1));
    expect(searchCombo).toHaveBeenCalledWith(
      [
        { kind: 'lemma', terms: ['logos'], relation: 'near' },
        { kind: 'form', terms: ['ἀρετή'], relation: 'after' },
      ],
      { window: 5, unit: 'line', ordered: false, crossChapter: true },
      expect.any(Array),
    );
  });

  it('drops widened results that arrive after the back button cleared the page', async () => {
    const { search, searchPhraseVariants } = await import('../lib/search');
    let finish!: (v: Awaited<ReturnType<typeof searchPhraseVariants>>) => void;
    vi.mocked(searchPhraseVariants).mockReturnValue(new Promise(r => { finish = r; }));
    at(`/search?g=${encodeURIComponent('λόγος ἀρετή')}`);
    render(Search);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await fireEvent.click(await screen.findByRole('button', { name: 'Find this phrase in any inflection' }));

    at('/search');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(screen.getByLabelText('Greek')).toHaveValue(''));
    finish({
      results: [{
        work: 'EN',
        meta: { id: 'seg1', book: 1, column: '1094a' },
        grkMatch: true, engMatch: false, grkPositions: [0],
      }],
      readings: [['logos', 'areth']], productive: [['logos', 'areth']], cappedFrom: 0, failedWorks: [],
    } as Awaited<ReturnType<typeof searchPhraseVariants>>);
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByText(/instances?/)).toBeNull();
    expect(screen.queryByText(/Showing every place/)).toBeNull();
  });

  // A promise and the function that settles it, for holding one load open.
  function held<T>() {
    let settle!: (v: T) => void;
    let fail!: (e: Error) => void;
    const promise = new Promise<T>((r, j) => { settle = r; fail = j; });
    return { promise, settle, fail };
  }
  // A work whose chapter edges do not load is paged by whole books.
  const noOffsets = new Error('no offsets.json');
  const workNames = () => [...document.querySelectorAll('.work-name')].map(n => n.textContent);

  it("drops an older search's page that finishes loading after a newer search", async () => {
    const { search, loadOffsets } = await import('../lib/search');
    const { fetchBook } = await import('../lib/data');
    const hit = (work: string) => ({
      results: [{ work, meta: { id: 'seg1', book: 1, column: '1094a' }, grkMatch: true, engMatch: false, grkPositions: [0] }],
      failedWorks: [],
    });
    vi.mocked(search).mockResolvedValueOnce(hit('EN')).mockResolvedValueOnce(hit('Meta'));
    const bookA = held<typeof fixtureBook>();
    vi.mocked(fetchBook).mockReturnValueOnce(bookA.promise);
    const offsetsB = held<Awaited<ReturnType<typeof loadOffsets>>>();
    vi.mocked(loadOffsets).mockRejectedValueOnce(noOffsets).mockReturnValueOnce(offsetsB.promise);
    // Only history can start a search while one is loading: the button waits.
    at(`/search?g=${encodeURIComponent('λόγος')}`);
    render(Search);
    await vi.waitFor(() => expect(fetchBook).toHaveBeenCalledTimes(1));
    at(`/search?g=${encodeURIComponent('ἀρετή')}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(loadOffsets).toHaveBeenCalledTimes(2));

    bookA.settle(fixtureBook);
    await new Promise(r => setTimeout(r, 20));
    expect(workNames()).not.toContain(getWork('EN')!.title);
    offsetsB.fail(noOffsets);
    await vi.waitFor(() => expect(workNames()).toEqual([getWork('Meta')!.title]));
  });

  it('frees the inflection lookup when a new search retires it', async () => {
    const { search, searchPhraseVariants } = await import('../lib/search');
    vi.mocked(searchPhraseVariants).mockReturnValue(new Promise(() => {}));
    at(`/search?g=${encodeURIComponent('λόγος ἀρετή')}`);
    render(Search);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await fireEvent.click(await screen.findByRole('button', { name: 'Find this phrase in any inflection' }));
    await screen.findByRole('button', { name: 'Looking…' });

    await fireEvent.input(screen.getByLabelText('Greek'), { target: { value: 'λόγος τέχνη' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    const find = await screen.findByRole('button', { name: 'Find this phrase in any inflection' });
    expect(find).toBeEnabled();
  });

  it("keeps a retired inflection lookup's note off a newer search", async () => {
    const { search, searchPhraseVariants, loadOffsets } = await import('../lib/search');
    vi.mocked(searchPhraseVariants).mockResolvedValue({
      results: [{ work: 'EN', meta: { id: 'seg1', book: 1, column: '1094a' }, grkMatch: true, engMatch: false, grkPositions: [0] }],
      readings: [['logos', 'areth']], productive: [['logos', 'areth']], cappedFrom: 0, failedWorks: [],
    } as Awaited<ReturnType<typeof searchPhraseVariants>>);
    const offsetsV = held<Awaited<ReturnType<typeof loadOffsets>>>();
    vi.mocked(loadOffsets).mockRejectedValueOnce(noOffsets).mockReturnValueOnce(offsetsV.promise);
    at(`/search?g=${encodeURIComponent('λόγος ἀρετή')}`);
    render(Search);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await fireEvent.click(await screen.findByRole('button', { name: 'Find this phrase in any inflection' }));
    await vi.waitFor(() => expect(loadOffsets).toHaveBeenCalledTimes(2));

    await fireEvent.input(screen.getByLabelText('Greek'), { target: { value: 'λόγος τέχνη' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(loadOffsets).toHaveBeenCalledTimes(3));
    offsetsV.fail(noOffsets);
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByText(/Showing every place/)).toBeNull();
  });

  it('writes the translator filter with replaceState, and restores it', async () => {
    const { search } = await import('../lib/search');
    const twoTranslations = {
      results: [{
        work: 'EN',
        meta: { id: 'seg1', book: 1, column: '1094a', greek_head: 'λόγος', english_head: 'Virtue' },
        grkMatch: false, engMatch: true, grkPositions: [],
        engHits: [{ translation: 'rackham', positions: [0] }, { translation: 'ostwald', positions: [2] }],
      }],
      failedWorks: [],
    };
    vi.mocked(search).mockResolvedValue(twoTranslations);
    at('/search?e=virtue');
    const push = vi.spyOn(window.history, 'pushState');
    const { unmount } = render(Search);
    const chip = await screen.findByRole('button', { name: /^Ostwald/ });
    await fireEvent.click(chip);
    expect(window.location.search).toBe('?e=virtue&t=ostwald');
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
    unmount();

    const second = render(Search);
    expect(await screen.findByRole('button', { name: /^Ostwald/ })).toHaveAttribute('aria-pressed', 'true');

    // A translation this search did not find is dropped from the URL.
    second.unmount();
    at('/search?e=virtue&t=nobody');
    render(Search);
    await screen.findByRole('button', { name: /^Ostwald/ });
    expect(window.location.search).toBe('?e=virtue');
  });

  it('writes the works filter with replaceState, and restores it', async () => {
    const { search } = await import('../lib/search');
    const meta = { id: 'seg1', book: 1, column: '1094a' };
    vi.mocked(search).mockResolvedValue({
      results: [
        { work: 'EN', meta, grkMatch: true, engMatch: false, grkPositions: [0] },
        { work: 'Meta', meta, grkMatch: true, engMatch: false, grkPositions: [0, 1] },
      ],
      failedWorks: [],
    });
    const status = () => screen.getByRole('status');
    at('/search?g=logos');
    const push = vi.spyOn(window.history, 'pushState');
    const { unmount } = render(Search);
    const works = await screen.findByRole('group', { name: 'Show hits from' });
    await fireEvent.click(within(works).getByRole('button', { name: /^Met\./ }));
    expect(window.location.search).toBe('?g=logos&wf=Meta');
    expect(push).not.toHaveBeenCalled();
    await fireEvent.click(within(works).getByRole('button', { name: /^Met\./ }));
    expect(window.location.search).toBe('?g=logos');
    push.mockRestore();
    unmount();

    at('/search?g=logos&wf=Meta');
    const second = render(Search);
    const restored = await screen.findByRole('group', { name: 'Show hits from' });
    await vi.waitFor(() => expect(within(restored).getByRole('button', { name: /^Met\./ }))
      .toHaveAttribute('aria-pressed', 'true'));
    await vi.waitFor(() => expect(status()).toHaveTextContent('2 instances'));

    // And the back button restores it, or clears it.
    at('/search?g=logos');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(status()).toHaveTextContent('3 instances'));
    expect(within(screen.getByRole('group', { name: 'Show hits from' })).getByRole('button', { name: /^Met\./ }))
      .toHaveAttribute('aria-pressed', 'false');

    // A work this search did not find is dropped from the URL.
    second.unmount();
    at('/search?g=logos&wf=Pol');
    render(Search);
    await screen.findByRole('group', { name: 'Show hits from' });
    await vi.waitFor(() => expect(window.location.search).toBe('?g=logos'));
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

  it('asks for quotations only for a work that has them', async () => {
    // Every other work used to ask too, and the browser logged each missing
    // file as a 404 on the live site even though the reader shrugged it off.
    const { fetchQuotations } = await import('../lib/data');
    render(Reader, { props: { work: 'EN', bookNum: 1, bookData: fixtureBook } });
    expect(fetchQuotations).not.toHaveBeenCalled();
    render(Reader, { props: { work: 'Meta', bookNum: 1, bookData: fixtureBook } });
    expect(fetchQuotations).toHaveBeenCalledWith('Meta');
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

  it('pushes the Greek and left columns down when only the right column is titled', async () => {
    // The mirror case: Ross on the left, Ostwald on the right. The Greek spacer
    // used to answer to the left column alone, so here it rode a line high.
    const book: BookData = structuredClone(fixtureBook);
    book.segments[0].secondary = [
      { chapter: '1', cont: false, text: 'Ross on the left.', bekker: [{ n: 1, offset: 0, real: true }] },
    ];
    localStorage.setItem('reader-view', 'both');
    localStorage.setItem('reader-trans-EN', 'compare');
    localStorage.setItem('reader-cmpl-EN', 'ross');
    localStorage.setItem('reader-cmpr-EN', 'ostwald');
    window.history.replaceState(null, '', '/EN/book/1');

    const { container } = render(Reader, {
      props: {
        work: 'EN',
        bookNum: 1,
        bookData: book,
        transTitles: { ostwald: { '1': 'The Good as the Aim of Action' } },
      },
    });
    await screen.findByText(/Ross on the left/);

    const row = container.querySelector('.seg-row')!;
    const left = row.querySelector('.english-col')!;
    const right = row.querySelector('.overlay-col')!;
    expect(row.querySelectorAll('.greek-col .overlay-chapter-title-spacer').length).toBe(1);
    expect(left.querySelectorAll('.overlay-chapter-title-gap').length).toBe(1);
    expect(right.querySelectorAll('.overlay-chapter-title-gap').length).toBe(0);
    expect(right.querySelectorAll('.overlay-chapter-title').length).toBe(1);
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
    expect(container.querySelectorAll('.overlay-chapter-title-gap').length).toBe(0);
    expect(container.querySelectorAll('.overlay-chapter-title-spacer').length).toBe(0);
  });
});
