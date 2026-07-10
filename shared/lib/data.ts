// Data-fetch helpers. All paths relative to /data (public symlink to
// build/dist/ne). Shards are cached in module-level Maps so a single
// click won't re-fetch the same shard twice in a session.
import { linkifyGlossaryRefs } from './glossary';

export interface Token {
  t: string;   // surface form (Unicode Greek)
  o: number;   // char offset in the line
  k: string;   // Beta Code key
}

export interface GreekLine {
  n: number;
  text: string;
  joined?: boolean;
  tokens: Token[];
  // Table row: present when the Greek line is part of an inline table (the TLG
  // ⎪ column divider, e.g. the De Int 22a modal square). Each cell carries its
  // own text + clickable tokens (offsets rebased to the cell).
  cells?: { text: string; tokens: Token[] }[];
}

export interface EnglishChunk {
  text: string;
  notes: { offset: number; text: string }[];
  markers: { kind: string; n: string; offset: number }[];
  // Bekker line ticks for the English gutter; `real` = a true TEI milestone
  // (column start / ~line 20), otherwise a proportional estimate.
  bekker?: { n: number; offset: number; real: boolean }[];
}

export interface ChapterStart {
  chapter: string;
  beforeLine: number;  // insert the heading before the Greek line with this n
  wordIndex: number;   // word index within that line where the chapter begins
                       // (>0 means the chapter starts mid-line → split the line)
  engOffset: number;   // char offset in the English chunk where the chapter begins
  bekker: string;      // Bekker span, e.g. "1097a–1098b" (single column if equal)
}

// A slice of the Ross translation paired to a chapter block in this column.
// `cont` = the tail of a chapter that began in an earlier column. Ross is
// chapter-anchored (no per-line Bekker gutter), distributed across columns.
export interface RossPiece {
  chapter: string;
  text: string;
  cont: boolean;
  // Interpolated Bekker-line ticks down this slice (all estimates — Ross has no
  // milestones of its own). Same shape as EnglishChunk.bekker.
  bekker?: { n: number; offset: number; real: boolean }[];
  // Structured diagram tables (e.g. Ackrill's squares of opposition), each
  // anchored to the Bekker line `n` of the segment it belongs to; rendered as a
  // grid after that segment's row.
  tables?: { n: number; rows: string[][] }[];
}

export interface Segment {
  id: string;
  column: string;
  greek: GreekLine[];
  english: EnglishChunk | null;
  chapterStarts?: ChapterStart[];
  ross?: RossPiece[];
  // Optional third translation (same overlay shape as ross), e.g. Categories'
  // Ackrill beside Edghill + Taylor. Absent in works with fewer translations.
  third?: RossPiece[];
  // Any further overlay translations (the 4th onward), keyed by translation id.
  // Same overlay shape as ross/third. Lets a work carry an unbounded number of
  // chapter-anchored secondary translations beyond the fixed ross/third slots.
  overlays?: Record<string, RossPiece[]>;
}

export interface ChapterRef {
  chapter: string;
  column: string;
  line: string;
  bekker: string;
}

export interface BookData {
  book: number;
  segments: Segment[];
}

export interface Analysis {
  lemma: string;   // Beta Code
  gloss: string;
  parse: string;
  lsj: string[];   // LSJ key(s)
}

export interface LsjEntry {
  key: string;
  head: string;    // Unicode Greek
  html: string;
}

