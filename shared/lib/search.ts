// Search engine — operates on the prebuilt inverted indexes from Stage 6.
//
// Greek search: input is Unicode Greek OR TLG Beta Code (with optional * wildcards).
//   Converted to fold form (base Beta Code letters only) to match the index.
//   Beta Code letters already ARE the fold form (θ→q, φ→f, χ→x, ψ→y, ξ→c,
//   η→h, ω→w, …), so Latin input passes straight through; accents/breathings
//   (the ) ( / \ = | + markers) are stripped, matching the index's fold form.
// English search: whitespace-tokenized, lowercase.
// Phrase search: after intersection, verify token adjacency in segment data.
// Cross-language: AND (intersection) or OR (union) the two result sets.

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
  greek_head: string;
  english_head: string;
}

type GrkIndex = Record<string, [number, number][]>; // fold → [[seg_idx, pos], ...]
type EngIndex = Record<string, number[]>;            // word → [seg_idx, ...]

// The word-offset primitive: one running token number per work, in document
// order, with the structural coordinates beside it. Global offset of a posting
// is seg_base_offset[seg_idx] + token_pos.
export interface Offsets {
  token_count: number;
  seg_base_offset: number[];
  segments: { book: number; column: string; line_runs: [number, number][] }[];
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
export type MatchMode = 'lemma' | 'form';

// -- Per-work index loading (cached, lazy per file) -----------------------
//
// Each index file is fetched and cached on its own, and only when a query
// actually needs it (a Greek-only query never loads english.json, and only the
// lemma OR form index per its match mode). This keeps the request burst small:
// a Greek search over all works loads ~2 files/work, not 4 — which matters on
// Safari/WebKit, where a large simultaneous fetch burst can drop a request with
// "TypeError: Load failed" and (via Promise.all) sink the whole search.

const _fileCache = new Map<string, Promise<unknown>>();

function loadIndex<T>(work: string, file: string): Promise<T> {
  const key = `${work}/${file}`;
  const cached = _fileCache.get(key);
  if (cached) return cached as Promise<T>;
  const p = fetch(`${searchBase(work)}/${file}`).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${key}`);
    return r.json();
  });
  // Evict on failure so a transient drop can be retried — a rejected promise
  // must NOT stay cached (that would poison every later search in the tab).
  p.catch(() => { if (_fileCache.get(key) === p) _fileCache.delete(key); });
  _fileCache.set(key, p);
  return p as Promise<T>;
}

// The grammatical column is binary (one small int per token, indexed by global
// offset), so it needs arrayBuffer rather than json. Cached the same way.
function loadBinary(work: string, file: string): Promise<ArrayBuffer> {
  const key = `${work}/${file}`;
  const cached = _fileCache.get(key);
  if (cached) return cached as Promise<ArrayBuffer>;
  const p = fetch(`${searchBase(work)}/${file}`).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${key}`);
    return r.arrayBuffer();
  });
  p.catch(() => { if (_fileCache.get(key) === p) _fileCache.delete(key); });
  _fileCache.set(key, p);
  return p as Promise<ArrayBuffer>;
}

// Run `fn` over `items` with at most `limit` in flight at once (bounds the
// concurrent-fetch burst). Rejections propagate; callers that want per-item
// tolerance pass an `fn` that catches.
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
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
    else if (ch === "'") out.push("'");
    // skip combining marks, punctuation, Beta Code diacritics ) ( / \ = | +,
    // asterisk (handled by caller), and sigma-variant digits
  }
  return out.join('');
}

// -- Posting-list helpers -------------------------------------------------

function grkPosting(idx: GrkIndex, term: string): Set<number> {
  const wildcard = term.indexOf('*');
  if (wildcard === -1) {
    const fold = greekFold(term);
    return new Set((idx[fold] ?? []).map(([si]) => si));
  }
  // Prefix wildcard: fold the part before *, match all keys with that prefix
  const prefix = greekFold(term.slice(0, wildcard));
  const result = new Set<number>();
  for (const key of Object.keys(idx)) {
    if (key.startsWith(prefix)) {
      for (const [si] of idx[key]) result.add(si);
    }
  }
  return result;
}

