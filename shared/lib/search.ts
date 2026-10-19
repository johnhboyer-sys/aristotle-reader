// Search engine — operates on the prebuilt inverted indexes from Stage 6.
//
// Greek search: input is Unicode Greek OR TLG Beta Code (with optional * wildcards).
//   Converted to fold form (base Beta Code letters only) to match the index.
//   Beta Code letters already ARE the fold form (θ→q, φ→f, χ→x, ψ→y, ξ→c,
//   η→h, ω→w, …), so Latin input passes straight through; accents/breathings
//   (the ) ( / \ = | + markers) are stripped, matching the index's fold form.
// English search: whitespace-tokenized, lowercase, asked of every translation
//   a work carries — each against its own index, so "all words" means all in
//   one translator's prose — and reported per translation.
// Phrase search: after intersection, verify token adjacency in segment data.
// Cross-language: AND (intersection) or OR (union) the two result sets.
import { memoAsyncBy } from './memo';
import { getWork, searchableTranslations, type TranslationRef } from './works';

// Honour Astro's base path. BASE_URL may lack a trailing slash, so strip + join.
// Same host override as data.ts: the desktop app points the whole data layer
// at an on-disk corpus via globalThis.__ARISTOTLE_DATA_ROOT__ (read lazily so
// module-import order doesn't matter); the site never sets it.
const DEFAULT_ROOT = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data`;
const ROOT = () =>
  (globalThis as { __ARISTOTLE_DATA_ROOT__?: string }).__ARISTOTLE_DATA_ROOT__ ?? DEFAULT_ROOT;
const searchBase = (work: string) => `${ROOT()}/${work}/search`;

// -- Data types -----------------------------------------------------------

export interface SegMeta {
  id: string;
  book: number;
  column: string;
}

type GrkIndex = Record<string, [number, number][]>; // fold → [[seg_idx, pos], ...]
type EngIndex = Record<string, [number, number][]>; // word → [[seg_idx, word_pos], ...]

// The word-offset primitive: one running token number per work, in document
// order, with the structural coordinates beside it. Global offset of a posting
// is seg_base_offset[seg_idx] + token_pos.
export interface Offsets {
  token_count: number;
  seg_base_offset: number[];
  // A run is [n, count], or [n, count, sub] on a lettered line (stage6 since
  // 2026-09-07). An older build carries only the pair, and a token on a
  // lettered line is then cited by the bare number, as it always was.
  segments: { book: number; column: string; line_runs: ([number, number] | [number, number, string])[] }[];
  book_bounds: { book: number; start: number }[];
  // accuracy is 'exact' where the chapter start was matched against the Greek
  // text, 'line-snapped' where the source knew only the Bekker line.
  chapter_bounds: { book: number; chapter: string; start: number; accuracy: string }[];
}

// A morphological reading: category → the values it licenses. A reading with
// more than one value for a category is syncretic ("fem nom/voc sg"), which is
// as genuinely ambiguous as two separate analyses.
type Reading = Record<string, string[]>;

// Signature dictionary + packed column. sigs[id] is the distinct readings a
// token's analyses license; the column holds one id per token, by global offset.
export interface GrammarDict {
  token_count: number;
  width: number;               // bytes per column entry
  categories: string[];
  reserved: { unkeyed: number; unanalysed: number };
  sigs: Reading[][];
}

// A grammatical query: category → required value, e.g. { mood: 'opt' }.
export type GrammarQuery = Record<string, string>;

// Greek search can match by dictionary headword ('lemma', every inflected form)
// or by the exact surface form as written ('form').
// lemma: the reader typed a word; resolve it to every headword it can belong
//   to (a typed inflection finds its dictionary entry) and search the lemma
//   index. form: the exact inflected token. headword: the caller already holds
//   the exact lemma keys (the picker's ticks) and wants those and nothing
//   wider — the lemma index, without resolution.
export type MatchMode = 'lemma' | 'form' | 'headword';

// -- Per-work index loading (cached, lazy per file) -----------------------
//
// Each index file is fetched and cached on its own, and only when a query
// actually needs it. This keeps the request burst small, which matters on
// Safari/WebKit, where a large simultaneous fetch burst can drop a request with
// "TypeError: Load failed" and (via Promise.all) sink the whole search. The
// lexical search reads the corpus shards instead (see below) and falls back to
// these files only for what the shards do not hold.

// Each loader memoises through lib/memo.ts, which evicts a rejection so a
// transient drop can be retried — a rejected promise must NOT stay cached
// (that would poison every later search in the tab). One memo per loader,
// rather than the single `_fileCache` these shared before: the three key spaces
// never overlapped anyway, which is why the corpus-level one needed its "::"
// prefix (so a path could not collide with a work called "lemma-map") and now
// does not.

// A per-work index is keyed `<work>/<file>`, the same string the error message
// quotes; the search directory sits between the two in the URL.
const searchUrl = (key: string) => {
  const at = key.indexOf('/');
  return `${searchBase(key.slice(0, at))}/${key.slice(at + 1)}`;
};

const _index = memoAsyncBy<string, unknown>(key =>
  fetch(searchUrl(key)).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${key}`);
    return r.json();
  }));

function loadIndex<T>(work: string, file: string): Promise<T> {
  return _index(`${work}/${file}`) as Promise<T>;
}

// The results page reads chapter edges from here to lay out its pages.
export function loadOffsets(work: string): Promise<Offsets> {
  return loadIndex<Offsets>(work, 'offsets.json');
}

// Corpus-level indexes live beside the per-work ones rather than inside them,
// so they are fetched from the root and memoised on their own path.
const _shared = memoAsyncBy<string, unknown>(path =>
  fetch(`${ROOT()}/${path}`).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
    return r.json();
  }));

function loadShared<T>(path: string): Promise<T> {
  return _shared(path) as Promise<T>;
}

