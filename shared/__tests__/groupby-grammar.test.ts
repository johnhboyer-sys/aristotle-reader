// Group by grammar, ruled (John, 13 Nov: round B, option 2): the headword
// over its paradigm, each spelling a row headed by its parse. The readings of
// a spelling are its headword's alone where the data names each reading's
// headword (stage6 signature(), "lemma"); data built before that names none,
// and then every reading stays, as before.
import { describe, expect, it } from 'vitest';
import type { HitGrammar, Reading, SearchResult } from '../lib/search';
import {
  ambiguityNote, facetCounts, formatReading, formKey, ownGrammar, ownReadings, paradigmOf, parseLabel, refine,
} from '../lib/result-views';

// ἀρετή's spellings, with the readings Morpheus gives them. The verb ἀρετάω
// shares ἀρετῇ and ἀρετῆς.
const NOM_SG: Reading = { case: ['nom', 'voc'], gender: ['fem'], number: ['sg'], lemma: ['areth'] };
const GEN_SG: Reading = { case: ['gen'], gender: ['fem'], number: ['sg'], lemma: ['areth'] };
const DAT_SG: Reading = { case: ['dat'], gender: ['fem'], number: ['sg'], lemma: ['areth'] };
const GEN_PL: Reading = { case: ['gen'], gender: ['fem'], number: ['pl'], lemma: ['areth'] };
const V_IND: Reading = { mood: ['ind'], number: ['sg'], person: ['2nd'], tense: ['pres'], voice: ['act'], lemma: ['aretaw'] };
const V_SUBJ: Reading = { mood: ['subj'], number: ['sg'], person: ['2nd'], tense: ['pres'], voice: ['act'], lemma: ['aretaw'] };
// The same readings as data built before the lemma was kept.
const old = (r: Reading): Reading => { const { lemma: _, ...rest } = r; return rest; };

const HEADS = new Set(['areth']);

describe('ownReadings', () => {
  it('keeps the searched headword’s readings and drops the homograph’s', () => {
    expect(ownReadings([DAT_SG, V_IND, V_SUBJ], HEADS)).toEqual([DAT_SG]);
  });
  it('keeps every reading of data that names no headword: today’s behaviour', () => {
    const before = [DAT_SG, V_IND, V_SUBJ].map(old);
    expect(ownReadings(before, HEADS)).toEqual(before);
  });
  it('keeps a reading that names no headword beside ones that do', () => {
    expect(ownReadings([old(GEN_SG), V_IND], HEADS)).toEqual([old(GEN_SG)]);
  });
  it('keeps everything when no headword was searched', () => {
    expect(ownReadings([DAT_SG, V_IND], null)).toEqual([DAT_SG, V_IND]);
  });
  it('never prints the headword as part of a reading', () => {
    expect(formatReading(DAT_SG)).toBe('dat sg fem');
  });
});

// A noun search's hits: ἀρετῇ (0), ἀρετῆς (1), ἀρετή (2).
const at = (id: string, grkPositions: number[]): SearchResult => ({
  work: 'A', meta: { id, book: 1, column: id }, grkMatch: true, engMatch: false, grkPositions,
});
const RESULTS = [at('a1', [0, 1, 2])];
const grammarOf = (map: (r: Reading) => Reading): HitGrammar => ({
  byResult: new Map([['A:a1', [[DAT_SG, V_IND, V_SUBJ].map(map), [GEN_SG, V_IND].map(map), [NOM_SG].map(map)]]]),
  failedWorks: [],
});
const NEW = grammarOf(r => r);
const OLD = grammarOf(old);
const categories = (g: HitGrammar) => facetCounts(RESULTS, g).map(c => c.category);

