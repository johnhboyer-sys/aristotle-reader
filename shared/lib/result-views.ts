// The results page's grammar facets and its form grouping. The readings come
// from greekHitGrammar and the forms from greekHitForms (lib/search); this
// file only matches, counts, filters and groups, from the result set, so
// ticking a facet or changing the view asks the network for nothing.
import { BOTH_AT_ONCE, type HitForms, type HitGrammar, type LangOp, type Reading, type SearchResult } from './search';

/** How the hits of one results page are grouped: 'page' is by work, the
 * default (its id kept from the Stephanus page view it replaced); an old
 * address's v=work falls back to it. */
export type ResultView = 'page' | 'form' | 'grammar';
export const RESULT_VIEWS: readonly ResultView[] = ['page', 'form', 'grammar'];
/** How much text a hit shows: a line's worth, three, or its whole section. */
export type ResultContext = '1' | '3' | 's';
export const RESULT_CONTEXTS: readonly ResultContext[] = ['1', '3', 's'];
/** How the hits of one results page are ordered. */
export type ResultSort = 'page' | 'work' | 'form' | 'freq';
export const RESULT_SORTS: readonly ResultSort[] = ['page', 'work', 'form', 'freq'];
/** Hits per results page, or a list of citations alone. */
export type PageSize = '20' | '40' | '100' | 'c';
export const PAGE_SIZES: readonly PageSize[] = ['20', '40', '100', 'c'];

/** Category → the values ticked. A category with none ticked does not filter. */
export type Facets = Record<string, string[]>;

// The order a reading is printed and the facets are listed in: part of
// speech first (John, 2026-11-10, option B1), then the noun's categories,
// then the verb's.
const CATEGORY_ORDER = ['pos', 'case', 'number', 'gender', 'tense', 'mood', 'voice', 'person', 'degree'];
// Morpheus's raw word-class tags (`marker`) are still in the index but never
// shown: part of speech replaced them (option A1), and some are wrong
// (ἀλλά tagged an adverb). Not printed, not offered as a facet.
export const NOT_SHOWN = new Set(['marker']);
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

export interface FormGroupOf<T> {
  /** The folded form; null for the hits with no Greek, grouped last. */
  form: string | null;
  /** Its accented spellings among the items, in the order met. */
  surfaces: string[];
  items: T[];
  count: number;
  /** Its Greek hits, which order the groups: an item's `grk`, else its `hits`. */
  grk: number;
}

/** The items grouped by form, most Greek hits first (an item's `grk`, where
 * it carries English hits too) and then by form in Greek order (compareForms,
 * as orderHits), each group keeping the items' order;
 * the items without a form in one group at the end. */
export function formGroupsOf<T extends { form?: string; surface?: string; hits: number; grk?: number }>(items: T[]): FormGroupOf<T>[] {
  const byForm = new Map<string | null, FormGroupOf<T>>();
  for (const item of items) {
    const form = item.form ?? null;
    const g = byForm.get(form) ?? byForm.set(form, { form, surfaces: [], items: [], count: 0, grk: 0 }).get(form)!;
    g.items.push(item);
    g.count += item.hits;
    g.grk += item.grk ?? item.hits;
    if (item.surface && !g.surfaces.includes(item.surface)) g.surfaces.push(item.surface);
  }
  const english = byForm.get(null);
  byForm.delete(null);
  const groups = [...byForm.values()].sort((a, b) => b.grk - a.grk || compareForms(a.form!, b.form!));
  return english ? [...groups, english] : groups;
}
