// Counting and paging the search results, from the index alone: the page
// count and every page's slice are known before any book is fetched, so only
// the books on the page in view are loaded.
//
// The chapter is the unit (John, 15 Nov: "Bekker columns are not grouped by
// coherent thematic treatments"). Every hit is put in its chapter here, once,
// and the results page draws it under that chapter: a hit counted in one
// chapter and drawn in another left page 67 of ἀρετή + virtue empty.
import { englishIndexSlot, type EngChapters, type Offsets, type SearchResult } from './search';
import { cutPositions } from './result-views';
import { getWork, searchableTranslations, WORK_ORDER } from './works';

export { hitCount, engHitCount } from './search-pages';

// A place in the corpus to the chapter: work order, book, chapter index.
type Pos = [number, number, number];
const cmp = (a: Pos, b: Pos) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** A chapter a hit falls in. A work whose offsets did not load has no
 * chapters to name: its hits go in their book, as chapter '' (order 0). */
export interface ChapterAt {
  key: string;        // work:book:chapter
  work: string;
  book: number;
  chapter: string;
  order: number;      // the chapter's place in its book
  pos: Pos;
}

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
  for (const c of [...(offsets.chapter_bounds ?? [])].sort((a, b) => a.start - b.start)) {
    (starts.get(c.book) ?? starts.set(c.book, []).get(c.book)!).push(c.start);
    (names.get(c.book) ?? names.set(c.book, []).get(c.book)!).push(c.chapter);
  }
  return { offsets, seg, starts, names };
}

// The chapter a global offset falls in: the last to start at or before it. A
// token before the book's first chapter start goes with the first chapter.
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

export interface ChapterPlaces {
  /** The chapter of the Greek word at token `pos` of r's section (a match
   * running on past the section counts on into the next). */
  grk(r: SearchResult, pos: number): ChapterAt;
  /** The chapter of word `word` of `translation` in r's section, the word
   * counted as the translation's index counts it. */
  eng(r: SearchResult, translation: string, word: number): ChapterAt;
  /** A chapter of a book by name, or null where the offsets do not name it. */
  named(work: string, book: number, chapter: string): ChapterAt | null;
}

/** Where each hit falls, from each work's offsets (the Greek) and its
 * eng-chapters.json (each translation's words). */
export function chapterPlaces(
  offsets: Map<string, Offsets | null>,
  eng: Map<string, EngChapters | null> = new Map(),
): ChapterPlaces {
  const maps = new Map<string, ChapterMap | null>();
  const mapOf = (work: string) => {
    if (!maps.has(work)) {
      const o = offsets.get(work);
      maps.set(work, o ? chapterMap(o) : null);
    }
    return maps.get(work)!;
  };
  const at = (work: string, book: number, chapter: string, order: number): ChapterAt =>
    ({ key: `${work}:${book}:${chapter}`, work, book, chapter, order, pos: [WORK_ORDER.get(work) ?? 0, book, order] });
  const whole = (r: SearchResult) => at(r.work, r.meta.book, '', 0);
  const place = (r: SearchResult) => {
    const m = mapOf(r.work);
    const si = m?.seg.get(`${r.meta.book}:${r.meta.column}`);
    const starts = m?.starts.get(r.meta.book);
    return m && si !== undefined && starts?.length ? { m, si, starts, names: m.names.get(r.meta.book)! } : null;
  };
  const grk = (r: SearchResult, pos: number) => {
    const p = place(r);
    if (!p) return whole(r);
    const i = chapterIdx(p.starts, p.m.offsets.seg_base_offset[p.si] + pos);
    return at(r.work, r.meta.book, p.names[i], i);
  };
  return {
    grk,
    eng(r, translation, word) {
      const p = place(r);
      if (!p) return whole(r);
      const w = getWork(r.work);
      const t = (w ? searchableTranslations(w) : []).find(x => x.id === translation);
      const starts = eng.get(r.work)?.[t ? englishIndexSlot(t) : 'english']?.[String(p.si)] ?? [];
      let chapter: string | undefined;
      for (const [from, name] of starts) if (from <= word) chapter = name;
      const i = chapter === undefined ? -1 : p.names.indexOf(chapter);
      // Before the section's first chapter start, its words are in the
      // chapter its Greek opens in.
      return i < 0 ? grk(r, 0) : at(r.work, r.meta.book, p.names[i], i);
    },
    named(work, book, chapter) {
      const i = mapOf(work)?.names.get(book)?.indexOf(chapter) ?? -1;
      return i < 0 ? null : at(work, book, chapter, i);
    },
  };
}

/** Each hit of a result with its chapter: a Greek word, or a match of
 * several words by its first; each word a translation matched, or each run
 * of a phrase (as engHitCount counts them), a match with no word positions
 * once, at the head of its section. */
