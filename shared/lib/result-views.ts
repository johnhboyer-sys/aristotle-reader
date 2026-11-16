// The results page's grammar facets and its form grouping. The readings come
// from greekHitGrammar and the forms from greekHitForms (lib/search); this
// file only matches, counts, filters and groups, from the result set, so
// ticking a facet or changing the view asks the network for nothing.
import { BOTH_AT_ONCE, greekFold, type HitForms, type HitGrammar, type LangOp, type Reading, type SearchResult } from './search';

/** How the hits of one results page are grouped: 'page' is by work, the
 * default (its id kept from the Stephanus page view it replaced); an old
 * address's v=work falls back to it. */
export type ResultView = 'page' | 'form' | 'grammar';
export const RESULT_VIEWS: readonly ResultView[] = ['page', 'form', 'grammar'];
/** What a search asks for, as far as grouping its hits goes: a dictionary
 * word (the Lemma switch: one headword or several, always any of them), one
 * word as spelled, a phrase or running text, several words, a proximity
 * search, or English alone. */
export type SearchKind = 'lemma' | 'word' | 'phrase' | 'words' | 'proximity' | 'english';
/** The parts of a search (search-url's UrlSearch) its kind is read from. */
export interface SearchShape { grk: string; grkMode: string; matchMode: string; lemmas: string[]; combo: unknown }
export function searchKind(s: SearchShape): SearchKind {
  if (s.combo) return 'proximity';
  if (s.lemmas.length) return 'lemma';
  const words = s.grk.trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 'english';
  if (s.matchMode === 'text') return 'phrase';
  if (words === 1) return 'word';
  return s.grkMode === 'phrase' ? 'phrase' : 'words';
}
/** The groupings a kind of search is offered (John, 13 Nov): by form for one
 * word or a phrase as spelled, by grammar for a dictionary word, and by work
 * always. A phrase is grouped on the whole of it; several words, or words
 * near each other, have no one form to group on. */
export function viewsOffered(kind: SearchKind): ResultView[] {
  if (kind === 'lemma') return ['page', 'grammar'];
  if (kind === 'word' || kind === 'phrase') return ['page', 'form'];
  return ['page'];
}

/** One line, three, a whole section, or citations without text. */
export type ResultContext = '1' | '3' | 's' | 'c';
export const RESULT_CONTEXTS: readonly ResultContext[] = ['1', '3', 's', 'c'];
/** How the hits of one results page are ordered. */
export type ResultSort = 'page' | 'work' | 'form' | 'freq';
export const RESULT_SORTS: readonly ResultSort[] = ['page', 'work', 'form', 'freq'];
/** Hits per results page. */
export type PageSize = '20' | '40' | '100';
export const PAGE_SIZES: readonly PageSize[] = ['20', '40', '100'];

/** Category → the values ticked. A category with none ticked does not filter. */
export type Facets = Record<string, string[]>;

// The order a reading is printed and the facets are listed in: part of
// speech first (John, 2026-11-10, option B1), then the noun's categories,
// then the verb's.
const CATEGORY_ORDER = ['pos', 'case', 'number', 'gender', 'tense', 'mood', 'voice', 'person', 'degree'];
// Morpheus's raw word-class tags (`marker`) are still in the index but never
// shown: part of speech replaced them (option A1), and some are wrong
// (ἀλλά tagged an adverb). Not printed, not offered as a facet.
// The headwords a reading belongs to (`lemma`, stage6 signature()) are not
// a category either: they narrow the readings to the word searched (ownReadings).
export const NOT_SHOWN = new Set(['marker', 'lemma']);
const rank = (category: string) => {
  const i = CATEGORY_ORDER.indexOf(category);
  return i < 0 ? CATEGORY_ORDER.length : i;
};
const byCategory = (a: string, b: string) => rank(a) - rank(b) || a.localeCompare(b);

const keyOf = (r: SearchResult) => `${r.work}:${r.meta.id}`;
const ticked = (facets: Facets) => Object.entries(facets).filter(([, values]) => values.length);
// A reading's values in one category. Its own only: "constructor" names a
// property of every object, not a category of this one.
const licensed = (reading: Reading, category: string): string[] =>
  Object.hasOwn(reading, category) ? reading[category] : [];

