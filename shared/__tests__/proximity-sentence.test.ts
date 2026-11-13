import { describe, expect, it } from 'vitest';
import { grammarWords, proximitySentence, proximityTerms, type SentenceTerm } from '../lib/proximity-sentence';

// The summary sentence of HANDOFF-SEARCH-BUILD §5.5, as round 34 draws it.
const HEADS: Record<string, string> = { areth: 'ἀρετή', ecis: 'ἕξις', hdonh: 'ἡδονή', luph: 'λύπη', aitios: 'αἴτιος', dia: 'διά' };
const heads = (k: string) => HEADS[k] ?? k;
const lemma = (key: string, over: Partial<SentenceTerm> = {}): SentenceTerm =>
  ({ kind: 'lemma', text: '', picked: [key], grammar: {}, relation: 'near', ...over });
const gram = (grammar: Record<string, string>, over: Partial<SentenceTerm> = {}): SentenceTerm =>
  ({ kind: 'grammatical', text: '', picked: [], grammar, relation: 'near', ...over });
const words = (window: number, ordered = false) => ({ window, unit: 'words' as const, ordered });

describe('the proximity sentence', () => {
  it('reads each round-34 state as drawn', () => {
    expect(proximitySentence([lemma('areth'), lemma('ecis')], words(5), heads, null))
      .toBe('ἕξις near ἀρετή, within 5 words');
    expect(proximitySentence([lemma('areth'), lemma('ecis', { relation: 'before' })], words(10), heads, null))
      .toBe('ἕξις before ἀρετή, within 10 words');
    expect(proximitySentence([lemma('areth'), lemma('ecis'), lemma('hdonh', { relation: 'before' })], words(10), heads, null))
      .toBe('ἕξις near ἀρετή, ἡδονή before ἀρετή, within 10 words');
    expect(proximitySentence([lemma('areth'), lemma('hdonh', { relation: 'before' }), lemma('luph', { relation: 'not' })], words(10), heads, null))
      .toBe('ἡδονή before ἀρετή, λύπη not near ἀρετή, within 10 words');
    expect(proximitySentence([lemma('areth'), gram({ case: 'gen', number: 'pl' })], words(3), heads, null))
      .toBe('any genitive plural near ἀρετή, within 3 words');
    expect(proximitySentence([lemma('areth'), lemma('ecis'), lemma('hdonh', { or: true })], words(10), heads, null))
      .toBe('either ἕξις or ἡδονή near ἀρετή, within 10 words');
    expect(proximitySentence([lemma('aitios'), lemma('dia'), gram({ case: 'acc' }, { target: 1 })], words(5), heads, null))
      .toBe('διά near αἴτιος, any accusative near διά, within 5 words');
  });

  it('names the works when the search is not over all of them', () => {
    expect(proximitySentence([lemma('areth'), lemma('ecis')], words(5), heads, 'authentic works'))
      .toBe('ἕξις near ἀρετή, within 5 words, in authentic works');
  });

  it('names the unit, the order lock, and the other kinds', () => {
    expect(proximitySentence([lemma('areth'), lemma('ecis')], { window: 5, unit: 'line', ordered: true }, heads, null))
      .toBe('ἕξις near ἀρετή, in the same line, in this order');
    // Before or after set the order; the lock goes unsaid.
    expect(proximitySentence([lemma('areth'), lemma('ecis', { relation: 'after' })], words(1, true), heads, null))
      .toBe('ἕξις after ἀρετή, within 1 word');
    expect(proximitySentence([
      { kind: 'form', text: 'ἀρετῆς', picked: [], grammar: {}, relation: 'near' },
      { kind: 'phrase', text: 'τὸ τί ἦν εἶναι', picked: [], grammar: {}, relation: 'near' },
    ], words(5), heads, null)).toBe('the phrase τὸ τί ἦν εἶναι near ἀρετῆς as typed, within 5 words');
  });

  it('leaves out terms that ask nothing, and reads three or-joined terms with a serial comma', () => {
    expect(proximitySentence([lemma('areth'), { ...lemma('x'), picked: [] }, lemma('ecis', { target: 1 })], words(5), heads, null))
      .toBe('ἕξις near ἀρετή, within 5 words');
    expect(proximitySentence([lemma('areth'), lemma('ecis'), lemma('hdonh', { or: true }), lemma('luph', { or: true })], words(5), heads, null))
      .toBe('either ἕξις, ἡδονή, or λύπη near ἀρετή, within 5 words');
  });

  it('says a lone grammar term with its works', () => {
    expect(proximitySentence([gram({ tense: 'aor', voice: 'pass', mood: 'part' })], words(5), heads, 'Categories'))
      .toBe('any aorist participle passive, in Categories');
    expect(grammarWords({ number: 'pl', case: 'gen', gender: 'fem' })).toBe('feminine genitive plural');
  });
});

// The search box while proximity is live (John, 12 Nov: "a ; between terms").
describe('the proximity terms in the search box', () => {
  it('joins the terms with "; " in term order, a grammar term as its description', () => {
    expect(proximityTerms([lemma('aitios'), lemma('dia'), gram({ case: 'acc' }, { target: 1 })], heads)).toBe('αἴτιος; διά; accusative');
    expect(proximityTerms([gram({ number: 'pl', case: 'gen' }), lemma('areth')], heads)).toBe('genitive plural; ἀρετή');
  });

  it('writes an or-joined run as one item', () => {
    expect(proximityTerms([lemma('areth'), lemma('ecis'), lemma('hdonh', { or: true })], heads)).toBe('ἀρετή; ἕξις or ἡδονή');
    expect(proximityTerms([lemma('areth'), lemma('ecis'), lemma('hdonh', { or: true }), lemma('luph', { or: true })], heads))
      .toBe('ἀρετή; ἕξις or ἡδονή or λύπη');
  });

  it('writes a phrase as its words, a typed form as typed, and keeps a NOT term', () => {
    expect(proximityTerms([
      { kind: 'phrase', text: ' τὸ  τί ἦν εἶναι ', picked: [], grammar: {}, relation: 'near' },
      { kind: 'form', text: 'ἀρετῆς', picked: [], grammar: {}, relation: 'near' },
      lemma('luph', { relation: 'not' }),
    ], heads)).toBe('τὸ τί ἦν εἶναι; ἀρετῆς; λύπη');
  });

  it('leaves out terms that ask nothing', () => {
    expect(proximityTerms([lemma('areth'), { ...lemma('x'), picked: [] }, lemma('ecis')], heads)).toBe('ἀρετή; ἕξις');
  });
});