// The grammatical column is binary (one small int per token, indexed by global
// offset), so it needs arrayBuffer rather than json. Cached the same way, in
// its own memo — the one .bin file never shares a key with a JSON index.
const _binary = memoAsyncBy<string, ArrayBuffer>(key =>
  fetch(searchUrl(key)).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${key}`);
    return r.arrayBuffer();
  }));

function loadBinary(work: string, file: string): Promise<ArrayBuffer> {
  return _binary(`${work}/${file}`);
}

// Run `fn` over `items` with at most `limit` in flight at once (bounds the
// concurrent-fetch burst that can make Safari drop requests with "Load
// failed"). Rejections propagate; callers that want per-item tolerance pass an
// `fn` that catches. Shared with the components — one loop, not three copies.
export async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// -- Unicode Greek → Beta Code fold form ----------------------------------

const GREEK_BETA: Record<string, string> = {
  α:'a',β:'b',γ:'g',δ:'d',ε:'e',ζ:'z',η:'h',θ:'q',ι:'i',κ:'k',
  λ:'l',μ:'m',ν:'n',ξ:'c',ο:'o',π:'p',ρ:'r',σ:'s',ς:'s',τ:'t',
  υ:'u',φ:'f',χ:'x',ψ:'y',ω:'w',ϝ:'v',
};

export function greekFold(input: string): string {
  const out: string[] = [];
  for (const ch of input.normalize('NFD')) {
    const lower = ch.toLowerCase();
    const b = GREEK_BETA[lower];
    if (b) out.push(b);                          // Unicode Greek → fold letter
    else if (lower >= 'a' && lower <= 'z') out.push(lower); // Beta Code Latin input
    // Elision: the index keys δ' as d'. The page prints the mark as U+2019
    // (δ’), so a word copied from the text must fold to the same key as one
    // typed with a straight apostrophe.
    else if (ch === "'" || ch === '\u2019' || ch === '\u02bc') out.push("'");
    // skip combining marks, punctuation, Beta Code diacritics ) ( / \ = | +,
    // asterisk (handled by caller), and sigma-variant digits
  }
  return out.join('');
}

// Fold a pattern without losing its metacharacters. Folding one character at
// a time keeps * and ? out of greekFold(), where they are deliberately ignored
// with punctuation and diacritics.
// A pattern's `prefix` is its literal text before the first metacharacter,
// which is what decides the corpus shards it can match in.
type CompiledPattern = { exact: string } | { test: (key: string) => boolean; prefix: string };

function compilePattern(
  term: string,
  fold: (s: string) => string,
): CompiledPattern | null {
  // A leading * is Beta Code's capital marker, so a Greek pattern drops it.
  // English has no such use for it, and there it is a wildcard like any
  // other: *ness finds happiness and goodness. Dropping it there turned the
  // query into the exact word "ness" and found nothing.
  const input = fold === greekFold ? term.replace(/^\*+/, '') : term;
  let pattern = '';
  for (const ch of input) {
    pattern += ch === '*' || ch === '?' ? ch : fold(ch);
  }
  if (!pattern) return null;

  if (!pattern.includes('*') && !pattern.includes('?')) {
    return { exact: pattern };
  }

  // Preserve the common trailing-* fast path without compiling or scanning
  // with a regular expression.
  if (pattern.endsWith('*')
    && !pattern.slice(0, -1).includes('*')
    && !pattern.includes('?')) {
    const prefix = pattern.slice(0, -1);
    return { test: key => key.startsWith(prefix), prefix };
  }

  // Index keys contain only fold letters and apostrophes. Build the expression
  // from known-safe pieces rather than interpolating user input.
  const pieces: string[] = [];
  for (const ch of pattern) {
    if (ch === '*') pieces.push("[a-z']*");
    else if (ch === '?') pieces.push("[a-z']");
    else pieces.push(ch);
  }
  const regex = new RegExp(`^${pieces.join('')}$`);
  return { test: key => regex.test(key), prefix: pattern.slice(0, pattern.search(/[*?]/)) };
}

// The one statement of what an English word is, on the reader's side; stage6's
// english_words() is its mirror on the index side (pinned by a pipeline test).
// The page prints possession and elision with U+2019 (Aristotle’s) and quotes
// with U+2018/U+2019 (‘change’): both become a straight apostrophe, and an
// apostrophe at a word's edge is a quotation mark, not part of the word.
const ENGLISH_QUOTES = /[\u2018\u2019\u02bc]/g;
// Ligatures become two letters and accents drop off, so "Lacedæmonians" is
// the word a reader types, not "laced" + "monians". Mirror of stage6's
// _latin_fold. Takes lowercase input.
function latinFold(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00e6/g, 'ae').replace(/\u0153/g, 'oe');
}
function englishFold(input: string): string {
  return latinFold(input.toLowerCase().replace(ENGLISH_QUOTES, "'")).replace(/[^a-z']/g, '');
}
function englishTerm(term: string): string {
  return term.replace(ENGLISH_QUOTES, "'").replace(/^'+|'+$/g, '');
}

// Apparatus a translation's prose carries inline: a footnote marker [^1.9] is
// glued to the word before it and drops out; a sidenote or figure marker
// [[s3]] / [[fig1]] stands between words. Neither is a word. Mirror of stage6's
// _EN_FOOTNOTE / _EN_SIDENOTE.
const EN_FOOTNOTE = /\[\^[0-9A-Za-z_.*\u2020]+\]/y;
const EN_SIDENOTE = /\[\[(?:s|fig)[0-9]+\]\]/y;

// Only the elision marks become apostrophes on the index side; an opening
// quote U+2018 is punctuation there, so it splits a word here too.
const INDEX_APOSTROPHE = /[\u2019\u02bc]/g;

export interface EnglishWord { word: string; start: number; end: number }

/** The words of a stretch of English as the index counts them, each with the
 * span it occupies in `text` as given (markers included), so a posting's
 * word_pos can be turned back into a place on the page. stage6's
 * english_words() is the same split; a shared fixture pins the two. */
export function englishWords(text: string): EnglishWord[] {
  const out: EnglishWord[] = [];
  let word = '';
  let offsets: number[] = [];
  let ends: number[] = [];
  const close = () => {
    let a = 0;
    let b = word.length;
    while (a < b && word[a] === "'") a++;
    while (b > a && word[b - 1] === "'") b--;
    if (a < b) out.push({ word: word.slice(a, b), start: offsets[a], end: ends[b - 1] });
    word = '';
    offsets = [];
    ends = [];
  };
  for (let i = 0; i < text.length;) {
    if (text[i] === '[') {
      EN_FOOTNOTE.lastIndex = i;
      if (EN_FOOTNOTE.test(text)) { i = EN_FOOTNOTE.lastIndex; continue; }
      EN_SIDENOTE.lastIndex = i;
      if (EN_SIDENOTE.test(text)) { close(); i = EN_SIDENOTE.lastIndex; continue; }
    }
    // Lowercased and folded a character at a time, as Python does the whole
    // string: æ gives two letters, both at this character, and a combining
    // accent gives none, so it neither joins nor splits the word.
    const folded = latinFold(text[i].replace(INDEX_APOSTROPHE, "'").toLowerCase());
    // An accent written as its own character belongs to the letter before it,
    // so the word's span runs through it: "cafe\u0301" is marked whole.
    if (!folded && ends.length) ends[ends.length - 1] = i + 1;
    for (const ch of folded) {
      if ((ch >= 'a' && ch <= 'z') || ch === "'") { word += ch; offsets.push(i); ends.push(i + 1); }
      else close();
    }
    i++;
  }
  close();
  return out;
}

// "Any form" in English: a typed word also finds its plural and possessive
// forms, and a plural or possessive its singular. Exact matching found
// "virtue" 232 times in Rackham's Ethics and missed "virtues" 83 times; a
// wildcard (virtue*) finds the plural but also every word that merely begins
// the same way. Only forms the index holds are looked up (englishMatch), so a
// rule's misfire ("virtu" from "virtues") costs nothing.
//
// A word under three letters is left alone, and no rule makes one: "a" would
// otherwise find "as", and "is" or "us" would lose their s. A plural
// possessive (virtues') is indexed as the plural, since the index strips an
// apostrophe at a word's edge, so "-s'" needs no form of its own.
const EN_IRREGULAR = new Map<string, string>([
  ['child', 'children'], ['foot', 'feet'], ['tooth', 'teeth'], ['goose', 'geese'],
  ['mouse', 'mice'], ['ox', 'oxen'], ['life', 'lives'], ['wife', 'wives'],
  ['knife', 'knives'], ['half', 'halves'], ['self', 'selves'], ['leaf', 'leaves'],
  ['wolf', 'wolves'], ['calf', 'calves'], ['thief', 'thieves'], ['genus', 'genera'],
  ['phenomenon', 'phenomena'], ['criterion', 'criteria'], ['basis', 'bases'],
  ['hypothesis', 'hypotheses'], ['analysis', 'analyses'], ['thesis', 'theses'],
  ['crisis', 'crises'], ['axis', 'axes'],
].flatMap(([one, many]) => [[one, many], [many, one]]));

// Words in -s that are not the plural of the word without it: "news" is not
// more than one "new", nor "politics" of "politic". "Means" is usually a word
// of its own (a means to an end, a man's means) and almost never the plural of
// the ethical mean. No rule makes one of these or takes its s away.
const EN_NOT_PLURAL = new Set([
  'news', 'means', 'politics', 'ethics', 'physics', 'mathematics', 'economics', 'species', 'series',
]);

// The singulars a word may be a plural of, itself included. Man/men,
// woman/women and every -man compound (statesman, craftsman) go by rule.
function englishSingulars(w: string): string[] {
  const out = [w];
  if (EN_NOT_PLURAL.has(w)) return out;
  if (w.endsWith('ies')) out.push(`${w.slice(0, -3)}y`, w.slice(0, -1));
  else if (/(?:s|x|z|ch|sh|o)es$/.test(w)) out.push(w.slice(0, -2), w.slice(0, -1));
  // Not -ss, -us, -is: class, genus and basis are singulars.
  else if (/[^siu']s$/.test(w)) out.push(w.slice(0, -1));
  if (w.endsWith('men')) out.push(`${w.slice(0, -3)}man`);
  const irregular = EN_IRREGULAR.get(w);
  if (irregular) out.push(irregular);
  return out.filter(s => s.length >= 3 || EN_IRREGULAR.has(s));
}

// A singular's own forms: itself and its possessive, its plurals, and the
// possessive of each plural that does not end in s (men's).
function englishPlurals(w: string): string[] {
  const out: string[] = [];
  if (/(?:s|x|z|ch|sh)$/.test(w)) out.push(`${w}es`);
  else {
    out.push(`${w}s`);
    if (w.endsWith('o')) out.push(`${w}es`);
    if (/[^aeiou]y$/.test(w)) out.push(`${w.slice(0, -1)}ies`);
  }
  if (w.endsWith('man')) out.push(`${w.slice(0, -3)}men`);
  const irregular = EN_IRREGULAR.get(w);
  if (irregular) out.push(irregular);
  return [w, `${w}'s`, ...out
    .filter(f => !EN_NOT_PLURAL.has(f))
    .flatMap(f => (f.endsWith('s') ? [f] : [f, `${f}'s`]))];
}

