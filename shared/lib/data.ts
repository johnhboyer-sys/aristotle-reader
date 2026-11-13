import { schemeFor } from './citation';
// Data-fetch helpers. All paths relative to /data (public symlink to
// build/dist/ne). Every fetcher is memoised through lib/memo.ts so a single
// click won't re-fetch the same shard twice in a session — and so a failure is
// never remembered.
import { linkifyGlossaryRefs } from './glossary';
import { memoAsync, memoAsyncBy } from './memo';

export interface Token {
  t: string;   // surface form (Unicode Greek)
  o: number;   // char offset in the line
  k: string;   // Beta Code key
}

export interface GreekLine {
  n: number;
  // Bekker's lettered lines: 244b carries 5 and then 5a, two lines sharing a
  // number. The suffix is part of the line's identity — its anchor id, its
  // gutter label and any citation of it — and stage3 keeps it for that.
  sub?: string;
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

// A slice of an overlay translation paired to a chapter block in this column.
// `cont` = the tail of a chapter that began in an earlier column. An overlay is
// chapter-anchored (no per-line Bekker gutter), distributed across columns.
export interface OverlayPiece {
  chapter: string;
  text: string;
  cont: boolean;
  // Interpolated Bekker-line ticks down this slice (all estimates — an overlay
  // has no milestones of its own). Same shape as EnglishChunk.bekker.
  bekker?: { n: number; offset: number; real: boolean }[];
  // Structured diagram tables (e.g. Ackrill's squares of opposition), each
  // anchored to the Bekker line `n` of the segment it belongs to; rendered as a
  // grid after that segment's row.
  tables?: { n: number; rows: string[][] }[];
}

export interface Segment {
  speakers?: SpeakerTurn[];
  id: string;
  column: string;
  greek: GreekLine[];
  english: EnglishChunk | null;
  chapterStarts?: ChapterStart[];
  // The secondary chapter-anchored translation. `ross` is the pre-rename
  // emitted name — stage7_emit still writes it, so both are declared until the
  // corpus is rebuilt; read via `secondary ?? ross`.
  secondary?: OverlayPiece[];
  /** @deprecated legacy emitted name for `secondary`; drop after a corpus rebuild. */
  ross?: OverlayPiece[];
  // Optional third translation (same overlay shape), e.g. Categories'
  // Ackrill beside Edghill + Taylor. Absent in works with fewer translations.
  third?: OverlayPiece[];
  // Any further overlay translations (the 4th onward), keyed by translation id.
  // Same overlay shape as secondary/third. Lets a work carry an unbounded number
  // of chapter-anchored translations beyond the fixed secondary/third slots.
  overlays?: Record<string, OverlayPiece[]>;
}

export interface ChapterRef {
  chapter: string;
  column: string;
  line: string;
  bekker: string;
}

export interface BookData {
  turnFlow?: TurnFlow;
  book: number;
  segments: Segment[];
}

export interface Analysis {
  page?: string;
  pos?: string[];
  unlikely?: boolean;
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

// Every fetcher below is a memoAsync (one slot) or memoAsyncBy (one slot per
// key) from lib/memo.ts, so each owns its cache and each drops a rejection so
// the next call retries — the idiom is stated once, there. The keyed caches are
// keyed by work (or work+book, letter, slug) so two works loaded in one session
// (e.g. unified search) never collide.

// Keyed `work:n` — one string key, so invalidateBookCache can evict a single
// book by key or a whole work by prefix.
const _book = memoAsyncBy<string, BookData>(key => {
  const at = key.lastIndexOf(':');
  const work = key.slice(0, at);
  const n = Number(key.slice(at + 1));
  return fetch(`${workBase(work)}/book-${String(n).padStart(2, '0')}.json`).then(r => {
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
});

export function fetchBook(work: string, n: number): Promise<BookData> {
  return _book(`${work}:${n}`);
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
    _book.evict(`${work}:${n}`);
    return;
  }
  _book.evictWhere(key => key.startsWith(`${work}:`));
}

const _chapters = memoAsyncBy<string, Record<string, ChapterRef[]>>(work =>
  fetch(`${workBase(work)}/chapters.json`).then(r => {
    if (!r.ok) throw new Error(`${work} chapters: ${r.status}`);
    return r.json();
  }));

export function fetchChapters(work: string): Promise<Record<string, ChapterRef[]>> {
  return _chapters(work);
}

// Translator footnotes for a work: { footnote number -> pre-rendered HTML }.
// Present only for works whose translation carries notes (NE Ostwald). Loaded
// lazily the first time a `[^N]` marker is clicked, then cached for the session.
const _footnotes = memoAsyncBy<string, Record<string, string>>(work =>
  fetch(`${workBase(work)}/footnotes.json`).then(r => {
    if (!r.ok) throw new Error(`${work} footnotes: ${r.status}`);
    return r.json();
  }).then((map: Record<string, string>) =>
    // The NE (Ostwald) footnotes reference glossary entries ("see Glossary,
    // <term>"); turn those into links to the standalone glossary page.
    work === 'EN'
      ? Object.fromEntries(Object.entries(map).map(([k, v]) => [k, linkifyGlossaryRefs(v)]))
      : map
  ));

export function fetchFootnotes(work: string): Promise<Record<string, string>> {
  return _footnotes(work);
}

// Analytical sidenotes for a work: { sidenote number -> text }. Present only for
// works whose translation carries marginal notes (the Isagoge's Owen). Loaded
// lazily and cached for the session.
// A missing sidenotes.json throws (a work without the feature never asks for
// one), like footnotes/figures and unlike quotations.
const _sidenotes = memoAsyncBy<string, Record<string, string>>(work =>
  fetch(`${workBase(work)}/sidenotes.json`).then(r => {
    if (!r.ok) throw new Error(`${work} sidenotes: ${r.status}`);
    return r.json();
  }));

export function fetchSidenotes(work: string): Promise<Record<string, string>> {
  return _sidenotes(work);
}

// Diagrams for a work: { figure number -> pre-rendered HTML <figure> }. Present
// only for works that carry [[figN]] markers (the Isagoge's Tree of Porphyry).
const _figures = memoAsyncBy<string, Record<string, string>>(work =>
  fetch(`${workBase(work)}/figures.json`).then(r => {
    if (!r.ok) throw new Error(`${work} figures: ${r.status}`);
    return r.json();
  }));

export function fetchFigures(work: string): Promise<Record<string, string>> {
  return _figures(work);
}

// Bekker column -> owning book(s) with each book's line span in that column.
export interface ColumnRef { book: number; lo: number; hi: number; }

const _columns = memoAsyncBy<string, Record<string, ColumnRef[]>>(work =>
  fetch(`${workBase(work)}/columns.json`).then(r => {
    if (!r.ok) throw new Error(`${work} columns: ${r.status}`);
    return r.json();
  }));

export function fetchColumns(work: string): Promise<Record<string, ColumnRef[]>> {
  return _columns(work);
}

// One work's claim on a Bekker column, from the corpus-wide index.
export interface BekkerRef { work: string; book: number; lo: number; hi: number; }

// bekker.json is written as tuples — [work, book, lo, hi] — to keep the
// corpus-wide index small enough to fetch on the first keystroke that looks
// like a citation. Built by scripts/build-bekker-index.mjs.
type BekkerTuple = [string, number, number, number];

// Every Bekker column in the corpus → the works and books that carry it. Used
// by the ⌘K palette to jump to a citation from anywhere on the site.
// Throw on a bad response rather than resolving to {}: resolving would make a
// 404 look like an empty index, the memo's eviction would never fire, and no
// citation could be jumped to for the rest of the session (the same trap
// fetchLsjHeads documents). A missing index just means no citation jumps.
const _bekker = memoAsync<Record<string, BekkerRef[]>>(() =>
  fetch(`${ROOT()}/bekker.json`)
    .then(r => {
      if (!r.ok) throw new Error(`bekker.json: ${r.status}`);
      return r.json();
    })
    .then((raw: Record<string, BekkerTuple[]>) => {
      const out: Record<string, BekkerRef[]> = {};
      for (const [column, entries] of Object.entries(raw)) {
        out[column] = entries.map(([work, book, lo, hi]) => ({ work, book, lo, hi }));
      }
      return out;
    }));

export function fetchBekkerIndex(): Promise<Record<string, BekkerRef[]>> {
  return _bekker();
}

// Parse a raw Bekker citation (e.g. "1097a15", "1097a 15", "1097a.15") into
// its column ("1097a"), line (15) and, on a lettered line, its suffix
// ("244b5a" → 244b, 5, "a"). Returns null if it isn't a citation.
// The page can be one digit: the Categories run 1a–15b and De Interpretatione
// 16a–24b, so "16a5" is a citation as much as "1097a15" is.
export function parseBekker(raw: string): { column: string; line: number; sub?: string } | null {
  const m = raw.trim().toLowerCase().replace(/\s+/g, '').match(/^(\d{1,4})([ab])\.?(\d+)([a-z])?$/);
  if (!m) return null;
  return { column: m[1] + m[2], line: Number(m[3]), ...(m[4] ? { sub: m[4] } : {}) };
}

// The identity of one Bekker line, as the reader's anchor ids and citations
// spell it: the suffix belongs to the line, so 244b5 and 244b5a are two lines
// and not one written twice.
export function lineRef(n: number, sub?: string): string {
  return `${n}${sub ?? ''}`;
}
export function lineAnchor(column: string, n: number, sub?: string): string {
  return `L${column}-${lineRef(n, sub)}`;
}

// The chapter.section labels (isChapterSection, isNonBekker, citeLabel,
// citeLabelOf) live in citation.ts, which this module's callers reach
// through these re-exports; citation.ts must not import this module.
export { citeLabel, citeLabelOf, isChapterSection, isNonBekker } from './citation';

// An English section tick's cite: its segment (`col-49a`) and the number it
// prints ("3") → "49a3". The scroll spy watches these when the Greek is hidden.
export function tickCite(segmentId: string, text: string): string | null {
  const col = /^col-(.+)$/.exec(segmentId);
  const n = text.trim();
  return col && /^\d+$/.test(n) ? `${col[1]}${n}` : null;
}

// Inverse of lineAnchor, plus the wrapped continuation the reader appends
// (`L1094a-3-c`, `L775a-11a-c`). The column is everything before the line
// hyphen, so a Busse page ("1a", the Isagoge's columns) cites the same way a
// Bekker column does: L1a-3 → 1a3. Anything else is not a line anchor.
const LINE_ANCHOR_ID = /^L(.+)-(\d+)([a-z])?(?:-c)?$/;

export function anchorCite(id: string): string | null {
  const m = LINE_ANCHOR_ID.exec(id);
  if (!m) return null;
  return m[1] + lineRef(Number(m[2]), m[3]);
}

// What the scroll spy may write into the URL. A continuation line is not a
// scroll target (the spy used to reject any id that did not end in digits,
// which also dropped lettered lines — those are cited, continuations are not).
// A segment id `col-<column>` cites as the bare column.
export function citeOfId(id: string): string | null {
  if (id.startsWith('L')) {
    if (id.endsWith('-c')) return null;
    return anchorCite(id);
  }
  const cm = /^col-(.+)$/.exec(id);
  return cm ? cm[1] : null;
}

// The line a token index falls on, letter and all. Search used to read `line.n`
// here and drop the suffix, so a hit on GA 775a11a was printed and linked as
// "775a11" — a line that column does not have.
export function lineAtPosition(seg: Segment, pos: number): { n: number; sub?: string } {
  let count = 0;
  for (const line of seg.greek) {
    if (pos < count + line.tokens.length) return { n: line.n, sub: line.sub };
    count += line.tokens.length;
  }
  const last = seg.greek[seg.greek.length - 1];
  return { n: last?.n ?? 1, sub: last?.sub };
}

// The tokens a search hit names, as the very objects the page renders.
// `positions` count a segment's tokens line by line, as the index does. A
// table row's cells carry their own copies of the line's tokens, and need not
// carry all of them, so those are matched to the line's in order, by surface
// form. A position past the segment's last token counts on into the segments
// after it (a running-text match that crosses a section).
export function hitTokens(segments: Segment[], column: string, positions: Iterable<number>): Set<Token> {
  const out = new Set<Token>();
  const at = segments.findIndex(s => s.column === column);
  if (at < 0) return out;
  const want = new Set(positions);
  const top = Math.max(-1, ...want);
  let pos = 0;
  for (const line of segments.slice(at).flatMap(s => s.greek)) {
    if (pos > top) break;
    const hits = new Set<number>();
    line.tokens.forEach((tok, i) => { if (want.has(pos + i)) { out.add(tok); hits.add(i); } });
    if (line.cells && hits.size) {
      let i = 0;
      for (const cell of line.cells) {
        for (const tok of cell.tokens) {
          while (i < line.tokens.length && line.tokens[i].t !== tok.t) i++;
          if (i >= line.tokens.length) break;
          if (hits.has(i)) out.add(tok);
          i++;
        }
      }
    }
    pos += line.tokens.length;
  }
  return out;
}

// The anchor a citation should land on when the exact line is not in the page.
// Two rules, both learned from GA 775a (which prints 11a/11b/11c and no bare
// 11): a lettered id is a candidate — matching only ids ending in a digit
// skipped the whole group and snapped a citation of "775a11" back to line 10 —
// and on a tie the earlier line wins, so a bare citation resolves to the first
// sub-line of its own number rather than to a neighbour the same distance away.
export function nearestLineAnchor(ids: Iterable<string>, column: string, line: number): string | null {
  const prefix = `L${column}-`;
  let best: string | null = null;
  // Rank each candidate by distance, then by whether it carries a letter (an
  // unlettered line wins a tie), then by the letter itself, so a bare citation
  // lands on the first sub-line of its own number.
  let bestRank: [number, number, string] = [Infinity, 0, ''];
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const m = /^(\d+)([a-z]?)$/.exec(id.slice(prefix.length));
    if (!m) continue;
    const rank: [number, number, string] = [Math.abs(Number(m[1]) - line), m[2] ? 1 : 0, m[2]];
    const better = rank[0] !== bestRank[0] ? rank[0] < bestRank[0]
      : rank[1] !== bestRank[1] ? rank[1] < bestRank[1]
      : rank[2] < bestRank[2];
    if (best === null || better) { best = id; bestRank = rank; }
  }
  return best;
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

// A rejection must not stay cached: it would make every later word tap in this
// work rethrow it for the whole session. (memoAsyncBy evicts it.)
const _analyses = memoAsyncBy<string, Record<string, Analysis[]>>(work =>
  fetch(`${workBase(work)}/analyses.json`).then(r => {
    if (!r.ok) throw new Error(`${work} analyses: ${r.status}`);
    return r.json();
  }));

export function fetchAnalyses(work: string): Promise<Record<string, Analysis[]>> {
  return _analyses(work);
}

// The lemma-page manifest: LSJ key -> { slug, head, count } for every lemma that
// has a /lemma/<slug> reference page (produced by scripts/build-lemmata.mjs).
// The word popup loads it once to decide whether to offer a "see all N
// occurrences" link, and only for lemmata that actually have a page.
export interface LemmaRef {
  slug: string; head: string; count: number; distinctiveness_label?: string; }
// A missing/failed manifest just means no lemma links (every caller catches)
// — don't cache the failure. It has to be a rejection for that to work: a
// {} resolved on a 404 would be cached as an empty manifest for the session.
const _lemmata = memoAsync<Record<string, LemmaRef>>(() =>
  fetch(`${ROOT()}/lemmata.json`).then(r => {
    if (!r.ok) throw new Error(`lemmata.json: ${r.status}`);
    return r.json();
  }));

export function fetchLemmata(): Promise<Record<string, LemmaRef>> {
  return _lemmata();
}

// Curated quotation citations for a work: [{ column, lo, hi, cite, author, url,
// attestation }, …]. Present only for works that have a quotations.json (the
// Metaphysics pilot today). The reader calls this only for a work whose registry
// entry sets `quotations`. Missing file → empty list, never a throw — works
// without the feature ship nothing. Pattern matches fetchLemmata, not
// fetchColumns/fetchFootnotes (those throw on a missing file).
export interface Quotation {
  column: string;
  lo: number;
  hi: number;
  cite: string;
  author: string;
  url: string;
  attestation: string;
}
// Deliberately resolves (and caches) [] on a missing file rather than throwing
// — see the note above; the memo's eviction then only fires on a network
// rejection, which is the intent.
const _quotations = memoAsyncBy<string, Quotation[]>(work =>
  fetch(`${workBase(work)}/quotations.json`).then(r => (r.ok ? r.json() : [])));

export function fetchQuotations(work: string): Promise<Quotation[]> {
  return _quotations(work);
}

// The combo-search lemma picker: fold key -> the headwords a lemma slot can
// match, commonest first. Sharded by fold-initial letter like the LSJ, so
// typing into the picker fetches one small file rather than the whole
// vocabulary. Covers every key in greek_lemma.json by construction; the few
// with no resolvable headword arrive with an empty list and are shown under
// their fold key. `slug` is present only where the lemma has a reference page,
// which is where a gloss can be fetched from on demand.
export interface LemmaCandidate { h: string; k: string; s?: string; }
// `n` belongs to the fold key, not to any one headword: the index is
// accent-folded, so several headwords can share a key that no search can split,
// and the count a user is shown must be the one their search returns.
export interface LemmaChoice { n: number; c: LemmaCandidate[]; }
// Reject rather than resolving empty on a failed fetch: an empty object would
// be cached as a real (silent) answer, and the picker would report "no lemmas
// start with that text" for the rest of the session with no way to retry.
const _picker = memoAsyncBy<string, Record<string, LemmaChoice>>(letter =>
  fetch(`${ROOT()}/lemma-picker/${letter}.json`).then(async r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for lemma-picker/${letter}.json`);
    const shard = await r.json();
    // A shard built by an older script would have the wrong shape and render as
    // blank counts rather than failing, so check one entry and refuse it here.
    const first = Object.values(shard)[0] as LemmaChoice | undefined;
    if (first && !Array.isArray((first as LemmaChoice).c)) {
      throw new Error(`lemma-picker/${letter}.json is stale — rebuild the lemma data`);
    }
    return shard;
  }));

export function fetchLemmaPickerShard(letter: string): Promise<Record<string, LemmaChoice>> {
  return _picker(letter);
}

// A lemma page's short glosses, fetched only when the picker needs to show one
// (the pages are ~4.7 KB each, so they are never loaded in bulk).
// Like fetchQuotations, a missing page resolves (and caches) [] rather than
// throwing: the picker shows a row without a gloss, not an error.
const _glosses = memoAsyncBy<string, string[]>(slug =>
  fetch(`${ROOT()}/lemmata/${slug}.json`)
    .then(r => (r.ok ? r.json() : null))
    .then(d => (d?.glosses ?? []) as string[]));

export function fetchLemmaGlosses(slug: string): Promise<string[]> {
  return _glosses(slug);
}

// Recurrent phrases (stage 8), sharded by the phrase's fold-initial letter.
//
// The browse list and the occurrences are separate fetches on purpose: browsing
// needs every phrase, but only an EXPANDED phrase needs its offsets, and one
// combined shard reached 10.4 MB. A row is positional to keep the list small —
// [length, corpus count, distinctiveness score, works, occurrences straddling a
// chapter?]. The score orders the list; it never removes anything from it.
export type NgramRow = [number, number, number, number, number?];
// 'english' indexes the translations. Same shape, same shards, different
// language — and its occurrences resolve through english-segments.json rather
// than a work's offsets.json, because the English is aligned per segment.
export type NgramStream = 'form' | 'lemma' | 'english';

export interface EnglishSegment {
  book: number;
  column: string;
  base: number;
  words: number;
}

const _englishSegments = memoAsync<Record<string, EnglishSegment[]>>(() =>
  fetch(`${ROOT()}/ngrams/english-segments.json`).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ngrams/english-segments.json`);
    return r.json();
  }));

export function fetchEnglishSegments(): Promise<Record<string, EnglishSegment[]>> {
  return _englishSegments();
}

// Keyed by the shard's path fragment (`<stream>/<letter>`), which is also all
// the URL and the error message need.
const _ngramShard = memoAsyncBy<string, Record<string, NgramRow>>(key =>
  fetch(`${ROOT()}/ngrams/${key}.json`).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ngrams/${key}.json`);
    return r.json();
  }));

export function fetchNgramShard(
  stream: NgramStream,
  letter: string,
): Promise<Record<string, NgramRow>> {
  return _ngramShard(`${stream}/${letter}`);
}

// work -> global offsets, delta-encoded after the first.
const _ngramOcc = memoAsyncBy<string, Record<string, Record<string, number[]>>>(key =>
  fetch(`${ROOT()}/ngrams/${key}.json`).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ngrams/${key}.json`);
    return r.json();
  }));

