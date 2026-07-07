/**
 * Chapter-boundary detection — TS port of pipeline/aristotle_pipeline/stage1_chapters.py.
 *
 * Two paths:
 *  - extractChaptersExplicit: chapters declared directly as Bekker starts in
 *    the manifest (port of extract_chapters_explicit).
 *  - extractChaptersGrc: grc-TEI alignment — chapter div/milestone opening
 *    texts text-aligned onto the Greek spine, monotonically, with documented
 *    fallbacks (port of extract_chapters_grc + its private helpers).
 *
 * fast-xml-parser's `preserveOrder` mode gives each element's children as a
 * single ordered array of text-runs and sub-elements. That array already
 * represents both lxml's `.text` (any leading text run) AND every child's
 * `.tail` (the text run immediately following it) as plain siblings in
 * document order — so unlike the lxml original we never need to track
 * `.text`/`.tail` separately; walking `children(node)` in order reproduces
 * the same document-order text stream.
 */

import { XMLParser } from 'fast-xml-parser';
import { type XmlNode, attrs, children, isTextNode, tagName, textOf } from './xmlnode';
import { norm } from './normalize';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  // See spine.ts: lxml never trims .text/.tail, and we collapse whitespace
  // ourselves after flattening, so parser-level trimming must stay off.
  trimValues: false,
});

function parseTei(xml: string): XmlNode[] {
  return xmlParser.parse(xml) as XmlNode[];
}

/** Find the first `<body>` element anywhere in the document (lxml's
 * `tree.find(".//{*}body")`), or fall back to the document root's own node
 * list when absent (lxml's `tree.getroot()` — the parser's top-level array
 * already plays that role here since there is always exactly one root
 * element in a well-formed TEI file). */
function findBody(root: XmlNode[]): XmlNode[] {
  const walk = (nodes: XmlNode[]): XmlNode[] | null => {
    for (const n of nodes) {
      if (isTextNode(n)) continue;
      if (tagName(n) === 'body') return children(n);
      const found = walk(children(n));
      if (found) return found;
    }
    return null;
  };
  return walk(root) ?? root;
}

// ── spine flattening (port of _spine_words) ─────────────────────────────────

export interface SpineForChapters {
  segments: Array<{ column: string; lines: Array<{ n: number; text: string }> }>;
}

export type WordOwner = [column: string, line: number, wordIndexInLine: number];

/** Flatten the spine into a normalized word stream with each word's owning
 * (column, line) and its char offset in the joined string. Port of
 * `_spine_words`. */
export function spineWords(spine: SpineForChapters): {
  joined: string;
  owner: WordOwner[];
  wstart: number[];
} {
  const words: string[] = [];
  const owner: WordOwner[] = [];
  for (const seg of spine.segments) {
    for (const line of seg.lines) {
      // drop trailing hyphens so a word split across lines still matches.
      const normalized = norm(line.text.replace(/-/g, ''));
      const lineWords = normalized === '' ? [] : normalized.split(' ');
      lineWords.forEach((w, wi) => {
        words.push(w);
        owner.push([seg.column, line.n, wi]);
      });
    }
  }
  const joined = words.join(' ');
  const wstart: number[] = [];
  let pos = 0;
  for (const w of words) {
    wstart.push(pos);
    pos += w.length + 1;
  }
  return { joined, owner, wstart };
}

// ── milestone / opening-text extraction (port of _first_word_at, _div_opening,
// _first_bekker_in, _chapter_openings, _chapter_openings_milestone) ────────

/** Index in the spine word stream of the first word at (column, >= line) —
 * used to pin a chapter at an authoritative Bekker milestone when text
 * alignment misses. Port of `_first_word_at`. */
export function firstWordAt(
  owner: WordOwner[],
  column: string | null,
  line: string | null,
): number | null {
  if (column === null || line === null) return null;
  if (!/^-?\d+$/.test(line.trim())) return null;
  const ln = Number(line);
  for (let i = 0; i < owner.length; i++) {
    const [col, lno] = owner[i];
    if (col === column && lno >= ln) return i;
  }
  return null;
}

/** Strip a leading single-letter book label ("Α. " / "Α· ") from the start of
 * an opening-text segment. Port of the trailing `re.sub(r"^\s*[Α-Ω][.·]?\s",
 * " ", seg)` applied in both `_div_opening` and `_chapter_openings_milestone`. */
function stripLeadingBookLabel(seg: string): string {
  return seg.replace(/^\s*[Α-Ω][.·]?\s/, ' ');
}

