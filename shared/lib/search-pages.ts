import { paginate as chapterPaginate } from './chapter-pages';
// Count matches as the header does. Aristotle pages load chapter offsets and
// break between chapters; the legacy two-argument overload groups Stephanus pages.
import type { EngHit, SearchResult } from './search';
import { WORK_ORDER } from './works';

/** What one translation's match counts for: each word the query matched
 * there, as Greek counts each matching word, or each run of a phrase once
 * (`matches`). A bare * matches no word in particular and counts as one. */
export const engHitCount = (h: EngHit): number => h.matches ? h.matches.length : Math.max(1, h.positions.length);

/** What a result counts for: every Greek word matched (a match of several
 * words once, however many it touches: its window), and every English word
 * matched in each translation (an English phrase once). */
export function hitCount(r: SearchResult): number {
  const grk = !r.grkMatch ? 0 : r.windows ? r.windows.length : r.grkPositions.length;
  const eng = !r.engMatch ? 0 : r.engHits ? r.engHits.reduce((n, h) => n + engHitCount(h), 0) : 1;
  return grk + eng;
}

/** The Stephanus page a section column belongs to: "34b" → 34. */
export const stephanusPage = (column: string): number => parseInt(column, 10) || 0;

// A place in the corpus to the Stephanus page: work order, book, page.
type Pos = [number, number, number];
const cmp = (a: Pos, b: Pos) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const posOf = (r: SearchResult): Pos =>
  [WORK_ORDER.get(r.work) ?? 0, r.meta.book, stephanusPage(r.meta.column)];

/** Lay results out in pages of about `target` hits, breaking only between
 * Stephanus pages, in corpus order. A Stephanus page with more hits than
 * `target` is a result page of its own. */
export function paginate(results: SearchResult[], target: number): SearchResult[][];
export function paginate(results: SearchResult[], offsets: Map<string, import('./search').Offsets | null>, target: number): import('./chapter-pages').ResultPages;
export function paginate(results: SearchResult[], arg: number | Map<string, import('./search').Offsets | null>, size?: number): SearchResult[][] | import('./chapter-pages').ResultPages {
  if (typeof arg !== 'number') return chapterPaginate(results, arg, size!);
  const target = arg;
  const units = new Map<string, { pos: Pos; n: number; results: SearchResult[] }>();
  for (const r of results) {
    const pos = posOf(r);
    const key = pos.join(':');
    const unit = units.get(key) ?? units.set(key, { pos, n: 0, results: [] }).get(key)!;
    unit.n += hitCount(r);
    unit.results.push(r);
  }
  const pages: SearchResult[][] = [];
  let n = 0;
  for (const unit of [...units.values()].sort((a, b) => cmp(a.pos, b.pos))) {
    if (!pages.length || (n > 0 && n + unit.n > target)) {
      pages.push([]);
      n = 0;
    }
    pages[pages.length - 1].push(...unit.results);
    n += unit.n;
  }
  return pages;
}