/** Every form "any form" looks up for one word as the index keys it (folded,
 * lowercase), the word itself first. A wildcard term is its own only form. */
export function englishForms(word: string): string[] {
  if (/[*?]/.test(word)) return [word];
  const bare = word.endsWith("'s") ? word.slice(0, -2) : word;
  if (bare.length < 3 && !EN_IRREGULAR.has(bare)) return [word];
  const forms = new Set([word]);
  for (const one of englishSingulars(bare)) for (const f of englishPlurals(one)) forms.add(f);
  return [...forms];
}

/** True for a word (as englishWords() gives it) that the typed term matches,
 * by the same rule the index lookup uses; with `forms`, any form of it. */
export function englishTermMatcher(terms: string[], forms = false): (word: string) => boolean {
  const tests = terms.map(t => {
    if (t === '*') return () => true;
    const pattern = compilePattern(englishTerm(t), englishFold);
    if (!pattern) return () => false;
    if (!('exact' in pattern)) return pattern.test;
    if (!forms) return (w: string) => w === pattern.exact;
    const all = new Set(englishForms(pattern.exact));
    return (w: string) => all.has(w);
  });
  return word => tests.some(test => test(word));
}

/** An English query as units of words, each unit one typed term. The index
 * splits text wherever englishWords() does, so "coming-to-be" is three
 * indexed words; typed as one term it was looked up as "comingtobe" and found
 * nothing. Here a term splits the same way, and its pieces become a unit that
 * must stand together, in order. A wildcard stays inside its piece. */