/** First ~k chars of text under a chapter div, dropping note/head subtrees
 * and a leading single-letter book label. Port of `_div_opening`. Walks the
 * element's own children array (which already interleaves text-runs the way
 * lxml's .text/.tail would) and recurses into sub-elements other than
 * note/head. The Python has a `len(...) > k_chars*2` check but it is the
 * LAST statement in its recursive walk() and never interrupts the traversal
 * (a `return` with nothing following it is a no-op) — confirmed empirically
 * against lxml; the real truncation happens only via the final `[:k_chars]`
 * slice, ported below as `.slice(0, kChars)`. So this port omits the inert
 * check rather than reproducing dead code. */
function divOpening(div: XmlNode, kChars = 400): string {
  const out: string[] = [];

  const walkChildren = (node: XmlNode) => {
    for (const child of children(node)) {
      if (isTextNode(child)) {
        out.push(textOf(child));
        continue;
      }
      const tag = tagName(child);
      if (tag === 'note' || tag === 'head') {
        // Skip the note/head subtree entirely: its own text/children are
        // dropped, but (per the flat-children model) whatever text run
        // follows it is just the next sibling in this same loop, so no
        // special "tail" handling is needed here.
        continue;
      }
      walkChildren(child);
    }
  };

  walkChildren(div);
  const seg = out.join('').replace(/\s+/g, ' ').trim();
  return stripLeadingBookLabel(seg).slice(0, kChars);
}

/** The Bekker (page, line) at the start of a chapter div: the first line
 * milestone inside it (with any preceding inner page milestone), falling
 * back to the position running when the div opened. Port of
 * `_first_bekker_in`. */
