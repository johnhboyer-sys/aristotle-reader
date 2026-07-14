import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, segmentSentences } from '../sentenceSegment';
import { isValidSplitOffset } from '../../chapterfile';

describe('segmentSentences — English prose', () => {
  it('splits a simple two-sentence paragraph', () => {
    const text = 'This is one sentence. This is another.';
    const offsets = segmentSentences(text);
    expect(offsets).toEqual([text.indexOf('This is another')]);
    expect(text.slice(0, offsets[0])).toBe('This is one sentence. ');
    expect(text.slice(offsets[0])).toBe('This is another.');
  });

  it('splits on !, ?, and ;', () => {
    const text = 'Stop right there! Who goes there? Halt; identify yourself.';
    const offsets = segmentSentences(text);
    for (const o of offsets) {
      expect(/[\p{L}\p{M}]/u.test(text[o])).toBe(true);
      expect(/[\p{L}\p{M}]/u.test(text[o - 1])).toBe(false);
    }
    expect(offsets.length).toBe(3);
  });

  it('does not split on abbreviations (cf., e.g., Dr., etc.)', () => {
    const text = 'See the note, cf. p. 12 for details. Dr. Smith agreed, e.g. in his letter.';
    const offsets = segmentSentences(text);
    // The only real sentence boundary is after "for details." — every
    // abbreviation period (cf., p., Dr., e.g.) must be suppressed.
    expect(offsets).toEqual([text.indexOf('Dr. Smith')]);
  });

  it('does not split a single-letter initial ("A. Smith wrote...")', () => {
    const text = 'A. Smith wrote the letter.';
    const offsets = segmentSentences(text);
    expect(offsets).toEqual([]);
  });

  it('does not split a decimal number (3.14)', () => {
    const text = 'The value of pi is roughly 3.14 in most calculations.';
    expect(segmentSentences(text)).toEqual([]);
  });

  it('splits after a sentence ending in a closing quote', () => {
    const text = 'He said, "I will go." Then he left.';
    const offsets = segmentSentences(text);
    expect(offsets).toEqual([text.indexOf('Then he left')]);
  });

  it('splits after a sentence ending in a closing bracket', () => {
    const text = 'This is true (as shown above). Another point follows.';
    const offsets = segmentSentences(text);
    expect(offsets).toEqual([text.indexOf('Another point follows')]);
  });

  it('collapses runs of terminators (e.g. "?!" or "...") into one boundary', () => {
    const text = 'What is happening?! I have no idea. Truly...  None at all.';
    const offsets = segmentSentences(text);
    expect(offsets).toContain(text.indexOf('I have no idea'));
    expect(offsets).toContain(text.indexOf('None at all'));
  });

  it('no terminator at all yields no offsets', () => {
    expect(segmentSentences('just one clause with no ending punctuation')).toEqual([]);
  });

  it('a trailing terminator at end of text yields no internal offset', () => {
    expect(segmentSentences('Only one sentence here.')).toEqual([]);
  });

  it('is conservative with multiple abbreviations and decimals mixed together', () => {
    const text = 'Cf. fig. 3.14 vs. the earlier estimate, e.g. p. 9. The next chapter begins here.';
    const offsets = segmentSentences(text);
    expect(offsets).toEqual([text.indexOf('The next chapter begins here')]);
  });
});

describe('segmentSentences — Greek prose', () => {
  // Real polytonic Greek borrowed from existing workbench test fixtures
  // (assist/__tests__/prompt.test.ts, chapterfile/__tests__/parse.test.ts).
  it('splits on the ano teleia (U+0387)', () => {
    const text = 'τὸ αἴτιον· καὶ ἡ ἀρχή ἐστιν.';
    const offsets = segmentSentences(text);
    expect(offsets).toEqual([text.indexOf('καὶ')]);
  });

  it('splits on the ano teleia lookalike middle dot (U+00B7)', () => {
    const text = 'τὸ αἴτιον· καὶ ἡ ἀρχή ἐστιν.';
    const offsets = segmentSentences(text);
    expect(offsets).toEqual([text.indexOf('καὶ')]);
  });

  it('splits on the Greek question mark U+037E (visually a semicolon)', () => {
    const text = 'διὰ τί ὕλη τὶς τόδε τὶ ἐστιν; πάλιν ἐπανέλθωμεν.';
    const offsets = segmentSentences(text);
    expect(offsets).toEqual([text.indexOf('πάλιν')]);
  });

  it('splits on an ordinary semicolon the same way as the Greek question mark', () => {
    const text = 'διὰ τί ὕλη τὶς τόδε τὶ ἐστιν; πάλιν ἐπανέλθωμεν.';
    const offsets = segmentSentences(text);
    expect(offsets).toEqual([text.indexOf('πάλιν')]);
  });

  it('splits a multi-sentence Greek paragraph on period + ano teleia together', () => {
    const text = 'ἔστω δὴ σαφὲς τοῦτο. τὸ γὰρ τί ἦν εἶναι· πρῶτον οὖν εἴπωμεν.';
    const offsets = segmentSentences(text);
    expect(offsets).toEqual([text.indexOf('τὸ γὰρ'), text.indexOf('πρῶτον')]);
  });
});

describe('segmentSentences — compatibility with isValidSplitOffset (gridRows validator)', () => {
  const corpus = [
    'This is one sentence. This is another. And a third one follows here.',
    'See the note, cf. p. 12 for details. Dr. Smith agreed, e.g. in his letter.',
    'A. Smith wrote the letter. B. Jones replied.',
    'The value of pi is roughly 3.14 in most calculations. It is well known.',
    'He said, "I will go." Then he left. She said, ‘Wait!’ He paused.',
    'τὸ αἴτιον· καὶ ἡ ἀρχή ἐστιν. ἔστω δὴ σαφὲς τοῦτο.',
    'διὰ τί ὕλη τὶς τόδε τὶ ἐστιν; πάλιν ἐπανέλθωμεν. τὸ γὰρ τί ἦν εἶναι· πρῶτον οὖν εἴπωμεν.',
    'Cf. fig. 3.14 vs. the earlier estimate, e.g. p. 9. The next chapter begins here! Truly?',
  ];

  it('every offset segmentSentences produces passes isValidSplitOffset on the same text', () => {
    for (const text of corpus) {
      const offsets = segmentSentences(text, DEFAULT_RULES);
      for (const offset of offsets) {
        expect(isValidSplitOffset(text, offset)).toBe(true);
      }
    }
  });
});

describe('segmentSentences — degenerate inputs', () => {
  it('empty text yields no offsets', () => {
    expect(segmentSentences('')).toEqual([]);
  });

  it('whitespace-only text yields no offsets', () => {
    expect(segmentSentences('   \n  ')).toEqual([]);
  });

  it('text that is only punctuation yields no offsets', () => {
    expect(segmentSentences('... !? ;;')).toEqual([]);
  });
});