export const hasFacets = (facets: Facets) => ticked(facets).length > 0;

/** One reading answers the facets when, in every category ticked, it
 * licenses at least one of the values ticked. */
export function readingMatches(reading: Reading, facets: Facets): boolean {
  return ticked(facets).every(([category, values]) => values.some(v => licensed(reading, category).includes(v)));
}

/** A token passes on any of its readings, as a grammatical search's match
 * does: ambiguity is not held against it. With a facet ticked an unanalysed
 * token claims nothing, so does not pass. */
export function tokenMatches(readings: Reading[], facets: Facets): boolean {
  if (!hasFacets(facets)) return true;
  return readings.some(r => readingMatches(r, facets));
}

// The values a reading leaves open in a ticked category: it licenses more
// than were ticked ("nom/voc" when only nom is), so the match is not settled.
// Not so for part of speech, whose values on one reading all hold at once.
const leftOpen = (reading: Reading, facets: Facets) =>
  ticked(facets).filter(([category, values]) =>
    !BOTH_AT_ONCE.has(category) && licensed(reading, category).some(v => !values.includes(v)));

/** The token passes, but the parse does not settle that it should: not every
 * reading matches, or one that does is itself two-valued in a category
 * ticked. The rule a grammatical search's `certain` follows (compileQuery). */
export function ambiguous(readings: Reading[], facets: Facets): boolean {
  if (!hasFacets(facets) || !tokenMatches(readings, facets)) return false;
  return !readings.every(r => readingMatches(r, facets)) || readings.some(r => leftOpen(r, facets).length > 0);
}

/** What to print on an ambiguous hit: "one of N readings" where the readings
 * disagree, else the values one reading leaves open ("case nom or voc"), as a
 * grammatical search's hits say it. Undefined when the hit is not ambiguous. */
export function ambiguityNote(readings: Reading[], facets: Facets): string | undefined {
  if (!ambiguous(readings, facets)) return undefined;
  if (!readings.every(r => readingMatches(r, facets))) return `one of ${readings.length} readings`;
  // For each category some reading leaves open, every value any reading
  // allows there: the hit may be any of them.
  const open = [...new Set(readings.flatMap(r => leftOpen(r, facets).map(([category]) => category)))];
  return open.sort(byCategory).map(category => {
    const values = new Set(readings.flatMap(r => licensed(r, category)));
    return `${category} ${[...values].sort().join(' or ')}`;
  }).join(' · ');
}

/** The readings of a word that belong to the headwords searched: a spelling
 * two words share (ἀρετῇ, the noun's dative and a verb form of ἀρετάω) has
 * both words' readings, and a search for the noun is owed the noun's alone.
 * A reading that names no headword is kept, and so is every reading of data
 * built before readings named theirs; `heads` null keeps all. */
export function ownReadings(readings: Reading[], heads: ReadonlySet<string> | null): Reading[] {
  if (!heads?.size) return readings;
  return readings.filter(r => !Object.hasOwn(r, 'lemma') || r.lemma.some(h => heads.has(h)));
}

/** `grammar` with each hit's readings narrowed to the headwords searched
 * (ownReadings); the same object where nothing is narrowed, so data that
 * names no headword is read exactly as before. */
export function ownGrammar(grammar: HitGrammar, heads: ReadonlySet<string> | null): HitGrammar {
  if (!heads?.size) return grammar;
  let named = false;
  const byResult = new Map<string, Reading[][]>();
  for (const [key, words] of grammar.byResult) {
    byResult.set(key, words.map(readings => {
      const own = ownReadings(readings, heads);
      if (own.length !== readings.length || readings.some(r => Object.hasOwn(r, 'lemma'))) named = true;
      return own;
    }));
  }
  return named ? { ...grammar, byResult } : grammar;
}

/** A reading as a line: "nom/voc pl masc". A word's parts of speech hold at
 * once, so they join with "+" ("adj+pronoun"), never "/", which means "or". */
