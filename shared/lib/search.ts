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
  greek_tokens: string;  // space-joined fold token sequence
  english_head: string;
}

type GrkIndex = Record<string, [number, number][]>; // fold → [[seg_idx, pos], ...]
type EngIndex = Record<string, number[]>;            // word → [seg_idx, ...]

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

// Phrase check: do all folded terms appear in order (adjacent, space-separated)?
function phraseMatches(foldTokenSeq: string, foldTerms: string[]): boolean {
  if (foldTerms.length === 0) return true;
  const pattern = foldTerms.join(' ');
  return foldTokenSeq.includes(pattern);
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
  meta: SegMeta[],
  terms: string[],
  mode: SearchMode,
  hits: Set<number>,
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  if (mode === 'phrase' && terms.length > 1) {
    const foldTerms = terms.map(t => greekFold(t.replace('*', '')));
    for (const si of hits) {
      const toks = meta[si].greek_tokens.split(' ');
      const ps: number[] = [];
      for (let i = 0; i + foldTerms.length <= toks.length; i++) {
        let ok = true;
        for (let j = 0; j < foldTerms.length; j++) {
          if (toks[i + j] !== foldTerms[j]) { ok = false; break; }
        }
        if (ok) for (let j = 0; j < foldTerms.length; j++) ps.push(i + j);
      }
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
        const foldTerms = grkTerms.map(t => greekFold(t.replace('*', '')));
        grkHits = new Set([...grkHits].filter(si =>
          phraseMatches(meta[si].greek_tokens, foldTerms)
        ));
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
    ? greekPositions(grkIdx, meta, grkTerms, grkMode, grkHits)
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
): Promise<SearchResult[]> {
  if (!grkQuery.trim() && !engQuery.trim()) return [];
  if (!works.length) return [];

  // Strip a leading '*' (Beta Code capital marker, e.g. *a)nqrwpos); the fold
  // form is caseless, and a leading wildcard would match everything anyway.
  const grkTerms = grkQuery.trim().split(/\s+/).filter(Boolean).map(t => t.replace(/^\*+/, ''));
  const engTerms = engQuery.trim().split(/\s+/).filter(Boolean);

  // Bound how many works load at once, and let a single work's failed index
  // load drop just that work (logged) instead of rejecting the whole search.
  let failures = 0;
  const perWork = await pool(works, 8, async w => {
    try {
      return await searchWork(w, grkTerms, engTerms, grkMode, engMode, langOp, matchMode);
    } catch (err) {
      console.warn(`search: skipping ${w} —`, err);
      failures++;
      return [] as SearchResult[];
    }
  });
  // If EVERY work failed to load (e.g. offline, or a transient window mid-deploy
  // when the index JSONs are briefly unavailable), surface it as an error to
  // retry — not as an empty result that reads as a misleading "No passages
  // found." A partial failure still returns what loaded.
  if (failures === works.length) {
    throw new Error('Could not load the search index — check your connection and try again.');
  }
  return perWork.flat();
}
