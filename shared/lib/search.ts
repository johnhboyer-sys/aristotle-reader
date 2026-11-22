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
import { betaQueryToGreek } from './betacode';
import { formatCite } from './citation';
import { fetchLemmaPickerShard } from './data';
import { narrowByAccent, type LemmaAccents } from './lemma-accents';
import { memoAsyncBy } from './memo';
import { getWork, searchableTranslations, WORKS, type TranslationRef } from './works';

// Honour Astro's base path. BASE_URL may lack a trailing slash, so strip + join.
// Same host override as data.ts: the desktop app points the whole data layer
// at an on-disk corpus via globalThis.__ARISTOTLE_DATA_ROOT__ (read lazily so
// module-import order doesn't matter); the site never sets it. The site's
// build-time PUBLIC_DATA_ROOT applies here as in data.ts.
const DEFAULT_ROOT = import.meta.env.PUBLIC_DATA_ROOT
  ? import.meta.env.PUBLIC_DATA_ROOT.replace(/\/+$/, '')
  : `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data`;
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
//
// Bekker columns and token offsets locate hits. Proximity search reads
// chapter_bounds to keep windows within a chapter when requested.
export interface Offsets {
  chapter_bounds?: { book: number; chapter: string; start: number; accuracy: string }[];
  token_count: number;
  seg_base_offset: number[];
  segments: { book: number; column: string; line_runs: ([number, number] | [number, number, string])[] }[];
  book_bounds: { book: number; start: number }[];
  // Plato's substitute for chapter bounds: one entry per speaker turn, global
  // per book. `accuracy` is 'exact' where the turn start was matched against
  // the Greek text. Only `start`, `speaker` and `accuracy` are consumed here.
  turn_bounds?: { book: number; speaker: string; start: number; accuracy: string }[];
}

// A morphological reading: category → the values it licenses. A reading with
// more than one value for a category is syncretic ("fem nom/voc sg"), which is
// as genuinely ambiguous as two separate analyses. Data built since 13 Nov also
// names, under "lemma", the headwords (folded, as the lemma index keys them)
// whose analyses give the reading; it is no category, and older data has none
// (lib/result-views ownReadings).
export type Reading = Record<string, string[]>;

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
  }).then(j => {
    // Aristotle: an Aristotle offsets.json has no speaker turns. An
    // empty list reads as "no labelled speakers", which is what it means.
    if (key.endsWith('/offsets.json') && j && !(j as Offsets).turn_bounds) (j as Offsets).turn_bounds = [];
    return j;
  }));

export function loadIndex<T>(work: string, file: string): Promise<T> {
  return _index(`${work}/${file}`) as Promise<T>;
}

// The results page reads chapter bounds to lay out pages. Shared speaker
// searches read turn bounds when a corpus supplies them.
export function loadOffsets(work: string): Promise<Offsets> {
  return loadIndex<Offsets>(work, 'offsets.json');
}

// Where a chapter begins in each translation's words (stage6
// eng-chapters.json): slot -> seg_idx -> [[word_pos, chapter], ...], the
// word counted as the slot's English index counts it. The results page puts an
// English hit in its chapter from this, before any book is fetched.
export type EngChapters = Record<string, Record<string, [number, string][]>>;
export function loadEngChapters(work: string): Promise<EngChapters> {
  return loadIndex<EngChapters>(work, 'eng-chapters.json');
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

export const GREEK_BETA: Record<string, string> = {
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
    // typed with a straight apostrophe. stage6 keys U+1FBD (᾽) the same way.
    else if (ch === "'" || ch === '\u2019' || ch === '\u02bc' || ch === '\u1fbd') out.push("'");
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

// The Greek pattern syntax (John, 2026-11-10), over folded letters:
//   ? .     exactly one letter (never an elision's apostrophe)
//   *       any run, apostrophes included
//   +       one or more of the letter before (a letter, ? ., or a class)
//   […]     one of these letters; [^…] any letter but these
//   ( ) |   a group, and alternatives
//   ^ $     the word's start and end
// It depends on the script the term is typed in. A term with any Greek letter
// takes all of it, and a leading * is a wildcard there (*ικος), since Greek
// script needs no capital marker. A term without one is Beta Code: a leading *
// is the capital and is dropped, and ( ) | + are breathings, the iota
// subscript and the diaeresis, dropped by the fold like = / \. So a Beta Code
// suffix search is written .*ikos$.
export type PatternPiece =
  | { kind: 'char'; ch: string }                         // a literal, unfolded
  | { kind: 'run' } | { kind: 'one' } | { kind: 'plus' }
  | { kind: 'set'; negated: boolean; chars: string[] }   // members unfolded
  | { kind: 'open' } | { kind: 'close' } | { kind: 'or' };

// A Greek letter: not Greek punctuation (U+037E, U+0387), and not Coptic.
const GREEK_LETTER = /(?=\p{L})\p{Script=Greek}/u;
/** Whether a term is typed in Greek script (any Greek letter), which decides
 * how its pattern symbols read. */
export const greekScript = (term: string) => GREEK_LETTER.test(term);

/** A Greek search term read as a pattern, by the script rule above; null for
 * a class left open, or a ^ or $ anywhere but the very start or very end,
 * none of which can match anything. The term is read composed (NFC), and a
 * combining mark left over goes with the letter before it, so a letter typed
 * decomposed is still one letter, to a + or a class. */
export function patternPieces(term: string): PatternPiece[] | null {
  const greek = greekScript(term);
  const chars = [...(greek ? term : term.replace(/^\*+/, '')).normalize('NFC')];
  const out: PatternPiece[] = [];
  const mark = (ch: string) => /\p{M}/u.test(ch);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const last = out[out.length - 1];
    if (mark(ch) && last?.kind === 'char') last.ch += ch;
    else if (ch === '*') out.push({ kind: 'run' });
    else if (ch === '?' || ch === '.') out.push({ kind: 'one' });
    // Whole-word matching already pins both ends, so ^ and $ change nothing;
    // they are read so that .*ikos$ says what it means. Inside a word they
    // can match nothing (λο$γος), so the pattern is invalid.
    else if (ch === '^' || ch === '$') {
      if (ch === '^' ? i !== 0 : i !== chars.length - 1) return null;
    }
    else if (ch === '[') {
      const close = chars.indexOf(']', i + 1);
      if (close < 0) return null;
      const negated = chars[i + 1] === '^';
      const members: string[] = [];
      for (const m of chars.slice(i + (negated ? 2 : 1), close)) {
        if (mark(m) && members.length) members[members.length - 1] += m;
        else members.push(m);
      }
      out.push({ kind: 'set', negated, chars: members });
      i = close;
    } else if (greek && ch === '+') out.push({ kind: 'plus' });
    else if (greek && ch === '(') out.push({ kind: 'open' });
    else if (greek && ch === ')') out.push({ kind: 'close' });
    else if (greek && ch === '|') out.push({ kind: 'or' });
    else out.push({ kind: 'char', ch });
  }
  return out;
}

/** How a pattern reads the units of a word: what a typed character (a letter
 * with its marks) stands for, as units, and which units are letters. */
export interface PatternUnits {
  literal: (ch: string) => string[];
  isLetter: (unit: string) => boolean;
}

type PatternNode =
  | { t: 'lit'; units: string[] }
  | { t: 'one' } | { t: 'run' }
  | { t: 'set'; negated: boolean; members: Set<string> }
  | { t: 'seq'; items: PatternNode[] }
  | { t: 'alt'; options: PatternNode[] }
  | { t: 'plus'; item: PatternNode };

// The pieces as a tree; null when they do not make a pattern: an unbalanced
// group, an empty class, or a + after anything but a single letter.
function parsePattern(pieces: PatternPiece[], units: PatternUnits): PatternNode | null {
  let i = 0;
  const alt = (): PatternNode | null => {
    const options: PatternNode[] = [];
    for (;;) {
      const s = seq();
      if (!s) return null;
      options.push(s);
      if (pieces[i]?.kind !== 'or') break;
      i++;
    }
    return options.length === 1 ? options[0] : { t: 'alt', options };
  };
  const seq = (): PatternNode | null => {
    const items: PatternNode[] = [];
    for (; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.kind === 'or' || p.kind === 'close') break;
      if (p.kind === 'plus') {
        // + repeats one letter only, as the help says: after a group, a * or
        // another + it would nest repeats, (.+)+β.
        const before = pieces[i - 1]?.kind;
        if (before !== 'char' && before !== 'one' && before !== 'set') return null;
        items.push({ t: 'plus', item: items.pop()! });
      } else if (p.kind === 'open') {
        i++;
        const inner = alt();
        if (!inner || pieces[i]?.kind !== 'close') return null;
        items.push(inner);
      } else if (p.kind === 'char') items.push({ t: 'lit', units: units.literal(p.ch) });
      else if (p.kind === 'one') items.push({ t: 'one' });
      else if (p.kind === 'run') items.push({ t: 'run' });
      else {
        const members = new Set(p.chars.flatMap(units.literal));
        if (!members.size) return null;
        items.push({ t: 'set', negated: p.negated, members });
      }
    }
    return { t: 'seq', items };
  };
  const root = alt();
  return root && i === pieces.length ? root : null;
}

/** The pattern as a test of a whole word, given as its units (a string's
 * characters, or a token's letter clusters); null when the pattern does not
 * compile. The test runs the pattern as a set of states over the word, one
 * unit at a time, so its work is bounded by the word's length times the
 * pattern's size, whatever the pattern: no pattern can make it backtrack. */
export function patternMatcher(
  pieces: PatternPiece[],
  units: PatternUnits,
): ((word: ArrayLike<string>) => boolean) | null {
  const root = parsePattern(pieces, units);
  if (!root) return null;
  // States: a test of one unit with the state after it, or a fork to any of
  // several states that reads nothing. The last state accepts.
  const test: (((u: string) => boolean) | null)[] = [];
  const next: number[][] = [];
  const state = (t: ((u: string) => boolean) | null, to: number[]) => {
    test.push(t);
    next.push(to);
    return test.length - 1;
  };
  const any = () => true;
  // The start of `node` followed by state `after`, built back to front.
  const build = (node: PatternNode, after: number): number => {
    switch (node.t) {
      case 'lit': {
        let at = after;
        for (let k = node.units.length - 1; k >= 0; k--) {
          const want = node.units[k];
          at = state(u => u === want, [at]);
        }
        return at;
      }
      case 'one': return state(units.isLetter, [after]);
      case 'set': {
        const { members, negated } = node;
        return state(negated ? u => units.isLetter(u) && !members.has(u) : u => members.has(u), [after]);
      }
      case 'run': {
        const fork = state(null, []);
        next[fork].push(state(any, [fork]), after);
        return fork;
      }
      case 'plus': {
        const fork = state(null, []);
        const body = build(node.item, fork);
        next[fork].push(body, after);
        return body;
      }
      case 'seq': {
        let at = after;
        for (let k = node.items.length - 1; k >= 0; k--) at = build(node.items[k], at);
        return at;
      }
      case 'alt': return state(null, node.options.map(o => build(o, after)));
    }
  };
  const accept = state(null, []);
  const start = build(root, accept);
  const size = test.length;
  const seen = new Int32Array(size);
  const stack = new Int32Array(size);
  let gen = 0;
  // Adds state s and every state it forks to, once each per step.
  const add = (list: number[], s: number) => {
    if (seen[s] === gen) return;
    seen[s] = gen;
    let top = 0;
    stack[top++] = s;
    while (top) {
      const x = stack[--top];
      if (test[x] || x === accept) list.push(x);
      else for (const y of next[x]) if (seen[y] !== gen) { seen[y] = gen; stack[top++] = y; }
    }
  };
  const step = (from: number[], u: string): number[] => {
    gen++;
    const to: number[] = [];
    for (const x of from) {
      const t = test[x];
      if (t && t(u)) add(to, next[x][0]);
    }
    return to;
  };
  // Each set of states met is kept with the sets each unit leads to, so a
  // word mostly costs one lookup a unit. The store is capped; past it the
  // sets are stepped afresh, which is still bounded.
  const sets: number[][] = [];
  const accepts: boolean[] = [];
  const moves: Map<string, number>[] = [];
  const ids = new Map<string, number>();
  const intern = (set: number[]): number => {
    const key = set.sort((x, y) => x - y).join(',');
    let id = ids.get(key);
    if (id === undefined) {
      if (sets.length >= 4096) return -1;
      id = sets.length;
      ids.set(key, id);
      sets.push(set);
      accepts.push(set.includes(accept));
      moves.push(new Map());
    }
    return id;
  };
  gen++;
  const first: number[] = [];
  add(first, start);
  const initial = intern(first);
  return (word) => {
    let d = initial;
    let w = 0;
    for (; w < word.length; w++) {
      if (!sets[d].length) return false;
      let to = moves[d].get(word[w]);
      if (to === undefined) {
        const set = step(sets[d], word[w]);
        to = intern(set);
        if (to < 0) {
          // The store is full: carry on without it.
          let cur = set;
          for (w++; w < word.length && cur.length; w++) cur = step(cur, word[w]);
          return cur.includes(accept);
        }
        moves[d].set(word[w], to);
      }
      d = to;
    }
    return accepts[d];
  };
}

