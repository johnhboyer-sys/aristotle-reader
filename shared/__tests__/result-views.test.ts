// The views and grammar facets of the results page, below the component:
// greekHitGrammar (lib/search) reads each hit's readings from the grammar
// column; lib/result-views counts, filters and groups them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { greekHitGrammar, type HitForms, type HitGrammar, type Reading, type SearchResult } from '../lib/search';
import {
  ambiguous, compareForms, facetCounts, formGroupsOf, formKey, formatReading, grammarHitNote, readingMatches, refine, tokenMatches, withTicked,
  ambiguityNote,
} from '../lib/result-views';
import { formGroups } from '../lib/form-panel';
import { hitCount } from '../lib/search-pages';

// Signatures: 0 unanalysed; 1 gen or dat sg fem (two readings); 2 nom/voc pl
// masc (one syncretic reading); 3 a present indicative.
const GEN_SG_FEM: Reading = { case: ['gen'], number: ['sg'], gender: ['fem'] };
const DAT_SG_FEM: Reading = { case: ['dat'], number: ['sg'], gender: ['fem'] };
const NOM_PL_MASC: Reading = { case: ['nom', 'voc'], number: ['pl'], gender: ['masc'] };
const PRES_IND: Reading = { tense: ['pres'], mood: ['ind'], voice: ['act'], person: ['3rd'], number: ['sg'] };
const SIGS: Reading[][] = [[], [GEN_SG_FEM, DAT_SG_FEM], [NOM_PL_MASC], [PRES_IND]];

// a1 holds tokens 0–2, a2 tokens 3–4; the column gives each its signature.
const A = {
  'meta.json': [{ id: 'a1', book: 1, column: '1a' }, { id: 'a2', book: 1, column: '1b' }],
  'offsets.json': {
    token_count: 5, seg_base_offset: [0, 3],
    segments: [], book_bounds: [{ book: 1, start: 0 }], turn_bounds: [],
  },
  'grammar-dict.json': {
    token_count: 5, width: 2, categories: ['case', 'number', 'gender', 'tense', 'mood', 'voice', 'person'],
    reserved: { unkeyed: 0, unanalysed: 0 }, sigs: SIGS,
  },
  'grammar-col.bin': new Uint16Array([3, 1, 0, 2, 1]).buffer,
};
// GFail is A again under a name only the failure test reads: every loader is
// memoised once it has loaded.
const WORKS: Record<string, Record<string, unknown>> = { A, GFail: A, GGap: A };

let failing = new Set<string>();
beforeEach(() => {
  failing = new Set();
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    const path = String(url).replace(/^\/data\//, '');
    const own = /^([^/]+)\/search\/(.+)$/.exec(path);
    const data = own ? WORKS[own[1]]?.[own[2]] : undefined;
    if (failing.has(path) || data === undefined) {
      return Promise.resolve({ ok: false, status: failing.has(path) ? 500 : 404, json: async () => ({}) } as Response);
    }
    return Promise.resolve({
      ok: true, json: () => Promise.resolve(data), arrayBuffer: () => Promise.resolve(data as ArrayBuffer),
    } as Response);
  });
});
afterEach(() => vi.restoreAllMocks());

const at = (work: string, id: string, grkPositions: number[], over: Partial<SearchResult> = {}): SearchResult => ({
  work, meta: { id, book: 1, column: id === 'a1' ? '1a' : '1b' }, grkMatch: true, engMatch: false, grkPositions, ...over,
});
const RESULTS = [at('A', 'a1', [0, 1, 2]), at('A', 'a2', [0, 1])];
const GRAMMAR: HitGrammar = {
  byResult: new Map([
    ['A:a1', [[PRES_IND], [GEN_SG_FEM, DAT_SG_FEM], []]],
    ['A:a2', [[NOM_PL_MASC], [GEN_SG_FEM, DAT_SG_FEM]]],
  ]),
  failedWorks: [],
};
const hits = (results: SearchResult[]) => results.reduce((n, r) => n + r.grkPositions.length, 0);
const positions = (results: SearchResult[]) => results.map(r => [r.meta.id, r.grkPositions]);

