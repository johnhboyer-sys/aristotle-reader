// The row table: what laying out the result rows needs of a book, without
// its text, so the page count and the books a page needs are known before
// any book is fetched (John, 17 Nov). Only the books on the page in view load.
//
// A row is a passage the results draw (Search.svelte buildGroups): one per
// Greek hit, an English hit joining the Greek hit of its aligned unit, hits
// whose passages share words joined into one. Where each lies turns on the
// book: the unit each Greek word and each translation's word stands in, and
// how many words each Greek line holds. The table keeps exactly that, made at
// build time by the same functions the page uses (encodeRowBook), and
// countRows counts the rows from it as buildGroups lays them out.
//
// Pure: no Svelte, no fetching.
import type { BookData, Segment } from './data';
import type { ChapterAt, ChapterPlaces } from './chapter-pages';
import { englishWordLines } from './english-place';
import { translationTexts, turnTranslationTexts } from './english-hit';
import { lineOfPosition, lineTokens, sectionsAfter, segTokens, subOfPosition } from './greek-lines';
import { pairGreekWindow, pairUnits, sectionUnit, unitAtEnglish, unitAtGreek, unitAtLine, type PairUnit } from './paired-hit';
import { englishWords, type SearchResult } from './search';
import type { TranslationRef } from './works';

type Ref = Pick<TranslationRef, 'id' | 'slot'>;

export interface RowSeg {
  id: string;
  /** Column. */
  c: string;
  /** Each Greek line: its number, then how many words it holds. */
  l: number[];
  /** Line index → the lettered line's suffix. */
  s?: Record<string, string>;
  /** 1 where the reference English carries Bekker ticks. */
  b?: 1;
  /** The unit of each Greek word, run-length: unit, words, unit, words, … */
  g: number[];
  /** The whole section as a unit. */
  w: number;
  /** Translation id → the unit of each word the index counts there,
   * run-length, then one more entry: the unit of any word past the last.
   * A translation not listed puts every word in the whole section. */
  e?: Record<string, number[]>;
}

export interface RowBook {
  /** 1 for a book aligned by speaker turn (turnFlow). */
  f?: 1;
  s: RowSeg[];
  /** Unit → the index of its section's segment. */
  u: number[];
}

export interface RowTable { v: 1; books: Record<string, RowBook> }

const runs = (values: number[]): number[] => {
  const out: number[] = [];
  for (const v of values) {
    if (out.length && out[out.length - 2] === v) out[out.length - 1]++;
    else out.push(v, 1);
  }
  return out;
};

/** A book's row table, read from the book by the page's own functions.
 * `check` compares a sample of the English answers with unitAtEnglish word
 * by word, and throws on the first that differs. */
export function encodeRowBook(book: Pick<BookData, 'segments' | 'turnFlow'>, translations: TranslationRef[], check = true): RowBook {
  const ix = pairUnits(book, translations);
  const segs = book.segments;
  const firstOf = new Map<string, number>();
  segs.forEach((s, i) => { if (!firstOf.has(s.column)) firstOf.set(s.column, i); });
  const ids = new Map<PairUnit, number>();
  const u: number[] = [];
  const idOf = (unit: PairUnit) => {
    let id = ids.get(unit);
    if (id === undefined) {
      id = u.length;
      ids.set(unit, id);
      u.push(firstOf.get(unit.section) ?? -1);
    }
    return id;
  };
  const turns = new Map<string, Map<string, string[]>>();
  const turnsOf = (id: string) => turns.get(id) ?? turns.set(id, turnTranslationTexts(book, id)).get(id)!;

  const out: RowSeg[] = segs.map(seg => {
    const row: RowSeg = { id: seg.id, c: seg.column, l: [], g: [], w: idOf(sectionUnit(ix, seg)) };
    seg.greek.forEach((line, i) => {
      row.l.push(line.n, line.tokens.length);
      if (line.sub) (row.s ??= {})[String(i)] = line.sub;
    });
    if (seg.english?.bekker?.length) row.b = 1;
    const tokens = segTokens(seg).length;
    row.g = runs(Array.from({ length: tokens }, (_, pos) => idOf(unitAtGreek(ix, seg, pos))));
    for (const t of translations) {
      const texts = translationTexts(seg, t, t.slot === 'overlay' ? turnsOf(t.id) : undefined);
      const n = texts.reduce((sum, text) => sum + englishWords(text).length, 0);
      let units: number[];
      if (book.turnFlow) units = Array.from({ length: n }, (_, w) => idOf(unitAtEnglish(ix, seg, t, w)));
      else {
        const lines = englishWordLines(seg, t);
        units = Array.from({ length: n }, (_, w) => idOf(unitAtLine(ix, seg, lines[w])));
      }
      const rest = idOf(unitAtEnglish(ix, seg, t, n));
      if (check) {
        for (let w = 0; w < n; w += w + 53 < n ? 53 : Math.max(1, n - 1 - w)) {
          const want = idOf(unitAtEnglish(ix, seg, t, w));
          if (units[w] !== want) throw new Error(`row table: ${seg.id} ${t.id} word ${w} in unit ${units[w]}, unitAtEnglish says ${want}`);
        }
      }
      if (n === 0 && rest === row.w) continue;
      (row.e ??= {})[t.id] = [...runs(units), rest];
    }
    return row;
  });
  const result: RowBook = { s: out, u };
  if (book.turnFlow) result.f = 1;
  return result;
}