// Honour Astro's base path so data fetches work under a project Pages site as
// well as at the root. BASE_URL may or may not carry a trailing slash, so strip
// it and join explicitly. Each work's data lives under /data/<work>/.
// A non-Astro host (the desktop app) can point the whole data layer somewhere
// else — e.g. a Tauri asset:// URL for an on-disk corpus directory — by setting
// globalThis.__ARISTOTLE_DATA_ROOT__ before any fetch helper runs. Read lazily
// so the override wins regardless of module-import order.
const DEFAULT_ROOT = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data`;
const ROOT = () =>
  (globalThis as { __ARISTOTLE_DATA_ROOT__?: string }).__ARISTOTLE_DATA_ROOT__ ?? DEFAULT_ROOT;
const workBase = (work: string) => `${ROOT()}/${work}`;

// All caches are keyed by work so two works loaded in one session (e.g. unified
// search) never collide.
const _analysesCache = new Map<string, Promise<Record<string, Analysis[]>>>();
const _lsjCache = new Map<string, Record<string, LsjEntry>>();
const _bookCache = new Map<string, Promise<BookData>>();
const _chaptersCache = new Map<string, Promise<Record<string, ChapterRef[]>>>();
const _columnsCache = new Map<string, Promise<Record<string, ColumnRef[]>>>();
const _footnotesCache = new Map<string, Promise<Record<string, string>>>();

export function fetchBook(work: string, n: number): Promise<BookData> {
  const key = `${work}:${n}`;
  const cached = _bookCache.get(key);
  if (cached) return cached;
  const p = fetch(`${workBase(work)}/book-${String(n).padStart(2, '0')}.json`).then(r => {
    if (!r.ok) throw new Error(`${work} book ${n}: ${r.status}`);
    return r.json();
  }).then((d: BookData) => {
    // A non-Astro host (the desktop app) can overlay runtime content — e.g.
    // user-imported translations merged into seg.overlays — via this hook.
    // The site never sets it; the fetched data passes through untouched.
    const hook = (globalThis as {
      __ARISTOTLE_BOOK_HOOK__?: (work: string, n: number, data: BookData) => BookData;
    }).__ARISTOTLE_BOOK_HOOK__;
    return hook ? hook(work, n, d) : d;
  });
  // Evict a rejected fetch so it can be retried (don't cache the failure).
  p.catch(() => { if (_bookCache.get(key) === p) _bookCache.delete(key); });
  _bookCache.set(key, p);
  return p;
}

/**
 * Drop cached book data so the next fetchBook re-fetches and re-runs
 * __ARISTOTLE_BOOK_HOOK__. The desktop app calls this after a translation
 * import (imports.ts's overlays are merged into the fetched BookData by the
 * hook, which only runs at fetch time — a book already loaded before the
 * import keeps its pre-import segments until its cached promise is dropped).
 * Pass a book number to evict one book, or omit to evict every book of the
 * work. Inert on the site build, which never imports it.
 */
export function invalidateBookCache(work: string, n?: number): void {
  if (n !== undefined) {
    _bookCache.delete(`${work}:${n}`);
    return;
  }
  for (const key of [..._bookCache.keys()]) {
    if (key.startsWith(`${work}:`)) _bookCache.delete(key);
  }
}

export function fetchChapters(work: string): Promise<Record<string, ChapterRef[]>> {
  const cached = _chaptersCache.get(work);
  if (cached) return cached;
  const p = fetch(`${workBase(work)}/chapters.json`).then(r => {
    if (!r.ok) throw new Error(`${work} chapters: ${r.status}`);
    return r.json();
  });
  // Evict a rejected fetch so it can be retried (don't cache the failure).
  p.catch(() => { if (_chaptersCache.get(work) === p) _chaptersCache.delete(work); });
  _chaptersCache.set(work, p);
  return p;
}

// Translator footnotes for a work: { footnote number -> pre-rendered HTML }.
// Present only for works whose translation carries notes (NE Ostwald). Loaded
// lazily the first time a `[^N]` marker is clicked, then cached for the session.
export function fetchFootnotes(work: string): Promise<Record<string, string>> {
  const cached = _footnotesCache.get(work);
  if (cached) return cached;
  const p = fetch(`${workBase(work)}/footnotes.json`).then(r => {
    if (!r.ok) throw new Error(`${work} footnotes: ${r.status}`);
    return r.json();
  }).then((map: Record<string, string>) =>
    // The NE (Ostwald) footnotes reference glossary entries ("see Glossary,
    // <term>"); turn those into links to the standalone glossary page.
    work === 'EN'
      ? Object.fromEntries(Object.entries(map).map(([k, v]) => [k, linkifyGlossaryRefs(v)]))
      : map
  );
  // Evict a rejected fetch so it can be retried (don't cache the failure).
  p.catch(() => { if (_footnotesCache.get(work) === p) _footnotesCache.delete(work); });
  _footnotesCache.set(work, p);
  return p;
}

// Analytical sidenotes for a work: { sidenote number -> text }. Present only for
// works whose translation carries marginal notes (the Isagoge's Owen). Loaded
// lazily and cached for the session.
const _sidenotesCache = new Map<string, Promise<Record<string, string>>>();
export function fetchSidenotes(work: string): Promise<Record<string, string>> {
  const cached = _sidenotesCache.get(work);
  if (cached) return cached;
  const p = fetch(`${workBase(work)}/sidenotes.json`).then(r => {
    if (!r.ok) throw new Error(`${work} sidenotes: ${r.status}`);
    return r.json();
  });
  p.catch(() => { if (_sidenotesCache.get(work) === p) _sidenotesCache.delete(work); });
  _sidenotesCache.set(work, p);
  return p;
}

// Diagrams for a work: { figure number -> pre-rendered HTML <figure> }. Present
// only for works that carry [[figN]] markers (the Isagoge's Tree of Porphyry).
const _figuresCache = new Map<string, Promise<Record<string, string>>>();
export function fetchFigures(work: string): Promise<Record<string, string>> {
  const cached = _figuresCache.get(work);
  if (cached) return cached;
  const p = fetch(`${workBase(work)}/figures.json`).then(r => {
    if (!r.ok) throw new Error(`${work} figures: ${r.status}`);
    return r.json();
  });
  p.catch(() => { if (_figuresCache.get(work) === p) _figuresCache.delete(work); });
  _figuresCache.set(work, p);
  return p;
}

// Bekker column -> owning book(s) with each book's line span in that column.
export interface ColumnRef { book: number; lo: number; hi: number; }

export function fetchColumns(work: string): Promise<Record<string, ColumnRef[]>> {
  const cached = _columnsCache.get(work);
  if (cached) return cached;
  const p = fetch(`${workBase(work)}/columns.json`).then(r => {
    if (!r.ok) throw new Error(`${work} columns: ${r.status}`);
    return r.json();
  });
  _columnsCache.set(work, p);
  return p;
}

// Parse a raw Bekker citation (e.g. "1097a15", "1097a 15", "1097a.15") into
// its column ("1097a") and line (15). Returns null if it isn't a citation.
export function parseBekker(raw: string): { column: string; line: number } | null {
  const m = raw.trim().toLowerCase().replace(/\s+/g, '').match(/^(\d{3,4})([ab])\.?(\d+)$/);
  if (!m) return null;
  return { column: m[1] + m[2], line: Number(m[3]) };
}

// Resolve a parsed citation to the book that owns it. For a column shared by
// two books (a book that starts mid-column) the line picks the right one,
// snapping to the nearer book if the line falls in the gap between them.
export function resolveBekker(
  columns: Record<string, ColumnRef[]>,
  column: string,
  line: number,
): number | null {
  const entries = columns[column];
  if (!entries || entries.length === 0) return null;
  if (entries.length === 1) return entries[0].book;
  let best = entries[0];
  let bestDist = Infinity;
  for (const e of entries) {
    const d = line < e.lo ? e.lo - line : line > e.hi ? line - e.hi : 0;
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best.book;
}

export function fetchAnalyses(work: string): Promise<Record<string, Analysis[]>> {
  const cached = _analysesCache.get(work);
  if (cached) return cached;
  const p = fetch(`${workBase(work)}/analyses.json`).then(r => {
    if (!r.ok) throw new Error(`${work} analyses: ${r.status}`);
    return r.json();
  });
  _analysesCache.set(work, p);
  return p;
}

// The lemma-page manifest: LSJ key -> { slug, head, count } for every lemma that
// has a /lemma/<slug> reference page (produced by scripts/build-lemmata.mjs).
// The word popup loads it once to decide whether to offer a "see all N
// occurrences" link, and only for lemmata that actually have a page.
export interface LemmaRef { slug: string; head: string; count: number; }
let _lemmataCache: Promise<Record<string, LemmaRef>> | null = null;
export function fetchLemmata(): Promise<Record<string, LemmaRef>> {
  if (_lemmataCache) return _lemmataCache;
  const p = fetch(`${ROOT()}/lemmata.json`).then(r => (r.ok ? r.json() : {}));
  // A missing/failed manifest just means no lemma links — don't cache the failure.
  p.catch(() => { if (_lemmataCache === p) _lemmataCache = null; });
  _lemmataCache = p;
  return p;
}

export function lsjShard(key: string): string {
  for (const ch of key) {
    if (ch === '*') continue;
    if (/[a-z]/.test(ch)) return ch;
  }
  return '_';
}

// The LSJ dictionary is shared across the whole corpus — one copy at
// /data/lsj/<letter>.json (the union of every work's lemmas), not a per-work
// subset — so entries aren't duplicated ~30× across works. Keys are global
// betacode headwords, identical across works, so the same lookup resolves
// against the shared shard. Cached by letter (work-independent).
export async function fetchLsjShard(letter: string): Promise<Record<string, LsjEntry>> {
  if (_lsjCache.has(letter)) return _lsjCache.get(letter)!;
  const r = await fetch(`${ROOT()}/lsj/${letter}.json`);
  if (!r.ok) return {};
  const shard = await r.json();
  _lsjCache.set(letter, shard);
  return shard;
}

export async function lookupWord(
  work: string,
  key: string
): Promise<{ analyses: Analysis[]; lsj: LsjEntry[] }> {
  const allAnalyses = await fetchAnalyses(work);
  const entries = allAnalyses[key] ?? [];
  const lsjEntries: LsjEntry[] = [];
  const seen = new Set<string>();
  for (const a of entries) {
    for (const lsjKey of a.lsj) {
      if (seen.has(lsjKey)) continue;
      seen.add(lsjKey);
      const letter = lsjShard(lsjKey);
      const shard = await fetchLsjShard(letter);
      if (shard[lsjKey]) lsjEntries.push(shard[lsjKey]);
    }
  }
  return { analyses: entries, lsj: lsjEntries };
}
