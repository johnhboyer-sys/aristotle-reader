/**
 * splitDocument — partition a single DOCUMENT-SPINE ChapterFile into multiple
 * standalone chapter/book files at the Book/Chapter boundaries its heading
 * markers define (D8 heading tools → navigable parts). PURE: no I/O; returns
 * the parts, each a fully re-based ChapterFile a caller can serialize + write.
 *
 * Boundary rule (from the work's organization profile, via navRoleOf):
 *   - a row whose heading tier maps to navRole 'book' opens a NEW BOOK
 *     (book++, chapter→1);
 *   - navRole 'chapter' opens a NEW CHAPTER (chapter++);
 *   - the boundary row is the FIRST row of the part it opens;
 *   - 'heading' rows and unmarked rows stay in the current chapter;
 *   - rows before ANY boundary are book 1 / chapter 1 (a leading preface part);
 *   - a boundary on the very FIRST row just labels the first part (no bump).
 *
 * Re-basing per part: row ordinals (headers, paragraph_starts, line_splits
 * refs) become 1-based within the part; span_start/span_end re-derive from the
 * part's row count; footnotes are scoped to the part whose [ENGLISH] rows carry
 * their marker (a footnote anchored in two parts is kept in each). Ids are NOT
 * renumbered — they are stable keys and display numbers recompute, so keeping
 * them keeps every marker resolving. citation_scheme is unchanged; document
 * works carry no column_starts. Each returned file round-trips through
 * serializeChapterFile / parseChapterFile.
 *
 * Only valid for document-spine files (documentOrdinalAddress throws otherwise).
 */

import type { CitationScheme } from '../citation/types';
import { getScheme } from '../citation/registry';
import type { ChapterFile, ChapterFileMeta, Footnote, HeaderMark } from '../chapterfile';
import type { WorkProfile } from '../works/profile';
import { navRoleOf } from '../works/profile';
import { documentOrdinalAddress } from './autosave';

export interface DocumentPart {
  book: number;
  chapter: number;
  file: ChapterFile;
}

/** `{^<id>:` footnote-marker opener in a raw [ENGLISH] row string. */
const MARKER_RE = /\{\^(\d+):/g;

/** Footnote ids whose markers appear in the given [ENGLISH] row strings. */
function markerIdsInLines(lines: string[]): Set<number> {
  const ids = new Set<number>();
  for (const line of lines) {
    for (const m of line.matchAll(MARKER_RE)) ids.add(Number(m[1]));
  }
  return ids;
}

/** Trailing integer of an ordinal raw address ("¶5" / "5" → 5); null if none. */
function ordinalOf(raw: string): number | null {
  const m = /(\d+)$/.exec(raw);
  return m ? Number(m[1]) : null;
}

/** One contiguous [start, end) row range and the (book, chapter) it becomes. */
interface Segment {
  book: number;
  chapter: number;
  start: number; // inclusive, 0-based
  end: number; // exclusive, 0-based
}

function segment(file: ChapterFile, profile: WorkProfile): Segment[] {
  const rowCount = file.greekLines.length;
  const levelByRow = new Map<number, number>();
  for (const h of file.meta.headers ?? []) levelByRow.set(h.row, h.level);

  const navAt = (ordinal: number): 'book' | 'chapter' | 'heading' | null => {
    const level = levelByRow.get(ordinal);
    return level === undefined ? null : navRoleOf(profile, level);
  };

  const segs: Segment[] = [];
  let book = 1;
  let chapter = 1;
  let start = 0;
  // Row 0 (ordinal 1) never splits — a boundary there just labels the first
  // part. Every later row that is a book/chapter boundary closes the run.
  for (let i = 1; i < rowCount; i++) {
    const nav = navAt(i + 1);
    if (nav === 'book' || nav === 'chapter') {
      segs.push({ book, chapter, start, end: i });
      if (nav === 'book') {
        book += 1;
        chapter = 1;
      } else {
        chapter += 1;
      }
      start = i;
    }
  }
  segs.push({ book, chapter, start, end: rowCount });
  return segs;
}

function rebase(file: ChapterFile, scheme: CitationScheme, seg: Segment): ChapterFile {
  const { book, chapter, start, end } = seg;
  const n = end - start;

  const greekLines = file.greekLines.slice(start, end);
  const englishLines = file.englishLines.slice(start, end);
  const paraSlice = file.englishParaLines?.slice(start, end);
  // serializeChapterFile omits an all-empty [ENGLISH.PARA]; only carry the
  // section when some row has paragraph text (matches autosave's own rule, so
  // the part round-trips without a phantom section).
  const englishParaLines = paraSlice?.some((l) => l.length > 0) ? paraSlice : undefined;

  const headers: HeaderMark[] = (file.meta.headers ?? [])
    .filter((h) => h.row >= start + 1 && h.row <= end)
    .map((h) => ({ row: h.row - start, level: h.level }));

  const paragraphStarts = file.meta.paragraphStarts
    ?.filter((p) => p >= start + 1 && p <= end)
    .map((p) => p - start);

  const lineSplits = file.meta.lineSplits
    ?.map((ls) => {
      const g = ordinalOf(ls.ref);
      if (g === null || g < start + 1 || g > end) return null;
      return { ref: documentOrdinalAddress(scheme, g - start).raw, offset: ls.offset };
    })
    .filter((x): x is { ref: string; offset: number } => x !== null);

  const ids = markerIdsInLines(englishLines);
  const footnotes: Footnote[] = file.footnotes.filter((f) => ids.has(f.id));

  const meta: ChapterFileMeta = {
    schemaVersion: file.meta.schemaVersion,
    work: file.meta.work,
    book,
    chapter,
    citationScheme: file.meta.citationScheme,
    spanStart: n > 0 ? documentOrdinalAddress(scheme, 1).raw : '',
    spanEnd: n > 0 ? documentOrdinalAddress(scheme, n).raw : '',
    // document works carry no column_starts; key order below mirrors
    // parseChapterFile's meta construction (round-trip self-check compares JSON).
    ...(lineSplits && lineSplits.length > 0 ? { lineSplits } : {}),
    ...(paragraphStarts && paragraphStarts.length > 0 ? { paragraphStarts } : {}),
    ...(headers.length > 0 ? { headers } : {}),
  };

  return {
    meta,
    greekLines,
    englishLines,
    ...(englishParaLines ? { englishParaLines } : {}),
    footnotes,
  };
}

/**
 * Split a document-spine ChapterFile into its Book/Chapter parts. With no
 * book/chapter markers the result is a single part {book:1, chapter:1} whose
 * content mirrors the input. An empty file yields one empty book-1/chapter-1
 * part (defensive — a well-formed document file has ≥1 row).
 */
export function splitDocument(file: ChapterFile, profile: WorkProfile): DocumentPart[] {
  const scheme = getScheme(file.meta.citationScheme);
  if (file.greekLines.length === 0) {
    return [{ book: 1, chapter: 1, file: rebase(file, scheme, { book: 1, chapter: 1, start: 0, end: 0 }) }];
  }
  return segment(file, profile).map((seg) => ({
    book: seg.book,
    chapter: seg.chapter,
    file: rebase(file, scheme, seg),
  }));
}