// A book's segments as the counting reads them: line numbers, suffixes and
// how many words each line holds (the words themselves stand empty).
const skeletons = new WeakMap<RowBook, Segment[]>();
function skeleton(book: RowBook): Segment[] {
  let segs = skeletons.get(book);
  if (!segs) {
    segs = book.s.map(s => {
      const greek: Segment['greek'] = [];
      for (let i = 0; i < s.l.length; i += 2) {
        greek.push({ n: s.l[i], sub: s.s?.[String(i / 2)], text: '', tokens: new Array(s.l[i + 1]).fill(null) });
      }
      return { id: s.id, column: s.c, greek, english: null } as Segment;
    });
    skeletons.set(book, segs);
  }
  return segs;
}

// The unit at place `at` of a run-length list (the last run holds any place
// past the end, as unitAtGreek's clamp does).
function unitIn(list: number[], at: number): number | undefined {
  let n = Math.max(0, at);
  for (let i = 0; i < list.length; i += 2) {
    if (n < list[i + 1]) return list[i];
    n -= list[i + 1];
  }
  return list.length ? list[list.length - 2] : undefined;
}
// A translation's: the entry after the runs for a place past them.
function engUnitIn(list: number[], at: number): number {
  let n = at;
  for (let i = 0; i + 1 < list.length; i += 2) {
    if (n < list[i + 1]) return list[i];
    n -= list[i + 1];
  }
  return list[list.length - 1];
}

export interface RowCountOpts {
  context: '1' | '3' | 's';
  places: ChapterPlaces;
  /** The work's searchable translations (translationsOf). */
  translations: Ref[];
  /** A work cited by chapter and section (isChapterSection). */
  chapterSection: boolean;
  /** The outline's chapter at a column and line (Search.svelte
   * chapterLookup), for a hit its places do not name a chapter for; null
   * where the outline did not load or does not list the book. */
  lookup: ((column: string, line: number) => { chapter: string }) | null;
  engUnits: string[][];
  engPhrase: boolean;
}

interface Inst { unit: number; ch: ChapterAt; at: number; line: number; column: string; sh?: { key: string; from: number; to: number; turns: boolean }; rows: boolean }

/** How many rows buildGroups lays out for one book's results, or null where
 * the table cannot say (a section or translation it does not hold, an index
 * without word places), and the book must be read. Before the accent and
 * case filters only: a search with either reads its books anyway. An English
 * hit's words are the index's places, as buildGroups takes them wherever
 * each falls on a word the query matches; where one does not (an index from
 * another build), buildGroups finds the words in the text instead, and the
 * page, comparing each book it reads with this count, reads every book. */
