import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchChaptersMock = vi.hoisted(() => vi.fn());

vi.mock('@shared/lib/data', () => ({ fetchChapters: fetchChaptersMock }));
vi.mock('@shared/lib/works', () => ({
  WORKS: [
    { id: 'Synthetic', title: 'Synthetic Work', books: 2, bookLabels: ['I', 'II'] },
  ],
}));

import {
  DEFAULT_PUBLISHER_PRESET_ID,
  PUBLISHER_PRESETS,
  getPublisherPreset,
  resolveLayoutImportConfig,
  resolveWorkStructure,
} from '../import-presets';

const ref = (chapter: number, bekker: string) => ({
  chapter: String(chapter),
  column: bekker.match(/\d+[ab]/u)?.[0] ?? '',
  line: '1',
  bekker,
});

describe('publisher preset registry', () => {
  it('ships the ruled defaults and keeps Other as the empty identity default', () => {
    expect(DEFAULT_PUBLISHER_PRESET_ID).toBe('other');
    expect(PUBLISHER_PRESETS.map(option => option.id)).toEqual(['other', 'clarendon', 'peripatetic']);
    expect(getPublisherPreset('other')).toEqual({});
    expect(getPublisherPreset('clarendon')).toEqual({
      presetId: 'clarendon',
      runningHeadPlaceholder: 'work-title',
      footnotePlacement: 'page-bottom',
      strayNumeralStyle: 'roman',
      spacing: { enabled: true },
      footnotes: { enabled: true },
      editionDefaults: {
        chapterTitles: false,
        slice: {
          bodyStart: '^\\s{5,}BOOK\\s+([A-Z]+|\\d{1,2})\\s*$',
          bodyStartNextLine: '^\\s{2,}CHAPTER\\s+\\S{1,4}\\s*$',
          trimBodyStartPreamble: true,
          backMatterStart: '^\\s*COMMENTARY\\s*$',
        },
      },
    });
    expect(getPublisherPreset('peripatetic')).toEqual({
      presetId: 'peripatetic',
      runningHeadPlaceholder: 'work-title',
      headingStyle: { bookOrdinal: 'greek-letter', chapterNumeral: 'bare' },
      side: 'verso',
      endnotes: { source: 'witness-commentary' },
      witnessStructure: { format: 'genie-markdown' },
      footnotePlacement: 'endnote',
      strayNumeralStyle: 'arabic',
      spacing: { enabled: true },
      footnotes: { enabled: true },
      editionDefaults: {
        chapterTitles: false,
        slice: {
          bodyStart: '^\\s{5,}BOOK\\s+\\S{1,2}\\s*$',
          backMatterStart: '^\\s*COMMENTARIES(?:\\s+ON\\b.*)?\\s*$',
        },
      },
    });
    expect(getPublisherPreset('clarendon').interiorRunningHeads?.pattern).toBeUndefined();
    expect(getPublisherPreset('peripatetic').interiorRunningHeads?.pattern).toBeUndefined();
    const peripateticSlice = getPublisherPreset('peripatetic').editionDefaults?.slice;
    if (!peripateticSlice) throw new Error('Peripatetic slice default missing');
    expect(new RegExp(peripateticSlice.bodyStart).test('     BOOK A')).toBe(true);
  });
});

describe('layout import config resolver', () => {
  const structure = {
    workId: 'Synthetic',
    workTitle: 'Synthetic Work',
    runningHeadPlaceholder: 'Synthetic Work',
    books: 2,
    bookLabels: ['I', 'II'],
    chaptersPerBook: [2, 1],
    chapterKeysByBook: { 1: [1, 2], 2: [1] },
    bekkerStart: '100a',
    bekkerEnd: '101b',
  };

  it('leaves every stage-specific format field absent for Other', () => {
    expect(resolveLayoutImportConfig(getPublisherPreset('other'), {}, structure)).toEqual({
      workId: 'Synthetic',
      workTitle: 'Synthetic Work',
      books: 2,
      chaptersPerBook: [2, 1],
      bekkerStart: '100a',
      bekkerEnd: '101b',
    });
  });

  it('lets Edition values override preset defaults without changing the publisher', () => {
    const resolved = resolveLayoutImportConfig(getPublisherPreset('clarendon'), {
      chapterTitles: true,
      runningHeadPlaceholder: 'SYNTHETIC HEAD',
      slice: { bodyStart: '^START$', trimBodyStartPreamble: true },
    }, structure);

    expect(resolved).toMatchObject({
      presetId: 'clarendon',
      chapterTitles: true,
      runningHeadPlaceholder: 'SYNTHETIC HEAD',
      slice: { bodyStart: '^START$', trimBodyStartPreamble: true },
      spacing: { enabled: true },
      footnotes: { enabled: true },
    });
  });

  it('lets Edition turn off a publisher slice default', () => {
    const resolved = resolveLayoutImportConfig(
      getPublisherPreset('clarendon'),
      { slice: false },
      structure,
    );

    expect(resolved.slice).toBeUndefined();
    expect(resolved.presetId).toBe('clarendon');
  });
});

describe('work structure resolver', () => {
  beforeEach(() => fetchChaptersMock.mockReset());

  it('computes chapter counts and the full Bekker span from runtime chapters data', async () => {
    fetchChaptersMock.mockResolvedValue({
      '1': [ref(1, '100a1–100b12'), ref(2, '100b13–101a5')],
      '2': [ref(1, '101a6–101b20')],
    });

    await expect(resolveWorkStructure('Synthetic')).resolves.toEqual({
      workId: 'Synthetic',
      workTitle: 'Synthetic Work',
      runningHeadPlaceholder: 'Synthetic Work',
      books: 2,
      bookLabels: ['I', 'II'],
      chaptersPerBook: [2, 1],
      chapterKeysByBook: { 1: [1, 2], 2: [1] },
      bekkerStart: '100a',
      bekkerEnd: '101b',
    });
    expect(fetchChaptersMock).toHaveBeenCalledWith('Synthetic');
  });

  it('fails loud when chapters data omits a declared book', async () => {
    fetchChaptersMock.mockResolvedValue({ '1': [ref(1, '100a1–100b2')] });

    await expect(resolveWorkStructure('Synthetic')).rejects.toThrow(
      'WORKS declares 2 books, but chapters.json covers 1',
    );
  });

  it('fails loud when a covered book has no chapters', async () => {
    fetchChaptersMock.mockResolvedValue({
      '1': [ref(1, '100a1–100b2')],
      '2': [],
    });

    await expect(resolveWorkStructure('Synthetic')).rejects.toThrow(
      'chapters.json has no chapters for book 2',
    );
  });
});
