import { describe, expect, it } from 'vitest';
import type { BookData, FlowTurn, Segment } from '../lib/data';
import { englishSnippets, markEnglishHtml, markWordsHtml, translationTexts, turnTranslationTexts } from '../lib/english-hit';
import { englishQueryUnits, englishWords } from '../lib/search';

const seg = (column: string, text = ''): Segment => ({
  id: `1:${column}`, column, greek: [], english: text ? { text, notes: [], markers: [], bekker: [] } as unknown as Segment['english'] : null,
});
const turn = (column: string | null, ross?: string | null): FlowTurn => ({
  s: 'Socrates', d: 'Soc.', g: column ? { c: column, n: 1, o: 0 } : null, e: 'x', p: true,
  ...(ross !== undefined ? { alt: { ross: { e: ross } } } : {}),
});
const book = (turns: FlowTurn[]): Pick<BookData, 'segments' | 'turnFlow'> => ({
  segments: [seg('70a', 'Can you tell me, Socrates, whether virtue can be taught?'), seg('70b', 'EN, of old')],
  turnFlow: { leadE: null, turns },
});

describe('turnTranslationTexts', () => {
  // The same book the pipeline test files (test_translation_index.py): the
  // word positions a posting carries must count through these texts in this
  // order, or a hit lands on the wrong word.
  it('files a turn under the section its Greek starts in, in turn order', () => {
    const texts = turnTranslationTexts(book([
      turn('70a', 'Is virtue taught?'),
      turn('70a', 'I cannot say.'),
      turn('70b', 'Then let us ask.'),
    ]), 'ross');
    expect([...texts]).toEqual([
      ['1:70a', ['Is virtue taught?', 'I cannot say.']],
      ['1:70b', ['Then let us ask.']],
    ]);
    const words = texts.get('1:70a')!.flatMap(t => englishWords(t)).map(w => w.word);
    expect(words.indexOf('virtue')).toBe(1);
    expect(words.indexOf('cannot')).toBe(4);
  });

  it('puts a residual turn with the section before it, and the first ones in the book’s first', () => {
    const texts = turnTranslationTexts(book([turn(null, 'opening'), turn('70b', 'first'), turn(null, 'stray words')]), 'ross');
    expect([...texts]).toEqual([['1:70a', ['opening']], ['1:70b', ['first', 'stray words']]]);
  });

  it('skips a turn the translation has no text for, and a book with no turn flow', () => {
    expect([...turnTranslationTexts(book([turn('70a', null), turn('70b')]), 'ross')]).toEqual([]);
    expect(turnTranslationTexts({ segments: [seg('70a')], turnFlow: undefined }, 'ross').size).toBe(0);
  });
});

describe('translationTexts', () => {
  it('reads the primary off the segment and a turn-aligned overlay off the book', () => {
    const b = book([turn('70a', 'Is virtue taught?')]);
    const turns = turnTranslationTexts(b, 'ross');
    expect(translationTexts(b.segments[0], { id: 'rackham', slot: 'english' })).toEqual([b.segments[0].english!.text]);
    expect(translationTexts(b.segments[0], { id: 'ross', slot: 'overlay' }, turns)).toEqual(['Is virtue taught?']);
    expect(translationTexts(b.segments[1], { id: 'ross', slot: 'overlay' }, turns)).toEqual([]);
  });
});