export function formatReading(reading: Reading): string {
  return Object.keys(reading).filter(c => reading[c]?.length && !NOT_SHOWN.has(c)).sort(byCategory)
    .map(c => (BOTH_AT_ONCE.has(c) ? [...reading[c]].sort().join('+') : reading[c].join('/'))).join(' ');
}

/** What an uncertain grammatical hit leaves open: "case nom or voc". Part of
 * speech arrives one value per reading ("adj+pronoun"), so it is named only
 * when readings disagree on it. Undefined for a certain hit. */
export function grammarHitNote(g: { values: Record<string, string[]>; certain: boolean }): string | undefined {
  if (g.certain) return undefined;
  const note = Object.entries(g.values)
    .filter(([category, values]) => !(BOTH_AT_ONCE.has(category) && values.length < 2))
    .map(([category, values]) => `${category === 'pos' ? 'part of speech' : category} ${values.join(' or ')}`)
    .join(' · ');
  return note || undefined;
}

export interface FacetCount { category: string; values: { value: string; count: number }[] }

/** Each value present among the Greek hits of `results`, with the number of
 * hits that have a reading licensing it; categories in printing order, values
 * commonest first. `keep` passes over the positions another filter removed.
 * A match of several words is one hit (John, 2026-11-11), counted once under each
 * value any of its words licenses: the matches left when that value alone is
 * ticked, as refine keeps a match while one of its words passes. */
export function facetCounts(
  results: SearchResult[],
  grammar: HitGrammar,
  keep?: (r: SearchResult, i: number) => boolean,
): FacetCount[] {
  const counts = new Map<string, Map<string, number>>();
  for (const r of results) {
    if (!r.grkMatch) continue;
    const own = grammar.byResult.get(keyOf(r));
    if (!own) continue;
    // Each hit as the indices of its words: a match's window, else each word
    // alone.
    const hits = r.windows
      ? r.windows.map(w => w.map(p => r.grkPositions.indexOf(p)))
      : r.grkPositions.map((_, i) => [i]);
    for (const words of hits) {
      const licensed = new Set<string>();
      for (const i of words) {
        if (keep && !keep(r, i)) continue;
        for (const reading of own[i] ?? []) {
          for (const category in reading) {
            if (NOT_SHOWN.has(category)) continue;
            for (const v of reading[category]) licensed.add(`${category}\u0000${v}`);
          }
        }
      }
      for (const pair of licensed) {
        const [category, value] = pair.split('\u0000');
        const values = counts.get(category) ?? counts.set(category, new Map()).get(category)!;
        values.set(value, (values.get(value) ?? 0) + 1);
      }
    }
  }
  return [...counts.keys()].sort(byCategory).map(category => ({
    category,
    values: [...counts.get(category)!.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
  }));
}

/** `counts` with every ticked value listed, at 0 where no hit in view has
 * it, so a facet ticked can always be unticked. */
export function withTicked(counts: FacetCount[], facets: Facets): FacetCount[] {
  const out = counts.map(c => ({ ...c, values: [...c.values] }));
  for (const [category, values] of ticked(facets)) {
    let row = out.find(c => c.category === category);
    if (!row) { row = { category, values: [] }; out.push(row); }
    for (const value of values) if (!row.values.some(v => v.value === value)) row.values.push({ value, count: 0 });
  }
  return out.sort((a, b) => byCategory(a.category, b.category));
}

/** Whether a hit passes the facets, as `keep` for the other filters' counts.
 * A result with no readings (its work's grammar did not load) is not narrowed. */
export function facetKeep(grammar: HitGrammar | null, facets: Facets) {
  return (r: SearchResult, i: number): boolean => {
    const own = grammar?.byResult.get(keyOf(r));
    return !own || tokenMatches(own[i] ?? [], facets);
  };
}

/** `results` without the hits whose form is set aside or which fail the
 * facets, in one pass: both side tables are parallel to the positions as
 * searched, so the two filters cannot be chained. A passage left with no
 * Greek hit stays only if its English matched and the two queries were joined
 * by "either" (as excludeForms in lib/form-panel). A result missing from a
 * side table is not narrowed by that filter. */
export function refine(
  results: SearchResult[],
  by: { forms?: HitForms; excluded?: ReadonlySet<string>; grammar?: HitGrammar; facets?: Facets },
  langOp: LangOp,
): SearchResult[] {
  const excluded = by.forms && by.excluded?.size ? by.excluded : null;
  const facets = by.grammar && by.facets && hasFacets(by.facets) ? by.facets : null;
  if (!excluded && !facets) return results;
  return results.flatMap(r => {
    if (!r.grkMatch) return [r];
    const forms = excluded ? by.forms!.byResult.get(keyOf(r)) : undefined;
    const readings = facets ? by.grammar!.byResult.get(keyOf(r)) : undefined;
    if (!forms && !readings) return [r];
    const keep = r.grkPositions.map((_, i) =>
      (!forms || !excluded!.has(forms[i])) && (!readings || tokenMatches(readings[i] ?? [], facets!)));
    if (keep.every(Boolean)) return [r];
    const left = cutPositions(r, keep);
    if (left.grkPositions.length) return [left];
    return r.engMatch && langOp === 'or' ? [{ ...left, grkMatch: false }] : [];
  });
}

/** `r` with only the Greek positions `keep` marks, and every table parallel
 * to them cut in step. A proximity window loses the positions removed, and
 * a window left with none is dropped. */
export function cutPositions(r: SearchResult, keep: boolean[]): SearchResult {
  const cut = <T>(list: T[] | undefined) => list?.filter((_, i) => keep[i]);
  const kept = new Set(cut(r.grkPositions));
  return {
    ...r,
    grkPositions: cut(r.grkPositions)!,
    ...(r.grammar ? { grammar: cut(r.grammar) } : {}),
    ...(r.speakers ? { speakers: cut(r.speakers) } : {}),
    ...(r.windows ? { windows: r.windows.map(w => w.filter(p => kept.has(p))).filter(w => w.length) } : {}),
  };
}

// Folded forms in the order of the Greek alphabet: the fold's letters are
// Beta Code, whose Latin order puts ξ (c) before δ (d).
// Digamma (v) stands sixth, between ε and ζ.
const GREEK_ORDER = 'abgdevzhqiklmncoprstufxyw';
const letterRank = (ch: string) => {
  const i = GREEK_ORDER.indexOf(ch);
  return i < 0 ? GREEK_ORDER.length + ch.charCodeAt(0) : i;
};
export function compareForms(a: string, b: string): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = letterRank(a[i]) - letterRank(b[i]);
    if (d) return d;
  }
  return a.length - b.length;
}