/** A token as the accent filter reads it: letter clusters, each a base
 * character with the combining marks after it. */
export const letterClusters = (s: string): string[] =>
  s.normalize('NFC').match(/\P{M}\p{M}*|\p{M}+/gu) ?? [];

// Index keys hold only fold letters and apostrophes; what a character folds
// to is all the pattern sees of it.
const INDEX_UNITS: PatternUnits = {
  literal: ch => [...greekFold(ch)],
  isLetter: u => u !== "'",
};

function compileGreekPattern(term: string): CompiledPattern | null {
  const pieces = patternPieces(term);
  if (!pieces) return null;
  const lead = pieces.findIndex(p => p.kind !== 'char');
  const literal = (end: number) => pieces.slice(0, end)
    .map(p => (p.kind === 'char' ? greekFold(p.ch) : '')).join('');
  if (lead < 0) {
    const exact = literal(pieces.length);
    return exact ? { exact } : null;
  }
  // Preserve the common trailing-* fast path without compiling or scanning
  // with a regular expression.
  if (lead === pieces.length - 1 && pieces[lead].kind === 'run') {
    const prefix = literal(lead);
    return { test: key => key.startsWith(prefix), prefix };
  }
  const matches = patternMatcher(pieces, INDEX_UNITS);
  if (!matches) return null;
  // Alternatives at the top level share no prefix: λογος|αρετη is two.
  let depth = 0;
  const split = pieces.some(p => {
    if (p.kind === 'open') depth++;
    else if (p.kind === 'close') depth--;
    return p.kind === 'or' && depth === 0;
  });
  return { test: matches, prefix: split ? '' : literal(lead) };
}

function compilePattern(
  term: string,
  fold: (s: string) => string,
): CompiledPattern | null {
  if (fold === greekFold) return compileGreekPattern(term);
  // English keeps * and ? alone. A leading * there is a wildcard like any
  // other: *ness finds happiness and goodness (Beta Code's capital marker is
  // Greek's business).
  let pattern = '';
  for (const ch of term) {
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
    // One letter, as the hint and the guide say: never the apostrophe of an
    // elision (d? is δέ, not δ’) or of English can't.
    else if (ch === '?') pieces.push('[a-z]');
    else pieces.push(ch);
  }
  const regex = new RegExp(`^${pieces.join('')}$`);
  return { test: key => regex.test(key), prefix: pattern.slice(0, pattern.search(/[*?]/)) };
}

// The one statement of what an English word is, on the reader's side; stage6's
// english_words() is its mirror on the index side (pinned by a pipeline test).
// The page prints possession and elision with U+2019 (Socrates’) and quotes
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
// "soul" 1,073 times in the translations and missed "souls" 182 times; a
// wildcard (soul*) finds the plural but also every word that merely begins
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

// Words that are no noun, though a rule would make one of a plural: "theses"
// less its s is "these". No rule makes one of these, and none is expanded.
const EN_NOT_NOUN = new Set(['these', 'those']);

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
  return out.filter(s => (s.length >= 3 || EN_IRREGULAR.has(s)) && !EN_NOT_NOUN.has(s));
}

// A singular's own forms: itself and its possessive, its plurals, and the
// possessive of each plural that does not end in s (men's).
function englishPlurals(w: string): string[] {
  const out: string[] = [];
  if (/(?:s|x|z|sh)$/.test(w)) out.push(`${w}es`);
  // -ch takes either: churches, but stomachs and epochs.
  else if (w.endsWith('ch')) out.push(`${w}es`, `${w}s`);
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
  if ((bare.length < 3 && !EN_IRREGULAR.has(bare)) || EN_NOT_NOUN.has(bare)) return [word];
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
export function englishIndexSlot(t: Pick<TranslationRef, 'id' | 'slot'>): string {
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

// A word's postings, if the index holds it. A per-work index is plain JSON and
// inherits Object.prototype, so idx['constructor'] is a function, not absent.
function ownPostings<T>(idx: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(idx, key) ? idx[key] : undefined;
}

function grkPosting(idx: GrkIndex, term: string): Set<number> {
  const pattern = compilePattern(term, greekFold);
  if (!pattern) return new Set();
  if ('exact' in pattern) {
    return new Set((ownPostings(idx, pattern.exact) ?? []).map(([si]) => si));
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
// belong to, and a phrase typed as it stands on the page — ἦν δ’ ἐγώ —
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
// How a Both search joins its languages, by chapter: "and" both, "or" either
// or both (the inclusive or, "and/or" on the switch), "xor" one and not both
// ("or" on the switch; John, 16 Nov). The engines take "and" or "or".
export type LangOp = 'and' | 'or' | 'xor';

// One translation's English match in a segment: which translation (a
// TranslationRef id) and the word positions the query matched there, counted
// as englishWords() counts them through that translation's text for the
// segment. Positions are empty only for a bare *, which no word answers.
// A query with a unit of several words (a phrase, a hyphenated term) also
// gives `matches`, the first word of each run the query matched, a run of
// several words one match (John, 2026-11-11).
export interface EngHit { translation: string; positions: number[]; matches?: number[] }

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
  // Set only when a speaker filter ran, parallel to grkPositions: who is
  // speaking at each matched token, from the work's turn bounds. `null` is a
  // token before the first labelled turn (a narrator's opening, say) — it has
  // no speaker to name, and no filter mode claims it.
  speakers?: (string | null)[];
  // A search of several words (phrase, proximity, running text): each match's
  // tokens, ascending, cited in the section the match starts in (a token past
  // its last counts on into the next, as hitTokens reads it). A window is one
  // match and counts once however many words it touches (John, 2026-11-11).
  // They partition grkPositions: a token two windows share is the first's,
  // and a window left with none of its own is not listed. Filtered as the
  // positions are (cutPositions in lib/result-views).
  windows?: number[][];
}

// Windows as SearchResult keeps them: a token two share is the first's, and
// one left with none of its own is dropped.
function ownWindows(windows: number[][]): number[][] {
  const claimed = new Set<number>();
  return windows.map(w => w.filter(p => !claimed.has(p) && (claimed.add(p), true))).filter(w => w.length);
}

// -- Speaker attribution ---------------------------------------------------
//
// The TLG marks every change of speaker in the dialogues, and stage 6 records
// each turn's start as a global offset with the speaker's name (offsets.json
// `turn_bounds`). So the speaker of any token is the turn whose start is the
// last one at or before it — one binary search, no extra artifact. The
// narrated works (Republic, Apology, Charmides, Letters, Lovers) carry no
// labels in the OCT and so have no turn bounds: nothing there can be
// attributed, and a speaker filter must exclude them rather than guess.

export interface SpeakerFilter {
  // 'only': keep tokens spoken by one of `names`. 'except': keep tokens spoken
  // by anyone else. Tokens with no speaker fail both — "anyone but Socrates"
  // is a claim about who IS speaking, and an unlabelled token cannot make it.
  mode: 'only' | 'except';
  names: string[];
}

// Who is speaking at a global offset, or null before the first turn.
export function speakerAt(offsets: Offsets, global: number): string | null {
  const bounds = offsets.turn_bounds ?? [];
  if (!bounds.length || global < bounds[0].start) return null;
  let lo = 0;
  let hi = bounds.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bounds[mid].start <= global) lo = mid;
    else hi = mid - 1;
  }
  return bounds[lo].speaker;
}

// Every speaker with a turn inside segment `si` (including the turn already
// running when the segment opens). An English chunk is aligned to its section,
// not to a word, so this is the finest attribution the English side allows.
function segmentSpeakers(offsets: Offsets, si: number): Set<string> {
  const base = offsets.seg_base_offset;
  const start = base[si];
  const end = si + 1 < base.length ? base[si + 1] : offsets.token_count;
  const out = new Set<string>();
  const opening = speakerAt(offsets, start);
  if (opening) out.add(opening);
  // Seek to the first turn at or after this segment rather than scanning from
  // the top: a scan is bounded by the segment's position in the WORK, not by
  // its length, so a hit late in the Laws walked nearly every turn.
  const bounds = offsets.turn_bounds ?? [];
  let lo = 0;
  let hi = bounds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bounds[mid].start < start) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < bounds.length && bounds[i].start < end; i++) {
    out.add(bounds[i].speaker);
  }
  return out;
}

// A work the filter can attribute at all: it has labelled turns, and those
// labels are its speakers rather than a narrator's frame (works.ts
// `narrator`). Phaedo's 34 labels are Echecrates and Phaedo; filtered on them,
// every word Socrates says in the prison came back as Phaedo's.
export function attributable(work: string, offsets: Offsets | null | undefined): boolean {
  return !!offsets?.turn_bounds?.length && !getWork(work)?.narrator;
}

export function speakerPasses(filter: SpeakerFilter, speaker: string | null): boolean {
  if (speaker === null) return false;
  const named = filter.names.includes(speaker);
  return filter.mode === 'only' ? named : !named;
}

// A work's cast as the search sees it: each speaker with the number of turns
// the turn bounds give them. `speakers` is empty for a work with no labelled
// turns; `loaded` is false when its offsets could not be fetched at all, which
// is a different thing from having no speakers and is reported as such.
export interface SpeakerRosterEntry {
  work: string;
  loaded: boolean;
  speakers: { name: string; turns: number }[];
  // Some turn start in this work was matched only to its line of Greek, not to
  // the word. Every token between the true boundary and the snapped one is
  // then attributed to the wrong speaker, so a filtered search over this work
  // has to say so — the pipeline stamps each bound, and this is the only place
  // that reads the stamp for the plain search paths.
  approximate: boolean;
  // The work is reported by this speaker and its labels are the frame, not the
  // speeches (works.ts `narrator`): the filter leaves it out, `speakers` is
  // empty, and the note names it apart from the works with no labels at all.
  narrator: string | null;
}