export function fetchNgramOccurrences(
  stream: NgramStream,
  letter: string,
  n: number,
): Promise<Record<string, Record<string, number[]>>> {
  return _ngramOcc(`${stream}/occ/${letter}-${n}`);
}

// Per-work token-offset index used by the phrase browser to turn a global
// occurrence offset into a Bekker citation. No module-level cache — Phrases
// keeps its own per-work map so a failed fetch can be retried there.
export async function fetchSearchOffsets(work: string): Promise<unknown> {
  const r = await fetch(`${ROOT()}/${work}/search/offsets.json`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Undo the delta encoding: [first, +d, +d, ...] -> absolute global offsets.
export function decodeOffsets(deltas: number[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (let i = 0; i < deltas.length; i++) {
    at = i === 0 ? deltas[0] : at + deltas[i];
    out.push(at);
  }
  return out;
}

// fold(surface) -> the headwords that surface can belong to. Lets a typed
// phrase be widened to its inflected variants without the reader knowing any
// dictionary forms. Sharded by fold-initial letter like everything else.
const _lemmaMap = memoAsyncBy<string, Record<string, string[]>>(letter =>
  fetch(`${ROOT()}/lemma-map/${letter}.json`).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for lemma-map/${letter}.json`);
    return r.json();
  }));

export function fetchLemmaMapShard(letter: string): Promise<Record<string, string[]>> {
  return _lemmaMap(letter);
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
// A missing shard is not an error — the corpus need not carry every letter, and
// a lookup against one that isn't there just finds no entry — so this resolves
// {} where the other fetchers throw. That {} must NOT be cached (a shard that
// 404s mid-deploy would then be empty for the session), so the memo sees a
// rejection it can evict and only this wrapper turns it into {}. The sentinel
// keeps a genuine network failure a rejection, exactly as before.
class MissingLsjShard extends Error {}

const _lsjShard = memoAsyncBy<string, Record<string, LsjEntry>>(async letter => {
  const r = await fetch(`${ROOT()}/lsj/${letter}.json`);
  if (!r.ok) throw new MissingLsjShard(`lsj/${letter}.json: ${r.status}`);
  return r.json();
});

export async function fetchLsjShard(letter: string): Promise<Record<string, LsjEntry>> {
  try {
    return await _lsjShard(letter);
  } catch (e) {
    if (e instanceof MissingLsjShard) return {};
    throw e;
  }
}

// LSJ key -> { head, hom }: the two things a popup card needs about an entry
// before anyone taps it — the Unicode headword, and LSJ's own homograph letter.
// 14,047 keys, 139 KB gzipped, fetched once. It exists so the website can stop
// pulling a whole letter shard per lookup (e.json is 1,144 KB gzipped) purely
// to read a headword out of it. Built by app/scripts/build-lsj-heads.mjs.
// Distinct from lemmata.json, which is the lemma-PAGE manifest and covers only
// the 6,214 keys that have a page.
export interface LsjHead { head: string; hom?: string; }
// Throw on a bad response rather than resolving to {}: resolving would make
// the failure look like an empty manifest, the memo's eviction would never
// fire, and one 404 would pin every card to betaToGreek for the whole session.
// `npm run dev` does not run build-lsj-heads.mjs, so a tree without a built
// manifest hits exactly that path on the first popup. A missing manifest costs
// headwords, not the popup.
const _lsjHeads = memoAsync<Record<string, LsjHead>>(() =>
  fetch(`${ROOT()}/lsj-heads.json`).then(r => {
    if (!r.ok) throw new Error(`lsj-heads.json: ${r.status}`);
    return r.json();
  }));

export function fetchLsjHeads(): Promise<Record<string, LsjHead>> {
  return _lsjHeads();
}

export async function lookupWord(
  work: string,
  key: string,
  // The website renders no LSJ text of its own any more — grammata serves the
  // entry, keyed, when the reader taps a card — so it asks for analyses only
  // and never touches a shard. The desktop app bundles its corpus and renders
  // entries locally, so it keeps the default.
  opts: { withLsj?: boolean } = {}
): Promise<{ analyses: Analysis[]; lsj: LsjEntry[] }> {
  const { withLsj = true } = opts;
  const allAnalyses = await fetchAnalyses(work);
  const entries = allAnalyses[key] ?? [];
  const lsjEntries: LsjEntry[] = [];
  if (!withLsj) return { analyses: entries, lsj: lsjEntries };
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



export interface EnglishTurn {
  offset: number;
  speaker: string | null;
  display: string | null;
}


// One entry of a dialogue book's global turn flow (see TurnFlow): `g` is the
// Greek start ref (Stephanus column token, line n, char offset) — null for an
// English-only residual; `e` is the turn's English slice text — null for a
// Greek-only residual; `s`/`d` are the canonical speaker and the printed
// English lead-in; `p` marks a paired (level-locked) turn.
export interface FlowTurn {
  s: string | null;
  d: string | null;
  g: { c: string; n: number; o: number } | null;
  e: string | null;
  p: boolean;
  // ── Optional flow extensions. The pipeline emits an explicit JSON `null`
  // when a field is absent (not an omitted key), so each is `T[] | null` as
  // well as optional; old dialogue JSON (keys absent) still typechecks.
  //
  // `ep`: paragraph-break offsets within this turn's stripped English slice
  // (exclusive of 0 and the slice end) — the reader renders each as a break.
  // Emitted for para-flow rows AND for dialogue turns with internal paragraphs
  // (Timaeus/Phaedo long speeches).
  ep?: number[] | null;
  // `es`: Stephanus section starts within this turn's stripped English slice —
  // `o` is the char offset where section `c` begins, so the reader can hang each
  // gutter citation tick beside the prose it actually labels. A turn whose Greek
  // spans several sections (Laches 181e-182d, Timaeus' monologue) gets one entry
  // per section; before this existed the reader painted them all at the row's
  // top edge, stacking every label on one illegible spot. Omitted when empty.
  es?: { o: number; c: string }[] | null;
  // `et`: embedded english.turns for a para-flow row — intra-row speech blocks
  // with lead-ins (dialogue nested inside a narrated paragraph row). `o` is the
  // char offset in the row's English slice where the embedded speech begins.
  et?: { o: number; s: string | null; d: string | null }[] | null;
  // `sub`: stacked one-sided English speeches folded under this row (pipeline
  // B4's column-grouped residual rows — dialogue flows like Lysis/Parmenides,
  // and the para-flow contract). Usually the row's `e` is null and the stack
  // is its whole English cell; when the row also carries English (a narration
  // lead, e.g. Lysis 203a) the stack follows it. Each speech has its own
  // lead-in, English text, and optional paragraph breaks.
  sub?: { s: string | null; d: string | null; e: string; ep?: number[] | null; es?: { o: number; c: string }[] | null }[] | null;
  // `alt`: this turn's text in ALTERNATE translations, keyed by translation id
  // (see shared/lib/works.ts TranslationRef.id). Populated by the post-stage7
  // turn aligner (pipeline/plato_pipeline/align_turns.py), which pairs each
  // alternate translation's speaker turns to this reference turnFlow so the
  // alternate inherits Stephanus anchoring. The reader's turn-by-turn compare
  // renders `alt[id].e` in the second column on this same row; `e` is null for
  // a reference turn the alternate has no match for (rendered as an em-dash).
  // `es` (optional): section starts placed inside the alternate's slice by
  // pipeline/plato_pipeline/align_sections.py (matched against the reference
  // turn's words, so approximate); absent → the reader projects them itself.
  alt?: Record<string, { e: string | null; ep?: number[] | null; es?: { o: number; c: string }[] | null }> | null;
}


// A dialogue book's turn flow: the globally-paired, ordered turn list the
// reader renders as Greek-beside-English rows (each speaker's statement level
// with its translation; Stephanus sections become gutter ticks). Present only
// for books with Greek turn events; narrated books keep section-row rendering.
// `leadE` is English prose preceding the first English turn.
//
// `kind: 'para'` marks a paragraph-anchored flow for a NARRATED work: rows are
// paragraphs (s/d null, p false), the English cut at paragraph boundaries and
// the Greek ref snapped to the nearest Stephanus section boundary. Absent (or
// omitted) for ordinary speaker-turn dialogue flows.
export interface TurnFlow {
  kind?: 'para';
  leadE: string | null;
  turns: FlowTurn[];
}


// A speaker-turn event in a Stephanus dialogue (Plato): the interlocutor whose
// speech begins at `offset` (char position in line `line`'s rejoined text). The
// `label` siglum ("ΕΥΘ.") or dialectic dash ("—") is EXCLUDED from the line text
// and rendered as a separate inline lead-in, so token char-offsets never shift.
// See shared/lib/speakers.ts for the render model. Absent for non-dialogue works.
export interface SpeakerTurn {
  line: number;
  offset: number;
  label: string;
}


// All caches are keyed by work so two works loaded in one session (e.g. unified
// search) never collide.







// One entry of a Stephanus work's section outline: a page+letter column
// ("17a"), the page number and letter split out, and the stable segment anchor
// id (`book:column`) the reader emits as `col-{column}`. Emitted per book by the
// pipeline's stage7 emit_sections (a section scheme replaces chapters.json with
// sections.json as the outline-nav source — Plato is cited by page+section, not
// by chapter). Ordered in reading order (2a, 2b, … 17e, 18a).
export interface SectionRef { column: string; page: number; letter: string; id: string; }


const _sectionsCache = new Map<string, Promise<Record<string, SectionRef[]>>>();


// Per-book Stephanus section outline: { book -> ordered SectionRef[] }. Present
// only for section-scheme (stephanus) works; the outline nav groups these by
// page. Cached per work, failure evicted so it can be retried.
export function fetchSections(work: string): Promise<Record<string, SectionRef[]>> {
  const cached = _sectionsCache.get(work);
  if (cached) return cached;
  const p = fetch(`${workBase(work)}/sections.json`).then(r => {
    if (!r.ok) throw new Error(`${work} sections: ${r.status}`);
    return r.json();
  });
  p.catch(() => { if (_sectionsCache.get(work) === p) _sectionsCache.delete(work); });
  _sectionsCache.set(work, p);
  return p;
}


// Group a book's ordered sections into Stephanus pages for the outline nav:
// [{ page, column }] where `column` is the first section column on that page —
// the anchor (`col-{column}`) the page's outline entry links to. Reading order
// is preserved (sections are already ordered), so pages come out ascending and
// each page appears once, keyed to where it first starts.
export interface SectionPage { page: number; column: string; }

export function sectionPages(sections: SectionRef[]): SectionPage[] {
  const pages: SectionPage[] = [];
  let last: number | null = null;
  for (const s of sections) {
    if (s.page !== last) { pages.push({ page: s.page, column: s.column }); last = s.page; }
  }
  return pages;
}


// Analytical sidenotes for a work: { sidenote number -> text }. Present only for
// works whose translation carries marginal notes (the Isagoge's Owen). Loaded
// lazily and cached for the session.


// Diagrams for a work: { figure number -> pre-rendered HTML <figure> }. Present
// only for works that carry [[figN]] markers (the Isagoge's Tree of Porphyry).


// Parse a `?loc=` value (or a hand-typed citation) against the citation scheme
// a work actually uses — bare column ("17a"), column:line ("1097a:15"), or the
// legacy concatenated Bekker form ("1097a15"). See shared/lib/citation.ts for
// the grammar and why a lineless scheme (stephanus) rejects a line component
// instead of silently dropping it.
export function parseLocation(work: string, raw: string): { column: string; line: number | null } | null {
  return schemeFor(work).parseLocation(raw);
}


// work -> global offsets, delta-encoded after the first.
