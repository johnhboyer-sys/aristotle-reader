// The phrase list (John, 16 Nov): three-word runs that hold a hit, five hits
// or more, set aside only; setting one aside lowers the phrases that overlap it.
import { describe, expect, it } from 'vitest';
import { phraseRows, phraseText, runsAt, setAside, type PhraseHit } from '../lib/phrase-list';

// Each passage's hits: the place of every "virtue" in it.
const hitsIn = (...passages: string[]): PhraseHit[] => passages.flatMap(p => {
  const text = phraseText([p]);
  return text.words.flatMap((w, at) => (w === 'virtue' ? [{ text, at }] : []));
});

describe('phrase list', () => {
  it('takes the three-word runs that hold the hit, not across a sentence mark', () => {
    const text = phraseText(['He acts in virtue of the soul.']);
    expect(runsAt(text, 3)).toEqual(['acts in virtue', 'in virtue of', 'virtue of the']);
    const stop = phraseText(['It is virtue. Of the rest']);
    expect(runsAt(stop, 2)).toEqual(['it is virtue']);
    // Counted on through a passage's pieces, as the index counts them: one
    // text, so a run joins two pieces unless a sentence mark parts them.
    const pieces = phraseText(['one two', 'virtue three four']);
    expect(pieces.words).toEqual(['one', 'two', 'virtue', 'three', 'four']);
    expect(runsAt(pieces, 2)).toEqual(['one two virtue', 'two virtue three', 'virtue three four']);
    expect(runsAt(phraseText(['one two.', 'virtue three four']), 2)).toEqual(['virtue three four']);
    expect(runsAt(phraseText(['one two', '. virtue three four']), 2)).toEqual(['virtue three four']);
  });

  it('offers runs five hits or more stand in, most first, then A–Z', () => {
    const hits = hitsIn(...Array(6).fill('in virtue of the soul'), ...Array(5).fill('moral virtue is best'), ...Array(4).fill('by virtue of law'));
    expect(phraseRows(hits, new Set())).toEqual([
      { phrase: 'virtue of the', n: 6 }, { phrase: 'in virtue of', n: 6 },
      { phrase: 'moral virtue is', n: 5 }, { phrase: 'virtue is best', n: 5 },
    ].sort((a, b) => b.n - a.n || a.phrase.localeCompare(b.phrase)));
  });

  // "virtue of the" 108 → 60 with "in virtue of" set aside (John, 16 Nov).
  it('lowers the phrases a set-aside one overlaps, keeping every row in its place', () => {
    const hits = hitsIn(...Array(5).fill('in virtue of the soul'), ...Array(5).fill('the virtue of the city'));
    const before = phraseRows(hits, new Set());
    const after = phraseRows(hits, new Set(['in virtue of']));
    expect(after.map(r => r.phrase)).toEqual(before.map(r => r.phrase));
    const n = (rows: typeof after, p: string) => rows.find(r => r.phrase === p)!.n;
    expect(n(before, 'virtue of the')).toBe(10);
    expect(n(after, 'virtue of the')).toBe(5);
    // The phrase set aside keeps its own count: the hits it took out.
    expect(n(after, 'in virtue of')).toBe(5);
    expect(n(after, 'the virtue of')).toBe(5);
  });

  it('sets aside a hit inside any phrase set aside', () => {
    const [inside, outside] = hitsIn('in virtue of the soul', 'moral virtue and wisdom');
    expect(setAside(inside, new Set(['in virtue of']))).toBe(true);
    expect(setAside(outside, new Set(['in virtue of']))).toBe(false);
    expect(setAside(inside, new Set())).toBe(false);
  });
});
