// Counting and paging the search results, from the index alone: the page
// count and every page's slice are known before any book is fetched, so only
// the books on the page in view are loaded.
import type { EngHit, Offsets, SearchResult } from './search';
import { WORK_ORDER } from './works';

/** What one translation's match counts for: each word the query matched
 * there, as Greek counts each matching word. An index built before word
 * positions says only that the passage matched, which is one. */
export const engHitCount = (h: EngHit): number => Math.max(1, h.positions.length);

/** What a result counts for: every Greek word matched, and every English word
 * matched in each translation. */
export function hitCount(r: SearchResult): number {
  const grk = r.grkMatch ? r.grkPositions.length : 0;
  const eng = !r.engMatch ? 0 : r.engHits ? r.engHits.reduce((n, h) => n + engHitCount(h), 0) : 1;
  return grk + eng;
}

// A place in the corpus to the chapter: work order, book, chapter index.
type Pos = [number, number, number];
const cmp = (a: Pos, b: Pos) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

interface ChapterMap {
  offsets: Offsets;
  seg: Map<string, number>;          // "book:column" -> seg_idx
  starts: Map<number, number[]>;     // book -> its chapters' first global offsets
  names: Map<number, string[]>;      // book -> its chapter names, same order
}

function chapterMap(offsets: Offsets): ChapterMap {
  const seg = new Map<string, number>();
  offsets.segments.forEach((s, i) => seg.set(`${s.book}:${s.column}`, i));
  const starts = new Map<number, number[]>();
  const names = new Map<number, string[]>();
  for (const c of [...offsets.chapter_bounds].sort((a, b) => a.start - b.start)) {
    (starts.get(c.book) ?? starts.set(c.book, []).get(c.book)!).push(c.start);
    (names.get(c.book) ?? names.set(c.book, []).get(c.book)!).push(c.chapter);
  }
  return { offsets, seg, starts, names };
}

// The chapter a global offset falls in: the last to start at or before it. A
// token before the book's first chapter start goes with the first chapter, as
// the results page groups it.
function chapterIdx(starts: number[], global: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= global) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface ResultPages {
  pages: SearchResult[][];
  /** The one page that shows a hit of `r` the page grouped under `chapter`
   * (a chapter name of r's book). */
  pageOf(r: SearchResult, chapter: string): number;
}

/** Lay results out in pages of about `target` hits, breaking only between
 * chapters, so a chapter never runs across two pages.
 *
 * A passage (one Bekker column) can hold the end of one chapter and the start
 * of the next, so it may sit in two pages' slices; `pageOf` then says which
 * page shows which of its hits, and every hit is shown once. Greek hits are
 * placed in their chapter from the offsets; an English hit's chapter is known
 * only once the book is loaded, so for sizing pages it counts where its
 * passage begins, and the passage is put in the slices of the chapters either
 * side too: a translation's text can run a chapter past the column's Greek
 * (once in the corpus, by one chapter, as of 2026-10). A work whose offsets did not load (`null` or missing) has
 * no chapter edges to break at, and each of its books is laid out whole. */
export function paginate(
  results: SearchResult[],
  offsets: Map<string, Offsets | null>,
  target: number,
): ResultPages {
  const maps = new Map<string, ChapterMap | null>();
  const mapOf = (work: string) => {
    if (!maps.has(work)) {
      const o = offsets.get(work);
      maps.set(work, o ? chapterMap(o) : null);
    }
    return maps.get(work)!;
  };

  // lo..hi: the chapters a passage's hits can fall in; home: where it begins.
  const spans = new Map<SearchResult, { lo: Pos; hi: Pos; home: Pos }>();
  const units = new Map<string, { pos: Pos; n: number }>();
  const count = (pos: Pos, n: number) => {
    if (!n) return;
    const key = pos.join(':');
    const unit = units.get(key) ?? units.set(key, { pos, n: 0 }).get(key)!;
    unit.n += n;
  };

  for (const r of results) {
    const { book } = r.meta;
    const order = WORK_ORDER.get(r.work) ?? 0;
    const m = mapOf(r.work);
    const si = m?.seg.get(`${book}:${r.meta.column}`);
    const starts = m?.starts.get(book);
    if (!m || si === undefined || !starts?.length) {
      const pos: Pos = [order, book, 0];
      spans.set(r, { lo: pos, hi: pos, home: pos });
      count(pos, hitCount(r));
      continue;
    }
    const base = m.offsets.seg_base_offset[si];
    const end = (m.offsets.seg_base_offset[si + 1] ?? m.offsets.token_count) - 1;
    const at = (global: number): Pos => [order, book, chapterIdx(starts, global)];
    const home = at(base);
    const hi = at(Math.max(base, end));
    const wide = r.engMatch ? 1 : 0;
    spans.set(r, {
      lo: [order, book, Math.max(0, home[2] - wide)],
      hi: [order, book, Math.min(starts.length - 1, hi[2] + wide)],
      home,
    });
    const grk = r.grkMatch ? r.grkPositions : [];
    for (const p of grk) count(at(base + p), 1);
    count(home, hitCount(r) - grk.length);
  }

  // Each page starts at a chapter; the first also takes anything before it.
  const firsts: Pos[] = [];
  let n = 0;
  for (const unit of [...units.values()].sort((a, b) => cmp(a.pos, b.pos))) {
    if (!firsts.length || (n > 0 && n + unit.n > target)) {
      firsts.push(unit.pos);
      n = 0;
    }
    n += unit.n;
  }
  const pageAt = (pos: Pos) => {
    let lo = 0;
    let hi = firsts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cmp(firsts[mid], pos) <= 0) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const pages: SearchResult[][] = firsts.map(() => []);
  const ordered = [...results].sort((a, b) =>
    ((WORK_ORDER.get(a.work) ?? 0) - (WORK_ORDER.get(b.work) ?? 0)) || (a.meta.book - b.meta.book));
  for (const r of ordered) {
    const { lo, hi } = spans.get(r)!;
    for (let i = pageAt(lo); i <= pageAt(hi); i++) pages[i].push(r);
  }

  const pageOf = (r: SearchResult, chapter: string): number => {
    const span = spans.get(r);
    if (!span) return 0;
    const home = pageAt(span.home);
    const ch = mapOf(r.work)?.names.get(r.meta.book)?.indexOf(chapter) ?? -1;
    if (ch < 0) return home;
    // A chapter further from this passage than its span reaches stays with
    // the passage: the page that holds the chapter has not got it to show.
    const page = pageAt([span.lo[0], span.lo[1], ch]);
    return page >= pageAt(span.lo) && page <= pageAt(span.hi) ? page : home;
  };

  return { pages, pageOf };
}
