// The popup's word class and "Less likely" readings (John, 2026-11-10: P2 and
// U2, "dialect rule + short list"; the dimmed card at three-quarter strength).
import { describe, expect, it } from 'vitest';
import { classLine, lessLikelyFrom, withoutIndeclform } from '../lib/popup-class';

describe('classLine', () => {
  it('names the class in a reader’s words, in a fixed order, both when there are two', () => {
    expect(classLine(['conj'])).toBe('conjunction');
    expect(classLine(['pronoun', 'adj'])).toBe('adjective and pronoun');
    expect(classLine(['verb', 'verb'])).toBe('verb');
    expect(classLine(['exclam'])).toBe('interjection');
    expect(classLine([])).toBe('');
  });
});

describe('withoutIndeclform', () => {
  it('drops Morpheus’s "indeclform (…)", which the class line replaces, and keeps what else the row says', () => {
    expect(withoutIndeclform('indeclform (conj)')).toBe('');
    expect(withoutIndeclform('enclitic indeclform (particle)')).toBe('enclitic');
    expect(withoutIndeclform('poetic indeclform (prep)')).toBe('poetic');
    // Attic is never printed (it is Plato's own dialect).
    expect(withoutIndeclform('attic (indeclform conj)')).toBe('');
    expect(withoutIndeclform('contr indeclform (conj)')).toBe('contr');
    expect(withoutIndeclform('pres ind act 1st sg')).toBe('pres ind act 1st sg');
    // The class can sit inside the parenthesis after "indeclform".
    expect(withoutIndeclform('doric aeolic (proclitic indeclform prep)')).toBe('doric aeolic proclitic');
    expect(withoutIndeclform('aeolic (enclitic indeclform particle)')).toBe('aeolic enclitic');
    expect(withoutIndeclform('attic epic (proclitic indeclform adverb)')).toBe('epic proclitic');
  });
});

describe('lessLikelyFrom', () => {
  it('puts the likely cards first and says where the less likely begin', () => {
    const c = (id: string, unlikely: boolean) => ({ id, unlikely });
    expect(lessLikelyFrom([c('legw', false), c('legos', true)])).toEqual({ cards: [c('legw', false), c('legos', true)], from: 1 });
    expect(lessLikelyFrom([c('ana', true), c('an', false), c('ean', false)]))
      .toEqual({ cards: [c('an', false), c('ean', false), c('ana', true)], from: 2 });
  });

  it('dims nothing when every card is unlikely (a line of Homer) or none is', () => {
    const c = (id: string, unlikely: boolean) => ({ id, unlikely });
    expect(lessLikelyFrom([c('a', true), c('b', true)])).toEqual({ cards: [c('a', true), c('b', true)], from: -1 });
    expect(lessLikelyFrom([c('a', false)])).toEqual({ cards: [c('a', false)], from: -1 });
  });
});