describe('the facets and notes of a noun search', () => {
  it('new data: the verb’s categories are not offered', () => {
    expect(categories(ownGrammar(NEW, HEADS))).toEqual(['case', 'number', 'gender']);
    const counts = facetCounts(RESULTS, ownGrammar(NEW, HEADS));
    expect(counts.find(c => c.category === 'number')!.values).toEqual([{ value: 'sg', count: 3 }]);
  });

  it('old data: unchanged, the verb’s categories offered as before', () => {
    expect(categories(ownGrammar(OLD, HEADS))).toEqual(categories(OLD));
    expect(categories(OLD)).toEqual(['case', 'number', 'gender', 'tense', 'mood', 'voice', 'person']);
    expect(ownGrammar(OLD, HEADS)).toBe(OLD);
  });

  it('a facet ticked keeps the hits its count says, in both', () => {
    for (const g of [ownGrammar(NEW, HEADS), ownGrammar(OLD, HEADS)]) {
      for (const { category, values } of facetCounts(RESULTS, g)) {
        for (const { value, count } of values) {
          const left = refine(RESULTS, { grammar: g, facets: { [category]: [value] } }, 'and');
          expect(left.reduce((n, r) => n + r.grkPositions.length, 0)).toBe(count);
        }
      }
    }
  });

  it('the note on a hit counts its own readings only', () => {
    const own = ownGrammar(NEW, HEADS).byResult.get('A:a1')![0];
    expect(ambiguityNote(own, { case: ['dat'] })).toBeUndefined();
    expect(ambiguityNote(OLD.byResult.get('A:a1')![0], { case: ['dat'] })).toBe('one of 3 readings');
  });

  it('a grammar with no headword searched is left as it is', () => {
    expect(ownGrammar(NEW, null)).toBe(NEW);
  });
});

describe('parseLabel', () => {
  it('says a parse in words, a syncretic case as "or"', () => {
    expect(parseLabel([NOM_SG], false)).toBe('Nominative or vocative singular');
    expect(parseLabel([DAT_SG], false)).toBe('Dative singular');
  });
  it('says both parses of one spelling in one label', () => {
    const ACC_PL: Reading = { case: ['acc'], gender: ['fem'], number: ['pl'] };
    expect(parseLabel([GEN_SG, ACC_PL], false)).toBe('Genitive singular or accusative plural');
    expect(parseLabel([GEN_SG, DAT_SG], false)).toBe('Genitive or dative singular');
  });
  it('names the gender only when asked', () => {
    expect(parseLabel([{ case: ['nom'], gender: ['masc'], number: ['sg'] }], true)).toBe('Nominative singular masculine');
    expect(parseLabel([{ case: ['nom'], gender: ['fem', 'masc'], number: ['sg'] }], true)).toBe('Nominative singular masculine or feminine');
  });
  it('says a verb’s parse: tense, voice and mood, then person and number', () => {
    expect(parseLabel([V_IND], false)).toBe('Present active indicative, second singular');
    expect(parseLabel([{ mood: ['inf'], tense: ['aor'], voice: ['mid'] }], false)).toBe('Aorist middle infinitive');
    expect(parseLabel([{ mood: ['part'], tense: ['pres'], voice: ['act'], case: ['gen'], number: ['sg'], gender: ['masc', 'neut'] }], true))
      .toBe('Present active participle, genitive singular masculine or neuter');
  });
  it('is empty where the analysis says nothing a reader is shown', () => {
    expect(parseLabel([{ marker: ['conj'] }], false)).toBe('');
    expect(parseLabel([], false)).toBe('');
  });
});