/** The hits of one results page in the order `sort` asks for. They arrive in
 * Stephanus order, and every sort is stable, so that order holds among equals.
 * `work` orders by the work's title; `form` by form in Greek order; `freq` by
 * the hits each form has (counted over `items` unless `freq` is given, so a
 * group can be ordered by the page's counts), then by form. Under the last
 * two, the hits with no Greek come last. */
export function orderHits<T extends { work: string; form?: string; hits: number }>(
  items: T[],
  sort: ResultSort,
  title: (work: string) => string,
  freq?: ReadonlyMap<string, number>,
): T[] {
  if (sort === 'page') return items;
  if (sort === 'work') return [...items].sort((a, b) => title(a.work).localeCompare(title(b.work)));
  const counts = freq ?? items.reduce((m, x) => (x.form ? m.set(x.form, (m.get(x.form) ?? 0) + x.hits) : m), new Map<string, number>());
  return [...items].sort((a, b) => {
    if (!a.form || !b.form) return (a.form ? 0 : 1) - (b.form ? 0 : 1);
    if (sort === 'freq') {
      const d = (counts.get(b.form) ?? 0) - (counts.get(a.form) ?? 0);
      if (d) return d;
    }
    return compareForms(a.form, b.form);
  });
}

// -- Group by form ------------------------------------------------------------
//
// A form is its spelling, lower-cased, with the accents taken off and the
// rest kept: breathings, iota subscript, diaeresis and the elision mark (John,
// 13 Nov). So ἀρετή and ἀρετὴ are one form and the dative ἀρετῇ another,
// while an accent that moves within one form (ἐστίν, ἔστιν; πρᾶξίς before an
// enclitic) leaves it one. Searching stays blind to all of these
// (greekFold); this key only groups the hits found.
const ACCENTS = /[\u0300\u0301\u0342]/g;
const ELISION = /[\u2019\u02bc]/g;
/** The form key of a spelling; of each word, for a phrase, joined by a space. */
export function formKey(spelling: string): string {
  return spelling.trim().split(/\s+/).map(w => w.normalize('NFD').toLowerCase().replace(ACCENTS, '').replace(ELISION, "'").normalize('NFC')).join(' ');
}
/** A spelling as a heading counts it: a grave as the acute, never shown, and
 * a word's second accent (thrown back by an enclitic: πρᾶξίς) dropped. */
