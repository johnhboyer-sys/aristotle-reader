import { describe, expect, it } from 'vitest';
import { alignImportedChapter } from '../import-align';
import type { ChapterInput } from '../engine';
import type { InlineTag } from '../../translation-file';

// A chapter whose only real anchor is its column-start 81a1, but whose Greek
// reference carries a full 5-line milestone set 81a1..81a40 (the Greek column
// has 40 lines). fillChapterTail extrapolates the whole tail — including an
// 81a40 estimate the printed English column never shows (seating-pass §2).
function chapterInput(): ChapterInput {
  const greekLines = [1, 5, 10, 15, 20, 25, 30, 35, 40].map((n, i) => ({
    citation: `81a${n}`,
    cumWords: i * 10,
  }));
  return {
    book: 2,
    chapter: '30',
    citation: '81a1',
    targetText: Array.from({ length: 200 }, (_, i) => `word${i}`).join(' '),
    refText: '',
    refAnchors: [{ citation: '81a1', off: 0, tier: 'chapter' }],
    greekLines,
  };
}

const tags: InlineTag[] = [{ kind: 'column', raw: '81a', offset: 0, column: '81a', citation: '81a1' }];

describe('NOTICK — fillChapterTail phantom line-40', () => {
  it('extrapolates a phantom 81a40 with no NOTICK set (the defect)', () => {
    const ca = alignImportedChapter(chapterInput(), tags, 'five-line-or-column');
    expect(ca.anchors.some(a => a.citation === '81a40' && a.confidence === 'interpolated')).toBe(true);
  });

  it('drops the phantom 81a40 when NOTICK names it, keeping the earlier 5-line ticks', () => {
    const ca = alignImportedChapter(chapterInput(), tags, 'five-line-or-column', [], [], new Set(['81a40']));
    expect(ca.anchors.some(a => a.citation === '81a40')).toBe(false);
    expect(ca.anchors.some(a => a.citation === '81a35' && a.confidence === 'interpolated')).toBe(true);
  });

  it('never removes a real (tagged) tick even if the column is listed', () => {
    const tagged: InlineTag[] = [
      ...tags,
      { kind: 'line', raw: '40', offset: 300, column: '81a', line: 40, citation: '81a40' },
    ];
    const ca = alignImportedChapter(chapterInput(), tagged, 'five-line-or-column', [], [], new Set(['81a40']));
    expect(ca.anchors.some(a => a.citation === '81a40' && a.confidence === 'tagged')).toBe(true);
  });
});