export function countRows(results: SearchResult[], book: RowBook, o: RowCountOpts): number | null {
  if (!o.lookup) return null;
  const segs = skeleton(book);
  const at = new Map(book.s.map((s, i) => [s.id, i]));
  const reach = o.context === '1' ? 4 : 12;
  const turnFlow = !!book.f;
  const made: (Inst & { grk: boolean })[] = [];
  const grkByUnit = new Map<number, Inst[]>();
  const engByUnit = new Map<number, Map<string, Inst>>();
  const star = o.engUnits.every(u => u.length === 1 && u[0] === '*');

  for (const r of results) {
    const si = at.get(r.meta.id);
    if (si === undefined) return null;
    const row = book.s[si];
    const seg = segs[si];
    if (r.grkMatch) {
      const tokens = segTokens(seg).length;
      const top = Math.max(-1, ...r.grkPositions);
      const after = sectionsAfter(segs, seg, top, reach);
      const keep = new Set(r.grkPositions);
      const windows = r.windows?.map(w => w.filter(p => keep.has(p))).filter(w => w.length);
      const hits = windows?.length ? windows : r.grkPositions.map(pos => [pos]);
      for (const own of hits) {
        const pos = own[0];
        const line = lineOfPosition(seg, pos);
        const unit = unitIn(row.g, pos) ?? row.w;
        const inst: Inst & { grk: boolean } = { grk: true, unit, ch: o.places.grk(r, pos), at: pos, line, column: row.c, rows: false };
        const last = own[own.length - 1];
        // The whole section is one row however its hits lie: no window.
        if (o.context === 's') { /* no passage to share */ }
        else if (!turnFlow && row.b && !o.chapterSection && last < tokens) {
          const win = pairGreekWindow(seg, {} as PairUnit, line, o.context, windows?.length ? last : undefined, subOfPosition(seg, pos));
          const span = lineTokens(seg);
          const lines = win.greek.map(l => span.get(`${l.n}${l.sub ?? ''}`)).filter((x): x is [number, number] => !!x);
          if (lines.length && !windows?.length) inst.sh = { key: `${seg.id}:lines`, from: lines[0][0], to: lines[lines.length - 1][1], turns: false };
        } else if (!windows?.length) {
          const words = tokens + after.reduce((n, s) => n + segTokens(s).length, 0);
          const [first, end] = [own[0], last].map(p => Math.min(p, words - 1));
          inst.sh = { key: `${seg.id}:words`, from: Math.max(0, first - reach), to: Math.min(words, end + reach + 1), turns: turnFlow };
        }
        made.push(inst);
        (grkByUnit.get(unit) ?? grkByUnit.set(unit, []).get(unit)!).push(inst);
      }
    }
    if (r.engMatch) {
      const hits = r.engHits ?? [{ translation: o.translations[0]?.id ?? 'english', positions: [] }];
      for (const hit of hits) {
        if (!o.translations.some(t => t.id === hit.translation)) return null;
        // With no places from the index, the words marked are found in the
        // text, which the table does not hold.
        if (!hit.positions.length && !star) return null;
        const list = row.e?.[hit.translation];
        const unitOf = (w: number) => (list ? engUnitIn(list, w) : row.w);
        const marked = [...new Set(hit.positions)];
        const heads = [...(hit.matches ?? [])].sort((a, b) => a - b);
        const span = Math.max(1, o.engUnits.flat().length);
        const chaptersOf = (w: number): ChapterAt[] => {
          const own = o.engPhrase ? heads.filter(m => m <= w && w < m + span) : [];
          const found = (own.length ? own : [heads.filter(m => m <= w).at(-1) ?? w]).map(m => o.places.eng(r, hit.translation, m));
          return found.filter((a, i) => found.findIndex(b => b.key === a.key) === i);
        };
        const file = (w: number, ch: ChapterAt) => {
          const unit = unitOf(w);
          const inUnit = engByUnit.get(unit) ?? engByUnit.set(unit, new Map()).get(unit)!;
          if (inUnit.has(ch.key)) return;
          const inst: Inst & { grk: boolean } = { grk: false, unit, ch, at: 0, line: 0, column: segs[book.u[unit]]?.column ?? row.c, rows: true };
          inUnit.set(ch.key, inst);
          made.push(inst);
        };
        for (const w of marked) for (const ch of chaptersOf(w)) file(w, ch);
        if (!marked.length) file(0, o.places.eng(r, hit.translation, 0));
      }
    }
  }

  // An English hit joins the first Greek hit of its unit in its chapter.
  const merged = new Set<Inst>();
  for (const [unit, insts] of engByUnit) {
    const greek = grkByUnit.get(unit);
    if (!greek) continue;
    for (const [key, eng] of insts) {
      let first: Inst | undefined;
      for (const g of greek) if (g.ch.key === key && (!first || g.at < first.at)) first = g;
      if (first) { first.rows = true; merged.add(eng); }
    }
  }
  const placed = made.filter(inst => !merged.has(inst));
  if (o.context === 's') {
    const sections = new Set<string>();
    for (const inst of placed) sections.add(`${inst.column}:${inst.ch.key}`);
    return sections.size;
  }
  // Hits whose passages share words are one row; a run holds at most one hit
  // with English, and in a book aligned by turns, one turn's hits.
  const byKey = new Map<string, Inst[]>();
  for (const inst of made) {
    if (!inst.sh || merged.has(inst)) continue;
    const chapter = inst.ch.chapter ? inst.ch.chapter : o.lookup(inst.column, inst.line ?? 1).chapter;
    const key = `${inst.sh.key}:chapter:${chapter}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(inst);
  }
  let joined = 0;
  for (const list of byKey.values()) {
    list.sort((a, b) => a.at - b.at);
    let run: Inst[] = [];
    let end = -1;
    for (const inst of list) {
      const sh = inst.sh!;
      const rows = run.filter(x => x.rows).length + (inst.rows ? 1 : 0);
      if (run.length && sh.from < end && rows <= 1 && (!sh.turns || inst.unit === run[0].unit)) { run.push(inst); end = Math.max(end, sh.to); continue; }
      joined += Math.max(0, run.length - 1);
      run = [inst];
      end = sh.to;
    }
    joined += Math.max(0, run.length - 1);
  }
  return placed.length - joined;
}