export async function speakerRoster(works: string[]): Promise<SpeakerRosterEntry[]> {
  return pool(works, 8, async work => {
    try {
      const offsets = await loadIndex<Offsets>(work, 'offsets.json');
      const narrator = getWork(work)?.narrator ?? null;
      const counts = new Map<string, number>();
      // An unlabelled turn (the OCT's dash) names nobody: it is not a chip.
      // 2,003 of them across six works once made one, showing only its count.
      for (const t of offsets.turn_bounds ?? []) {
        if (t.speaker && !narrator) counts.set(t.speaker, (counts.get(t.speaker) ?? 0) + 1);
      }
      const speakers = [...counts.entries()]
        .map(([name, turns]) => ({ name, turns }))
        .sort((a, b) => b.turns - a.turns || a.name.localeCompare(b.name));
      // A snapped bound at offset 0 is the book opening, which is exact in the
      // only sense that matters — same rule the combo path already applies.
      const approximate = (offsets.turn_bounds ?? []).some(
        t => t.accuracy !== 'exact' && t.start !== 0);
      return { work, loaded: true, speakers, approximate, narrator };
    } catch (err) {
      console.warn(`speakerRoster: skipping ${work} —`, err);
      return { work, loaded: false, speakers: [], approximate: false, narrator: null };
    }
  });
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
  // Greek words typed under "any form" whose headwords could not be looked up
  // (the lemma map did not load), so each was searched only as typed.
  unresolvedTerms?: string[];
  // A grammar-only combo refused because nothing narrows it (ruling 3): the
  // page shows the narrowing controls rather than "no passages".
  unnarrowed?: boolean;
  // Works whose turn starts are known only approximately, reported ONLY when
  // the query actually leans on turn geometry. The pipeline stamps each bound
  // exact or not; saying nothing here would let a turn-scoped result imply a
  // precision the source does not have.
  approximateChapters?: string[];
  approximateTurns?: string[];
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
    add(ownPostings(idx, pattern.exact) ?? []);
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
): { segs: Set<number>; positions: Map<number, number[]>; starts: Map<number, number[]> } {
  const positions = new Map<number, number[]>();
  const runs = new Map<number, number[]>();
  // The bare *: every word matches it, so no word is the hit.
  if (unit.length === 1 && unit[0] === '*') return { segs: engEverySegment(idx), positions, starts: runs };
  const alts = unit.map(t => (forms
    ? englishForms(englishTerm(t)).filter((f, i) => i === 0 || Object.hasOwn(idx, f))
    : [englishTerm(t)]));
  for (const [si, starts] of phraseStarts(idx, alts, englishFold)) {
    positions.set(si, starts.flatMap(start => unit.map((_, j) => start + j)));
    runs.set(si, starts);
  }
  return { segs: new Set(positions.keys()), positions, starts: runs };
}

// The segments one English index matches by the mode's rule, and where in
// each the query's words stand. An exact phrase is all the units in a row.
function englishMatch(
  idx: EngIndex,
  units: string[][],
  engMode: SearchMode,
  forms: boolean,
): { segs: Set<number>; positions: Map<number, number[]>; matches: Map<number, number[]> } {
  const asked = engMode === 'phrase' ? [units.flat()] : units;
  const matches = asked.map(u => unitMatch(idx, u, forms));
  const segs = matches.map(m => m.segs).reduce(engMode === 'any' ? union : intersect);
  const positions = new Map<number, number[]>();
  // Each run once, by where it starts and how long it is; only where a unit
  // has several words, else every word is its own match, as before.
  const several = asked.some(u => u.length > 1);
  const runs = new Map<number, number[]>();
  for (const si of segs) {
    const ps = new Set<number>();
    for (const m of matches) for (const p of m.positions.get(si) ?? []) ps.add(p);
    if (ps.size) positions.set(si, [...ps].sort((a, b) => a - b));
    if (!several) continue;
    const seen = new Map<string, number>();
    matches.forEach((m, i) => {
      for (const start of m.starts.get(si) ?? []) seen.set(`${start}:${asked[i].length}`, start);
    });
    if (seen.size) runs.set(si, [...seen.values()].sort((a, b) => a - b));
  }
  return { segs, positions, matches: runs };
}

// The same matches as greekPositions, but kept in the groups the query mode is
// defined over: one group per TERM for 'all'/'any', one per phrase RUN for
// 'phrase'. Only a speaker filter needs this, and only because a flat position
// list cannot answer the two questions the modes ask — whether every term
// survived, and where one phrase ends and the next begins.
function greekGroups(
  idx: GrkIndex,
  terms: string[][],
  mode: SearchMode,
  hits: Set<number>,
): Map<number, number[][]> {
  const out = new Map<number, number[][]>();
  const push = (si: number, group: number[]) => {
    const groups = out.get(si);
    if (groups) groups.push(group);
    else out.set(si, [group]);
  };
  if (mode === 'phrase' && terms.length > 1) {
    for (const [si, starts] of phraseStarts(idx, terms)) {
      if (!hits.has(si)) continue;
      for (const start of starts) push(si, terms.map((_, j) => start + j));
    }
    return out;
  }
  for (const alts of terms) {
    // A term's own alternatives (the headwords a typed inflection resolves to)
    // are one term, so they union into a single group.
    const perTerm = new Map<number, number[]>();
    for (const t of alts) {
      for (const [si, ps] of termPositions(idx, t)) {
        if (!hits.has(si)) continue;
        const arr = perTerm.get(si);
        if (arr) arr.push(...ps);
        else perTerm.set(si, [...ps]);
      }
    }
    for (const [si, ps] of perTerm) push(si, [...new Set(ps)].sort((a, b) => a - b));
  }
  return out;
}

interface WorkOutcome { results: SearchResult[]; unsearched: string[] }

// -- Corpus search shards ---------------------------------------------------
//
// Stage 9 merges every work's lexical indexes into one set per stream, split
// by a word's first two letters: {word: {source: postings}}. A query fetches
// only the shards its words can fall in — "justice" is one shard, where it
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

// A pattern with no literal prefix (*ικος, (λ|τ).*) could be in any shard.
// Rather than fetch them all, it is matched over the stream's vocabulary — every
// key, read once — and only the shards its words are filed under are fetched.
// vocab.json lists the form keys; a stream it has no list for, or a corpus
// built without it, reads every shard as before.
interface Vocab { forms?: string[]; lemmas?: string[] }
const VOCAB_LIST: Partial<Record<Stream, keyof Vocab>> = { form: 'forms', lemma: 'lemmas' };
async function vocabKeys(stream: Stream): Promise<string[] | null> {
  const list = VOCAB_LIST[stream];
  if (!list) return null;
  const vocab = await loadShared<Vocab>('search-shards/vocab.json').catch(() => null);
  return vocab?.[list] ?? null;
}

async function shardSlice(stream: Stream, listed: string[], patterns: CompiledPattern[]): Promise<Slice> {
  const open = patterns.filter(p => !('exact' in p) && !p.prefix);
  const vocab = open.length ? await vocabKeys(stream) : null;
  const names = [...new Set(patterns.flatMap(p => {
    if (!vocab || 'exact' in p || p.prefix) return shardsFor(p, listed);
    return vocab.filter(key => p.test(key)).map(shardName).filter(name => listed.includes(name));
  }))];
  const shards = await pool(names, 8, name => loadShared<Shard>(`search-shards/${stream}/${name}.json`));
  const slice: Slice = new Map();
  for (const shard of shards) {
    for (const key of Object.keys(shard)) {
      if (patterns.some(p => ('exact' in p ? p.exact === key : p.test(key)))) slice.set(key, shard[key]);
    }
  }
  return slice;
}

/** The accented spellings of each folded form key, commonest first, from the
 * accents shards (filed by shardName, as the form shards are). For display
 * only: a key the shards do not hold, a shard that does not load, or a corpus
 * without the shard listing leaves the key out, and the caller prints the
 * fold. Each shard is read once. */
export async function formAccents(keys: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!keys.length) return out;
  const listing = await loadShared<ShardListing>('search-shards/index.json').catch(() => null);
  // Aristotle: this corpus has no accents stream; asking for its shards
  // only logs 404s, so a listing without one leaves every key folded.
  if (!listing || !(listing as { streams?: Record<string, unknown> }).streams?.accents) return out;
  const byShard = new Map<string, string[]>();
  for (const key of keys) {
    const name = shardName(key);
    (byShard.get(name) ?? byShard.set(name, []).get(name)!).push(key);
  }
  await pool([...byShard], 8, async ([name, inShard]) => {
    const shard = await loadShared<Record<string, string[]>>(`search-shards/accents/${name}.json`).catch(() => null);
    if (!shard) return;
    for (const key of inShard) if (Object.hasOwn(shard, key) && shard[key].length) out.set(key, shard[key]);
  });
  return out;
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
  speaker?: SpeakerFilter,
): Promise<WorkOutcome> {
  // Fetch only what this query needs: the Greek index iff there are Greek
  // terms; an English index per translation iff there are English terms; the
  // offsets iff a speaker filter has to place each hit in a turn. Kick them
  // off together, then await.
  const offP: Promise<Offsets | null> = speaker ? loadOffsets(work) : Promise.resolve(null);
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
  const offsets = await offP;
  // A work with no labelled turns has nobody to attribute a word to, and a
  // narrated one only its narrator. Excluding it is the only answer a speaker
  // filter can give; the roster tells the UI which works these are, so the
  // exclusion is stated rather than silent.
  if (speaker && !attributable(work, offsets)) return { results: [], unsearched };

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
      const { segs: hits, positions, matches } = englishMatch(idx, engUnits, engMode, engForms);
      for (const si of hits) {
        engHits!.add(si);
        const hit: EngHit = { translation: t.id, positions: positions.get(si) ?? [] };
        if (matches.has(si)) hit.matches = matches.get(si);
        const arr = engBySeg.get(si);
        if (arr) arr.push(hit);
        else engBySeg.set(si, [hit]);
      }
    });
  }

  const grkPos = grkHits && grkIdx
    ? greekPositions(grkIdx, grkTerms, grkMode, grkHits)
    : new Map<number, number[]>();

  // The speaker filter runs BEFORE the languages combine, so an AND query asks
  // for a passage where the filtered Greek and the filtered English both hit.
  // English is filtered by the speakers the passage holds (see
  // segmentSpeakers) — in every translation alike, since each is placed by
  // section; Greek is filtered in the STRUCTURE its mode is defined over, never
  // over a flattened position list — see greekGroups.
  const spokenBy = new Map<number, (string | null)[]>();
  // A phrase's runs, each one match (its window), by segment.
  const isPhrase = grkMode === 'phrase' && grkTerms.length > 1;
  const runs = isPhrase && grkHits && grkIdx
    ? greekGroups(grkIdx, grkTerms, grkMode, grkHits)
    : new Map<number, number[][]>();
  if (speaker && offsets) {
    const base = offsets.seg_base_offset;
    if (grkHits && grkIdx) {
      const groupsBySeg = greekGroups(grkIdx, grkTerms, grkMode, grkHits);
      for (const si of [...grkHits]) {
        const groups = groupsBySeg.get(si) ?? [];
        const survived: number[][] = [];
        // Who said each surviving token. A phrase's words all carry the
        // speaker of its first word — the one it was kept on — so a phrase
        // that runs across a turn break never labels its tail with the
        // speaker the filter excluded.
        const said = new Map<number, string | null>();
        for (const group of groups) {
          if (isPhrase) {
            // A phrase is one utterance: it stands or falls on its first word,
            // which is how the variant and combo engines treat it too. Keeping
            // it word by word would leave half a phrase highlighted.
            const first = speakerAt(offsets, base[si] + group[0]);
            if (speakerPasses(speaker, first)) {
              survived.push(group);
              for (const p of group) said.set(p, first);
            }
          } else {
            const kept = group.filter(p => {
              const who = speakerAt(offsets, base[si] + p);
              if (!speakerPasses(speaker, who)) return false;
              said.set(p, who);
              return true;
            });
            if (kept.length) survived.push(kept);
          }
        }
        // "All words" means one speaker said all of them. Requiring only that
        // SOME matched token survive would return a section where Socrates
        // says one term and Callicles the other, and report it as his.
        const ok = (isPhrase || grkMode === 'any')
          ? survived.length > 0
          : groups.length > 0 && survived.length === groups.length;
        if (!ok) { grkHits.delete(si); grkPos.delete(si); continue; }
        if (isPhrase) runs.set(si, survived);
        const merged = [...new Set(survived.flat())].sort((a, b) => a - b);
        grkPos.set(si, merged);
        spokenBy.set(si, merged.map(p => said.get(p) ?? null));
      }
    }
    if (engHits) {
      for (const si of [...engHits]) {
        const present = [...segmentSpeakers(offsets, si)];
        if (!present.some(s => speakerPasses(speaker, s))) {
          engHits.delete(si);
          engBySeg.delete(si);
        }
      }
    }
  }

  let combined: Set<number>;
  if (grkHits !== null && engHits !== null) {
    combined = langOp === 'and' ? intersect(grkHits, engHits) : union(grkHits, engHits);
  } else {
    combined = grkHits ?? engHits ?? new Set();
  }

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
      ...(isPhrase && grkHits?.has(si) ? { windows: ownWindows(runs.get(si) ?? []) } : {}),
      ...(spokenBy.has(si) ? { speakers: spokenBy.get(si) } : {}),
    }));
  return { results, unsearched };
}