export function headingSpelling(spelling: string): string {
  return spelling.trim().split(/\s+/).map(w => {
    const d = w.normalize('NFD').replace(/\u0300/g, '\u0301');
    const accents = [...d.matchAll(/[\u0301\u0342]/g)];
    if (accents.length < 2) return d.normalize('NFC');
    const last = accents.at(-1)!.index!;
    return (d.slice(0, last) + d.slice(last + 1)).normalize('NFC');
  }).join(' ');
}
/** The one spelling a group of hits is headed by: the commonest among them,
 * counted as headingSpelling counts it; a tie goes to one in `prefer` (the
 * headword's own spelling), else to the first met. */
export function commonSpelling(spellings: string[], prefer?: ReadonlySet<string>): string {
  const counts = new Map<string, number>();
  for (const s of spellings) { const h = headingSpelling(s); counts.set(h, (counts.get(h) ?? 0) + 1); }
  let best = '';
  let n = 0;
  for (const [h, c] of counts) {
    if (c > n || (c === n && !prefer?.has(best) && prefer?.has(h))) { best = h; n = c; }
  }
  return best;
}

export interface FormGroupOf<T> {
  /** The form key (formKey); null for the hits with no Greek, grouped last. */
  key: string | null;
  /** Its letters folded (greekFold), which order the groups by form. */
  form: string | null;
  /** The one spelling the group is headed by (commonSpelling); "" for the English. */
  heading: string;
  items: T[];
  count: number;
  /** Its Greek hits, which order the groups: an item's `grk`, else its `hits`. */
  grk: number;
}

/** The items grouped by form key (`group`), most Greek hits first (an
 * item's `grk`, where it carries English hits too) and then in Greek order
 * (compareForms, as orderHits), each group keeping the items' order; the
 * items without a key in one group at the end. Each item's `spellings` are
 * the hits it holds, as printed, one apiece. */
export function formGroupsOf<T extends { group?: string; spellings?: string[]; hits: number; grk?: number }>(
  items: T[],
  prefer?: ReadonlySet<string>,
): FormGroupOf<T>[] {
  const byKey = new Map<string | null, FormGroupOf<T> & { spellings: string[] }>();
  for (const item of items) {
    const key = item.group ?? null;
    const g = byKey.get(key) ?? byKey.set(key, { key, form: key === null ? null : greekFold(key), heading: '', items: [], count: 0, grk: 0, spellings: [] }).get(key)!;
    g.items.push(item);
    g.count += item.hits;
    g.grk += item.grk ?? item.hits;
    g.spellings.push(...(item.spellings ?? []));
  }
  const english = byKey.get(null);
  byKey.delete(null);
  const groups = [...byKey.values()]
    .sort((a, b) => b.grk - a.grk || compareForms(a.form!, b.form!) || (a.key! < b.key! ? -1 : a.key! > b.key! ? 1 : 0));
  return [...groups, ...(english ? [english] : [])].map(({ spellings, ...g }) => ({ ...g, heading: g.key === null ? '' : commonSpelling(spellings, prefer) }));
}

// -- Group by grammar ---------------------------------------------------------
//
// Round B, option 2 (John, 13 Nov): the headword once, with its hits, and
// under it each spelling as a row headed by its parse in words, the rows in
// the order of a paradigm. A spelling whose readings give two parses says
// both in one row: the data parses spellings, not each word in its sentence,
// so its hits cannot be split between them.

