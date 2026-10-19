import { describe, expect, it } from 'vitest';
import type { Segment } from '../lib/data';
import { englishPlace, markEnglishHtml, overlayPieces, positionsByChapter } from '../lib/english-hit';
import { englishQueryUnits, englishWords } from '../lib/search';

const rackham = { id: 'rackham', slot: 'english' as const };
const ross = { id: 'ross', slot: 'secondary' as const };
const ostwald = { id: 'ostwald', slot: 'third' as const };
const peters = { id: 'peters', slot: 'overlay' as const };

const lines = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ n: from + i, text: '', tokens: [] }));

// 1095a, lines 1–30; chapter 4 begins at line 14. Ross carries the tail of
// chapter 3 and the head of chapter 4 as two slices.
const seg: Segment = {
  id: '1:1095a',
  column: '1095a',
  greek: lines(1, 30),
  chapterStarts: [{ chapter: '4', beforeLine: 14, wordIndex: 0, engOffset: 40, bekker: '1095a14–1095b13' }],
  english: {
    text: 'The young are not fit to study politics. Let us resume: every inquiry aims at some good.',
    notes: [],
    markers: [],
    bekker: [{ n: 1, offset: 0, real: true }, { n: 14, offset: 40, real: false }, { n: 30, offset: 88, real: true }],
  },
  ross: [
    { chapter: '3', cont: true, text: 'a young man is not a proper hearer of lectures.' },
    {
      chapter: '4',
      cont: false,
      text: 'Let us resume our inquiry and state the good,[^1.9] what is the highest of all goods.',
      bekker: [{ n: 14, offset: 0, real: true }, { n: 24, offset: 84, real: false }],
    },
  ],
  third: [{ chapter: '4', cont: false, text: 'what is the good[[s3]]life of man' }],
};

describe('englishPlace', () => {
  it('places a hit in the slice its word position falls in, and names that chapter', () => {
    // Ross's word 10 is "our" counted from the first slice: 10 words precede the
    // second slice's "let us resume our".
    const words = englishWords(seg.ross![0].text).length;
    const place = englishPlace(seg, ross, [words + 3], ['our'], false)!;
    expect(place.chapter).toBe('4');
    expect(place.html).toContain('<mark>our</mark>');
    // The snippet stays inside chapter 4's slice.
    expect(place.html).not.toContain('lectures');
    // "our" stands 14 characters into a slice whose ticks run 14 → 24 over 84.
    expect(place.line).toBe(15);
  });

  it('reads the Bekker line off the slice’s ticks, between two of them', () => {
    const text = seg.ross![1].text;
    const at = text.indexOf('highest');
    const pos = englishWords(seg.ross![0].text).length
      + englishWords(text).findIndex((w) => w.word === 'highest');
    const place = englishPlace(seg, ross, [pos], ['highest'], false)!;
    expect(place.line).toBe(14 + Math.floor((at * 10) / 84));
  });

  it('places a primary hit in the chapter whose start precedes it', () => {
    const early = englishPlace(seg, rackham, [1], ['young'], false)!;
    expect(early.chapter).toBeNull();          // before chapter 4 begins in this column
    expect(early.line).toBe(2);              // 4 of 40 characters into lines 1 → 14
    const late = englishPlace(seg, rackham, [11], ['every'], false)!;
    expect(late.chapter).toBe('4');
    expect(late.html).toContain('<mark>every</mark>');
  });

  it('marks the whole run of a phrase and only that run', () => {
    const place = englishPlace(seg, rackham, [13, 14], ['some', 'good'], true)!;
    expect(place.html).toContain('<mark>some</mark> <mark>good</mark>');
  });

  it('shows no apparatus: footnote markers drop, sidenotes leave a space', () => {
    const r = englishPlace(seg, ross, [], ['good'], false)!;
    expect(r.html).not.toContain('[^');
    expect(r.html).toContain('<mark>good</mark>,');
    const o = englishPlace(seg, ostwald, [3, 4], ['good', 'life'], true)!;
    expect(o.html).toBe('what is the <mark>good</mark> <mark>life</mark> of man');
  });

  it('finds the words itself when the positions are missing or do not fit', () => {
    // An older primary index (no positions) and one from a different build.
    for (const positions of [[], [2]]) {
      const place = englishPlace(seg, rackham, positions, ['politics'], false)!;
      expect(place.html).toContain('<mark>politics</mark>');
    }
    const phrase = englishPlace(seg, ross, [], ['the', 'good'], true)!;
    expect(phrase.html).toContain('<mark>the</mark> <mark>good</mark>');
    expect(phrase.chapter).toBe('4');
  });

  it('falls back to the chapter start for a slice with no ticks', () => {
    const place = englishPlace(seg, ostwald, [4], ['life'], false)!;
    expect(place.line).toBe(14);
  });

  it('marks the form an any-form search found where the index says it stands', () => {
    const text = seg.ross![1].text;
    const pos = englishWords(seg.ross![0].text).length
      + englishWords(text).findIndex((w) => w.word === 'goods');
    expect(englishPlace(seg, ross, [pos], ['good'], false, true)!.html).toContain('<mark>goods</mark>');
    // Exact, "goods" is not the word typed, so the position is not trusted.
    expect(englishPlace(seg, ross, [pos], ['good'], false)!.html).not.toContain('<mark>goods</mark>');
  });

  it('is null for a translation with no text in the segment', () => {
    expect(englishPlace(seg, peters, [0], ['virtue'], false)).toBeNull();
  });
});