// Turn a global offset into a citable position, using only offsets.json — the
// phrase browser shows hundreds of citations at once and must not have to fetch
// a whole book for each.
//
// Plato is cited by Stephanus page + section ("34b"), which is exactly a
// segment's `column`, so the citation falls out of the segment lookup alone.
// `line_runs` is deliberately NOT consulted: Plato has no user-facing line
// numbers, and there is nothing finer than the section to cite.
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

// The citation string a reader sees for a global offset, e.g. "34b". Routed
// through citation.ts so the no-line rule is enforced by the work's scheme
// rather than by this call site remembering it.
export function offsetCite(work: string, offsets: Offsets, global: number): string | null {
  const ref = offsetRef(offsets, global);
  return ref ? formatCite(work, ref.column, ref.line, ref.sub) : null;
}

// -- Grammatical matching -------------------------------------------------
//
// Grammar is reachable only through a combo slot; no standalone entry point
// is exported. Asking the whole corpus for "genitive plural feminine" returns
// tens of thousands of tokens, which is the corpus, not a search result. So,
// by John's ruling 3 (2026-11-10), a grammar-only query runs only when
// something narrows it — fewer works, a speaker, or a second term near or not
// near — and searchCombo refuses it otherwise.
//
// Honesty rules, applied here and rendered by the UI:
//   possible — at least one of a token's readings satisfies the query. That is
//              what a match means, and it is all a match ever claims.
//   certain  — every reading satisfies it AND each queried category has exactly
//              one licensed value. Anything else is one-of-N.
// A token whose sole analysis is "fem nom/voc sg" is NOT certain for case: one
// analysis record, two possible cases.
//
// Part of speech is the exception (2026-11-10). Its values on one reading are
// all true at once — John's ruling makes ἄλλος both adjective and pronoun —
// not alternatives, so a second value there leaves nothing open. Readings that
// disagree (a noun reading beside a verb reading) still make a match uncertain.
export const BOTH_AT_ONCE = new Set(['pos']);

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
      if (BOTH_AT_ONCE.has(category)) {
        // Settled when every reading has the class asked for, whatever else it
        // is too. Otherwise each reading's classes stay together ("adj+pronoun"
        // beside "noun"), and a reading with none says so.
        if (readings.every(r => r[category]?.includes(query[category]))) licensed.add(query[category]);
        else for (const r of readings) licensed.add(r[category]?.length ? [...r[category]].sort().join('+') : 'no class');
      } else {
        for (const reading of readings) for (const v of reading[category] ?? []) licensed.add(v);
      }
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

// -- Inflected variants of a typed phrase ---------------------------------
//
// A reader who types τὸ τί ἦν εἶναι gets the places where those exact words
// stand. The same formula also appears as τῷ τί ἦν εἶναι and τοῦ τί ἦν εἶναι,
// which an exact phrase cannot reach — the surface string differs. Finding
// those means knowing that τό, τῷ and τοῦ all lemmatise to ὁ, which is exactly
// the knowledge a reader should not need. So widen it for them.
//
// Widening is a FAN-OUT, not a lookup: `hn` alone belongs to several headwords,
// so a four-word phrase can have several readings. Every reading is tried and
// their OFFSETS ARE UNIONED, never summed — two readings of one passage are one
// passage, and adding them would double the count.

// Above this many readings the fan-out is truncated rather than run, and the
// caller is told. A phrase of common ambiguous words could otherwise multiply
// out to thousands of index scans for nothing.
export const VARIANT_READING_CAP = 64;

export interface VariantOutcome extends SearchOutcome {
  readings: string[][];        // the lemma readings actually tried
  productive: string[][];      // those that matched anything
  cappedFrom: number;          // 0 unless the fan-out was truncated
}

const shardLetter = (key: string) => (/^[a-z]/.test(key) ? key[0] : '_');

export interface HeadwordKeyDeps {
  /** lemma-picker shard for one letter (`a`–`z`, or `_`). Rejects if it will not load. */
  pickerShard: (letter: string) => Promise<Record<string, unknown>>;
  /** lemma-map shard for one letter. `fold` is the spelling being resolved. Rejects if it will not load. */
  lemmaMap: (letter: string, fold: string) => Promise<Record<string, string[]>>;
}

/** The picker's keys for a typed word.
 *
 * The fold itself when that fold is a dictionary key — the lemma map is not
 * read. Otherwise the dictionary keys among the map's readings of the fold.
 * An unknown word, or a shard that does not load, is an empty list.
 */
export async function resolveHeadwordKeys(word: string, deps: HeadwordKeyDeps): Promise<string[]> {
  const fold = greekFold(word);
  if (!fold) return [];
  const has = async (key: string): Promise<boolean> => {
    try {
      return Object.hasOwn(await deps.pickerShard(shardLetter(key)), key);
    } catch {
      return false;
    }
  };
  if (await has(fold)) return [fold];
  let heads: string[] = [];
  try {
    const shard = await deps.lemmaMap(shardLetter(fold), fold);
    heads = Object.hasOwn(shard, fold) ? shard[fold] : [];
  } catch {
    heads = [];
  }
  const found: string[] = [];
  for (const head of heads) if (await has(head)) found.push(head);
  return found;
}

/** The loaders the page's lemma picker and the corpus map already use. */
export const corpusHeadwordDeps: HeadwordKeyDeps = {
  pickerShard: async (letter) => fetchLemmaPickerShard(letter) as unknown as Record<string, unknown>,
  lemmaMap: (letter) => loadShared<Record<string, string[]>>(`lemma-map/${letter}.json`),
};

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
      perTerm.push(Object.hasOwn(shard, fold) ? shard[fold] : []);
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

// Accented spelling of a typed word, for comparison with a picker's `h`.
// Beta Code is read as the search box reads it. A leading * is the capital
// marker there and a wildcard in Greek, and either way it is not part of the
// spelling. Lowercased before it is composed, as a capital with two marks
// has no composed form and its small letter does.
function typedHeadwordSurface(word: string): string {
  const stripped = word.replace(/^\*+/, '');
  const greek = greekScript(stripped) ? stripped : betaQueryToGreek(stripped);
  return greek.toLowerCase().normalize('NFC');
}

const headwordSurface = (h: string) => h.toLowerCase().normalize('NFC');

// The accented headwords (`h`) one picker key is filed under. A shard that
// does not load rejects; a key the shard does not hold is an empty list.
async function pickerHeadwords(key: string): Promise<string[]> {
  const shard = await fetchLemmaPickerShard(shardLetter(key));
  const choice = shard[key];
  if (!choice || !Array.isArray(choice.c)) return [];
  return choice.c.map(c => c.h).filter(h => h.length > 0);
}

/** Where a typed word is itself one headword, keep only that key.
 *
 * μήν is the headword μήν, so a phrase must not also be read as μείς
 * ("month"), which shares its folded letters. A spelling that is not exactly
 * one of the option keys' headwords — εἶ, an unaccented μην — keeps every
 * option, and so does a word whose picker shard did not load.
 */
export async function narrowToTypedHeadwords(
  typed: string[],
  perTerm: string[][],
  headsOf: (key: string) => Promise<string[]>,
): Promise<string[][]> {
  const out: string[][] = [];
  for (let i = 0; i < perTerm.length; i++) {
    const options = perTerm[i] ?? [];
    const surface = typedHeadwordSurface(typed[i] ?? '');
    if (!surface || !options.length) { out.push(options); continue; }
    try {
      const named = await Promise.all(options.map(async key => ({ key, names: await headsOf(key) })));
      const matched = named.filter(row => row.names.some(name => headwordSurface(name) === surface)).map(row => row.key);
      out.push(matched.length ? matched : options);
    } catch {
      out.push(options);
    }
  }
  return out;
}

