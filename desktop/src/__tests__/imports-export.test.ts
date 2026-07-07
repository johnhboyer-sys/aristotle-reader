import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchBook: vi.fn(),
  fetchChapters: vi.fn(),
  getWork: vi.fn(),
  buildChapterInputs: vi.fn(),
  alignImportedChapter: vi.fn(),
  emitOverlayPieces: vi.fn(),
}));

vi.mock('../../../app/src/lib/data', () => ({
  fetchBook: mocks.fetchBook,
  fetchChapters: mocks.fetchChapters,
}));

vi.mock('../../../app/src/lib/works', () => ({
  WORKS: [{ id: 'ethics' }, { id: 'politics' }],
  getWork: mocks.getWork,
}));

vi.mock('../lib/aligner/reference', () => ({
  buildChapterInputs: mocks.buildChapterInputs,
}));

vi.mock('../lib/aligner/import-align', () => ({
  alignImportedChapter: mocks.alignImportedChapter,
  emitOverlayPieces: mocks.emitOverlayPieces,
}));

describe('imports', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.getWork.mockReturnValue({ id: 'ethics', books: 1 });
    mocks.fetchChapters.mockResolvedValue({ '1': [{ chapter: 1, column: '1094a', line: '1' }] });
    mocks.fetchBook.mockResolvedValue({ book: 1, segments: [] });
    mocks.buildChapterInputs.mockReturnValue([
      { book: 1, chapter: '1', citation: '1094a1', targetText: 'Happiness.', refText: '', refAnchors: [], greekLines: [] },
    ]);
    mocks.alignImportedChapter.mockReturnValue({
      book: 1,
      chapter: '1',
      text: 'Happiness.',
      anchors: [],
      stats: { tagged: 1, placed: 0, interpolated: 0 },
    });
    mocks.emitOverlayPieces.mockReturnValue({
      pieces: { seg1: [{ chapter: '1', text: 'Happiness.', cont: false }] },
      emphasis: {},
    });
  });

  it('imports tagged translation content, writes browser storage, and formats runtime citation metadata', async () => {
    const { runImport, loadImports } = await import('../lib/imports');
    const progress: string[] = [];

    const summary = await runImport({
      raw: '{1.1}Happiness. {1094a}Column.',
      work: 'ethics',
      translator: 'Jane Doe',
      license: 'public-domain',
      year: 1901,
    }, msg => progress.push(msg));

    expect(summary).toMatchObject({
      density: 'five-line-or-column',
      chapters: 1,
      tagged: 1,
      placed: 0,
      interpolated: 0,
      replaced: false,
    });
    expect(summary.meta).toMatchObject({
      id: 'jane-doe-ethics',
      work: 'ethics',
      translator: 'Jane Doe',
      year: 1901,
      language: 'en',
    });
    expect(progress).toEqual(['Scanning tags…', 'Aligning Book 1 of 1…', 'Writing library files…']);
    expect(JSON.parse(localStorage.getItem('import-map:ethics/jane-doe-ethics')!)).toMatchObject({
      meta: { translator: 'Jane Doe' },
      overlaysByBook: { '1': { seg1: [{ text: 'Happiness.' }] } },
    });

    await loadImports();
    expect((globalThis as { __ARISTOTLE_EXTRA_TRANSLATIONS__?: Record<string, unknown[]> })
      .__ARISTOTLE_EXTRA_TRANSLATIONS__?.ethics[0]).toMatchObject({
      id: 'jane-doe-ethics',
      name: 'Jane Doe (1901) ⓘ',
      short: 'Jane Doe',
      slot: 'overlay',
    });
  });

  it('rejects malformed imports and collisions without replacing stored maps', async () => {
    const { ImportCollision, runImport } = await import('../lib/imports');

    await expect(runImport({
      raw: 'No tags here.',
      work: 'ethics',
      translator: 'Jane Doe',
      license: 'user-supplied',
    })).rejects.toThrow('No {book.chapter} tags found');

    await runImport({
      raw: '{1.1}Happiness.',
      work: 'ethics',
      translator: 'Jane Doe',
      license: 'user-supplied',
    });
    await expect(runImport({
      raw: '{1.1}Second copy.',
      work: 'ethics',
      translator: 'Jane Doe',
      license: 'user-supplied',
    })).rejects.toBeInstanceOf(ImportCollision);
  });
});

describe('exportLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('builds a clean browser export summary with annotations and imported maps', async () => {
    const { exportLibrary } = await import('../lib/export');
    const clicks: string[] = [];
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:library');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function clickAnchor(this: HTMLAnchorElement) {
      clicks.push(this.download);
    });

    localStorage.setItem('annotations:ethics', JSON.stringify([
      { id: 'ann-1', work: 'ethics', created: '2026-01-01T00:00:00.000Z', body: '', layer: 'greek', exact: 'logos', target: { kind: 'greek', book: 1, start: { column: '1094a', line: 1, word: 0 }, end: { column: '1094a', line: 1, word: 0 } } },
    ]));
    localStorage.setItem('import-map:ethics/custom', JSON.stringify({ meta: { id: 'custom' }, stats: { tagged: 1 } }));

    await expect(exportLibrary()).resolves.toBe('1 annotation, 1 imported translation');
    expect(clicks[0]).toMatch(/^aristotle-reader-library-\d{4}-\d{2}-\d{2}\.json$/);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:library');

    click.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});
