// When each grouping is offered (John, 13 Nov): by form for one word or a
// phrase searched as spelled, by grammar for a dictionary-word search, and
// otherwise by work alone.
import { describe, expect, it } from 'vitest';
import { searchKind, viewsOffered, type SearchShape } from '../lib/result-views';

const shape = (over: Partial<SearchShape>): SearchShape => ({
  grk: '', grkMode: 'all', matchMode: 'lemma', lemmas: [], combo: null, ...over,
});

describe('searchKind and viewsOffered', () => {
  const cases: [string, Partial<SearchShape>, string, string[]][] = [
    ['one word, any form', { grk: 'ἀρετή' }, 'word', ['page', 'form']],
    ['one word, only as typed', { grk: 'ἀρετή', matchMode: 'form' }, 'word', ['page', 'form']],
    ['one word under Match "phrase"', { grk: 'ἀρετή', grkMode: 'phrase' }, 'word', ['page', 'form']],
    ['an exact phrase', { grk: 'τὸ τί ἦν εἶναι', grkMode: 'phrase', matchMode: 'form' }, 'phrase', ['page', 'form']],
    ['an exact phrase, any form', { grk: 'τὸ τί ἦν εἶναι', grkMode: 'phrase' }, 'phrase', ['page', 'form']],
    ['running text', { grk: 'τὸ τί ἦν', matchMode: 'text' }, 'phrase', ['page', 'form']],
    ['one headword', { grk: 'ἀρετή', lemmas: ['areth'] }, 'lemma', ['page', 'grammar']],
    ['several headwords (always "any")', { lemmas: ['areth', 'ecis'] }, 'lemma', ['page', 'grammar']],
    ['several words, Match "all"', { grk: 'ἀρετή ἕξις' }, 'words', ['page']],
    ['several words, Match "any"', { grk: 'ἀρετή ἕξις', grkMode: 'any' }, 'words', ['page']],
    ['a proximity search', { combo: { slots: [] } }, 'proximity', ['page']],
    ['English alone', { grk: '' }, 'english', ['page']],
  ];
  for (const [name, over, kind, views] of cases) {
    it(`${name}: ${views.join(', ')}`, () => {
      expect(searchKind(shape(over))).toBe(kind);
      expect(viewsOffered(searchKind(shape(over)))).toEqual(views);
    });
  }

  it('reads a proximity search first, whatever the box holds', () => {
    expect(searchKind(shape({ grk: 'ἀρετή', lemmas: ['areth'], combo: { slots: [] } }))).toBe('proximity');
  });
});