describe('greekHitGrammar', () => {
  it('reads the readings of every hit from the grammar column', async () => {
    const grammar = await greekHitGrammar(RESULTS);
    expect(grammar.failedWorks).toEqual([]);
    expect(grammar.byResult.get('A:a1')).toEqual([[PRES_IND], [GEN_SG_FEM, DAT_SG_FEM], []]);
    expect(grammar.byResult.get('A:a2')).toEqual([[NOM_PL_MASC], [GEN_SG_FEM, DAT_SG_FEM]]);
  });

  it('names a work whose grammar did not load, and still reads the others', async () => {
    failing.add('GFail/search/grammar-col.bin');
    const grammar = await greekHitGrammar([...RESULTS, at('GFail', 'a2', [1])]);
    expect(grammar.failedWorks).toEqual(['GFail']);
    expect(grammar.byResult.has('GFail:a2')).toBe(false);
    expect(grammar.byResult.get('A:a2')).toEqual([[NOM_PL_MASC], [GEN_SG_FEM, DAT_SG_FEM]]);
  });

  it('counts a work as failed when one of its segments is not in the index it read', async () => {
    // A result from another build than the index: left in, its hits would be
    // neither counted nor narrowed, and nothing would say so.
    const grammar = await greekHitGrammar([at('GGap', 'a2', [1]), at('GGap', 'gone', [0])]);
    expect(grammar.failedWorks).toEqual(['GGap']);
    expect([...grammar.byResult.keys()]).toEqual([]);
  });

  it('asks for nothing when no result has a Greek hit', async () => {
    const grammar = await greekHitGrammar([{ ...at('A', 'a1', []), grkMatch: false, engMatch: true }]);
    expect(grammar.byResult.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('matching a token against the facets', () => {
  it('passes an ambiguous token on any of its readings', () => {
    expect(tokenMatches([GEN_SG_FEM, DAT_SG_FEM], { case: ['dat'] })).toBe(true);
    expect(tokenMatches([GEN_SG_FEM, DAT_SG_FEM], { case: ['acc'] })).toBe(false);
    expect(ambiguous([GEN_SG_FEM, DAT_SG_FEM], { case: ['dat'] })).toBe(true);
    // Every reading is feminine: a match, and not one of several.
    expect(ambiguous([GEN_SG_FEM, DAT_SG_FEM], { gender: ['fem'] })).toBe(false);
  });

  it('needs one reading to satisfy every category ticked, any value within one', () => {
    expect(readingMatches(GEN_SG_FEM, { case: ['gen', 'acc'], number: ['sg'] })).toBe(true);
    expect(readingMatches(GEN_SG_FEM, { case: ['gen'], number: ['pl'] })).toBe(false);
    // gen from one reading and dat from the other is not one reading's claim.
    expect(tokenMatches([GEN_SG_FEM, DAT_SG_FEM], { case: ['gen'], number: ['pl'] })).toBe(false);
  });

  it('fails an unanalysed token once a facet is ticked, and passes everything with none', () => {
    expect(tokenMatches([], { case: ['gen'] })).toBe(false);
    expect(tokenMatches([], {})).toBe(true);
    expect(tokenMatches([GEN_SG_FEM], { case: [] })).toBe(true);
  });
});

describe('saying a hit is ambiguous', () => {
  const NOM_VOC: Reading = { case: ['nom', 'voc'], number: ['pl'], gender: ['masc'] };
  it('counts a reading that is itself two-valued in a ticked category', () => {
    expect(ambiguous([NOM_VOC], { case: ['nom'] })).toBe(true);
    // Both of its values ticked: nothing is left open.
    expect(ambiguous([NOM_VOC], { case: ['nom', 'voc'] })).toBe(false);
    // Two-valued in a category not asked about.
    expect(ambiguous([NOM_VOC], { number: ['pl'] })).toBe(false);
  });

  it('says which: one of several readings, or the values one reading leaves open', () => {
    expect(ambiguityNote([GEN_SG_FEM, DAT_SG_FEM], { case: ['dat'] })).toBe('one of 2 readings');
    expect(ambiguityNote([NOM_VOC], { case: ['nom'] })).toBe('case nom or voc');
    // Every value the readings allow there, not only the two-valued reading's.
    expect(ambiguityNote([{ case: ['acc'] }, NOM_VOC], { case: ['acc', 'nom'] })).toBe('case acc or nom or voc');
    expect(ambiguityNote([DAT_SG_FEM], { case: ['dat'] })).toBeUndefined();
    expect(ambiguityNote([], { case: ['dat'] })).toBeUndefined();
  });

  // Part of speech: one reading's classes all hold at once (ἄλλος is both
  // adjective and pronoun), so they leave nothing open; readings that
  // disagree still do.
  it('does not call a reading with two parts of speech ambiguous', () => {
    const ALLOS: Reading = { pos: ['adj', 'pronoun'], case: ['nom'] };
    expect(ambiguous([ALLOS], { pos: ['pronoun'] })).toBe(false);
    expect(ambiguityNote([ALLOS], { pos: ['pronoun'] })).toBeUndefined();
    expect(ambiguous([{ pos: ['noun'] }, { pos: ['verb'] }], { pos: ['noun'] })).toBe(true);
  });

  it('does not read a property every object has as a category', () => {
    expect(readingMatches(GEN_SG_FEM, { constructor: ['gen'] })).toBe(false);
    expect(tokenMatches([GEN_SG_FEM], { toString: ['x'] })).toBe(false);
  });
});

describe('formatReading', () => {
  it('prints the categories in a fixed order, several values of one joined by "/"', () => {
    expect(formatReading(NOM_PL_MASC)).toBe('nom/voc pl masc');
    expect(formatReading(PRES_IND)).toBe('sg pres ind act 3rd');
    // Rewritten 2026-11-10 (options A1/B1): part of speech prints first, and
    // Morpheus's raw word-class tag (`marker`) is no longer printed. Was:
    // formatReading({ marker: ['adverb'], degree: ['comp'] }) === 'comp adverb'.
    expect(formatReading({ marker: ['adverb'], degree: ['comp'], pos: ['adverb'] })).toBe('adverb comp');
    // A word's two classes hold at once: "+", never "/", which means "or".
    expect(formatReading({ case: ['nom'], pos: ['pronoun', 'adj'] })).toBe('adj+pronoun nom');
  });
});

describe('grammarHitNote', () => {
  it('says what a grammatical hit leaves open, and nothing when it is certain', () => {
    expect(grammarHitNote({ values: { case: ['nom'] }, certain: true })).toBeUndefined();
    expect(grammarHitNote({ values: { case: ['nom', 'voc'] }, certain: false })).toBe('case nom or voc');
  });

  it('names part of speech only where readings disagree on it', () => {
    expect(grammarHitNote({ values: { pos: ['adj+pronoun'], case: ['nom', 'voc'] }, certain: false })).toBe('case nom or voc');
    expect(grammarHitNote({ values: { pos: ['adj+pronoun', 'noun'] }, certain: false })).toBe('part of speech adj+pronoun or noun');
    expect(grammarHitNote({ values: { pos: ['no class', 'noun'] }, certain: false })).toBe('part of speech no class or noun');
  });
});

describe('facetCounts', () => {
  it('counts the hits each value licenses, in category order, only what is present', () => {
    const counts = facetCounts(RESULTS, GRAMMAR);
    expect(counts.map(c => c.category)).toEqual(['case', 'number', 'gender', 'tense', 'mood', 'voice', 'person']);
    expect(counts[0]).toEqual({
      category: 'case',
      values: [{ value: 'dat', count: 2 }, { value: 'gen', count: 2 }, { value: 'nom', count: 1 }, { value: 'voc', count: 1 }],
    });
    expect(counts[1].values).toEqual([{ value: 'sg', count: 3 }, { value: 'pl', count: 1 }]);
  });

  // Options B1 and A1 (2026-11-10): part of speech heads the facets, and
  // Morpheus's word-class tag is never offered as one.
  it('lists part of speech first and never the word-class tag', () => {
    const grammar: HitGrammar = {
      byResult: new Map([['A:a1', [[{ case: ['gen'], pos: ['noun'], marker: ['adverb'] }], [{ case: ['dat'], pos: ['adj', 'pronoun'] }]]]]),
      failedWorks: [],
    };
    const counts = facetCounts([at('A', 'a1', [0, 1])], grammar);
    expect(counts.map(c => c.category)).toEqual(['pos', 'case']);
    expect(counts[0].values).toEqual([{ value: 'adj', count: 1 }, { value: 'noun', count: 1 }, { value: 'pronoun', count: 1 }]);
  });

  it('equals the hits refine leaves when that one value is ticked', () => {
    for (const { category, values } of facetCounts(RESULTS, GRAMMAR)) {
      for (const { value, count } of values) {
        expect(hits(refine(RESULTS, { grammar: GRAMMAR, facets: { [category]: [value] } }, 'and'))).toBe(count);
      }
    }
  });

  it('skips the positions another filter has removed', () => {
    // Without a1's second hit, gen is a2's alone.
    const keep = (r: SearchResult, i: number) => !(r.meta.id === 'a1' && i === 1);
    const counts = facetCounts(RESULTS, GRAMMAR, keep);
    expect(counts[0].values.find(v => v.value === 'gen')).toEqual({ value: 'gen', count: 1 });
  });

  // John, 2026-11-11: a match of several words (running text, a phrase, a
  // proximity window) counts once. Under facets it counts once under each
  // value any of its words has, so a chip's count is the matches left when
  // that value alone is ticked, as the status line says.
  it('counts a match of several words once under each value its words have', () => {
    // a1: one match over tokens 0–1 (pres ind; gen or dat sg fem), one over 2 (unanalysed).
    // a2: one match over tokens 0–1 (nom/voc pl masc; gen or dat sg fem).
    const running = [
      at('A', 'a1', [0, 1, 2], { windows: [[0, 1], [2]] }),
      at('A', 'a2', [0, 1], { windows: [[0, 1]] }),
    ];
    const counts = facetCounts(running, GRAMMAR);
    // Both words of a1's first match are sg, and both of a2's: 2, not 4.
    expect(counts.find(c => c.category === 'number')!.values).toEqual([{ value: 'sg', count: 2 }, { value: 'pl', count: 1 }]);
    expect(counts.find(c => c.category === 'case')!.values)
      .toEqual([{ value: 'dat', count: 2 }, { value: 'gen', count: 2 }, { value: 'nom', count: 1 }, { value: 'voc', count: 1 }]);
    for (const { category, values } of counts) {
      for (const { value, count } of values) {
        const left = refine(running, { grammar: GRAMMAR, facets: { [category]: [value] } }, 'and');
        expect(left.reduce((n, r) => n + hitCount(r), 0)).toBe(count);
      }
    }
    // A word another filter removed claims nothing for its match.
    const keep = (r: SearchResult, i: number) => !(r.meta.id === 'a1' && i === 0);
    expect(facetCounts(running, GRAMMAR, keep).find(c => c.category === 'tense')).toBeUndefined();
  });

  it('counts what a speaker filter left', () => {
    // As the engine returns them under a filter: a1's first two hits only.
    const spoken = [at('A', 'a1', [0, 1], { speakers: ['Socrates', 'Socrates'] })];
    const grammar: HitGrammar = { byResult: new Map([['A:a1', [[PRES_IND], [GEN_SG_FEM, DAT_SG_FEM]]]]), failedWorks: [] };
    const counts = facetCounts(spoken, grammar);
    expect(counts[0].values).toEqual([{ value: 'dat', count: 1 }, { value: 'gen', count: 1 }]);
    const left = refine(spoken, { grammar, facets: { case: ['gen'] } }, 'and');
    expect(left[0].speakers).toEqual(['Socrates']);
    expect(hits(left)).toBe(1);
  });
});

describe('withTicked', () => {
  it('lists a ticked value no hit in view has, at 0, so it can be unticked', () => {
    const counts = withTicked(facetCounts(RESULTS, GRAMMAR), { case: ['acc'], degree: ['comp'] });
    expect(counts[0].values.at(-1)).toEqual({ value: 'acc', count: 0 });
    expect(counts.map(c => c.category).slice(-1)).toEqual(['degree']);
    expect(withTicked([], {})).toEqual([]);
  });
});

describe('refine', () => {
  it('removes exactly the positions that fail the facets', () => {
    const left = refine(RESULTS, { grammar: GRAMMAR, facets: { case: ['gen'] } }, 'and');
    expect(positions(left)).toEqual([['a1', [1]], ['a2', [1]]]);
  });

  it('keeps the arrays that run beside the positions in step', () => {
    const r = at('A', 'a1', [0, 1, 2], {
      speakers: ['Socrates', 'EN', null],
      grammar: [{ values: { mood: ['ind'] }, certain: true }, { values: { mood: ['x'] }, certain: false }, { values: {}, certain: false }],
    });
    const [left] = refine([r], { grammar: GRAMMAR, facets: { gender: ['fem'] } }, 'and');
    expect(left.grkPositions).toEqual([1]);
    expect(left.speakers).toEqual(['EN']);
    expect(left.grammar).toEqual([{ values: { mood: ['x'] }, certain: false }]);
  });

  it('sets forms aside and narrows by grammar in one pass over the positions as searched', () => {
    const forms: HitForms = {
      byResult: new Map([['A:a1', ['esti', 'ths', 'kai']], ['A:a2', ['oi', 'ths']]]), headwords: new Map(), failedWorks: [],
    };
    // τῆς is set aside; of the rest only ἐστι is singular. a2 is left with nothing.
    const left = refine(RESULTS, { forms, excluded: new Set(['ths']), grammar: GRAMMAR, facets: { number: ['sg'] } }, 'and');
    expect(positions(left)).toEqual([['a1', [0]]]);
    const both = refine(RESULTS, { forms, excluded: new Set(['esti']), grammar: GRAMMAR, facets: { gender: ['fem', 'masc'] } }, 'and');
    expect(positions(both)).toEqual([['a1', [1]], ['a2', [0, 1]]]);
  });

  it('lets the English side stand under "either", and drops the passage under "both"', () => {
    const r = at('A', 'a1', [0], { engMatch: true, engHits: [{ translation: 'rackham', positions: [3] }] });
    const grammar: HitGrammar = { byResult: new Map([['A:a1', [[PRES_IND]]]]), failedWorks: [] };
    expect(refine([r], { grammar, facets: { case: ['gen'] } }, 'and')).toEqual([]);
    const [either] = refine([r], { grammar, facets: { case: ['gen'] } }, 'or');
    expect([either.grkMatch, either.grkPositions, either.engMatch]).toEqual([false, [], true]);
  });

  it('returns the same array when nothing filters', () => {
    expect(refine(RESULTS, {}, 'and')).toBe(RESULTS);
    expect(refine(RESULTS, { grammar: GRAMMAR, facets: {} }, 'and')).toBe(RESULTS);
    expect(refine(RESULTS, { grammar: GRAMMAR, facets: { case: [] }, excluded: new Set() }, 'and')).toBe(RESULTS);
  });

  it('leaves alone the results of a work whose grammar did not load', () => {
    const grammar: HitGrammar = { byResult: new Map([['A:a1', GRAMMAR.byResult.get('A:a1')!]]), failedWorks: ['A'] };
    const left = refine(RESULTS, { grammar, facets: { case: ['gen'] } }, 'and');
    expect(positions(left)).toEqual([['a1', [1]], ['a2', [0, 1]]]);
  });
});

describe('formGroups with keep', () => {
  it('counts only the positions kept', () => {
    const forms: HitForms = {
      byResult: new Map([['A:a1', ['esti', 'ths', 'kai']], ['A:a2', ['oi', 'ths']]]), headwords: new Map(), failedWorks: [],
    };
    const keep = (r: SearchResult, i: number) => tokenMatches(GRAMMAR.byResult.get(`${r.work}:${r.meta.id}`)![i], { case: ['gen'] });
    expect(formGroups(RESULTS, forms, keep)[0].forms).toEqual([{ form: 'ths', count: 2 }]);
    expect(formGroups(RESULTS, forms)[0].count).toBe(5);
  });
});

describe('compareForms', () => {
  it('puts digamma where the alphabet does, after ε and before ζ', () => {
    expect(['z', 'v', 'e', 'w'].sort(compareForms)).toEqual(['e', 'v', 'z', 'w']);
  });
});

describe('formGroupsOf', () => {
  // Keyed on the ruled form key (groupby-key.test.ts): accents off, all else
  // kept. ἐστι and ἐστί are one form; καὶ and καί too.
  const g = (id: number, spelling: string, hits = 1, grk?: number) =>
    ({ id, group: formKey(spelling), spellings: [spelling], hits, ...(grk === undefined ? {} : { grk }) });
  it('groups by form, most hits first, then by form, with the English last', () => {
    const items = [
      g(1, 'τῆς'), g(2, 'ἐστι'), { id: 3, id2: 'eng', hits: 2 }, g(4, 'τῆς'), g(5, 'ἐστί'), g(6, 'καὶ'), g(7, 'καί', 3),
    ];
    const groups = formGroupsOf(items);
    expect(groups.map(x => [x.key, x.heading, x.count, x.items.map(i => i.id)])).toEqual([
      ['και', 'καί', 4, [6, 7]],
      ['ἐστι', 'ἐστι', 2, [2, 5]],
      ['τῆς'.normalize('NFD').replace(/\u0342/g, '').normalize('NFC'), 'τῆς', 2, [1, 4]],
      [null, '', 2, [3]],
    ]);
  });

  it('orders the groups by their Greek hits, given, not by the English an item carries', () => {
    // β: one Greek hit carrying two English; ω: two Greek hits.
    const items = [g(1, 'β', 3, 1), g(2, 'ω', 1, 1), g(3, 'ω', 1, 1)];
    expect(formGroupsOf(items).map(x => [x.heading, x.count])).toEqual([['ω', 2], ['β', 3]]);
  });

  it('breaks a tie in Greek order, as the sort does: δ before ξ, though their keys run d, c', () => {
    expect(formGroupsOf([g(1, 'ξένος'), g(2, 'δῆμος')]).map(x => x.form)).toEqual(['dhmos', 'cenos']);
  });
});
