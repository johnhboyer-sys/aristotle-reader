import { describe, expect, it } from 'vitest';
import { alignChapter, checkRoundtrip, monotonicAlign, splitSentences, type ChapterInput } from '../lib/aligner/engine';
import { cosMatrix } from '../lib/aligner/similarity';

describe('aligner similarity', () => {
  it('scores lexical matches above unrelated sentences and handles empty matrices', () => {
    const scores = cosMatrix(
      ['virtue is a state concerned with choice'],
      ['virtue concerns choice', 'geometry studies triangles'],
    );

    expect(scores[0][0]).toBeGreaterThan(scores[0][1]);
    expect(cosMatrix([], ['x'])).toEqual([]);
    expect(cosMatrix(['x'], [])).toEqual([[]]);
  });
});

describe('aligner engine', () => {
  const chapter: ChapterInput = {
    book: 1,
    chapter: '1',
    citation: '1094a1',
    targetText: 'Virtue concerns choice. Happiness is complete activity. Friendship holds cities together.',
    refText: 'Virtue is a state about choice. Happiness is complete activity. Friendship holds cities together.',
    refAnchors: [
      { citation: '1094a1', off: 0, tier: 'chapter' },
      { citation: '1094a5', off: 32, tier: 'half_column' },
      { citation: '1094a10', off: 72, tier: 'half_column' },
    ],
    greekLines: [
      { citation: '1094a1', cumWords: 0 },
      { citation: '1094a5', cumWords: 5 },
      { citation: '1094a10', cumWords: 10 },
    ],
  };

  it('splits sentences with source offsets and finds a monotonic best path', () => {
    expect(splitSentences('First. Second!')).toEqual([[0, 'First.'], [7, 'Second!']]);
    expect(monotonicAlign([
      [0.9, 0.1, 0.0],
      [0.2, 0.8, 0.4],
    ])).toEqual([
      [0, 0, 0.9, 0.8],
      [1, 1, 0.8, 0.4],
    ]);
  });

  it('aligns tiny chapter fixtures and keeps offsets round-trippable', () => {
    const anchors = alignChapter(chapter);

    expect(anchors).toEqual([
      expect.objectContaining({ citation: '1094a1', offset: 0, tier: 'chapter', confidence: 'certain' }),
      expect.objectContaining({ citation: '1094a5', offset: 24, tier: 'half_column' }),
      expect.objectContaining({ citation: '1094a10', offset: 56, tier: 'half_column' }),
    ]);
    expect(() => checkRoundtrip(chapter, anchors)).not.toThrow();
  });

  it('applies manual overrides as confirmed anchors', () => {
    const anchors = alignChapter(chapter, { '1094a5': 30 });

    expect(anchors.find(a => a.citation === '1094a5')).toMatchObject({
      offset: 30,
      confidence: 'confirmed',
      flags: ['verified'],
    });
  });
});