describe('overlayPieces', () => {
  it('reads each slot’s field, and the legacy name of the secondary', () => {
    expect(overlayPieces(seg, ross)).toBe(seg.ross);
    expect(overlayPieces({ ...seg, secondary: [] }, ross)).toEqual([]);
    expect(overlayPieces(seg, ostwald)).toBe(seg.third);
    expect(overlayPieces({ ...seg, overlays: { peters: seg.third! } }, peters)).toBe(seg.third);
    expect(overlayPieces(seg, rackham)).toEqual([]);
  });
});

// The reader's highlight, by the search's own rule.
describe('markEnglishHtml', () => {
  const mark = (query: string, text: string, phrase = false, forms = false) =>
    markEnglishHtml(text, englishQueryUnits(query), phrase, forms);

  it('marks whole words, not every word a term begins', () => {
    expect(mark('end', 'the end, not the ending we endure'))
      .toBe('the <mark>end</mark>, not the ending we endure');
    expect(mark('end*', 'the end and the ending')).toBe('the <mark>end</mark> and the <mark>ending</mark>');
  });

  it('in an exact phrase marks only the run', () => {
    expect(mark('the good', 'they say the good is there, and the end is good', true))
      .toBe('they say <mark>the</mark> <mark>good</mark> is there, and the end is good');
  });

  it('marks a hyphenated term where its words stand together', () => {
    expect(mark('coming-to-be', 'coming-to-be, or coming slowly to be'))
      .toBe('<mark>coming</mark>-<mark>to</mark>-<mark>be</mark>, or coming slowly to be');
  });

  it('marks a word with an apostrophe or across a footnote marker, and leaves the marker as text', () => {
    expect(mark('aristotle’s emotions', 'Aristotle’s emotions,[^1.9] his'))
      .toBe('<mark>Aristotle’s</mark> <mark>emotions</mark>,[^1.9] his');
  });

  it('marks every form of a word for an any-form search, and nothing that only begins like it', () => {
    const text = 'the men’s virtues and a man’s virtue, not manly or virtuous';
    expect(mark('man virtue', text, false, true))
      .toBe('the <mark>men’s</mark> <mark>virtues</mark> and a <mark>man’s</mark> <mark>virtue</mark>, not manly or virtuous');
    expect(mark('man virtue', text)).toBe('the men’s virtues and a man’s <mark>virtue</mark>, not manly or virtuous');
  });

  it('marks a word the page prints with a ligature or an accent', () => {
    expect(mark('lacedaemonians', 'the Lacedæmonians')).toBe('the <mark>Lacedæmonians</mark>');
    expect(mark('Lacedæmonians versa', 'vice versâ, Lacedæmonians')).toBe('vice <mark>versâ</mark>, <mark>Lacedæmonians</mark>');
  });

  it('marks nothing for no query, or the bare *', () => {
    expect(mark('', 'a < b')).toBe('a &lt; b');
    expect(mark('*', 'a < b')).toBe('a &lt; b');
  });
});

describe('positionsByChapter', () => {
  // Every word position of "the" (or "a") in a translation's text here.
  const at = (t: typeof ross | typeof rackham, word: string) => {
    const texts = overlayPieces(seg, t).map(p => p.text);
    const words = (t.slot === 'english' ? [seg.english!.text] : texts).flatMap(x => englishWords(x));
    return words.flatMap((w, i) => (w.word === word ? [i] : []));
  };

  it('splits a slice-carrying translation at its slices', () => {
    // "a" twice in chapter 3's slice, "the" twice in chapter 4's.
    const hits = [...at(ross, 'a'), ...at(ross, 'the')].sort((x, y) => x - y);
    expect(positionsByChapter(seg, ross, hits)).toEqual([at(ross, 'a'), at(ross, 'the')]);
  });

  it('splits the primary at its chapter starts', () => {
    // "to" before the chapter 4 start, "at" after it.
    const before = at(rackham, 'to');
    const after = at(rackham, 'at');
    expect(positionsByChapter(seg, rackham, [...before, ...after])).toEqual([before, after]);
  });

  it('leaves positions together when they do not fit the text', () => {
    expect(positionsByChapter(seg, ross, [1, 999])).toEqual([[1, 999]]);
    expect(positionsByChapter(seg, ross, [])).toEqual([[]]);
  });
});