// Every place the phrase stands under ANY reading of its words.
export async function searchPhraseVariants(
  grkQuery: string,
  works: string[],
  speaker?: SpeakerFilter,
): Promise<VariantOutcome> {
  const terms = grkQuery.trim().split(/\s+/).filter(Boolean).map(t => t.replace(/^\*+/, ''));
  const empty: VariantOutcome = {
    results: [], failedWorks: [], readings: [], productive: [], cappedFrom: 0,
  };
  if (terms.length < 2 || !works.length) return empty;
  if (speaker && !speaker.names.length) speaker = undefined;

  // Resolve each typed word to the headwords it can belong to.
  const folds = terms.map(t => greekFold(t));
  if (folds.some(f => !f)) return empty;
  const perTerm = await lemmaOptions(folds);
  if (!perTerm) return empty;              // without the map there is nothing to widen with
  if (perTerm.some(options => !options.length)) return empty;
  // A word's accents choose among the headwords its spelling is shared by
  // (αὐτή is αὐτός, not οὗτος); then a word typed as its own headword is that
  // headword, not every homograph that folds the same way. A table or shard
  // that does not load leaves the word wide.
  const accented = await Promise.all(perTerm.map(async (options, i) =>
    (options.length > 1 ? await accentNarrowing(terms[i], folds[i], options) : null) ?? options));
  const narrowed = await narrowToTypedHeadwords(terms, accented, pickerHeadwords);

  const { readings, total } = lemmaReadings(narrowed, VARIANT_READING_CAP);
  const cappedFrom = total > readings.length ? total : 0;

  const failedWorks: string[] = [];
  const productiveKeys = new Set<string>();
  const indexes = queryIndexes('lemma', [...new Set(readings.flat())], []);
  const perWork = await pool(works, 8, async work => {
    try {
      const [idx, offsets] = await Promise.all([
        indexes.greek(work),
        speaker ? loadOffsets(work) : Promise.resolve(null),
      ]);
      if (speaker && !attributable(work, offsets)) return [] as SearchResult[];
      // seg_idx -> the token positions any reading matched. A Set because two
      // readings routinely land on the same token.
      // seg_idx -> token position -> who said it (the phrase's first word's
      // speaker for every word of it; null when no filter asked).
      const bySeg = new Map<number, Map<number, string | null>>();
      // seg_idx -> each run kept, one match apiece; two readings of one
      // run are one match (ownWindows drops the second).
      const runs = new Map<number, number[][]>();
      for (const reading of readings) {
        const starts = phraseStarts(idx, reading.map(t => [t]));
        if (starts.size) productiveKeys.add(reading.join(' '));
        for (const [si, positions] of starts) {
          let seen = bySeg.get(si);
          if (!seen) { seen = new Map(); bySeg.set(si, seen); }
          for (const start of positions) {
            // A phrase is one utterance: it is kept or dropped on its first
            // word, and labelled with that word's speaker throughout.
            const who = speaker && offsets
              ? speakerAt(offsets, offsets.seg_base_offset[si] + start) : null;
            if (speaker && !speakerPasses(speaker, who)) continue;
            (runs.get(si) ?? runs.set(si, []).get(si)!).push(reading.map((_, k) => start + k));
            for (let k = 0; k < reading.length; k++) {
              // A reading that STARTS here names the position; a reading that
              // merely runs through it defers to one that does, whichever
              // order the readings come in.
              if (k === 0 || !seen.has(start + k)) seen.set(start + k, who);
            }
          }
        }
      }
      const hits = [...bySeg.keys()].sort((a, b) => a - b).filter(si => bySeg.get(si)!.size);
      // Only a work with hits needs to name them.
      if (!hits.length) return [] as SearchResult[];
      const meta = await loadIndex<SegMeta[]>(work, 'meta.json');
      return hits.map(si => {
        const grkPositions = [...bySeg.get(si)!.keys()].sort((a, b) => a - b);
        return {
          work,
          meta: meta[si],
          grkMatch: true,
          engMatch: false,
          grkPositions,
          windows: ownWindows(runs.get(si)!.sort((a, b) => a[0] - b[0])),
          ...(speaker && offsets
            ? { speakers: grkPositions.map(p => bySeg.get(si)!.get(p) ?? null) }
            : {}),
        } as SearchResult;
      });
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
// proximity window. This is also the only way a grammatical predicate is
// searchable: as one slot beside a lexical one.
//
// Boundary rule: a window NEVER spans a book edge. Speaker turns are a toggle,
// default keep — an argument routinely runs across a change of speaker, and
// Plato's shortest turns are a single word.

export type SlotKind = 'phrase' | 'form' | 'lemma' | 'grammatical';

// Where a slot must fall relative to the slot it is measured from (its
// `target`; the first slot unless it names an earlier one). "before"/"after"
// answer the question a reader actually asks ("does the qualification come
// before the term or after it?"); chaining each slot to its predecessor is
// the whole-query `ordered` lock. "not" is the opposite: the slot must NOT
// occur near the term it is measured from (see comboWindows). It never holds
// on the first slot, which a match is built on.
export type SlotRelation = 'near' | 'before' | 'after' | 'not';

export interface ComboSlot {
  kind: SlotKind;
  // phrase: the token run, whitespace-separated. form: one surface token.
  // lemma: the fold keys the user ticked in the picker, unioned.
  terms?: string[];
  // grammatical only.
  query?: GrammarQuery;
  // Ignored on the first slot, which is what the others are placed against.
  relation?: SlotRelation;
  // Joined to the slot before it by "or" (inclusive): the two are one term,
  // either of them standing for it, and this slot's own relation and target
  // are ignored for that term's (the first of the run's).
  or?: boolean;
  // The index of the earlier slot this one is measured from; default 0.
  target?: number;
}

// The terms a query asks for: each run of or-joined slots made one, with the
// relation and target of its first slot, the target read as an index into
// the terms. Slots that ask nothing (`usable` false) are left out, and a term
// measured from one that went is measured from what that one was; so is a
// term measured from a NOT term, which is no word of the match. A term
// measured from itself or a later one is measured from the first.
export interface ComboJoin { or?: boolean; relation?: SlotRelation; target?: number }
export interface ComboGroup<T> { members: T[]; relation: SlotRelation; target: number }
export function comboGroups<T extends ComboJoin>(slots: T[], usable: (slot: T) => boolean): ComboGroup<T>[] {
  const all: ComboGroup<T>[] = [];
  const groupOf: number[] = [];
  slots.forEach((slot, i) => {
    if (i > 0 && slot.or) { all[all.length - 1].members.push(slot); groupOf.push(all.length - 1); return; }
    const t = slot.target ?? 0;
    all.push({ members: [slot], relation: slot.relation ?? 'near', target: t > 0 && t < i ? groupOf[t] : 0 });
    groupOf.push(all.length - 1);
  });
  const out: ComboGroup<T>[] = [];
  const at: number[] = [];   // old group index -> the new group standing for it
  all.forEach((g, i) => {
    const members = g.members.filter(usable);
    let target = i === 0 || !at.length ? 0 : at[g.target];
    while (target > 0 && out[target].relation === 'not') target = out[target].target;
    if (!members.length) { at.push(target); return; }
    at.push(out.length);
    out.push({ members, relation: g.relation, target: out.length ? target : 0 });
  });
  return out;
}
const slotUsable = (s: ComboSlot) =>
  s.kind === 'grammatical' ? Object.keys(s.query ?? {}).length > 0 : (s.terms ?? []).length > 0;

export type WindowUnit = 'words' | 'line' | 'turn' | 'chapter';

export interface ComboOptions {
  window: number;          // words; ignored for the line/turn units
  unit: WindowUnit;
  ordered: boolean;        // slots must appear in the order given
  crossChapter?: boolean;
  crossTurn?: boolean;      // default true — keep hits that straddle a turn
  // Keep only windows whose EVERY term is spoken by a wanted speaker. Stricter
  // than filtering the anchor alone: "ἀρετή near ἐπιστήμη in Socrates' mouth"
  // should not be satisfied by his ἀρετή and Protagoras' ἐπιστήμη.
  speaker?: SpeakerFilter;
}

// A slot's hits in one work, as global offsets. `span` is how many tokens the
// slot occupies (a phrase covers more than one), so an ordered query can
// require the next slot to start after this one ends.
interface SlotHit { start: number; span: number; certain: boolean; values?: Record<string, string[]> }

// The proximity default: 5 words. Capped at 50, since past that "near" stops
// meaning anything.
export const COMBO_WINDOW_DEFAULT = 5;
export const COMBO_WINDOW_MAX = 50;
// The most terms a proximity search takes.
export const COMBO_TERMS_MAX = 4;

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
// array. Used for the line/turn window units and the book-edge rule.
// Text before the first start is a unit of its own: Parmenides and Lysis open
// with narration before the first labelled turn, and it is not that turn.
function unitRange(starts: number[], global: number, total: number): [number, number] {
  if (!starts.length || global < starts[0]) return [0, starts.length ? starts[0] : total];
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
// same-line window is the same kind of lookup as same-turn. The line is a
// proximity measure only — it is never shown, and never cited.
function lineStarts(offsets: Offsets): number[] {
  const out: number[] = [];
  offsets.segments.forEach((seg, i) => {
    let at = offsets.seg_base_offset[i];
    for (const [, count] of seg.line_runs) { out.push(at); at += count; }
  });
  return out;
}

// Given each slot's hits, find every window where all slots co-occur.
//
// Anchors on the FIRST slot's hits and, for each, places every other slot
// against the hit chosen for the slot it is measured from (`targets`, the
// first slot by default): within the window of it, on the side its relation
// requires. Distance is checked pair by pair and nothing more (John, 12 Nov):
// two slots measured from one may stand on either side of it, up to twice
// the window apart, and a slot measured from a later one reaches further
// still ("proximity to second word is a very useful feature").
export function comboWindows(
  perSlot: SlotHit[][],
  opts: ComboOptions,
  offsets: Offsets,
  relations: SlotRelation[] = [],
  // Two slots sharing an identity are the same query asked twice, so they may
  // not both be satisfied by one token. Empty string means "no constraint".
  identities: string[] = [],
  // The slot each is measured from; an index into perSlot, default 0.
  targets: number[] = [],
  // Placement steps left for the whole search; past them it throws
  // ProximityTooComplex rather than return a short result.
  budget: StepBudget = { left: COMBO_STEP_BUDGET },
): ComboWindow[] {
  if (opts.unit === 'chapter' || opts.crossChapter === false) {
    return comboWindows(perSlot, { ...opts, unit: opts.unit === 'chapter' ? 'turn' : opts.unit,
      crossTurn: opts.crossChapter ?? true, crossChapter: undefined },
      { ...offsets, turn_bounds: (offsets.chapter_bounds ?? []).map(c => ({ ...c, speaker: '' })) }, relations, identities, targets, budget);
  }
  offsets = { ...offsets, turn_bounds: offsets.turn_bounds ?? [] };
  // A "not" slot takes no part in forming a match: the match is found over the
  // other slots, in their order if the lock is on, and must have no NOT hit
  // near the hit chosen for the slot the NOT slot is measured from. With the
  // words unit: a NOT hit within the window of that hit, in the same book (and
  // turn, when turns are kept apart); with the line or turn unit, one in the
  // same line or turn. A NOT slot with
  // no hits excludes nothing, and its hits are never part of the match, so
  // they are neither marked nor counted. The NOT hits are applied while
  // partners are chosen (windows below), so a partner a NOT hit reaches gives
  // way to one it does not.
  const isNot = (s: number) => s > 0 && relations[s] === 'not';
  // Measured from itself, a later slot, or a NOT slot: from the first.
  const targetOf = (s: number) => {
    let t = targets[s] ?? 0;
    while (t > 0 && (t >= s || isNot(t))) t = t >= s ? 0 : targets[t] ?? 0;
    return t;
  };
  const kept = perSlot.map((_, s) => s).filter(s => !isNot(s));
  const keptAt = new Map(kept.map((s, k) => [s, k]));
  const nots: NotSlot[] = perSlot
    .map((hits, s) => ({ id: identities[s] ?? '', target: keptAt.get(targetOf(s)) ?? 0, hits: [...hits].sort((a, b) => a.start - b.start) }))
    .filter((n, s) => isNot(s) && n.hits.length)
    .map(n => ({ ...n, longest: n.hits.reduce((m, h) => Math.max(m, h.span), 1) }));
  return windows(
    kept.map(s => perSlot[s]), opts, offsets, kept.map(s => relations[s] ?? 'near'), kept.map(s => identities[s] ?? ''),
    kept.map(s => keptAt.get(targetOf(s)) ?? 0), nots, budget,
  );
}

interface NotSlot { id: string; target: number; hits: SlotHit[]; longest: number }

// Placing the terms is a search: a failing anchor may try every combination
// of its partners. Pruning (windows, below) removes every hit that cannot
// take part in any match, which settles the common cases; what is left is
// bounded by this many candidate tries per search, after which the search
// stops and says so: about a third of a second of work at most.
export const COMBO_STEP_BUDGET = 5_000_000;
export interface StepBudget { left: number }
export class ProximityTooComplex extends Error {
  constructor() {
    super('This proximity search has too many ways to place its terms to finish. Narrow it: a smaller distance, fewer works, or a more particular term.');
    this.name = 'ProximityTooComplex';
  }
}

// One match: its span, the hit chosen for each slot, and `near`, every other
// hit of a term within range of the hit its partner was sought from: marked
// with the match, never counted (John, 2026-11-11, R3).
export interface ComboWindow { start: number; end: number; hits: SlotHit[]; near: SlotHit[] }

function windows(
  perSlot: SlotHit[][],
  opts: ComboOptions,
  offsets: Offsets,
  relations: SlotRelation[],
  identities: string[],
  targets: number[],
  nots: NotSlot[],
  budget: StepBudget,
): ComboWindow[] {
  if (!perSlot.length || perSlot.some(h => !h.length)) return [];
  const sorted = perSlot.map(h => [...h].sort((a, b) => a.start - b.start));
  const total = offsets.token_count;
  const bookStarts = offsets.book_bounds.map(b => b.start);
  const turnStarts = (offsets.turn_bounds ?? []).map(t => t.start);
  const lines = opts.unit === 'line' ? lineStarts(offsets) : null;
  const words = opts.unit === 'words';

  // The offsets an anchor's partners may occupy: the structural unit the anchor
  // sits in. Computed once per anchor, so each slot is then a binary search
  // rather than a scan — which would be quadratic on a grammatical slot
  // holding tens of thousands of hits.
  const structural = (at: number): [number, number] => {
    let lo = 0;
    let hi = total;
    const clamp = ([s, e]: [number, number]) => { if (s > lo) lo = s; if (e < hi) hi = e; };
    clamp(unitRange(bookStarts, at, total));                       // never cross a book
    if (!opts.crossTurn && turnStarts.length) clamp(unitRange(turnStarts, at, total));
    if (opts.unit === 'line' && lines) clamp(unitRange(lines, at, total));
    if (opts.unit === 'turn' && turnStarts.length) clamp(unitRange(turnStarts, at, total));
    return [lo, hi];
  };

  // A NOT hit on a word a slot asking the same query also holds may be that
  // slot's own word, and then it does not count: "X not near X" means an X
  // with no OTHER X near it (John's ruling). Without this every X would
  // exclude itself and the query would always come back empty.
  // A NOT hit counts only where a partner could stand: wholly inside the
  // unit, so a NOT phrase across a turn kept apart is in neither turn.
  const fits = (h: SlotHit, unitLo: number, unitHi: number) => h.start >= unitLo && h.start + h.span <= unitHi;
  // Line and turn units: whether a NOT hit not exempt as the same query
  // stands in the unit, found once per unit, not once per anchor.
  const unitBlocked = new Map<number, boolean>();
  const sameQueryAt = (n: NotSlot, h: SlotHit) => !!n.id && identities.some((id, k) => {
    if (id !== n.id) return false;
    const i = lowerBound(sorted[k], h.start);
    return i < sorted[k].length && sorted[k][i].start === h.start;
  });
  // Whether a NOT hit stands near the hit chosen for the slot it is measured
  // from, unless it is one of the match's own words of the same query (above).
  const excluded = (take: SlotHit[], unitLo: number, unitHi: number) => nots.some(n => {
    let lo = unitLo;
    let hi = unitHi;
    if (words) {
      const from = take[n.target];
      lo = Math.max(lo, from.start - opts.window);
      hi = Math.min(hi, from.start + from.span + opts.window);
    }
    for (let i = lowerBound(n.hits, lo - n.longest + 1); i < n.hits.length && n.hits[i].start < hi; i++) {
      const h = n.hits[i];
      if (h.start + h.span <= lo || !fits(h, unitLo, unitHi)) continue;
      if (!n.id || !take.some((m, k) => m.start === h.start && identities[k] === n.id)) return true;
    }
    return false;
  });

  // Pruning: the hits of each slot that could take part in some match, found
  // before any anchor is placed, so that a search with no match does not try
  // every combination of partners to learn it. A hit stays only if every
  // slot measured from it has a hit left within its reach, on the side its
  // relation asks; under the order lock, if the next slot has a hit left
  // after it in its unit; and, with the words unit, if no NOT term measured
  // from its slot (one no slot asks the same thing as) stands within the
  // window of it. Each is required of a match, so removing a hit that fails
  // one changes no result: the placement below finds the same hits, in the
  // same order. Slots are measured from earlier ones, so this runs from the
  // last slot back. Every hit of a match stands in the anchor's unit, and the
  // unit is the same from any offset in it, so each hit's own unit serves.
  const reach = words ? opts.window : total;
  const live: SlotHit[][] = [];
  {
    const counts: number[][] = [];   // prefix counts of live hits per slot
    const anyLive = (k: number, from: number, to: number) =>
      from < to && counts[k][lowerBound(sorted[k], to)] - counts[k][lowerBound(sorted[k], from)] > 0;
    for (let s = sorted.length - 1; s >= 0; s--) {
      const children = targets.map((t, c) => (c > s && t === s ? c : -1)).filter(c => c >= 0);
      const notsFrom = words ? nots.filter(n => n.target === s && !n.id) : [];
      const keep = sorted[s].map(h => {
        const [uLo, uHi] = structural(h.start);
        if (h.start + h.span > uHi) return false;
        for (const c of children) {
          const relation = relations[c] ?? 'near';
          const lo = Math.max(uLo, h.start - reach);
          const hi = Math.min(uHi, h.start + reach + 1);
          if (!anyLive(c, relation === 'after' ? Math.max(lo, h.start + h.span) : lo, relation === 'before' ? Math.min(hi, h.start + 1) : hi)) return false;
        }
        if (opts.ordered && s + 1 < sorted.length && !anyLive(s + 1, h.start + h.span, uHi)) return false;
        for (const n of notsFrom) {
          const lo = Math.max(uLo, h.start - opts.window);
          const hi = Math.min(uHi, h.start + h.span + opts.window);
          for (let i = lowerBound(n.hits, lo - n.longest + 1); i < n.hits.length && n.hits[i].start < hi; i++) {
            const x = n.hits[i];
            if (x.start + x.span > lo && fits(x, uLo, uHi)) return false;
          }
        }
        return true;
      });
      const count = [0];
      keep.forEach((k, i) => count.push(count[i] + (k ? 1 : 0)));
      counts[s] = count;
      live[s] = sorted[s].filter((_, i) => keep[i]);
    }
  }
  if (live.some(h => !h.length)) return [];

  const out: ComboWindow[] = [];
  for (const anchor of live[0]) {
    const [unitLo, unitHi] = structural(anchor.start);
    if (anchor.start + anchor.span > unitHi) continue;   // the anchor's own run must fit

    // An anchor a NOT hit measured from it reaches is no match, whatever its
    // partners: with the words unit, a NOT hit within the window of the
    // anchor; with the line or turn unit, one anywhere in the unit (every
    // partner stands in the anchor's unit, so there any NOT slot counts,
    // whatever it is measured from). Cheap: per anchor and NOT slot, one
    // binary search and a read of the NOT hits within W of the anchor (or up
    // to the first in the unit). A NOT hit a slot of the same query might
    // take is left to the final check, since whether it counts depends on
    // which partner is chosen; so is a NOT slot measured from a later slot.
    const blocked = words ? undefined : unitBlocked.get(unitLo);
    if (blocked === true) continue;
    let clear = true;
    if (blocked === undefined) for (const n of nots) {
      if (words && n.target !== 0) continue;
      const from = words ? Math.max(unitLo, anchor.start - opts.window) : unitLo;
      const to = words ? Math.min(unitHi, anchor.start + anchor.span + opts.window) : unitHi;
      for (let i = lowerBound(n.hits, from - n.longest + 1); i < n.hits.length && n.hits[i].start < to; i++) {
        const h = n.hits[i];
        if (h.start + h.span <= from || !fits(h, unitLo, unitHi) || sameQueryAt(n, h)) continue;
        clear = false;
        break;
      }
      if (!clear) break;
    }
    if (!words) unitBlocked.set(unitLo, !clear);
    if (!clear) continue;

    // Where slot s may stand, placed against `from`, the hit chosen for the
    // slot it is measured from: inside the unit, inside the word window, and
    // on the side its relation requires (from `after` on, when given), as a
    // range of indexes into `list`. "before" wants the nearest preceding run
    // first, so is read from the end; everything else from the start.
    const range = (s: number, from: SlotHit, list: SlotHit[], after: number): [number, number] => {
      const relation = relations[s] ?? 'near';
      const lo = Math.max(unitLo, from.start - reach);
      const hi = Math.min(unitHi, from.start + reach + 1);
      const first = Math.max(after, relation === 'after' ? Math.max(lo, from.start + from.span) : lo);
      const last = relation === 'before' ? Math.min(hi, from.start + 1) : hi;
      return [lowerBound(list, first), lowerBound(list, last)];
    };
    // Whether a hit in that range may stand there: its run inside the unit,
    // and "before" measured by the END of the run, so a phrase only counts as
    // preceding when the whole run finishes first.
    const standsAt = (s: number, from: SlotHit, h: SlotHit) =>
      h.start + h.span <= unitHi && !((relations[s] ?? 'near') === 'before' && h.start + h.span > from.start);
    const candidates = (s: number, from: SlotHit, list: SlotHit[], after: number): SlotHit[] => {
      const [i0, i1] = range(s, from, list, after);
      const picks = list.slice(i0, Math.max(i0, i1)).filter(h => standsAt(s, from, h));
      return relations[s] === 'before' ? picks.reverse() : picks;
    };

    // Each slot in turn, against the hit its target took, trying the next
    // candidate when a later slot finds nothing: taking the first feasible
    // hit per slot is NOT sufficient, since the order lock, a term measured
    // from a later one, or a NOT term measured from one can each rule out a
    // partner when another would have served.
    // One token may satisfy two DIFFERENT slots — "λόγος in the nominative"
    // is a lemma slot and a grammatical slot landing on the same word, and is
    // the most useful combo query there is. But two IDENTICAL slots asking
    // the same thing want two occurrences, not one word counted twice.
    const take: SlotHit[] = [anchor];
    const used = new Map<string, Set<number>>();
    const taken = (s: number) => {
      const id = identities[s];
      if (!id) return null;
      let set = used.get(id);
      if (!set) { set = new Set(); used.set(id, set); }
      return set;
    };
    taken(0)?.add(anchor.start);
    const place = (s: number): boolean => {
      if (s === sorted.length) return !(nots.length && excluded(take, unitLo, unitHi));
      const set = taken(s);
      const from = take[targets[s]];
      const list = live[s];
      // The whole-query order lock: each slot after the one before it.
      const [i0, i1] = range(s, from, list, opts.ordered ? take[s - 1].start + take[s - 1].span : 0);
      const back = relations[s] === 'before';
      for (let k = 0; k < i1 - i0; k++) {
        if (--budget.left < 0) throw new ProximityTooComplex();
        const h = list[back ? i1 - 1 - k : i0 + k];
        if (!standsAt(s, from, h) || set?.has(h.start)) continue;
        set?.add(h.start);
        take[s] = h;
        if (place(s + 1)) return true;
        set?.delete(h.start);
      }
      take.length = s;
      return false;
    };
    if (!place(1)) continue;
    const chosen = take;
    // An extra mark must work in its term's place with every other chosen
    // hit fixed: both ends of each relation, the slot order, and NOT terms.
    const near: SlotHit[] = [];
    const canReplace = (s: number, h: SlotHit) => {
      if (!fits(h, unitLo, unitHi)) return false;
      const alt = chosen.slice();
      alt[s] = h;
      if (opts.ordered && ((s > 0 && alt[s - 1].start + alt[s - 1].span > h.start)
        || (s + 1 < alt.length && h.start + h.span > alt[s + 1].start))) return false;
      for (let k = 0; k < alt.length; k++) {
        if (k !== s && identities[s] && identities[s] === identities[k] && h.start === alt[k].start) return false;
        if (k === 0 || (k !== s && targets[k] !== s)) continue;
        const from = alt[targets[k]], hit = alt[k];
        if (words && Math.abs(hit.start - from.start) > opts.window) return false;
        if (relations[k] === 'after' && hit.start < from.start + from.span) return false;
        if (relations[k] === 'before' && hit.start + hit.span > from.start) return false;
      }
      return !nots.length || !excluded(alt, unitLo, unitHi);
    };
    for (let i = lowerBound(sorted[0], Math.max(unitLo, anchor.start - reach)); i < sorted[0].length && sorted[0][i].start < Math.min(unitHi, anchor.start + reach + 1); i++) {
      const h = sorted[0][i];
      if (h.start + h.span > unitHi) continue;
      if (!chosen.includes(h) && canReplace(0, h)) near.push(h);
    }
    for (let s = 1; s < sorted.length; s++) {
      for (const h of candidates(s, chosen[targets[s]], sorted[s], opts.ordered ? anchor.start + anchor.span : 0)) {
        if (!chosen.includes(h) && canReplace(s, h)) near.push(h);
      }
    }
    out.push({
      start: Math.min(...chosen.map(h => h.start)),
      end: Math.max(...chosen.map(h => h.start + h.span - 1)),
      hits: chosen,
      near,
    });
  }
  return out;
}

// What a Greek term asks, as the index reads it: its pattern pieces with the
// literals folded and runs of them joined, so two spellings that fold alike
// are one query. A term that is no pattern asks nothing, and keeps its text.
function termMeaning(term: string): string {
  const pieces = patternPieces(term);
  if (!pieces) return `!${term}`;
  const out: (string | [string, ...string[]])[] = [];
  for (const p of pieces) {
    if (p.kind === 'char') {
      const f = greekFold(p.ch);
      if (typeof out[out.length - 1] === 'string' && !/^[.*+()|]$/.test(out[out.length - 1] as string)) {
        out[out.length - 1] += f;
      } else out.push(f);
    } else if (p.kind === 'set') {
      out.push([p.negated ? '^' : '', ...[...new Set(p.chars.map(greekFold).filter(Boolean))].sort()]);
    } else out.push({ run: '*', one: '.', plus: '+', open: '(', close: ')', or: '|' }[p.kind]);
  }
  return JSON.stringify(out);
}

async function comboSearchWork(
  work: string,
  groups: ComboGroup<ComboSlot>[],
  opts: ComboOptions,
  seen?: { notHit: boolean },   // set when a NOT term occurs in this work
  budget?: StepBudget,
): Promise<SearchResult[]> {
  const slots = groups.flatMap(g => g.members);
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
    // The column is joined to the offsets by position alone, so a mismatched
    // token_count means the two files came from different builds — refuse
    // rather than silently report the wrong words.
    if (dict.token_count !== offsets.token_count) {
      throw new Error(`${work}: grammar/offsets built from different runs`);
    }
    const buffer = await loadBinary(work, 'grammar-col.bin');
    column = dict.width === 4 ? new Uint32Array(buffer) : new Uint16Array(buffer);
    // A short column would silently drop every grammatical hit past its end and
    // still report a complete result.
    if (column.length !== offsets.token_count) {
      throw new Error(`${work}: grammar column length does not match token count`);
    }
  }

  // Same rule as the plain search: no labelled turns, or a narrator's only,
  // nothing to attribute.
  const speaker = opts.speaker?.names.length ? opts.speaker : undefined;
  if (speaker && !attributable(work, offsets)) return [];

  const base = offsets.seg_base_offset;
  // An or-joined term's hits are its members' together, one list, before any
  // window forms: either word stands for the term. A token two members both
  // hold is one hit.
  let perSlot = groups.map(g => {
    const hits = g.members.flatMap(s => slotHits(s, base, lemmaIdx, formIdx, dict, column));
    if (g.members.length === 1) return hits;
    hits.sort((a, b) => a.start - b.start || a.span - b.span);
    return hits.filter((h, i) => i === 0 || h.start !== hits[i - 1].start || h.span !== hits[i - 1].span);
  });
  const isNot = (i: number) => i > 0 && groups[i].relation === 'not';
  if (seen && perSlot.some((hits, i) => isNot(i) && hits.length)) seen.notHit = true;
  // The speaker filter is applied to each slot's hits BEFORE windows form, not
  // to the windows after. Each anchor takes one partner per slot — the nearest
  // feasible one — so filtering afterwards would let an unwanted speaker's
  // token claim the window and hide a wanted one a few words further on.
  // A "not" slot is left unfiltered: a NOT term excludes a match whoever says
  // the excluded word. "ἀρετή in Socrates' mouth, not near ἐπιστήμη" asks
  // about the passage, and an ἐπιστήμη his partner says is still near it.
  if (speaker) {
    perSlot = perSlot.map((hits, i) => (isNot(i)
      ? hits
      : hits.filter(h => speakerPasses(speaker, speakerAt(offsets, h.start)))));
  }
  // Two slots are the same slot when they ask the same thing, whatever order
  // the reader ticked or typed it in: a lemma slot's heads are unioned, so
  // their order carries nothing; a phrase is a run, so its order is the
  // question. A grammatical query's categories are a set.
  // A term is compared by what it asks, not how it is spelled: λόγος, LOGOS
  // and λογος are one query.
  // An or-joined term is the set of its members.
  const slotId = (s: ComboSlot) => JSON.stringify([
    s.kind,
    s.terms ? (s.kind === 'phrase' ? s.terms.map(termMeaning) : s.terms.map(termMeaning).sort()) : null,
    s.query ? Object.fromEntries(Object.entries(s.query).sort(([a], [b]) => a.localeCompare(b))) : null,
  ]);
  const slotIds = groups.map(g => (g.members.length === 1 ? slotId(g.members[0]) : JSON.stringify(g.members.map(slotId).sort())));
  const duplicated = new Set(slotIds.filter((id, i) => slotIds.indexOf(id) !== i));
  const windows = comboWindows(
    perSlot, opts, offsets,
    groups.map(g => g.relation),
    slotIds.map(id => (duplicated.has(id) ? id : '')),
    groups.map(g => g.target),
    budget,
  );

  const bySeg = new Map<number, SearchResult>();
  const resultFor = (si: number): SearchResult => {
    let r = bySeg.get(si);
    if (!r) {
      r = {
        work, meta: meta[si], grkMatch: true, engMatch: false,
        grkPositions: [], grammar: [], windows: [],
        ...(speaker ? { speakers: [] } : {}),
      };
      bySeg.set(si, r);
    }
    return r;
  };
  // A window can straddle a column boundary — segments are keyed (book,
  // column), and a book edge is the only thing a window may not cross. It is
  // one match all the same: cited in the section it starts in, a token past
  // that section's last counting on into the next (hitTokens), so one row
  // marks every word of it (audit, 2026-11-11). A token two windows share is
  // the first's (global offsets, so a token is one token whichever section
  // a window starts in).
  const claimed = new Set<number>();
  // Report every matched token so the KWIC marks all of them. Ambiguity is
  // recorded PER SLOT, not per window: a lexically matched word is certain
  // whatever its neighbour's parse allows, and labelling it with the other
  // slot's alternatives would attribute morphology to the wrong word.
  const mark = (si: number, list: number[], h: SlotHit) => {
    for (let k = 0; k < h.span; k++) {
      const g = h.start + k;
      if (claimed.has(g)) continue;
      claimed.add(g);
      const result = resultFor(si);
      const hp = g - base[si];
      list.push(hp);
      result.grkPositions.push(hp);
      result.grammar!.push({ values: h.values ?? {}, certain: h.certain });
      // Every word of a slot's run carries the speaker it was kept on (its
      // first word's), as the plain and variant engines do: a phrase slot
      // across a turn break must not print the excluded speaker on its tail.
      if (speaker) result.speakers!.push(speakerAt(offsets, h.start));
    }
  };
  // The matched words first, every window's, so which windows stand (and so
  // the count) is as it was; then the words in range of each anchor, on the
  // windows that stand, where no window has them.
  const listed: { si: number; list: number[]; near: SlotHit[] }[] = [];
  for (const w of windows) {
    const [si] = locate(base, w.start);
    const list: number[] = [];
    for (const h of w.hits) mark(si, list, h);
    if (list.length) listed.push({ si, list, near: w.near });
  }
  for (const { si, list, near } of listed) {
    // A word in range before the section the match is cited in has no place
    // on its row (positions count on from that section's first word), so it
    // is not marked; the match's own words never stand there.
    for (const h of near) if (h.start >= base[si]) mark(si, list, h);
    bySeg.get(si)!.windows!.push(list.sort((a, b) => a - b));
  }
  for (const r of bySeg.values()) {
    const order = r.grkPositions.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
    r.grkPositions = order.map(([p]) => p);
    r.grammar = order.map(([, i]) => r.grammar![i]);
    if (r.speakers) r.speakers = order.map(([, i]) => r.speakers![i]);
  }
  return [...bySeg.keys()].sort((a, b) => a - b).map(si => bySeg.get(si)!);
}

// Combo search across one or more works.
export async function searchCombo(
  slots: ComboSlot[],
  opts: ComboOptions,
  works: string[],
): Promise<SearchOutcome> {
  const groups = comboGroups(slots, slotUsable);
  // Grammar alone (ruling 3, John, 2026-11-10; this replaces "grammar is a
  // filter on a lexical query and nothing else"). A query of grammar terms
  // only runs when something narrows it: fewer than all works, a speaker
  // filter, or a second term near or not near it. Unnarrowed, "genitive
  // plural feminine" returns the corpus, not an answer, so it is refused here
  // and the page shows the narrowing controls instead.
  // A single word term is no proximity search: that is the main search box.
  // A search that opens with a NOT term has nothing for it to stand apart from.
  // A NOT term narrows only by occurring: one that occurs nowhere takes
  // nothing away, so that case is settled after the search, below.
  // An or-joined run counts as the one term it is.
  const narrowed = new Set(works).size < WORKS.length || !!opts.speaker?.names.length;
  const positive = groups.slice(1).filter(g => g.relation !== 'not');
  const grammatical = (g: ComboGroup<ComboSlot>) => g.members.every(s => s.kind === 'grammatical');
  const grammarOnly = groups.every((g, i) => grammatical(g) || (i > 0 && g.relation === 'not'));
  const onlyNotNarrows = grammarOnly && !narrowed && groups.length >= 2 && !positive.length;
  if (groups[0]?.relation === 'not' || !works.length) return { results: [], failedWorks: [] };
  if (groups.length === 1) {
    if (!grammatical(groups[0])) return { results: [], failedWorks: [] };
    if (!narrowed) return { results: [], failedWorks: [], unnarrowed: true };
  }
  if (!groups.length) return { results: [], failedWorks: [] };
  const seen = { notHit: false };

  const bounded: ComboOptions = {
    ...opts,
    window: Math.max(1, Math.min(opts.window || COMBO_WINDOW_DEFAULT, COMBO_WINDOW_MAX)),
  };
  const failedWorks: string[] = [];
  const budget: StepBudget = { left: COMBO_STEP_BUDGET };
  const perWork = await pool(works, 8, async w => {
    try {
      return await comboSearchWork(w, groups, bounded, seen, budget);
    } catch (err) {
      // Too many placements is the search's answer, not one work's failure:
      // the whole search stops and says so, never a short count.
      if (err instanceof ProximityTooComplex) throw err;
      console.warn(`searchCombo: skipping ${w} —`, err);
      failedWorks.push(w);
      return [] as SearchResult[];
    }
  });
  if (failedWorks.length === works.length) {
    throw new Error('Could not load the search index — check your connection and try again.');
  }
  if (onlyNotNarrows && !seen.notHit) return { results: [], failedWorks, unnarrowed: true };

  // Only worth saying when the answer depends on where a turn begins — which a
  // speaker filter does as much as the turn unit: a snapped bound puts the
  // words either side of it in the wrong mouth.
  const approximateTurns: string[] = [];
  if (bounded.unit === 'chapter' || bounded.crossChapter === false) {
    const approximateChapters: string[] = [];
    for (const w of works) {
      try { if ((await loadOffsets(w)).chapter_bounds?.some(c => c.accuracy !== 'exact' && c.start !== 0)) approximateChapters.push(w); } catch {}
    }
    return { results: perWork.flat(), failedWorks, approximateChapters };
  }
  if (bounded.unit === 'turn' || !bounded.crossTurn || !!bounded.speaker?.names.length) {
    for (const w of works) {
      if (failedWorks.includes(w)) continue;
      try {
        const offsets = await loadOffsets(w);   // already cached
        if ((offsets.turn_bounds ?? []).some(t => t.accuracy !== 'exact' && t.start !== 0)) {
          approximateTurns.push(w);
        }
      } catch { /* a work that failed to load is already reported */ }
    }
  }
  return { results: perWork.flat(), failedWorks, approximateTurns };
}

// The keys a typed word's accents leave of its spelling's headwords
// (lib/lemma-accents), or null. The table is made at site build; where it does
// not load, every word stays as wide as its spelling.
async function accentNarrowing(typed: string, fold: string, heads: string[]): Promise<string[] | null> {
  try {
    return narrowByAccent(await loadShared<LemmaAccents>('lemma-accents.json'), typed, fold, heads);
  } catch {
    return null;
  }
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
 * still searches as itself. Patterns are left alone — they are patterns over
 * index keys, not surface words to resolve. Which terms are patterns is
 * compilePattern's call: in Beta Code a leading * is the capital (*LO/GOU).
 *
 * Where the map does not load, a word searches as typed, and `unresolved`
 * names it: an inflection searched as itself finds nothing, and the reader
 * must not take that for the corpus's answer.
 */
async function resolveHeadwords(terms: string[]): Promise<{ terms: string[][]; unresolved: string[] }> {
  const unresolved: string[] = [];
  const resolved = await Promise.all(terms.map(async term => {
    const pattern = compilePattern(term, greekFold);
    if (!pattern || !('exact' in pattern)) return [term];
    const fold = pattern.exact;
    const letter = /^[a-z]/.test(fold) ? fold[0] : '_';
    try {
      const shard = await loadShared<Record<string, string[]>>(`lemma-map/${letter}.json`);
      const heads = Object.hasOwn(shard, fold) ? shard[fold] : undefined;
      if (!heads?.length) return [term];
      // The bare fold and the headwords, unless the typed word's accents pick
      // among them (lib/lemma-accents). The table decides about the bare fold
      // too: ἡ's "h" is also ἤ's key, and stays only where the index says so.
      const wide = [...new Set([fold, ...heads])];
      return (await accentNarrowing(term, fold, wide)) ?? wide;
    } catch {
      unresolved.push(term);
      return [term];
    }
  }));
  return { terms: resolved, unresolved };
}

// -- The form of each Greek hit ---------------------------------------------
//
// A result says where the query's words stand, not what form each takes: a
// lemma search reads the lemma index, whose postings carry no form. The form
// index does, so the forms are read back from it. For a lemma search the
// candidates are the forms the lemma map files under the headwords searched,
// which is every form the lemma index could have counted (stage 8 writes the
// map from the same analyses). The whole map is a third of a megabyte, read
// once; the forms then fall in a few shards.

export interface HitForms {
  /** `${work}:${segment id}` → the folded form at each of that result's
   * grkPositions, in step with them; "" where none was found. */
  byResult: Map<string, string[]>;
  /** Folded form → the headwords searched that it is a form of. Empty for a
   * search by form, which names no headword. */
  headwords: Map<string, string[]>;
  /** Works whose indexes did not load: their results have no entry in
   * byResult, so nothing of theirs can be counted or set aside. */
  failedWorks: string[];
}

// The letters a folded Greek word can begin with (greekFold's, digamma's v
// among them), as lemma-map is split; "_" holds the rest. A corpus has no
// shard for a letter none of its words begins with: that 404 is an answer,
// and is not asked for again. Any other failure is one.
const LEMMA_MAP_SHARDS = [...'abcdefghiklmnopqrstuvwxyz', '_'];
const _noLemmaMap = new Set<string>();
async function lemmaMapShard(letter: string): Promise<Record<string, string[]>> {
  if (_noLemmaMap.has(letter)) return {};
  // Aristotle: no lemma begins with digamma, so there is no v shard.
  if (letter === 'v') return {};
  try {
    return await loadShared<Record<string, string[]>>(`lemma-map/${letter}.json`);
  } catch (err) {
    if (!/^HTTP 404 /.test(err instanceof Error ? err.message : '')) throw err;
    _noLemmaMap.add(letter);
    return {};
  }
}

// The keys of an index one query's terms match. On the shard path the index
// holds only those; a work read from its own file holds every key.
function matchedKeys(idx: GrkIndex, terms: string[]): string[] {
  const patterns = terms.map(t => compilePattern(t, greekFold)).filter(p => p !== null);
  return Object.keys(idx).filter(key => patterns.some(p => ('exact' in p ? p.exact === key : p.test(key))));
}

/** The form of every Greek hit in `results`, for the search (`grkQuery`,
 * `matchMode`) that found them: the same query search() was given. A work
 * whose indexes do not load is left without forms and named in failedWorks;
 * a lemma map that cannot be read fails the whole lookup. */
export async function greekHitForms(
  results: SearchResult[],
  grkQuery: string,
  matchMode: MatchMode,
  phrase = false,
): Promise<HitForms> {
  const out: HitForms = { byResult: new Map(), headwords: new Map(), failedWorks: [] };
  const failed = new Set<string>();
  const works = [...new Set(results.filter(r => r.grkMatch && r.grkPositions.length).map(r => r.work))];
  const typed = grkQuery.trim().split(/\s+/).filter(Boolean);
  if (!works.length || !typed.length) return out;

  let formTerms = typed;
  if (matchMode !== 'form') {
    let perWord = matchMode === 'lemma' ? (await resolveHeadwords(typed)).terms : typed.map(t => [t]);
    // As search() reads a lemma phrase: μήν in τί μήν is μήν, so the list must
    // not name μείς as a headword of hits it never took.
    if (matchMode === 'lemma' && phrase && typed.length > 1) {
      perWord = await narrowToTypedHeadwords(typed, perWord, pickerHeadwords);
    }
    const terms = perWord.flat();
    const lemmaIx = queryIndexes('lemma', terms, []);
    const heads = new Set<string>();
    await pool(works, 8, async w => {
      try { for (const key of matchedKeys(await lemmaIx.greek(w), terms)) heads.add(key); } catch { failed.add(w); }
    });
    const maps = await pool(LEMMA_MAP_SHARDS, 8, lemmaMapShard);
    for (const map of maps) {
      for (const form of Object.keys(map)) {
        const own = map[form].filter(h => heads.has(h));
        if (own.length) out.headwords.set(form, own.sort());
      }
    }
    formTerms = [...out.headwords.keys()];
  }

  const formIx = queryIndexes('form', formTerms, []);
  await pool(works.filter(w => !failed.has(w)), 8, async w => {
    try {
      const [idx, meta] = await Promise.all([formIx.greek(w), loadIndex<SegMeta[]>(w, 'meta.json')]);
      const at = new Map<string, string>();               // `${seg_idx}:${pos}` → form
      for (const form of matchedKeys(idx, formTerms)) {
        for (const [si, pos] of idx[form]) at.set(`${si}:${pos}`, form);
      }
      const segIndex = new Map(meta.map((m, i) => [m.id, i]));
      // Whole or not at all, as greekHitGrammar reads a work.
      const own = new Map<string, string[]>();
      for (const r of results) {
        if (r.work !== w || !r.grkMatch) continue;
        const si = segIndex.get(r.meta.id);
        if (si === undefined) throw new Error(`${w}: segment ${r.meta.id} is not in its index`);
        own.set(`${w}:${r.meta.id}`, r.grkPositions.map(pos => at.get(`${si}:${pos}`) ?? ''));
      }
      for (const [key, forms] of own) out.byResult.set(key, forms);
    } catch (err) {
      console.warn(`search: no forms for ${w} —`, err);
      failed.add(w);
    }
  });
  out.failedWorks = works.filter(w => failed.has(w));
  return out;
}

// -- The grammar of each Greek hit -------------------------------------------
//
// The readings of every hit, for the results page's grammar view and facets:
// the same column a grammatical search reads, looked up at each hit's global
// offset after the search, so the search itself loads no grammar it was not
// asked for.

export interface HitGrammar {
  /** `${work}:${segment id}` → the readings of the token at each of that
   * result's grkPositions, in step with them; [] for an unanalysed token. */
  byResult: Map<string, Reading[][]>;
  /** Works whose grammar files did not load: no entry in byResult for their results. */
  failedWorks: string[];
}

/** The readings of every Greek hit in `results`. A work whose grammar does
 * not load is left without and named in failedWorks; the rest still resolve. */
export async function greekHitGrammar(results: SearchResult[]): Promise<HitGrammar> {
  const out: HitGrammar = { byResult: new Map(), failedWorks: [] };
  const failed = new Set<string>();
  const works = [...new Set(results.filter(r => r.grkMatch && r.grkPositions.length).map(r => r.work))];
  await pool(works, 8, async w => {
    try {
      const [dict, offsets, meta, buffer] = await Promise.all([
        loadIndex<GrammarDict>(w, 'grammar-dict.json'),
        loadOffsets(w),
        loadIndex<SegMeta[]>(w, 'meta.json'),
        loadBinary(w, 'grammar-col.bin'),
      ]);
      // As in comboSearchWork: the column is joined to the offsets by
      // position alone, so files from different builds would name the wrong words.
      const column = dict.width === 4 ? new Uint32Array(buffer) : new Uint16Array(buffer);
      if (dict.token_count !== offsets.token_count || column.length !== offsets.token_count) {
        throw new Error(`${w}: grammar/offsets built from different runs`);
      }
      const segIndex = new Map(meta.map((m, i) => [m.id, i]));
      // Read whole or not at all: a result whose segment this index does not
      // know is from another build, and the work's hits would then be partly
      // narrowed and partly not, with nothing to say so.
      const own = new Map<string, Reading[][]>();
      for (const r of results) {
        if (r.work !== w || !r.grkMatch) continue;
        const si = segIndex.get(r.meta.id);
        if (si === undefined) throw new Error(`${w}: segment ${r.meta.id} is not in its index`);
        const base = offsets.seg_base_offset[si];
        own.set(`${w}:${r.meta.id}`, r.grkPositions.map(pos => dict.sigs[column[base + pos]] ?? []));
      }
      for (const [key, readings] of own) out.byResult.set(key, readings);
    } catch (err) {
      console.warn(`search: no grammar for ${w} —`, err);
      failed.add(w);
    }
  });
  out.failedWorks = works.filter(w => failed.has(w));
  return out;
}

// Unified search across one or more works. `matchMode` chooses the Greek index
// (lemma = all forms of a headword, form = the exact inflected token);
// `engForms` lets each English word match its plural and possessive forms;
// `speaker` holds the hits to one voice (see SpeakerFilter).
export async function search(
  grkQuery: string,
  engQuery: string,
  grkMode: SearchMode,
  engMode: SearchMode,
  langOp: LangOp,
  works: string[],
  matchMode: MatchMode = 'lemma',
  engForms = false,
  speaker?: SpeakerFilter,
): Promise<SearchOutcome> {
  if (!grkQuery.trim() && !engQuery.trim()) return { results: [], failedWorks: [] };
  if (!works.length) return { results: [], failedWorks: [] };
  // An empty name list would mean "only nobody" or "anyone but nobody"; treat
  // both as no filter rather than return an empty corpus or the whole one.
  if (speaker && !speaker.names.length) speaker = undefined;

  const typedGrk = grkQuery.trim().split(/\s+/).filter(Boolean);
  let { terms: grkTerms, unresolved: unresolvedTerms } = matchMode === 'lemma'
    ? await resolveHeadwords(typedGrk)
    : { terms: typedGrk.map(t => [t]), unresolved: [] as string[] };
  // A phrase, and only a phrase: one typed word still means every headword
  // that spelling can belong to, and form mode and running text never come
  // through here as a phrase of dictionary words. μήν in a phrase is μήν.
  if (matchMode === 'lemma' && grkMode === 'phrase' && typedGrk.length > 1) {
    grkTerms = await narrowToTypedHeadwords(typedGrk, grkTerms, pickerHeadwords);
  }
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
        await searchWork(w, grkTerms, engUnits, grkMode, engMode, langOp, indexes, engForms, speaker);
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
    ...(unresolvedTerms.length ? { unresolvedTerms } : {}),
  };
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


export interface ComboHit {
  work: string;
  seg_idx: number;
  pos: number;             // token position of the leftmost slot, within its segment
  global: number;
  positions: number[];     // every matched token position in that segment
  certain: boolean;        // false if ANY slot rested on an ambiguous parse
  values?: Record<string, string[]>;
}