function engPosting(idx: EngIndex, term: string): Set<number> {
  const word = term.toLowerCase().replace(/[^a-z'*]/g, '');
  if (!word || word === '*') return new Set(Object.values(idx).flat());
  if (word.endsWith('*')) {
    const prefix = word.slice(0, -1);
    const result = new Set<number>();
    for (const key of Object.keys(idx)) {
      if (key.startsWith(prefix)) for (const si of idx[key]) result.add(si);
    }
    return result;
  }
  return new Set(idx[word] ?? []);
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
// analysis lemma for 'lemma'), and wildcard terms participate via their prefix
// postings. Token positions count EVERY token, so an unanalysed word between
// two terms correctly breaks adjacency.
function phraseStarts(idx: GrkIndex, terms: string[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const perTerm = terms.map(t => termPositions(idx, t));
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

// English phrase: do all terms appear in order in the text?
function engPhraseMatches(text: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const lower = text.toLowerCase();
  const phrase = terms.map(t => t.toLowerCase().replace(/[^a-z']/g, '')).join(' ');
  return lower.includes(phrase);
}

// -- Public search API ----------------------------------------------------

export type SearchMode = 'all' | 'any' | 'phrase';
export type LangOp = 'and' | 'or';

export interface SearchResult {
  work: string;           // which work this hit belongs to
  meta: SegMeta;
  grkMatch: boolean;
  engMatch: boolean;
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
}

// Positions of a single term across segments: seg_idx → [token positions].
function termPositions(idx: GrkIndex, term: string): Map<number, number[]> {
  const m = new Map<number, number[]>();
  const add = (posts: [number, number][]) => {
    for (const [si, pos] of posts) {
      const arr = m.get(si);
      if (arr) arr.push(pos);
      else m.set(si, [pos]);
    }
  };
  const wildcard = term.indexOf('*');
  if (wildcard === -1) {
    add(idx[greekFold(term)] ?? []);
  } else {
    const prefix = greekFold(term.slice(0, wildcard));
    for (const key of Object.keys(idx)) if (key.startsWith(prefix)) add(idx[key]);
  }
  return m;
}

// For each segment in `hits`, the token positions to highlight in a KWIC snippet.
function greekPositions(
  idx: GrkIndex,
  terms: string[],
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
    for (const t of terms) {
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

// Search one work, returning hits tagged with that work.
async function searchWork(
  work: string,
  grkTerms: string[],
  engTerms: string[],
  grkMode: SearchMode,
  engMode: SearchMode,
  langOp: LangOp,
  matchMode: MatchMode,
): Promise<SearchResult[]> {
  // Fetch only what this query needs: meta always; the lemma OR form Greek
  // index iff there are Greek terms; the English index iff there are English
  // terms. Kick them off together, then await.
  const metaP = loadIndex<SegMeta[]>(work, 'meta.json');
  const grkP: Promise<GrkIndex | null> = grkTerms.length
    ? loadIndex<GrkIndex>(work, matchMode === 'form' ? 'greek_form.json' : 'greek_lemma.json')
    : Promise.resolve(null);
  const engP: Promise<EngIndex | null> = engTerms.length
    ? loadIndex<EngIndex>(work, 'english.json')
    : Promise.resolve(null);
  const meta = await metaP;
  const grkIdx = await grkP;
  const engIdx = await engP;

  let grkHits: Set<number> | null = null;
  let engHits: Set<number> | null = null;

  if (grkTerms.length > 0 && grkIdx) {
    const postings = grkTerms.map(t => grkPosting(grkIdx, t));
    if (grkMode === 'any') {
      grkHits = postings.reduce(union);
    } else {
      grkHits = postings.reduce(intersect);
      if (grkMode === 'phrase' && grkTerms.length > 1) {
        grkHits = new Set(phraseStarts(grkIdx, grkTerms).keys());
      }
    }
  }

  if (engTerms.length > 0 && engIdx) {
    const postings = engTerms.map(t => engPosting(engIdx, t));
    if (engMode === 'any') {
      engHits = postings.reduce(union);
    } else {
      engHits = postings.reduce(intersect);
      if (engMode === 'phrase' && engTerms.length > 1) {
        engHits = new Set([...engHits].filter(si =>
          engPhraseMatches(meta[si].english_head, engTerms)
        ));
      }
    }
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

  return [...combined]
    .sort((a, b) => a - b)
    .map(si => ({
      work,
      meta: meta[si],
      grkMatch: grkHits?.has(si) ?? false,
      engMatch: engHits?.has(si) ?? false,
      grkPositions: grkPos.get(si) ?? [],
    }));
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

// Unified search across one or more works. `matchMode` chooses the Greek index
// (lemma = all forms of a headword, form = the exact inflected token).
export async function search(
  grkQuery: string,
  engQuery: string,
  grkMode: SearchMode,
  engMode: SearchMode,
  langOp: LangOp,
  works: string[],
  matchMode: MatchMode = 'lemma',
): Promise<SearchOutcome> {
  if (!grkQuery.trim() && !engQuery.trim()) return { results: [], failedWorks: [] };
  if (!works.length) return { results: [], failedWorks: [] };

  // Strip a leading '*' (Beta Code capital marker, e.g. *a)nqrwpos); the fold
  // form is caseless, and a leading wildcard would match everything anyway.
  const grkTerms = grkQuery.trim().split(/\s+/).filter(Boolean).map(t => t.replace(/^\*+/, ''));
  const engTerms = engQuery.trim().split(/\s+/).filter(Boolean);

  // Bound how many works load at once, and let a single work's failed index
  // load drop just that work (logged + reported) instead of rejecting the whole
  // search.
  const failedWorks: string[] = [];
  const perWork = await pool(works, 8, async w => {
    try {
      return await searchWork(w, grkTerms, engTerms, grkMode, engMode, langOp, matchMode);
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
  return { results: perWork.flat(), failedWorks };
}
