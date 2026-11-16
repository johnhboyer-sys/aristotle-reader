// The reader's ?hlt= marks: positions count a segment's tokens, and one past
// its last counts on into the next (a running-text match across a section).
import { describe, expect, it } from 'vitest';
import { hitTokens, type Segment } from '../lib/data';

const seg = (column: string, words: string[]): Segment => ({
  id: `1:${column}`, column, english: null,
  greek: [{ n: 1, text: words.join(' '), tokens: words.map(t => ({ t })) }],
} as unknown as Segment);

describe('hitTokens', () => {
  const segments = [seg('17a', ['ὅτι', 'οὖν']), seg('17b', ['καὶ', 'ὡς'])];
  const marked = (positions: number[]) => [...hitTokens(segments, '17a', positions)].map(t => t.t);

  it('marks a segment\'s own tokens', () => {
    expect(marked([1])).toEqual(['οὖν']);
  });

  it('counts on into the next segment past the last token', () => {
    expect(marked([1, 2])).toEqual(['οὖν', 'καὶ']);
    expect([...hitTokens(segments, '17b', [0])].map(t => t.t)).toEqual(['καὶ']);
  });
});
