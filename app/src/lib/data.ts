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
}

export interface Segment {
  id: string;
  column: string;
  greek: GreekLine[];
  english: EnglishChunk | null;
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

const BASE = '/data';

const _analyses: { data: Record<string, Analysis[]> | null } = { data: null };
const _lsjCache = new Map<string, Record<string, LsjEntry>>();

export async function fetchBook(n: number): Promise<BookData> {
  const r = await fetch(`${BASE}/book-${String(n).padStart(2, '0')}.json`);
  if (!r.ok) throw new Error(`book ${n}: ${r.status}`);
  return r.json();
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
