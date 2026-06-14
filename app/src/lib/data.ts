// Data-fetch helpers. All paths relative to /data (public symlink to
// build/dist/ne). Shards are cached in module-level Maps so a single
// click won't re-fetch the same shard twice in a session.

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
}

export interface Segment {
  id: string;
  column: string;
  greek: GreekLine[];
  english: EnglishChunk | null;
  chapterStarts?: ChapterStart[];
  ross?: RossPiece[];
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
// it and join explicitly.
const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data`;

const _analyses: { data: Record<string, Analysis[]> | null } = { data: null };
const _lsjCache = new Map<string, Record<string, LsjEntry>>();
const _bookCache = new Map<number, Promise<BookData>>();

export function fetchBook(n: number): Promise<BookData> {
  const cached = _bookCache.get(n);
  if (cached) return cached;
  const p = fetch(`${BASE}/book-${String(n).padStart(2, '0')}.json`).then(r => {
    if (!r.ok) throw new Error(`book ${n}: ${r.status}`);
    return r.json();
  });
  _bookCache.set(n, p);
  return p;
}

const _chapters: { data: Record<string, ChapterRef[]> | null } = { data: null };

export async function fetchChapters(): Promise<Record<string, ChapterRef[]>> {
  if (_chapters.data) return _chapters.data;
  const r = await fetch(`${BASE}/chapters.json`);
  if (!r.ok) throw new Error(`chapters: ${r.status}`);
  _chapters.data = await r.json();
  return _chapters.data!;
}

// Bekker column -> owning book(s) with each book's line span in that column.
export interface ColumnRef { book: number; lo: number; hi: number; }
const _columns: { data: Record<string, ColumnRef[]> | null } = { data: null };

export async function fetchColumns(): Promise<Record<string, ColumnRef[]>> {
  if (_columns.data) return _columns.data;
  const r = await fetch(`${BASE}/columns.json`);
  if (!r.ok) throw new Error(`columns: ${r.status}`);
  _columns.data = await r.json();
  return _columns.data!;
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

export async function fetchAnalyses(): Promise<Record<string, Analysis[]>> {
  if (_analyses.data) return _analyses.data;
  const r = await fetch(`${BASE}/analyses.json`);
  if (!r.ok) throw new Error(`analyses: ${r.status}`);
  _analyses.data = await r.json();
  return _analyses.data!;
}

export function lsjShard(key: string): string {
  for (const ch of key) {
    if (ch === '*') continue;
    if (/[a-z]/.test(ch)) return ch;
  }
  return '_';
}

export async function fetchLsjShard(letter: string): Promise<Record<string, LsjEntry>> {
  if (_lsjCache.has(letter)) return _lsjCache.get(letter)!;
  const r = await fetch(`${BASE}/lsj/${letter}.json`);
  if (!r.ok) return {};
  const shard = await r.json();
  _lsjCache.set(letter, shard);
  return shard;
}

export async function lookupWord(
  key: string
): Promise<{ analyses: Analysis[]; lsj: LsjEntry[] }> {
  const allAnalyses = await fetchAnalyses();
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