export function englishQueryUnits(query: string): string[][] {
  return query.trim().split(/\s+/).filter(Boolean)
    .map(term => latinFold(term.replace(ENGLISH_QUOTES, "'").toLowerCase()).split(/[^a-z'*?]+/)
      .map(w => w.replace(/^'+|'+$/g, ''))
      .filter(Boolean))
    .filter(unit => unit.length > 0);
}

// Which index holds a translation's words: english.json for the primary, and
// one english-<slot>.json for each translation beyond it (stage6
// emit_translation_indexes names them the same way). The slot alone names the
// translation's postings in the corpus shards, as "<work>/<slot>".
function englishIndexSlot(t: Pick<TranslationRef, 'id' | 'slot'>): string {
  return t.slot === 'overlay' ? `overlay-${t.id}` : t.slot;
}
export function englishIndexFile(t: Pick<TranslationRef, 'id' | 'slot'>): string {
  const slot = englishIndexSlot(t);
  return slot === 'english' ? 'english.json' : `english-${slot}.json`;
}

// The translations an English query is asked of in one work. A work the
// registry does not know (or that names no translation) still has its
// primary index.
function englishSources(work: string): Pick<TranslationRef, 'id' | 'slot'>[] {
  const w = getWork(work);
  const ts = w ? searchableTranslations(w) : [];
  return ts.length ? ts : [{ id: 'english', slot: 'english' }];
}

// -- Posting-list helpers -------------------------------------------------

function grkPosting(idx: GrkIndex, term: string): Set<number> {
  const pattern = compilePattern(term, greekFold);
  if (!pattern) return new Set();
  if ('exact' in pattern) {
    return new Set((idx[pattern.exact] ?? []).map(([si]) => si));
  }
  const result = new Set<number>();
  for (const key of Object.keys(idx)) {
    if (pattern.test(key)) {
      for (const [si] of idx[key]) result.add(si);
    }
  }
  return result;
}

// Every segment the index holds a word in: what a bare * matches.
function engEverySegment(idx: EngIndex): Set<number> {
  const result = new Set<number>();
  for (const ps of Object.values(idx)) for (const [si] of ps) result.add(si);
  return result;
}

function intersect(a: Set<number>, b: Set<number>): Set<number> {
  return new Set([...a].filter(x => b.has(x)));
}

function union(a: Set<number>, b: Set<number>): Set<number> {
  return new Set([...a, ...b]);
}

// Phrase check, by posting adjacency: seg_idx → start positions of every run
// where the terms occupy consecutive token positions, in order.
//
// This works off the same postings the query already intersected, so it uses
// whichever index the match mode selected (surface forms for 'form', every
// analysis lemma for 'lemma'), and wildcard terms participate via their
// postings. Token positions count EVERY token, so an unanalysed word between
// two terms correctly breaks adjacency.
//
// Each term is a list of ALTERNATIVE keys, any of which may stand at that
// position: a lemma search resolves a typed inflection to every headword it can
// belong to, and a phrase typed as it stands on the page — κατὰ συμβεβηκός —
// must find its run under whichever of those headwords the token was analysed
// to. Taking only the first alternative found nothing for exactly the phrases
// a reader copies off the page.
function phraseStarts(
  idx: GrkIndex,
  terms: string[][],
  fold: (s: string) => string = greekFold,
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const perTerm = terms.map(alts => {
    if (alts.length === 1) return termPositions(idx, alts[0], fold);
    const merged = new Map<number, number[]>();
    for (const alt of alts) {
      for (const [si, ps] of termPositions(idx, alt, fold)) {
        const arr = merged.get(si);
        if (arr) arr.push(...ps);
        else merged.set(si, [...ps]);
      }
    }
    return merged;
  });
  const first = perTerm[0];
  if (!first) return out;
  for (const [si, firstPositions] of first) {
    const rest = perTerm.slice(1).map(m => new Set(m.get(si) ?? []));
    if (rest.some(s => s.size === 0)) continue;
    const starts = [...new Set(firstPositions)]
      .filter(p => rest.every((s, j) => s.has(p + j + 1)))
      .sort((a, b) => a - b);
    if (starts.length) out.set(si, starts);
  }
  return out;
}

// -- Public search API ----------------------------------------------------

export type SearchMode = 'all' | 'any' | 'phrase';
export type LangOp = 'and' | 'or';

// One translation's English match in a segment: which translation (a
// TranslationRef id) and the word positions the query matched there, counted
// as englishWords() counts them through that translation's text for the
// segment. Positions are empty only for a bare *, which no word answers.
export interface EngHit { translation: string; positions: number[] }

export interface SearchResult {
  work: string;           // which work this hit belongs to
  meta: SegMeta;
  grkMatch: boolean;
  engMatch: boolean;      // true iff engHits is non-empty
  // Every translation the English query matched in this segment, in registry
  // order. Absent on a Greek-only search.
  engHits?: EngHit[];
  grkPositions: number[]; // token positions in the segment where a Greek term matched
  // Grammatical hits only, parallel to grkPositions: the values each position's
  // readings license for the queried categories, and whether every reading
  // agrees. `certain: false` must be shown as one-of-N, never asserted.
  grammar?: { values: Record<string, string[]>; certain: boolean }[];
}

// search() returns the hits PLUS any works whose index failed to load, so the
// UI can flag an incomplete result instead of presenting a partial search as
// exhaustive. `failedWorks` is empty on a fully successful search.
export interface SearchOutcome {
  results: SearchResult[];
  failedWorks: string[];  // work ids that could not be searched this run
  // Translations whose index did not load, so the English query was not asked
  // of them: a corpus emitted before those indexes existed, or a dropped
  // fetch. The primary translation's index failing fails the work instead.
  unsearchedTranslations?: { work: string; translation: string }[];
  // Works whose chapter starts are known only to the Bekker line, reported ONLY
  // when the query actually leans on chapter geometry. The pipeline stamps each
  // bound exact or line-snapped; saying nothing here would let a chapter-scoped
  // result imply a precision the source does not have. Categories and De
  // Interpretatione declare chapters by Bekker line, so nearly every edge in
  // them is approximate.
  approximateChapters?: string[];
}

// Positions of a single term across segments: seg_idx → [token positions].
function termPositions(
  idx: GrkIndex,
  term: string,
  fold: (s: string) => string = greekFold,
): Map<number, number[]> {
  const m = new Map<number, number[]>();
  const add = (posts: [number, number][]) => {
    for (const [si, pos] of posts) {
      const arr = m.get(si);
      if (arr) arr.push(pos);
      else m.set(si, [pos]);
    }
  };
  const pattern = compilePattern(term, fold);
  if (!pattern) return m;
  if ('exact' in pattern) {
    add(idx[pattern.exact] ?? []);
  } else {
    for (const key of Object.keys(idx)) if (pattern.test(key)) add(idx[key]);
  }
  return m;
}

// For each segment in `hits`, the token positions to highlight in a KWIC snippet.
function greekPositions(
  idx: GrkIndex,
  terms: string[][],
  mode: SearchMode,
  hits: Set<number>,
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  if (mode === 'phrase' && terms.length > 1) {
    for (const [si, starts] of phraseStarts(idx, terms)) {
      if (!hits.has(si)) continue;
      const ps: number[] = [];
      for (const s of starts) for (let j = 0; j < terms.length; j++) ps.push(s + j);
      out.set(si, ps);
    }
  } else {
    for (const t of terms.flat()) {
      for (const [si, ps] of termPositions(idx, t)) {
        if (!hits.has(si)) continue;
        const arr = out.get(si);
        if (arr) arr.push(...ps);
        else out.set(si, [...ps]);
      }
    }
  }
  for (const [si, ps] of out) out.set(si, [...new Set(ps)].sort((a, b) => a - b));
  return out;
}

// Where one unit of an English query stands in an index: seg_idx -> the word
// positions of every run of it. A one-word unit is any occurrence; a
// hyphenated term's words must stand in a row. With `forms`, each word may
// stand as any of its forms this index holds.
function unitMatch(
  idx: EngIndex,
  unit: string[],
  forms: boolean,
): { segs: Set<number>; positions: Map<number, number[]> } {
  const positions = new Map<number, number[]>();
  // The bare *: every word matches it, so no word is the hit.
  if (unit.length === 1 && unit[0] === '*') return { segs: engEverySegment(idx), positions };
  const alts = unit.map(t => (forms
    ? englishForms(englishTerm(t)).filter((f, i) => i === 0 || f in idx)
    : [englishTerm(t)]));
  for (const [si, starts] of phraseStarts(idx, alts, englishFold)) {
    positions.set(si, starts.flatMap(start => unit.map((_, j) => start + j)));
  }
  return { segs: new Set(positions.keys()), positions };
}

// The segments one English index matches by the mode's rule, and where in
// each the query's words stand. An exact phrase is all the units in a row.
function englishMatch(
  idx: EngIndex,
  units: string[][],
  engMode: SearchMode,
  forms: boolean,
): { segs: Set<number>; positions: Map<number, number[]> } {
  const matches = (engMode === 'phrase' ? [units.flat()] : units).map(u => unitMatch(idx, u, forms));
  const segs = matches.map(m => m.segs).reduce(engMode === 'any' ? union : intersect);
  const positions = new Map<number, number[]>();
  for (const si of segs) {
    const ps = new Set<number>();
    for (const m of matches) for (const p of m.positions.get(si) ?? []) ps.add(p);
    if (ps.size) positions.set(si, [...ps].sort((a, b) => a - b));
  }
  return { segs, positions };
}

interface WorkOutcome { results: SearchResult[]; unsearched: string[] }

// -- Corpus search shards ---------------------------------------------------
//
// Stage 9 merges every work's lexical indexes into one set per stream, split
// by a word's first two letters: {word: {source: postings}}. A query fetches
// only the shards its words can fall in — "happiness" is one shard, where it
// used to be every work's english.json — and the postings are the per-work
// ones unchanged, so the matching here runs on them as it always did.
// index.json lists each stream's shards and sources: the work for Greek,
// "<work>/<slot>" for English. A source it does not list (a corpus built
// before the shards, or a translation the desktop app imported) is read from
// the work's own file, as is everything when the shards are absent.

type Stream = 'lemma' | 'form' | 'english';
interface ShardListing { streams: Partial<Record<Stream, { shards: string[]; sources: Record<string, string> }>> }
type Shard = Record<string, Record<string, [number, number][]>>;
// One query's part of a stream: every key its terms match -> source -> postings.
type Slice = Map<string, Record<string, [number, number][]>>;

/** The shard a word is filed under. Mirror of stage9's shard_name(); a shared
 * fixture pins the two, since a word looked up under another name than it was
 * filed under is simply not found. */
export function shardName(word: string): string {
  let out = '';
  for (let i = 0; i < 2; i++) {
    const c = word[i] ?? '';
    out += c >= 'a' && c <= 'z' ? c : '_';
  }
  return out;
}

// The shards a pattern can match in. An exact word is in one; a pattern's
// literal prefix fixes as many of the two letters as it has itself, so hap*
// is one shard, h* every h-shard, and *ness all of them.
function shardsFor(pattern: CompiledPattern, listed: string[]): string[] {
  const literal = 'exact' in pattern ? pattern.exact : pattern.prefix;
  const fixed = 'exact' in pattern ? 2 : Math.min(literal.length, 2);
  const want = shardName(literal).slice(0, fixed);
  return listed.filter(name => name.slice(0, fixed) === want);
}

async function shardSlice(stream: Stream, listed: string[], patterns: CompiledPattern[]): Promise<Slice> {
  const names = [...new Set(patterns.flatMap(p => shardsFor(p, listed)))];
  const shards = await pool(names, 8, name => loadShared<Shard>(`search-shards/${stream}/${name}.json`));
  const slice: Slice = new Map();
  for (const shard of shards) {
    for (const key of Object.keys(shard)) {
      if (patterns.some(p => ('exact' in p ? p.exact === key : p.test(key)))) slice.set(key, shard[key]);
    }
  }
  return slice;
}

// Where one query's lexical indexes come from. Each per-work index it hands
// out holds only the keys the query's terms match, which is all the matching
// ever reads. The slice for a stream is cut once per query and shared by
// every work.
interface QueryIndexes {
  greek(work: string): Promise<GrkIndex>;
  english(work: string, t: Pick<TranslationRef, 'id' | 'slot'>): Promise<EngIndex>;
}

function queryIndexes(greekStream: 'lemma' | 'form', grkTerms: string[], engTerms: string[]): QueryIndexes {
  // Without a listing every index is read from its work, exactly as before
  // the shards existed.
  const listing = loadShared<ShardListing>('search-shards/index.json').catch(() => null);
  const slices = new Map<Stream, Promise<Slice>>();
  const index = async (
    stream: Stream, source: string, terms: string[], fold: (s: string) => string,
    work: string, file: string,
  ): Promise<Record<string, [number, number][]>> => {
    const entry = (await listing)?.streams?.[stream];
    if (!entry || !Object.hasOwn(entry.sources, source)) return loadIndex(work, file);
    let slice = slices.get(stream);
    if (!slice) {
      const patterns = terms.map(t => compilePattern(t, fold)).filter(p => p !== null);
      slice = shardSlice(stream, entry.shards, patterns);
      slices.set(stream, slice);
    }
    const idx: Record<string, [number, number][]> = Object.create(null);
    for (const [key, bySource] of await slice) {
      if (Object.hasOwn(bySource, source)) idx[key] = bySource[source];
    }
    return idx;
  };
  return {
    greek: work => index(greekStream, work, grkTerms, greekFold, work,
      greekStream === 'form' ? 'greek_form.json' : 'greek_lemma.json'),
    english: (work, t) => index('english', `${work}/${englishIndexSlot(t)}`,
      engTerms.map(englishTerm), englishFold, work, englishIndexFile(t)),
  };
}

// Search one work, returning hits tagged with that work.
async function searchWork(
  work: string,
  grkTerms: string[][],
  engUnits: string[][],
  grkMode: SearchMode,
  engMode: SearchMode,
  langOp: LangOp,
  indexes: QueryIndexes,
  engForms: boolean,
): Promise<WorkOutcome> {
  // Fetch only what this query needs: the Greek index iff there are Greek
  // terms; an English index per translation iff there are English terms.
  // Kick them off together, then await.
  const grkP: Promise<GrkIndex | null> = grkTerms.length ? indexes.greek(work) : Promise.resolve(null);
  const sources = engUnits.length ? englishSources(work) : [];
  // The primary index failing fails the work, as it always has; any other
  // translation's only drops that translation, and says so.
  const unsearched: string[] = [];
  const engP = sources.map(t => {
    const p = indexes.english(work, t);
    if (t.slot === 'english') return p;
    return p.catch(err => {
      console.warn(`search: ${work} ${t.id} not searched —`, err);
      unsearched.push(t.id);
      return null;
    });
  });
  const grkIdx = await grkP;
  const engIdxs = await Promise.all(engP);

  let grkHits: Set<number> | null = null;
  let engHits: Set<number> | null = null;

  if (grkTerms.length > 0 && grkIdx) {
    // Each term carries the keys it may match — one for a form search, the
    // headwords a typed inflection belongs to for a lemma one — so a term is
    // satisfied by ANY of its keys before the modes combine the terms.
    const postings = grkTerms.map(alts =>
      alts.map(t => grkPosting(grkIdx, t)).reduce(union));
    if (grkMode === 'any') {
      grkHits = postings.reduce(union);
    } else {
      grkHits = postings.reduce(intersect);
      if (grkMode === 'phrase' && grkTerms.length > 1) {
        // A phrase needs its words in order; each position may hold any of
        // the keys its term resolved to.
        grkHits = new Set(phraseStarts(grkIdx, grkTerms).keys());
      }
    }
  }

  // seg_idx -> each translation's hit there, in registry order.
  const engBySeg = new Map<number, EngHit[]>();
  if (engUnits.length > 0) {
    engHits = new Set();
    sources.forEach((t, i) => {
      const idx = engIdxs[i];
      if (!idx) return;
      const { segs: hits, positions } = englishMatch(idx, engUnits, engMode, engForms);
      for (const si of hits) {
        engHits!.add(si);
        const hit = { translation: t.id, positions: positions.get(si) ?? [] };
        const arr = engBySeg.get(si);
        if (arr) arr.push(hit);
        else engBySeg.set(si, [hit]);
      }
    });
  }

  let combined: Set<number>;
  if (grkHits !== null && engHits !== null) {
    combined = langOp === 'and' ? intersect(grkHits, engHits) : union(grkHits, engHits);
  } else {
    combined = grkHits ?? engHits ?? new Set();
  }

  const grkPos = grkHits && grkIdx
    ? greekPositions(grkIdx, grkTerms, grkMode, grkHits)
    : new Map<number, number[]>();

  // Only a work with hits needs to name them.
  if (!combined.size) return { results: [], unsearched };
  const meta = await loadIndex<SegMeta[]>(work, 'meta.json');
  const results = [...combined]
    .sort((a, b) => a - b)
    .map(si => ({
      work,
      meta: meta[si],
      grkMatch: grkHits?.has(si) ?? false,
      engMatch: engHits?.has(si) ?? false,
      ...(engHits ? { engHits: engBySeg.get(si) ?? [] } : {}),
      grkPositions: grkPos.get(si) ?? [],
    }));
  return { results, unsearched };
}

// Turn a global offset into a citable position, using only offsets.json — the
// phrase browser shows hundreds of citations at once and must not have to fetch
// a whole book for each. line_runs exists for exactly this.
export interface OffsetRef { seg_idx: number; pos: number; book: number; column: string; line: number; sub?: string }

export function offsetRef(offsets: Offsets, global: number): OffsetRef | null {
  const base = offsets.seg_base_offset;
  if (!base.length || global < 0 || global >= offsets.token_count) return null;
  const [seg_idx, pos] = locate(base, global);
  const seg = offsets.segments[seg_idx];
  if (!seg) return null;
  let left = pos;
  for (const [line, count, sub] of seg.line_runs) {
    if (left < count) {
      return { seg_idx, pos, book: seg.book, column: seg.column, line, ...(sub ? { sub } : {}) };
    }
    left -= count;
  }
  return null;
}

// -- Grammatical search ---------------------------------------------------
//
// A separate engine from the lexical one above, deliberately: it answers "which
// words are in the optative", not "where does this word occur". Combining the
// two in one query is combo search, which is a later piece of work.
//
// Honesty rules, applied here and rendered by the UI:
//   possible — at least one of a token's readings satisfies the query. That is
//              what a match means, and it is all a match ever claims.
//   certain  — every reading satisfies it AND each queried category has exactly
//              one licensed value. Anything else is one-of-N.
// A token whose sole analysis is "fem nom/voc sg" is NOT certain for case: one
// analysis record, two possible cases.

function readingSatisfies(reading: Reading, query: GrammarQuery): boolean {
  for (const category in query) {
    if (!reading[category]?.includes(query[category])) return false;
  }
  return true;
}

// Which signature ids satisfy the query, and how ambiguous each one is. The
// dictionary is small (a few thousand entries), so this is compiled once per
// work and the column scan then costs one lookup per token.
function compileQuery(dict: GrammarDict, query: GrammarQuery) {
  const matches = new Map<number, { values: Record<string, string[]>; certain: boolean }>();
  dict.sigs.forEach((readings, id) => {
    if (!readings.length || !readings.some(r => readingSatisfies(r, query))) return;
    const values: Record<string, string[]> = {};
    for (const category in query) {
      const licensed = new Set<string>();
      for (const reading of readings) for (const v of reading[category] ?? []) licensed.add(v);
      values[category] = [...licensed].sort();
    }
    const certain =
      readings.every(r => readingSatisfies(r, query)) &&
      Object.values(values).every(v => v.length === 1);
    matches.set(id, { values, certain });
  });
  return matches;
}

// Turn a global offset back into (seg_idx, token_pos).
function locate(base: number[], global: number): [number, number] {
  let lo = 0;
  let hi = base.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (base[mid] <= global) lo = mid;
    else hi = mid - 1;
  }
  return [lo, global - base[lo]];
}

async function grammarSearchWork(work: string, query: GrammarQuery): Promise<SearchResult[]> {
  const [meta, offsets, dict] = await Promise.all([
    loadIndex<SegMeta[]>(work, 'meta.json'),
    loadIndex<Offsets>(work, 'offsets.json'),
    loadIndex<GrammarDict>(work, 'grammar-dict.json'),
  ]);
  // The column is joined to the offsets by position alone, so a mismatched
  // token_count means the two files came from different builds — refuse rather
  // than silently report the wrong words.
  if (dict.token_count !== offsets.token_count) {
    throw new Error(`${work}: grammar/offsets built from different runs`);
  }
  const wanted = compileQuery(dict, query);
  if (!wanted.size) return [];

  const buffer = await loadBinary(work, 'grammar-col.bin');
  const column = dict.width === 4 ? new Uint32Array(buffer) : new Uint16Array(buffer);
  if (column.length !== offsets.token_count) {
    throw new Error(`${work}: grammar column length does not match token count`);
  }

  const bySeg = new Map<number, SearchResult>();
  for (let global = 0; global < column.length; global++) {
    const hit = wanted.get(column[global]);
    if (!hit) continue;
    const [si, pos] = locate(offsets.seg_base_offset, global);
    let result = bySeg.get(si);
    if (!result) {
      result = {
        work,
        meta: meta[si],
        grkMatch: true,
        engMatch: false,
        grkPositions: [],
        grammar: [],
      };
      bySeg.set(si, result);
    }
    result.grkPositions.push(pos);
    result.grammar!.push(hit);
  }
  return [...bySeg.keys()].sort((a, b) => a - b).map(si => bySeg.get(si)!);
}

// Grammatical search across one or more works. Same per-work failure tolerance
// as search(): a work whose index will not load is reported, not fatal.
export async function searchGrammar(
  query: GrammarQuery,
  works: string[],
): Promise<SearchOutcome> {
  if (!Object.keys(query).length || !works.length) {
    return { results: [], failedWorks: [] };
  }
  const failedWorks: string[] = [];
  const perWork = await pool(works, 8, async w => {
    try {
      return await grammarSearchWork(w, query);
    } catch (err) {
      console.warn(`searchGrammar: skipping ${w} —`, err);
      failedWorks.push(w);
      return [] as SearchResult[];
    }
  });
  if (failedWorks.length === works.length) {
    throw new Error('Could not load the grammar index — check your connection and try again.');
  }
  return { results: perWork.flat(), failedWorks };
}

// -- Inflected variants of a typed phrase ---------------------------------
//
// A reader who types τὸ τί ἦν εἶναι gets the places where those exact words
// stand. The same formula also appears as τῷ τί ἦν εἶναι and τοῦ τί ἦν εἶναι,
// which an exact phrase cannot reach — the surface string differs. Finding
// those means knowing that τό, τῷ and τοῦ all lemmatise to ὁ, which is exactly
// the knowledge a reader should not need. So widen it for them.
//
// Widening is a FAN-OUT, not a lookup: `hn` alone belongs to five headwords
// (ἐάν, εἰμί, ἠμί, ἤν, ὅς), so a four-word phrase can have several readings.
// Every reading is tried and their OFFSETS ARE UNIONED, never summed — in the
// Metaphysics the εἰμί and ἠμί readings hit exactly the same 67 tokens, being
// one passage under two parses, and adding them would report 135 results for
// 68 places.

// Above this many readings the fan-out is truncated rather than run, and the
// caller is told. A phrase of common ambiguous words could otherwise multiply
// out to thousands of index scans for nothing.
export const VARIANT_READING_CAP = 64;

export interface VariantOutcome extends SearchOutcome {
  readings: string[][];        // the lemma readings actually tried
  productive: string[][];      // those that matched anything
  cappedFrom: number;          // 0 unless the fan-out was truncated
}

/** The headwords each folded word can belong to, one list per word.
 *
 * `null` means the corpus map itself could not be loaded: there is nothing to
 * widen with, and a caller should fall back to matching what was typed rather
 * than report an empty corpus. A word the map does not record yields an empty
 * list, which callers read differently — the phrase search takes it as nothing
 * to widen, the phrase index falls back to that one word as typed.
 */
export async function lemmaOptions(folds: string[]): Promise<string[][] | null> {
  const perTerm: string[][] = [];
  for (const fold of folds) {
    const letter = /^[a-z]/.test(fold) ? fold[0] : '_';
    try {
      const shard = await loadShared<Record<string, string[]>>(`lemma-map/${letter}.json`);
      perTerm.push(shard[fold] ?? []);
    } catch {
      return null;
    }
  }
  return perTerm;
}

// The cartesian product of each term's headwords, in the order typed.
export function lemmaReadings(perTerm: string[][], cap: number): { readings: string[][]; total: number } {
  let total = 1;
  for (const options of perTerm) total *= Math.max(options.length, 1);
  let readings: string[][] = [[]];
  for (const options of perTerm) {
    const next: string[][] = [];
    for (const so_far of readings) {
      for (const option of options) {
        if (next.length >= cap) break;
        next.push([...so_far, option]);
      }
    }
    readings = next;
  }
  return { readings, total };
}

// Every place the phrase stands under ANY reading of its words.
export async function searchPhraseVariants(
  grkQuery: string,
  works: string[],
): Promise<VariantOutcome> {
  const terms = grkQuery.trim().split(/\s+/).filter(Boolean).map(t => t.replace(/^\*+/, ''));
  const empty: VariantOutcome = {
    results: [], failedWorks: [], readings: [], productive: [], cappedFrom: 0,
  };
  if (terms.length < 2 || !works.length) return empty;

  // Resolve each typed word to the headwords it can belong to.
  const folds = terms.map(t => greekFold(t));
  if (folds.some(f => !f)) return empty;
  const perTerm = await lemmaOptions(folds);
  if (!perTerm) return empty;   // without the map there is nothing to widen with
  if (perTerm.some(options => !options.length)) return empty;

  const { readings, total } = lemmaReadings(perTerm, VARIANT_READING_CAP);
  const cappedFrom = total > readings.length ? total : 0;

  const failedWorks: string[] = [];
  const productiveKeys = new Set<string>();
  const indexes = queryIndexes('lemma', [...new Set(readings.flat())], []);
  const perWork = await pool(works, 8, async work => {
    try {
      const idx = await indexes.greek(work);
      // seg_idx -> the token positions any reading matched. A Set because two
      // readings routinely land on the same token.
      const bySeg = new Map<number, Set<number>>();
      for (const reading of readings) {
        const starts = phraseStarts(idx, reading.map(t => [t]));
        if (starts.size) productiveKeys.add(reading.join(' '));
        for (const [si, positions] of starts) {
          let seen = bySeg.get(si);
          if (!seen) { seen = new Set(); bySeg.set(si, seen); }
          for (const start of positions) {
            for (let k = 0; k < reading.length; k++) seen.add(start + k);
          }
        }
      }
      if (!bySeg.size) return [] as SearchResult[];
      const meta = await loadIndex<SegMeta[]>(work, 'meta.json');
      return [...bySeg.keys()].sort((a, b) => a - b).map(si => ({
        work,
        meta: meta[si],
        grkMatch: true,
        engMatch: false,
        grkPositions: [...bySeg.get(si)!].sort((a, b) => a - b),
      } as SearchResult));
    } catch (err) {
      console.warn(`searchPhraseVariants: skipping ${work} —`, err);
      failedWorks.push(work);
      return [] as SearchResult[];
    }
  });
  if (failedWorks.length === works.length) {
    throw new Error('Could not load the search index — check your connection and try again.');
  }
  return {
    results: perWork.flat(),
    failedWorks,
    readings,
    productive: readings.filter(r => productiveKeys.has(r.join(' '))),
    cappedFrom,
  };
}

// -- Combo search ---------------------------------------------------------
//
// Query-time, over the global offset. A query is a list of slots, each naming
// its own match type; a hit is a place where every slot lands within one
// proximity window. Distinct from the precomputed n-gram engine: combo answers
// "these terms, near each other", n-grams answer "what phrases recur".
//
// Boundary rule (shared with n-grams, not forked): a window NEVER spans a book
// edge. Chapters are a toggle, default keep — chapter divisions are editorial
// and an argument routinely runs across one.

export type SlotKind = 'phrase' | 'form' | 'lemma' | 'grammatical';

// Where a slot must fall relative to the FIRST slot — not to the slot before
// it. "before"/"after" answer the question a reader actually asks ("does the
// qualification come before the term or after it?"); chaining each slot to its
// predecessor instead is the whole-query `ordered` lock.
export type SlotRelation = 'near' | 'before' | 'after';

export interface ComboSlot {
  kind: SlotKind;
  // phrase: the token run, whitespace-separated. form: one surface token.
  // lemma: the fold keys the user ticked in the picker, unioned.
  terms?: string[];
  // grammatical only.
  query?: GrammarQuery;
  // Ignored on the first slot, which is what the others are placed against.
  relation?: SlotRelation;
}

export type WindowUnit = 'words' | 'line' | 'chapter';

export interface ComboOptions {
  window: number;          // words; ignored for the line/chapter units
  unit: WindowUnit;
  ordered: boolean;        // slots must appear in the order given
  crossChapter: boolean;   // default true — keep hits that straddle a chapter
}

// A slot's hits in one work, as global offsets. `span` is how many tokens the
// slot occupies (a phrase covers more than one), so an ordered query can
// require the next slot to start after this one ends.
interface SlotHit { start: number; span: number; certain: boolean; values?: Record<string, string[]> }

// The proximity default: 5 words, which is roughly half a Bekker line (the
// corpus averages 9.5 tokens per line). Capped at 50 — about five lines — since
// past that "near" stops meaning anything.
export const COMBO_WINDOW_DEFAULT = 5;
export const COMBO_WINDOW_MAX = 50;

function slotHits(
  slot: ComboSlot,
  base: number[],
  lemmaIdx: GrkIndex | null,
  formIdx: GrkIndex | null,
  dict: GrammarDict | null,
  column: Uint16Array | Uint32Array | null,
): SlotHit[] {
  const out: SlotHit[] = [];
  if (slot.kind === 'grammatical') {
    if (!dict || !column || !slot.query) return out;
    const wanted = compileQuery(dict, slot.query);
    if (!wanted.size) return out;
    for (let g = 0; g < column.length; g++) {
      const hit = wanted.get(column[g]);
      if (hit) out.push({ start: g, span: 1, certain: hit.certain, values: hit.values });
    }
    return out;
  }

  const terms = slot.terms ?? [];
  if (!terms.length) return out;
  // A lemma slot carries the exact heads the user ticked, so its terms are
  // unioned; a form or phrase slot is a single sequence.
  const idx = slot.kind === 'lemma' ? lemmaIdx : formIdx;
  if (!idx) return out;

  if (slot.kind === 'phrase' && terms.length > 1) {
    for (const [si, starts] of phraseStarts(idx, terms.map(t => [t]))) {
      for (const p of starts) out.push({ start: base[si] + p, span: terms.length, certain: true });
    }
    return out;
  }
  for (const term of terms) {
    for (const [si, positions] of termPositions(idx, term)) {
      for (const p of positions) out.push({ start: base[si] + p, span: 1, certain: true });
    }
  }
  return out;
}

// The structural unit an offset falls in, as a half-open [start, end) range of
// global offsets. Bounds are sorted, so this is a binary search over a short
// array. Used for the line/chapter window units and the book-edge rule.
function unitRange(starts: number[], global: number, total: number): [number, number] {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= global) lo = mid;
    else hi = mid - 1;
  }
  return [starts[lo], lo + 1 < starts.length ? starts[lo + 1] : total];
}