function firstBekkerIn(
  div: XmlNode,
  runPage: string | null,
  runLine: string | null,
): [string | null, string | null] {
  let page = runPage;
  let line = runLine;
  const walk = (node: XmlNode): [string | null, string | null] | null => {
    for (const child of children(node)) {
      if (isTextNode(child)) continue;
      if (tagName(child) === 'milestone') {
        const a = attrs(child);
        if (a['@_unit'] === 'page') {
          page = a['@_n'] ?? null;
        } else if (a['@_unit'] === 'line') {
          return [page, a['@_n'] ?? null];
        }
      }
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(div) ?? [page, line];
}

export type ChapterOpening = [
  book: number,
  chapter: string,
  opening: string,
  column: string | null,
  line: string | null,
];

/** (book, chapter, opening_text, column, line) for every chapter div, in
 * document order. Port of `_chapter_openings`. `topBook` restricts emission
 * to chapters under the `<div subtype="book" n="topBook">` div (multi-work
 * TEIs). */
export function chapterOpenings(
  xml: string,
  chapterSubtype = 'chapter',
  bookSubtype = 'book',
  topBook: string | null = null,
): ChapterOpening[] {
  const body = findBody(parseTei(xml));
  const out: ChapterOpening[] = [];
  const state = {
    book: 1,
    page: null as string | null,
    line: null as string | null,
    top: null as string | null,
  };

  const walk = (node: XmlNode) => {
    const ln = tagName(node);
    if (ln === 'milestone') {
      const a = attrs(node);
      if (a['@_unit'] === 'page') state.page = a['@_n'] ?? null;
      else if (a['@_unit'] === 'line') state.line = a['@_n'] ?? null;
    } else if (ln === 'div') {
      const a = attrs(node);
      const sub = a['@_subtype'];
      const n = a['@_n'];
      if (sub === 'book') state.top = n ?? null;
      if (sub === bookSubtype && n !== undefined && /^\d+$/.test(n)) {
        state.book = Number(n);
      } else if (
        sub === chapterSubtype &&
        n !== undefined &&
        /^\d+$/.test(n.replace(/^-+/, ''))
      ) {
        if (topBook === null || state.top === topBook) {
          const [col, line] = firstBekkerIn(node, state.page, state.line);
          out.push([state.book, n, divOpening(node), col, line]);
        }
      }
    }
    for (const child of children(node)) {
      if (!isTextNode(child)) walk(child);
    }
  };

  for (const n of body) if (!isTextNode(n)) walk(n);
  return out;
}

/** (book, chapter, opening_text, column, line) per `<milestone unit=unit>`,
 * in document order. Port of `_chapter_openings_milestone`, for Perseus TEIs
 * with no chapter <div>s (chapters are inline section milestones). */
export function chapterOpeningsMilestone(
  xml: string,
  unit = 'section',
  bookSubtype = 'book',
): ChapterOpening[] {
  const body = findBody(parseTei(xml));
  const buf: string[] = [];
  const marks: Array<[number, string, number, string | null, string | null]> = [];
  const state = {
    book: 1,
    counts: new Map<number, number>(),
    page: null as string | null,
    line: null as string | null,
  };

  const walk = (node: XmlNode) => {
    const ln = tagName(node);
    if (ln === 'div') {
      const a = attrs(node);
      const n = a['@_n'];
      if (a['@_subtype'] === bookSubtype && n !== undefined && /^\d+$/.test(n)) {
        state.book = Number(n);
      }
    }
    if (ln === 'milestone') {
      const a = attrs(node);
      const unitAttr = a['@_unit'];
      if (unitAttr === 'page') {
        state.page = a['@_n'] ?? null;
      } else if (unitAttr === 'line') {
        state.line = a['@_n'] ?? null;
      } else if (unitAttr === unit) {
        const b = state.book;
        const c = (state.counts.get(b) ?? 0) + 1;
        state.counts.set(b, c);
        const pos = buf.reduce((sum, x) => sum + x.length, 0);
        marks.push([b, String(c), pos, state.page, state.line]);
      }
    }
    if (ln === 'note' || ln === 'head') {
      // Dropped subtree; per the flat-children model, whatever text run
      // follows this element is simply the next sibling in the parent's
      // loop, so no explicit "tail" append is needed here (unlike the lxml
      // original, which has to append node.tail before returning).
      return;
    }
    for (const child of children(node)) {
      if (isTextNode(child)) buf.push(textOf(child));
      else walk(child);
    }
  };

  for (const n of body) {
    if (isTextNode(n)) buf.push(textOf(n));
    else walk(n);
  }

  const full = buf.join('');
  const out: ChapterOpening[] = [];
  for (const [b, chap, pos, col, line] of marks) {
    const seg = full.slice(pos, pos + 800).replace(/\s+/g, ' ').trim();
    out.push([b, chap, stripLeadingBookLabel(seg).slice(0, 400), col, line]);
  }
  return out;
}

// ── public extraction API ───────────────────────────────────────────────────

export interface ChapterEntry {
  book: number;
  chapter: string;
  column: string;
  line: string;
  wordIndex: number;
  bookstart: boolean;
  title?: string;
}

export interface ExplicitChapterEntry {
  n: number | string;
  bekker: string | number;
  title?: string;
}

const EXPLICIT_BEKKER_RE = /^(\d{1,4}[ab])(\d{1,3})$/;

/** Chapters declared directly as Bekker starts in the manifest. Port of
 * `extract_chapters_explicit`. Logs (console.warn, matching the Python's
 * `print`) rather than throwing on malformed/absent-column entries, same as
 * the pipeline original. */
export function extractChaptersExplicit(
  spine: SpineForChapters,
  chapterList: ExplicitChapterEntry[],
): ChapterEntry[] {
  const cols = new Set(spine.segments.map((s) => s.column));
  const chapters: ChapterEntry[] = [];
  for (const entry of chapterList) {
    const ref = String(entry.bekker).trim();
    const m = EXPLICIT_BEKKER_RE.exec(ref);
    if (!m) {
      console.warn(`  chapters: bad explicit bekker ${JSON.stringify(ref)}`);
      continue;
    }
    const [, column, line] = m;
    if (!cols.has(column)) {
      console.warn(`  chapters: explicit column ${column} absent from spine`);
    }
    const chapter: ChapterEntry = {
      book: 1,
      chapter: String(entry.n),
      column,
      line,
      wordIndex: 0,
      bookstart: chapters.length === 0,
    };
    if (entry.title) chapter.title = entry.title;
    chapters.push(chapter);
  }
  return chapters;
}

export interface ExtraChapterEntry {
  n: number | string;
  bekker: string | number;
  book?: number;
}

export interface ExtractChaptersGrcOptions {
  chapterSubtype?: string;
  bookSubtype?: string;
  /** 'div' (default) or 'milestone'. */
  chapterMarker?: 'div' | 'milestone';
  topBook?: string | null;
  extra?: ExtraChapterEntry[] | null;
}

// private port of refs.line_key (tiny duplication with spine.ts/citation is
// intentional per this task's scope — see spine.ts's own copy for the note).
type RefKey3 = [page: number, side: 'a' | 'b', line: number];
const REF_RE = /^(\d+)([ab])(\d+)?$/;
function lineKeyForSort(column: string, line: number): RefKey3 {
  const m = REF_RE.exec(column);
  if (!m || m[3] !== undefined) throw new Error(`not a Bekker column: ${column}`);
  return [Number(m[1]), m[2] as 'a' | 'b', line];
}
function compareRefKey3(a: RefKey3, b: RefKey3): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return a[2] - b[2];
}

/** List of {book, chapter, column, line, wordIndex, bookstart} aligned onto
 * the spine. Port of `extract_chapters_grc`. `xml` is the raw grc TEI file
 * text (read by the caller — no file I/O here). */
export function extractChaptersGrc(
  spine: SpineForChapters,
  xml: string,
  opts: ExtractChaptersGrcOptions = {},
): ChapterEntry[] {
  const {
    chapterSubtype = 'chapter',
    bookSubtype = 'book',
    chapterMarker = 'div',
    topBook = null,
    extra = null,
  } = opts;

  const { joined, owner, wstart } = spineWords(spine);
  const openings =
    chapterMarker === 'milestone'
      ? chapterOpeningsMilestone(xml, chapterSubtype, bookSubtype)
      : chapterOpenings(xml, chapterSubtype, bookSubtype, topBook);

  const chapters: ChapterEntry[] = [];
  let after = 0;

  for (const [book, chap, opening, mcol, mline] of openings) {
    let loc: WordOwner | null = null;

    if (chapters.length === 0) {
      loc = owner[0]; // the work's first chapter starts the spine
    } else {
      const ow = norm(opening).split(' ').filter((w) => w !== '');
      for (const kk of [8, 6, 5, 4]) {
        if (ow.length < kk) continue;
        const needle = ow.slice(0, kk).join(' ');
        const p = joined.indexOf(needle, after);
        if (p >= 0) {
          const widx = countSpacesBefore(joined, p);
          loc = owner[widx];
          after = wstart[widx];
          break;
        }
      }
      if (loc === null && mcol !== null) {
        // Orthographic divergence missed the text match; fall back to the
        // milestone's own Bekker position (heading pinned at line start).
        const widx = firstWordAt(owner, mcol, mline);
        if (widx !== null) {
          loc = owner[widx];
          after = wstart[widx];
        }
      }
      if (loc === null && mcol === null) {
        // Last resort for grc TEIs with no Bekker milestones. See
        // stage1_chapters.py's extract_chapters_grc for the full rationale
        // (APr I.4 / Top VIII.13 orthographic-divergence cases).
        outer: for (const kk of [4, 3]) {
          for (const start of [0, 1, 2, 3]) {
            if (ow.length < start + kk) continue;
            const needle = ow.slice(start, start + kk).join(' ');
            const p = joined.indexOf(needle, after);
            if (p >= 0) {
              const w = countSpacesBefore(joined, p);
              loc = owner[Math.max(0, w - start)];
              after = wstart[w];
              break outer;
            }
          }
        }
      }
    }

    if (loc === null) continue; // unmatched chapter (surfaced by the caller as a gap)
    const [col, line, word] = loc;
    const bookstart = !chapters.some((c) => c.book === book);
    chapters.push({
      book,
      chapter: chap,
      column: col,
      line: String(line),
      wordIndex: word,
      bookstart,
    });
  }

  if (extra) {
    const cols = new Set(spine.segments.map((s) => s.column));
    for (const e of extra) {
      const ref = String(e.bekker).trim();
      const m = EXPLICIT_BEKKER_RE.exec(ref);
      if (!m) {
        console.warn(`  chapters: bad extra bekker ${JSON.stringify(ref)}`);
        continue;
      }
      const [, column, line] = m;
      if (!cols.has(column)) {
        console.warn(`  chapters: extra column ${column} absent from spine`);
      }
      chapters.push({
        book: e.book ?? 1,
        chapter: String(e.n),
        column,
        line,
        wordIndex: 0,
        bookstart: false,
      });
    }
    chapters.sort((a, b) => {
      if (a.book !== b.book) return a.book - b.book;
      const ka = lineKeyForSort(a.column, Number(a.line));
      const kb = lineKeyForSort(b.column, Number(b.line));
      const cmp = compareRefKey3(ka, kb);
      if (cmp !== 0) return cmp;
      return a.wordIndex - b.wordIndex;
    });
    for (const c of chapters) c.bookstart = false;
    const seen = new Set<number>();
    for (const c of chapters) {
      if (!seen.has(c.book)) {
        c.bookstart = true;
        seen.add(c.book);
      }
    }
  }

  return chapters;
}

/** Python's `joined[:p].count(" ")` — the word index a char offset `p` falls
 * at in a single-space-joined word stream. */
function countSpacesBefore(joined: string, p: number): number {
  let count = 0;
  for (let i = 0; i < p; i++) {
    if (joined.charCodeAt(i) === 32) count++;
  }
  return count;
}
