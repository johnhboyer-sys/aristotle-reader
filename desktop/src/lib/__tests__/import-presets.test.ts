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
      footnotePlacement: 'page-bottom',
      strayNumeralStyle: 'roman',
    });
    expect(getPublisherPreset('peripatetic')).toEqual({
      presetId: 'peripatetic',
      headingStyle: { bookOrdinal: 'greek-letter', chapterNumeral: 'bare' },
      side: 'verso',
      endnotes: { source: 'witness-commentary' },
      witnessStructure: { format: 'genie-markdown' },
      footnotePlacement: 'endnote',
      strayNumeralStyle: 'arabic',
    });
    expect(getPublisherPreset('clarendon').interiorRunningHeads?.pattern).toBeUndefined();
    expect(getPublisherPreset('peripatetic').interiorRunningHeads?.pattern).toBeUndefined();
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