describe('englishSnippets', () => {
  const texts = ['Is virtue taught, Socrates?', 'I cannot say whether virtue is taught.'];
  const words = texts.flatMap(t => englishWords(t)).map(w => w.word);

  it('marks the words at the index’s positions, in the text they fall in', () => {
    const at = words.indexOf('cannot');
    expect(englishSnippets(texts, [at], [['cannot']], false)).toEqual(['I <mark>cannot</mark> say whether virtue is taught']);
  });

  it('marks the whole run of a phrase and only that run', () => {
    const start = words.lastIndexOf('virtue');
    expect(englishSnippets(texts, [start, start + 1], [['virtue'], ['is']], true))
      .toEqual(['I cannot say whether <mark>virtue</mark> <mark>is</mark> taught']);
  });

  it('finds the words itself when the positions are missing or do not fit', () => {
    const both = ['Is virtue <mark>taught</mark>, Socrates', 'I cannot say whether virtue is <mark>taught</mark>'];
    expect(englishSnippets(texts, [], [['taught']], false)).toEqual(both);
    expect(englishSnippets(texts, [999], [['taught']], false)).toEqual(both);
  });

  it('marks the form an any-form search found', () => {
    const t = ['the virtues of men'];
    expect(englishSnippets(t, [3], [['man']], false, true)).toEqual(['the virtues of <mark>men</mark>']);
  });

  it('shows no apparatus, and is null where the translation has no text', () => {
    expect(englishSnippets(['his emotions,[^1.9] his [[s3]] study'], [1], [['emotions']], false))
      .toEqual(['his <mark>emotions</mark>, his study']);
    expect(englishSnippets([], [0], [['a']], false)).toEqual([]);
    expect(englishSnippets([''], [0], [['a']], false)).toEqual([]);
  });

  // The results count every word the index matched (engHitCount), so every
  // one of them must be shown: a section whose second match sits in another
  // speech was counted and never printed, in the results or the CSV.
  it('shows a match in every speech it falls in', () => {
    const first = words.indexOf('virtue');
    const second = words.lastIndexOf('virtue');
    expect(englishSnippets(texts, [first, second], [['virtue']], false)).toEqual([
      'Is <mark>virtue</mark> taught, Socrates',
      'I cannot say whether <mark>virtue</mark> is taught',
    ]);
  });

  it('gives a match beyond the first one’s window its own passage, and repeats no words', () => {
    const filler = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    const t = [`virtue ${filler} virtue end`];
    const at = englishWords(t[0]).map(w => w.word).flatMap((w, i) => (w === 'virtue' ? [i] : []));
    const got = englishSnippets(t, at, [['virtue']], false);
    expect(got).toHaveLength(2);
    expect(got[0]).toMatch(/^<mark>virtue<\/mark> w0 .* …$/);
    expect(got[1]).toMatch(/^… .* <mark>virtue<\/mark> end$/);
    // The second passage starts after the first one ends.
    const last = got[0].replace(/ …$/, '').split(' ').pop()!;
    expect(got[1].split(' ')).not.toContain(last);
  });

  it('never cuts a phrase between two passages', () => {
    const t = ['the good ' + 'x '.repeat(63) + 'the good'];
    const got = englishSnippets(t, [0, 1, 65, 66], [['the'], ['good']], true);
    expect(got.join(' | ').match(/<mark>the<\/mark> <mark>good<\/mark>/g)).toHaveLength(2);
    expect(got.some(h => /^… <mark>good<\/mark>/.test(h))).toBe(false);
  });

  it('finds every run of a phrase when the positions do not fit', () => {
    expect(englishSnippets(['the good', 'the good'], [1, 2, 3, 4], [['the'], ['good']], true)).toEqual([
      '<mark>the</mark> <mark>good</mark>',
      '<mark>the</mark> <mark>good</mark>',
    ]);
  });

  it('distrusts positions when any of them misses, not only the first', () => {
    // An index from another build: 0 still lands on "virtue", 3 on "This".
    expect(englishSnippets(['virtue goes here', 'This virtue wins'], [0, 3], [['virtue']], false)).toEqual([
      '<mark>virtue</mark> goes here',
      'This <mark>virtue</mark> wins',
    ]);
  });

  it('does not run a passage on through adjacent single-word matches', () => {
    const t = ['a ' + 'x '.repeat(68) + 'a '.repeat(1000)];
    const got = englishSnippets(t, [], [['a']], false);
    // A window's worth of marked words, about 70 of them; unbounded, the
    // passage swallowed all 1,000.
    expect(Math.max(...got.map(h => (h.match(/<mark>/g) ?? []).length))).toBeLessThan(100);
    expect(got.join(' ').match(/<mark>a<\/mark>/g)).toHaveLength(1001);
  });

  it('marks overlapping runs of a phrase, as the index finds them', () => {
    expect(englishSnippets(['a a a'], [99], [['a', 'a']], true)).toEqual(['<mark>a</mark> <mark>a</mark> <mark>a</mark>']);
  });

  it('distrusts positions that match the words but not the phrase', () => {
    expect(englishSnippets(['good the', 'the good'], [0, 1], [['the'], ['good']], true))
      .toEqual(['<mark>the</mark> <mark>good</mark>']);
  });

  it('keeps a hyphenated word’s parts together when it finds the words itself', () => {
    expect(englishSnippets(['coming slowly to be', 'coming-to-be'], [0, 1, 4, 5, 6], [['coming', 'to', 'be']], false))
      .toEqual(['<mark>coming</mark>-<mark>to</mark>-<mark>be</mark>']);
  });

  it('marks nothing for the bare *, and shows the text’s head', () => {
    expect(englishSnippets(['the good'], [], [['*']], false)).toEqual(['the good']);
  });

  it('finishes the run at the window’s edge, whatever the longest unit', () => {
    const t = ['c d e ' + 'x '.repeat(66) + 'a b a b'];
    const got = englishSnippets(t, [0, 1, 2, 69, 70, 71, 72], [['c', 'd', 'e'], ['a', 'b']], false);
    expect(got.some(h => /^… <mark>b<\/mark>/.test(h))).toBe(false);
    expect(got.join(' ').match(/<mark>/g)).toHaveLength(7);
  });

  it('finishes runs that overlap at the window’s edge', () => {
    const got = englishSnippets(['q ' + 'x '.repeat(68) + 'a b c'], [], [['q'], ['a', 'b'], ['b', 'c']], false);
    expect(got.some(h => /^… <mark>c<\/mark>/.test(h))).toBe(false);
    expect(got.join(' ').match(/<mark>/g)).toHaveLength(4);
  });

  it('trusts a phrase the index found across two speeches', () => {
    // The index counts a section's words straight through its speeches.
    // The third speech holds the phrase too; the index did not put this hit
    // there, so no passage is drawn from it, as a fallback would draw one.
    expect(englishSnippets(['the', 'good', 'the good'], [0, 1], [['the'], ['good']], true))
      .toEqual(['<mark>the</mark>', '<mark>good</mark>']);
  });

  it('keeps two matches in one window in one passage', () => {
    expect(englishSnippets(['virtue and virtue'], [0, 2], [['virtue']], false))
      .toEqual(['<mark>virtue</mark> and <mark>virtue</mark>']);
  });

});

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
    expect(mark('isn’t emotions', 'it isn’t emotions,[^1.9] his'))
      .toBe('it <mark>isn’t</mark> <mark>emotions</mark>,[^1.9] his');
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

describe('markWordsHtml', () => {
  it('marks the words at the positions given, and no other match of them', () => {
    expect(markWordsHtml('virtue, and virtue < all', new Set([2])))
      .toBe('virtue, and <mark>virtue</mark> &lt; all');
  });

  it('counts words as the index does, and leaves out footnote and sidenote markers as a snippet does', () => {
    // The footnote does not end the word; the sidenote is not a word.
    expect(markWordsHtml('it isn’t[^1.9] so [[s2]] good', new Set([1, 3])))
      .toBe('it <mark>isn’t</mark> so <mark>good</mark>');
  });

  it('marks nothing for no positions', () => {
    expect(markWordsHtml('a & b', new Set())).toBe('a &amp; b');
  });
});