export function eachHit(
  r: SearchResult,
  places: ChapterPlaces,
  fn: (at: ChapterAt, lang: 'grk' | 'eng', translation?: string) => void,
): void {
  if (r.grkMatch) for (const w of r.windows ?? r.grkPositions.map(p => [p])) fn(places.grk(r, w[0]), 'grk');
  if (!r.engMatch) return;
  for (const h of r.engHits ?? [{ translation: '', positions: [] }]) {
    const words = h.matches ?? h.positions;
    if (!words.length) fn(places.eng(r, h.translation, 0), 'eng', h.translation);
    for (const word of words) fn(places.eng(r, h.translation, word), 'eng', h.translation);
  }
}

/** The hits of `results` in chapters where both languages have one: "and"
 * in a Both search, both terms anywhere in the same chapter (John, 15 Nov).
 * A result left with no hit drops out. */
export function chapterJoin(results: SearchResult[], places: ChapterPlaces): SearchResult[] {
  const grk = new Set<string>();
  const eng = new Set<string>();
  for (const r of results) eachHit(r, places, (at, lang) => (lang === 'grk' ? grk : eng).add(at.key));
  const keep = (at: ChapterAt) => grk.has(at.key) && eng.has(at.key);
  return results.flatMap(r => {
    let left = r;
    if (r.grkMatch) {
      // A match of several words stands or falls with its first word.
      const kept = new Set((r.windows ?? r.grkPositions.map(p => [p]))
        .filter(w => keep(places.grk(r, w[0]))).flat());
      left = cutPositions(r, r.grkPositions.map(p => kept.has(p)));
    }
    if (r.engMatch && r.engHits) {
      const engHits = r.engHits.flatMap(h => {
        const inside = (w: number) => keep(places.eng(r, h.translation, w));
        if (!(h.matches ?? h.positions).length) return inside(0) ? [h] : [];
        const positions = h.positions.filter(inside);
        const matches = h.matches?.filter(inside);
        return (matches ?? positions).length ? [{ ...h, positions, ...(matches ? { matches } : {}) }] : [];
      });
      left = { ...left, engHits, engMatch: engHits.length > 0 };
    }
    const grkMatch = left.grkPositions.length > 0;
    return grkMatch || left.engMatch ? [{ ...left, grkMatch }] : [];
  });
}

/** The chapters the results reach and their hits: those with Greek, with
 * English, with both; and the Greek and English hits. */
export interface Measure { chapters: number; both: number; grkOnly: number; engOnly: number; grkHits: number; engHits: number }
export function measure(results: SearchResult[], places: ChapterPlaces): Measure {
  const grk = new Set<string>();
  const eng = new Set<string>();
  let grkHits = 0;
  let engHits = 0;
  for (const r of results) eachHit(r, places, (at, lang) => {
    if (lang === 'grk') { grk.add(at.key); grkHits++; } else { eng.add(at.key); engHits++; }
  });
  const both = [...grk].filter(k => eng.has(k)).length;
  return { chapters: new Set([...grk, ...eng]).size, both, grkOnly: grk.size - both, engOnly: eng.size - both, grkHits, engHits };
}

export interface ResultPages {
  pages: SearchResult[][];
  /** The one page that shows a hit of `r` the page grouped under `chapter`
   * (a chapter name of r's book). */
  pageOf(r: SearchResult, chapter: string): number;
  /** The page that shows a chapter (chapterPlaces names it). */
  pageOfChapter(at: ChapterAt): number;
}

/** Lay results out in pages of about `target` hits, breaking only between
 * chapters, so a chapter never runs across two pages. Each hit counts in the
 * chapter it is drawn in (chapterPlaces); a section that holds the end of one
 * chapter and the start of the next sits in the slice of every page that
 * shows one of its hits. A work whose offsets did not load (`null` or
 * missing) has no chapter edges to break at, and each of its books is laid
 * out whole. */
export function paginate(
  results: SearchResult[],
  offsets: Map<string, Offsets | null>,
  target: number,
  eng: Map<string, EngChapters | null> = new Map(),
): ResultPages {
  return paginatePlaces(results, chapterPlaces(offsets, eng), target);
}

export function paginatePlaces(results: SearchResult[], places: ChapterPlaces, target: number): ResultPages {
  const units = new Map<string, { pos: Pos; n: number }>();
  const reach = new Map<SearchResult, Pos[]>();
  for (const r of results) {
    const mine: Pos[] = [];
    const count = (at: ChapterAt) => {
      const unit = units.get(at.key) ?? units.set(at.key, { pos: at.pos, n: 0 }).get(at.key)!;
      unit.n++;
      mine.push(at.pos);
    };
    eachHit(r, places, count);
    // A result with no hit left still has a place: where its section opens.
    if (!mine.length) mine.push(places.grk(r, 0).pos);
    reach.set(r, mine);
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
  if (firsts.length) for (const r of ordered) for (const i of new Set(reach.get(r)!.map(pageAt))) pages[i].push(r);

  const pageOf = (r: SearchResult, chapter: string): number => {
    const at = places.named(r.work, r.meta.book, chapter) ?? places.grk(r, 0);
    return pageAt(at.pos);
  };

  return { pages, pageOf, pageOfChapter: at => pageAt(at.pos) };
}