describe('paradigmOf', () => {
  // One item per hit, as the page's instances are; `grk` its Greek hits.
  const hit = (id: number, spelling: string, readings: Reading[], formHeads?: string[]) =>
    ({ id, group: formKey(spelling), spellings: [spelling], hits: 1, readings, formHeads });
  const rows = (blocks: ReturnType<typeof paradigmOf>['blocks']) =>
    blocks.map(b => [b.head, b.count, b.rows.map(r => `${r.label} | ${r.heading} | ${r.count}`)]);

  const ITEMS = [
    hit(1, 'ἀρετῇ', [DAT_SG, V_IND, V_SUBJ]),
    hit(2, 'ἀρετῶν', [GEN_PL]),
    hit(3, 'ἀρετὴ', [NOM_SG]),
    hit(4, 'ἀρετῆς', [GEN_SG, V_IND]),
    hit(5, 'ἀρετή', [NOM_SG]),
  ];

  it('new data: the headword over its paradigm, in paradigm order, the verb’s parses gone', () => {
    const { blocks, english } = paradigmOf(ITEMS, ['areth']);
    expect(english).toEqual([]);
    expect(rows(blocks)).toEqual([['areth', 5, [
      'Nominative or vocative singular | ἀρετή | 2',
      'Genitive singular | ἀρετῆς | 1',
      'Dative singular | ἀρετῇ | 1',
      'Genitive plural | ἀρετῶν | 1',
    ]]]);
    expect(blocks[0].rows[0].items.map(i => i.id)).toEqual([3, 5]);
  });

  it('old data: the same rows, each saying every reading of its spelling, as before', () => {
    const { blocks } = paradigmOf(ITEMS.map(i => ({ ...i, readings: i.readings.map(old) })), ['areth']);
    expect(rows(blocks)).toEqual([['areth', 5, [
      'Nominative or vocative singular | ἀρετή | 2',
      'Genitive singular or present active indicative, second singular | ἀρετῆς | 1',
      'Dative singular or present active indicative, second singular or present active subjunctive, second singular | ἀρετῇ | 1',
      'Genitive plural | ἀρετῶν | 1',
    ]]]);
  });

  it('several headwords: a block each, in the order picked, each hit under its own', () => {
    const ECIS: Reading = { case: ['nom'], gender: ['fem'], number: ['sg'], lemma: ['ecis'] };
    const { blocks } = paradigmOf([hit(1, 'ἀρετή', [NOM_SG]), hit(2, 'ἕξις', [ECIS]), hit(3, 'ἕξεις', [old(ECIS)], ['ecis'])], ['ecis', 'areth']);
    expect(rows(blocks)).toEqual([
      ['ecis', 2, ['Nominative singular | ἕξις | 1', 'Nominative singular | ἕξεις | 1']],
      ['areth', 1, ['Nominative or vocative singular | ἀρετή | 1']],
    ]);
  });

  it('a verb’s rows run by tense, voice, mood, number and person', () => {
    const v = (tense: string, voice: string, mood: string, extra: Reading = {}): Reading =>
      ({ tense: [tense], voice: [voice], mood: [mood], ...extra });
    const { blocks } = paradigmOf([
      hit(1, 'λέγοντος', [v('pres', 'act', 'part', { case: ['gen'], number: ['sg'], gender: ['masc', 'neut'] })]),
      hit(2, 'εἶπε', [v('aor', 'act', 'ind', { person: ['3rd'], number: ['sg'] })]),
      hit(3, 'λέγειν', [v('pres', 'act', 'inf')]),
      hit(4, 'λέγουσι', [v('pres', 'act', 'ind', { person: ['3rd'], number: ['pl'] })]),
      hit(5, 'λέγει', [v('pres', 'act', 'ind', { person: ['3rd'], number: ['sg'] })]),
      hit(6, 'λέγεται', [v('pres', 'mp', 'ind', { person: ['3rd'], number: ['sg'] })]),
    ], ['legw']);
    expect(blocks[0].rows.map(r => r.heading)).toEqual(['λέγει', 'λέγουσι', 'λέγειν', 'λέγοντος', 'λέγεται', 'εἶπε']);
  });

  it('keeps the English hits apart, and a spelling with no parse last, its row unlabelled', () => {
    const { blocks, english } = paradigmOf([{ id: 9, hits: 2 }, hit(1, 'ἀρετή', [NOM_SG]), hit(2, 'ἀρετᾶ', [])], ['areth']);
    expect(english.map(i => i.id)).toEqual([9]);
    expect(rows(blocks)).toEqual([['areth', 2, ['Nominative or vocative singular | ἀρετή | 1', ' | ἀρετᾶ | 1']]]);
  });
});
