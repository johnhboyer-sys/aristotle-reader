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
const ROOT = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data`;
const workBase = (work: string) => `${ROOT}/${work}`;

// All caches are keyed by work so two works loaded in one session (e.g. unified
// search) never collide.
const _analysesCache = new Map<string, Promise<Record<string, Analysis[]>>>();
const _lsjCache = new Map<string, Record<string, LsjEntry>>();
const _bookCache = new Map<string, Promise<BookData>>();
const _chaptersCache = new Map<string, Promise<Record<string, ChapterRef[]>>>();
const _columnsCache = new Map<string, Promise<Record<string, ColumnRef[]>>>();

export function fetchBook(work: string, n: number): Promise<BookData> {
  const key = `${work}:${n}`;
  const cached = _bookCache.get(key);
  if (cached) return cached;
  const p = fetch(`${workBase(work)}/book-${String(n).padStart(2, '0')}.json`).then(r => {
    if (!r.ok) throw new Error(`${work} book ${n}: ${r.status}`);
    return r.json();
  });
  _bookCache.set(key, p);
  return p;
}

export function fetchChapters(work: string): Promise<Record<string, ChapterRef[]>> {
  const cached = _chaptersCache.get(work);
  if (cached) return cached;
  const p = fetch(`${workBase(work)}/chapters.json`).then(r => {
    if (!r.ok) throw new Error(`${work} chapters: ${r.status}`);
    return r.json();
  });
  _chaptersCache.set(work, p);
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

export function lsjShard(key: string): string {
  for (const ch of key) {
    if (ch === '*') continue;
    if (/[a-z]/.test(ch)) return ch;
  }
  return '_';
}

export async function fetchLsjShard(work: string, letter: string): Promise<Record<string, LsjEntry>> {
  const key = `${work}:${letter}`;
  if (_lsjCache.has(key)) return _lsjCache.get(key)!;
  const r = await fetch(`${workBase(work)}/lsj/${letter}.json`);
  if (!r.ok) return {};
  const shard = await r.json();
  _lsjCache.set(key, shard);
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
      const shard = await fetchLsjShard(work, letter);
      if (shard[lsjKey]) lsjEntries.push(shard[lsjKey]);
    }
  }
  return { analyses: entries, lsj: lsjEntries };
}