const ORDER: Record<string, string[]> = {
  case: ['nom', 'gen', 'dat', 'acc', 'voc'],
  number: ['sg', 'dual', 'pl'],
  gender: ['masc', 'fem', 'neut'],
  tense: ['pres', 'imperf', 'fut', 'aor', 'perf', 'plup', 'futperf'],
  voice: ['act', 'mid', 'pass', 'mp'],
  mood: ['ind', 'subj', 'opt', 'imperat', 'inf', 'part'],
  person: ['1st', '2nd', '3rd'],
  degree: ['comp', 'superl', 'irreg_comp'],
};
const WORDS: Record<string, string> = {
  nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', voc: 'vocative',
  sg: 'singular', dual: 'dual', pl: 'plural', masc: 'masculine', fem: 'feminine', neut: 'neuter',
  pres: 'present', imperf: 'imperfect', fut: 'future', aor: 'aorist', perf: 'perfect', plup: 'pluperfect', futperf: 'future perfect',
  act: 'active', mid: 'middle', pass: 'passive', mp: 'middle or passive',
  ind: 'indicative', subj: 'subjunctive', opt: 'optative', imperat: 'imperative', inf: 'infinitive', part: 'participle',
  '1st': 'first', '2nd': 'second', '3rd': 'third', comp: 'comparative', superl: 'superlative', irreg_comp: 'comparative',
};
const sorted = (category: string, values: string[]) => {
  const at = (v: string) => { const i = ORDER[category]?.indexOf(v) ?? -1; return i < 0 ? 99 : i; };
  return [...values].sort((a, b) => at(a) - at(b) || a.localeCompare(b));
};
const said = (r: Reading, category: string) => sorted(category, licensed(r, category)).map(v => WORDS[v] ?? v).join(' or ');

// A reading in words, as its verb part ("present active indicative") and its
// noun part ("genitive singular"), the case kept apart so readings that
// differ only in case can share one ("genitive or dative singular").
function partsOf(r: Reading, gender: boolean) {
  const mood = licensed(r, 'mood');
  const verb = mood.length ? [said(r, 'tense'), said(r, 'voice'), said(r, 'mood')].filter(Boolean).join(' ') : '';
  const cases = sorted('case', licensed(r, 'case'));
  const finite = mood.length && !cases.length;
  const rest = (finite ? [said(r, 'person'), said(r, 'number')] : [said(r, 'number'), gender ? said(r, 'gender') : '', said(r, 'degree')])
    .filter(Boolean).join(' ');
  return { verb, cases, rest };
}

/** A spelling's parse in words, its readings joined by "or": "Genitive
 * singular or accusative plural", "Present active indicative, third
 * singular". `gender` names the gender, for a headword whose forms differ in
 * it. "" where the readings say nothing a reader is shown. */
export function parseLabel(readings: Reading[], gender: boolean): string {
  const phrases: { verb: string; cases: string[]; rest: string }[] = [];
  for (const r of [...readings].sort((a, b) => compareRanks(paradigmRank([a]), paradigmRank([b])))) {
    const p = partsOf(r, gender);
    const same = p.cases.length ? phrases.find(q => q.cases.length && q.verb === p.verb && q.rest === p.rest) : undefined;
    if (same) { for (const c of p.cases) if (!same.cases.includes(c)) same.cases.push(c); same.cases = sorted('case', same.cases); }
    else phrases.push(p);
  }
  const text = phrases.map(p => {
    const noun = [p.cases.map(c => WORDS[c] ?? c).join(' or '), p.rest].filter(Boolean).join(' ');
    return [p.verb, noun].filter(Boolean).join(', ');
  }).filter(Boolean);
  const out = [...new Set(text)].join(' or ');
  return out ? out[0].toUpperCase() + out.slice(1) : '';
}

/** Where readings stand in a paradigm, to order rows by: the forms of a noun
 * or adjective first, by number then case (then gender); a verb's by tense,
 * voice, mood, number and person, a participle's then by case and gender.
 * Of several readings, the first. Nothing to say, last. */