// First index in a sorted hit list whose start is >= target.
function lowerBound(hits: SlotHit[], target: number): number {
  let lo = 0;
  let hi = hits.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hits[mid].start < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Flatten the per-segment line runs into one array of line-start offsets, so a
// same-line window is the same kind of lookup as same-chapter.
function lineStarts(offsets: Offsets): number[] {
  const out: number[] = [];
  offsets.segments.forEach((seg, i) => {
    let at = offsets.seg_base_offset[i];
    for (const [, count] of seg.line_runs) { out.push(at); at += count; }
  });
  return out;
}

export interface ComboHit {
  work: string;
  seg_idx: number;
  pos: number;             // token position of the leftmost slot, within its segment
  global: number;
  positions: number[];     // every matched token position in that segment
  certain: boolean;        // false if ANY slot rested on an ambiguous parse
  values?: Record<string, string[]>;
}

// Given each slot's hits, find every window where all slots co-occur.
//
// Anchors on the FIRST slot's hits and, for each, asks whether every other slot
// has a hit in range. That is O(hits) with a sorted scan per slot rather than a
// cross-product, and it makes the ordered case a simple forward walk.
export function comboWindows(
  perSlot: SlotHit[][],
  opts: ComboOptions,
  offsets: Offsets,
  relations: SlotRelation[] = [],
  // Two slots sharing an identity are the same query asked twice, so they may
  // not both be satisfied by one token. Empty string means "no constraint".
  identities: string[] = [],
): { start: number; end: number; hits: SlotHit[] }[] {
  if (!perSlot.length || perSlot.some(h => !h.length)) return [];
  const sorted = perSlot.map(h => [...h].sort((a, b) => a.start - b.start));
  const total = offsets.token_count;
  const bookStarts = offsets.book_bounds.map(b => b.start);
  const chapStarts = offsets.chapter_bounds.map(c => c.start);
  const lines = opts.unit === 'line' ? lineStarts(offsets) : null;

  // The offsets an anchor's partners may occupy: the structural unit the anchor
  // sits in, intersected with the word window. Computed once per anchor, so each
  // slot is then a binary search rather than a scan — which would be quadratic
  // on a grammatical slot holding tens of thousands of hits.
  //
  // The word window is measured over the WHOLE match, not outward from the
  // anchor. Measuring from the anchor would make an unordered query depend on
  // which slot happened to be listed first (with W=5 and hits at 0, 5 and 10,
  // anchoring on 0 rejects and anchoring on 5 accepts) and would quietly admit
  // a span of 2W. A window of W now means every slot lands within W tokens of
  // every other, whatever order the slots were typed in.
  const structural = (at: number): [number, number] => {
    let lo = 0;
    let hi = total;
    const clamp = ([s, e]: [number, number]) => { if (s > lo) lo = s; if (e < hi) hi = e; };
    clamp(unitRange(bookStarts, at, total));                       // never cross a book
    if (!opts.crossChapter && chapStarts.length) clamp(unitRange(chapStarts, at, total));
    if (opts.unit === 'line' && lines) clamp(unitRange(lines, at, total));
    if (opts.unit === 'chapter' && chapStarts.length) clamp(unitRange(chapStarts, at, total));
    return [lo, hi];
  };

  const out: { start: number; end: number; hits: SlotHit[] }[] = [];
  for (const anchor of sorted[0]) {
    const [unitLo, unitHi] = structural(anchor.start);
    if (anchor.start + anchor.span > unitHi) continue;   // the anchor's own run must fit

    // Everything each slot could contribute for THIS anchor: inside the unit,
    // inside the word window, and on the side its relation requires.
    const reach = opts.unit === 'words' ? opts.window : total;
    const lo = Math.max(unitLo, anchor.start - reach);
    const hi = Math.min(unitHi, anchor.start + reach + 1);
    const feasible: SlotHit[][] = [[anchor]];
    let possible = true;
    for (let s = 1; s < sorted.length && possible; s++) {
      const relation = relations[s] ?? 'near';
      const from = relation === 'after' ? Math.max(lo, anchor.start + anchor.span) : lo;
      const to = relation === 'before' ? Math.min(hi, anchor.start + 1) : hi;
      const picks: SlotHit[] = [];
      for (let i = lowerBound(sorted[s], from); i < sorted[s].length; i++) {
        const h = sorted[s][i];
        if (h.start >= to) break;
        if (h.start + h.span > unitHi) continue;
        // "before" is measured by the END of the run, so a phrase only counts
        // as preceding when the whole run finishes first.
        if (relation === 'before' && h.start + h.span > anchor.start) continue;
        picks.push(h);
      }
      if (!picks.length) possible = false;
      else feasible.push(picks);
    }
    if (!possible) continue;

    // A window of W means every slot lands within W of every other, so the
    // group must fit in some span [s, s+W] that contains the anchor. Taking the
    // earliest feasible hit per slot is NOT sufficient: choosing an early
    // partner can push the far end out of reach when a later one would have
    // fitted. So try each candidate start rather than committing greedily.
    const starts = new Set<number>([anchor.start]);
    for (const picks of feasible) for (const h of picks) {
      if (h.start <= anchor.start) starts.add(h.start);
    }
    let chosen: SlotHit[] | null = null;
    for (const s0 of [...starts].sort((a, b) => a - b)) {
      if (opts.unit === 'words' && anchor.start - s0 > opts.window) continue;
      const limit = opts.unit === 'words' ? s0 + opts.window : unitHi;
      const take: SlotHit[] = [anchor];
      let cursor = anchor.start + anchor.span;   // for the whole-query order lock
      let ok = true;
      // One token may satisfy two DIFFERENT slots — "λόγος in the nominative"
      // is a lemma slot and a grammatical slot landing on the same word, and is
      // the most useful combo query there is. But two IDENTICAL slots asking
      // the same thing want two occurrences, not one word counted twice.
      const used = new Map<string, Set<number>>();
      const claim = (s: number, at: number): boolean => {
        const id = identities[s];
        if (!id) return true;
        let taken = used.get(id);
        if (!taken) { taken = new Set(); used.set(id, taken); }
        if (taken.has(at)) return false;
        taken.add(at);
        return true;
      };
      claim(0, anchor.start);
      for (let s = 1; s < feasible.length; s++) {
        const relation = relations[s] ?? 'near';
        const from = opts.ordered ? Math.max(s0, cursor) : s0;
        // "before" wants the nearest preceding run; everything else the
        // earliest, which also chains correctly when the order lock is on.
        const window = feasible[s].filter(h => h.start >= from && h.start <= limit);
        const ordered = relation === 'before' ? [...window].reverse() : window;
        const pick = ordered.find(h => claim(s, h.start));
        if (!pick) { ok = false; break; }
        take.push(pick);
        cursor = pick.start + pick.span;
      }
      if (ok) { chosen = take; break; }
    }
    if (!chosen) continue;
    out.push({
      start: Math.min(...chosen.map(h => h.start)),
      end: Math.max(...chosen.map(h => h.start + h.span - 1)),
      hits: chosen,
    });
  }
  return out;
}

async function comboSearchWork(
  work: string,
  slots: ComboSlot[],
  opts: ComboOptions,
): Promise<SearchResult[]> {
  const needLemma = slots.some(s => s.kind === 'lemma');
  const needForm = slots.some(s => s.kind === 'form' || s.kind === 'phrase');
  const needGrammar = slots.some(s => s.kind === 'grammatical');

  const [meta, offsets, lemmaIdx, formIdx, dict] = await Promise.all([
    loadIndex<SegMeta[]>(work, 'meta.json'),
    loadIndex<Offsets>(work, 'offsets.json'),
    needLemma ? loadIndex<GrkIndex>(work, 'greek_lemma.json') : Promise.resolve(null),
    needForm ? loadIndex<GrkIndex>(work, 'greek_form.json') : Promise.resolve(null),
    needGrammar ? loadIndex<GrammarDict>(work, 'grammar-dict.json') : Promise.resolve(null),
  ]);
  let column: Uint16Array | Uint32Array | null = null;
  if (dict) {
    if (dict.token_count !== offsets.token_count) {
      throw new Error(`${work}: grammar/offsets built from different runs`);
    }
    const buffer = await loadBinary(work, 'grammar-col.bin');
    column = dict.width === 4 ? new Uint32Array(buffer) : new Uint16Array(buffer);
    // A short column would silently drop every grammatical hit past its end and
    // still report a complete result, so check it here as well as in
    // grammarSearchWork.
    if (column.length !== offsets.token_count) {
      throw new Error(`${work}: grammar column length does not match token count`);
    }
  }

  const base = offsets.seg_base_offset;
  const perSlot = slots.map(s => slotHits(s, base, lemmaIdx, formIdx, dict, column));
  // Two slots are the same slot when they ask the same thing, whatever order
  // the reader ticked or typed it in: a lemma slot's heads are unioned, so
  // their order carries nothing; a phrase is a run, so its order is the
  // question. A grammatical query's categories are a set.
  const slotIds = slots.map(s => JSON.stringify([
    s.kind,
    s.terms ? (s.kind === 'phrase' ? s.terms : [...s.terms].sort()) : null,
    s.query ? Object.fromEntries(Object.entries(s.query).sort(([a], [b]) => a.localeCompare(b))) : null,
  ]));
  const duplicated = new Set(slotIds.filter((id, i) => slotIds.indexOf(id) !== i));
  const windows = comboWindows(
    perSlot, opts, offsets,
    slots.map(s => s.relation ?? 'near'),
    slotIds.map(id => (duplicated.has(id) ? id : '')),
  );

  const bySeg = new Map<number, SearchResult>();
  const seenBySeg = new Map<number, Set<number>>();
  const resultFor = (si: number): SearchResult => {
    let r = bySeg.get(si);
    if (!r) {
      r = { work, meta: meta[si], grkMatch: true, engMatch: false, grkPositions: [], grammar: [] };
      bySeg.set(si, r);
      seenBySeg.set(si, new Set());
    }
    return r;
  };
  for (const w of windows) {
    // Report every matched token so the KWIC marks all of them. Ambiguity is
    // recorded PER SLOT, not per window: a lexically matched word is certain
    // whatever its neighbour's parse allows, and labelling it with the other
    // slot's alternatives would attribute morphology to the wrong word. Merging
    // the two slots' values would be worse still — a second grammatical slot
    // would overwrite the first's alternatives and hide the very ambiguity that
    // made the hit uncertain.
    for (const h of w.hits) {
      for (let k = 0; k < h.span; k++) {
        const [hs, hp] = locate(base, h.start + k);
        // A window can straddle a column boundary — segments are keyed
        // (book, column), and a book edge is the only thing a window may not
        // cross. Mark the token in whichever segment it actually falls in, so
        // both halves of the passage are shown; dropping the far half used to
        // leave the reader looking at a hit with a term missing.
        const result = resultFor(hs);
        const seen = seenBySeg.get(hs)!;
        if (seen.has(hp)) continue;
        seen.add(hp);
        result.grkPositions.push(hp);
        result.grammar!.push({ values: h.values ?? {}, certain: h.certain });
      }
    }
  }
  for (const r of bySeg.values()) {
    const order = r.grkPositions.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
    r.grkPositions = order.map(([p]) => p);
    r.grammar = order.map(([, i]) => r.grammar![i]);
  }
  return [...bySeg.keys()].sort((a, b) => a - b).map(si => bySeg.get(si)!);
}

// Combo search across one or more works.
export async function searchCombo(
  slots: ComboSlot[],
  opts: ComboOptions,
  works: string[],
): Promise<SearchOutcome> {
  const usable = slots.filter(s =>
    s.kind === 'grammatical' ? Object.keys(s.query ?? {}).length : (s.terms ?? []).length);
  if (usable.length < 2 || !works.length) return { results: [], failedWorks: [] };

  const bounded: ComboOptions = {
    ...opts,
    window: Math.max(1, Math.min(opts.window || COMBO_WINDOW_DEFAULT, COMBO_WINDOW_MAX)),
  };
  const failedWorks: string[] = [];
  const perWork = await pool(works, 8, async w => {
    try {
      return await comboSearchWork(w, usable, bounded);
    } catch (err) {
      console.warn(`searchCombo: skipping ${w} —`, err);
      failedWorks.push(w);
      return [] as SearchResult[];
    }
  });
  if (failedWorks.length === works.length) {
    throw new Error('Could not load the search index — check your connection and try again.');
  }

  // Only worth saying when the answer depends on where a chapter begins.
  const approximateChapters: string[] = [];
  if (bounded.unit === 'chapter' || !bounded.crossChapter) {
    for (const w of works) {
      if (failedWorks.includes(w)) continue;
      try {
        const offsets = await loadIndex<Offsets>(w, 'offsets.json');   // already cached
        if (offsets.chapter_bounds.some(c => c.accuracy !== 'exact' && c.start !== 0)) {
          approximateChapters.push(w);
        }
      } catch { /* a work that failed to load is already reported */ }
    }
  }
  return { results: perWork.flat(), failedWorks, approximateChapters };
}

/** The headwords each typed word can belong to, for a lemma search.
 *
 * A lemma index is keyed on dictionary forms, so matching the typed word
 * against it directly only works when the reader already typed the dictionary
 * form — the one form the text in front of them is least likely to show. Typing
 * lo/gou found nothing while lo/gos found 2,269 of the same word. The corpus
 * lemma map turns the inflection into its headwords, so the reader can type
 * what stands on the page.
 *
 * The typed fold is kept alongside the headwords: a reader who does know the
 * dictionary form must never come off worse, and a word absent from the map
 * still searches as itself. Wildcards are left alone — they are patterns over
 * index keys, not surface words to resolve.
 */
async function resolveHeadwords(terms: string[]): Promise<string[][]> {
  return Promise.all(terms.map(async term => {
    if (/[*?]/.test(term)) return [term];
    const fold = greekFold(term);
    if (!fold) return [term];
    const letter = /^[a-z]/.test(fold) ? fold[0] : '_';
    try {
      const shard = await loadShared<Record<string, string[]>>(`lemma-map/${letter}.json`);
      const heads = shard[fold];
      return heads?.length ? [...new Set([fold, ...heads])] : [term];
    } catch {
      return [term];   // without the map, behave exactly as before
    }
  }));
}

// Unified search across one or more works. `matchMode` chooses the Greek index
// (lemma = all forms of a headword, form = the exact inflected token);
// `engForms` lets each English word match its plural and possessive forms.
export async function search(
  grkQuery: string,
  engQuery: string,
  grkMode: SearchMode,
  engMode: SearchMode,
  langOp: LangOp,
  works: string[],
  matchMode: MatchMode = 'lemma',
  engForms = false,
): Promise<SearchOutcome> {
  if (!grkQuery.trim() && !engQuery.trim()) return { results: [], failedWorks: [] };
  if (!works.length) return { results: [], failedWorks: [] };

  const typedGrk = grkQuery.trim().split(/\s+/).filter(Boolean);
  const grkTerms = matchMode === 'lemma'
    ? await resolveHeadwords(typedGrk)
    : typedGrk.map(t => [t]);
  const engUnits = englishQueryUnits(engQuery);
  // "Any form" looks each word's forms up in the index it is handed, which on
  // the shard path holds only the keys cut for these terms: so the forms are
  // terms here, and may fall in other shards than the word ("men", "man").
  const engTerms = engForms
    ? engUnits.flat().flatMap(t => englishForms(englishTerm(t)))
    : engUnits.flat();
  const indexes = queryIndexes(matchMode === 'form' ? 'form' : 'lemma', grkTerms.flat(), engTerms);

  // Bound how many works load at once, and let a single work's failed index
  // load drop just that work (logged + reported) instead of rejecting the whole
  // search.
  const failedWorks: string[] = [];
  const unsearchedTranslations: { work: string; translation: string }[] = [];
  const perWork = await pool(works, 8, async w => {
    try {
      const { results, unsearched } =
        await searchWork(w, grkTerms, engUnits, grkMode, engMode, langOp, indexes, engForms);
      for (const translation of unsearched) unsearchedTranslations.push({ work: w, translation });
      return results;
    } catch (err) {
      console.warn(`search: skipping ${w} —`, err);
      failedWorks.push(w);
      return [] as SearchResult[];
    }
  });
  // If EVERY work failed to load (e.g. offline, or a transient window mid-deploy
  // when the index JSONs are briefly unavailable), surface it as an error to
  // retry — not as an empty result that reads as a misleading "No passages
  // found." A partial failure returns what loaded PLUS the list of works that
  // didn't, so the caller can tell the user the results are incomplete rather
  // than presenting them as exhaustive.
  if (failedWorks.length === works.length) {
    throw new Error('Could not load the search index — check your connection and try again.');
  }
  return {
    results: perWork.flat(),
    failedWorks,
    ...(unsearchedTranslations.length ? { unsearchedTranslations } : {}),
  };
}