export function paradigmRank(readings: Reading[]): number[] {
  const at = (r: Reading, c: string) => Math.min(99, ...licensed(r, c).map(v => { const i = ORDER[c]?.indexOf(v) ?? -1; return i < 0 ? 98 : i; }));
  const ranks = readings.map(r => {
    if (licensed(r, 'mood').length) return [1, ...['tense', 'voice', 'mood', 'number', 'person', 'case', 'gender'].map(c => at(r, c))];
    if (licensed(r, 'case').length) return [0, ...['degree', 'number', 'case', 'gender'].map(c => at(r, c))];
    return [2];
  });
  return ranks.length ? ranks.sort(compareRanks)[0] : [3];
}
function compareRanks(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

export interface ParadigmRow<T> {
  key: string;
  /** The parse in words (parseLabel); "" where there is none. */
  label: string;
  /** The one spelling of the row (commonSpelling). */
  heading: string;
  items: T[];
  count: number;
  grk: number;
}
export interface ParadigmBlock<T> { head: string; rows: ParadigmRow<T>[]; items: T[]; count: number }

/** The items of a dictionary-word search as paradigms: one block for each
 * headword searched (`heads`, in the order picked) that has hits, its rows
 * one for each form key (`group`), in paradigm order, then by hits, then as
 * met. An item's `readings` are those of the words it holds; it is filed
 * under the headwords its readings name, else those its form belongs to
 * (`formHeads`, from the lemma map), else the first searched. The English
 * items come back apart. */
export function paradigmOf<T extends { group?: string; spellings?: string[]; hits: number; grk?: number; readings?: Reading[]; formHeads?: string[] }>(
  items: T[],
  heads: string[],
  prefer?: ReadonlySet<string>,
): { blocks: ParadigmBlock<T>[]; english: T[] } {
  const english: T[] = [];
  if (!heads.length) heads = [''];
  const rows = new Map<string, Map<string, { items: T[]; readings: Map<string, Reading>; spellings: string[]; count: number; grk: number }>>(heads.map(h => [h, new Map()]));
  for (const item of items) {
    if (item.group === undefined) { english.push(item); continue; }
    const named = heads.filter(h => item.readings?.some(r => Object.hasOwn(r, 'lemma') && r.lemma.includes(h)));
    const mapped = heads.filter(h => item.formHeads?.includes(h));
    const own = named.length ? named : mapped.length ? mapped : heads.slice(0, 1);
    for (const h of own) {
      const block = rows.get(h)!;
      const row = block.get(item.group) ?? block.set(item.group, { items: [], readings: new Map(), spellings: [], count: 0, grk: 0 }).get(item.group)!;
      row.items.push(item);
      row.count += item.hits;
      row.grk += item.grk ?? item.hits;
      row.spellings.push(...(item.spellings ?? []));
      for (const r of ownReadings(item.readings ?? [], new Set([h]))) {
        const { lemma: _, ...parse } = r;
        const id = JSON.stringify(Object.keys(parse).sort().map(c => [c, parse[c]]));
        if (!row.readings.has(id)) row.readings.set(id, parse);
      }
    }
  }
  const blocks: ParadigmBlock<T>[] = [];
  for (const [head, block] of rows) {
    if (!block.size) continue;
    const list = [...block.entries()].map(([key, row]) => ({ key, row, readings: [...row.readings.values()] }));
    // A gender is named where the headword's forms differ in it.
    const genders = new Set(list.flatMap(x => x.readings.map(r => sorted('gender', licensed(r, 'gender')).join('/')).filter(Boolean)));
    const out = list.map((x, i) => ({ i, rank: paradigmRank(x.readings), row: {
      key: `${head}\u0000${x.key}`, label: parseLabel(x.readings, genders.size > 1), heading: commonSpelling(x.row.spellings, prefer),
      items: x.row.items, count: x.row.count, grk: x.row.grk,
    } }));
    out.sort((a, b) => compareRanks(a.rank, b.rank) || b.row.grk - a.row.grk || a.i - b.i);
    const rowsOut = out.map(x => x.row);
    blocks.push({ head, rows: rowsOut, items: [...new Set(rowsOut.flatMap(r => r.items))], count: rowsOut.reduce((n, r) => n + r.count, 0) });
  }
  return { blocks, english };
}
