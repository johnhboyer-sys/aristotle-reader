/**
 * createFreeDocument — the pure core of the corpus-free "New document…" flow
 * (workbench-design/d8-view-modes.md §6). Given a title, an optional
 * language, a segmentation unit, and the raw pasted/read text, build:
 *
 *   - the ChapterFile for the work's single document (book 1, chapter 1) —
 *     paragraph unit: blank-line blocks → rows, sentence auto-segmentation
 *     seeding `line_splits` (d8 §3); line unit: non-blank lines → rows,
 *     blank-line groups → `paragraph_starts`;
 *   - the FreeWorkRecord the library registry needs (works/freeWorks.ts).
 *
 * This module never touches storage — the dialog writes the file via
 * libraryStorage() and registers the record via registerFreeWork.
 *
 * Segment-count invariant (load-bearing): a paragraph row seeded with k
 * sentence splits is written with k+1 (empty) [ENGLISH] segments — hydration
 * (library/autosave.ts) applies "English count wins" on any ¶-count vs
 * offset-count skew, so an [ENGLISH] row left as a single empty segment would
 * have its seeded offsets silently dropped (with a drift notice) on first
 * open. The round-trip test pins this.
 */

import type { SchemeId } from '../citation/types';
import { getScheme } from '../citation/registry';
import type { ChapterFile, ChapterFileMeta, LineSplit } from '../chapterfile';
import { emptyRowDocJSON } from '../editor/schema';
import { serializeRowSegments } from '../editor/serialize';
import type { FreeWorkRecord } from '../works/freeWorks';
import { splitIntoParagraphRows, splitIntoLineRows } from './segmentDetect';
import { segmentSentences } from './sentenceSegment';

export type FreeDocumentUnit = 'lines' | 'paragraphs';

/**
 * A document-spine scheme's segmentation unit, read from the scheme's row-unit
 * CAPABILITY (never a scheme-id comparison — D2 contract). Used when filling a
 * chapter slot in an existing work, where the unit isn't chosen in a dialog but
 * follows from the work's scheme.
 */
export function documentUnitForScheme(scheme: SchemeId): FreeDocumentUnit {
  switch (getScheme(scheme).gutter.rowUnit) {
    case 'paragraph':
      return 'paragraphs';
    default:
      return 'lines';
  }
}

export interface FreeDocumentSpec {
  /** Work title (required; whitespace-trimmed). */
  title: string;
  /** Free-text original language, e.g. "Greek", "German" (optional). */
  language?: string;
  /** Row segmentation chosen in the dialog (detectUnit preselects it). */
  unit: FreeDocumentUnit;
  /** The pasted / file-read source text. */
  text: string;
}

export interface FreeDocument {
  /** Registration record for the library's free-work registry. */
  work: FreeWorkRecord;
  /** The single-document chapter file (book 1, chapter 1). */
  file: ChapterFile;
}

/**
 * A filesystem-safe work id from the title: lowercase ASCII letters/digits
 * with single-hyphen separators (diacritics folded via NFKD). A title with
 * no representable characters (e.g. an all-Greek title) falls back to
 * "document". Uniqueness against `existingIds` by numeric suffix ("-2", …).
 */
export function slugForTitle(title: string, existingIds: Iterable<string> = []): string {
  const base =
    title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'document';
  const taken = new Set(existingIds);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** One row's [ENGLISH] line: `segments` EMPTY segments joined by the
 * structural `¶` token, via the real serializer so the byte shape matches
 * what autosave itself writes. */
function emptyEnglishLine(segments: number): string {
  return serializeRowSegments(Array.from({ length: segments }, () => emptyRowDocJSON()));
}

/** Where a built chapter file lands: which work, book, chapter, and the work's
 * document-spine scheme (its segmentation unit follows from the scheme). */
export interface DocumentChapterTarget {
  workId: string;
  book: number;
  chapter: number;
  scheme: SchemeId;
  text: string;
}

/**
 * Segment raw text into a standalone ChapterFile at a given (work, book,
 * chapter). Shared by "New document…" (the work's first chapter) and
 * "Import into chapter…" (filling a Book/Chapter container slot). The
 * segmentation unit is derived from the scheme so a work stays internally
 * consistent (a paragraph work's new chapters segment as paragraphs).
 * Throws when the text yields no rows.
 */
export function buildDocumentChapterFile(target: DocumentChapterTarget): ChapterFile {
  const { workId, book, chapter, scheme, text } = target;
  const unit = documentUnitForScheme(scheme);

  let rows: string[];
  const lineSplits: LineSplit[] = [];
  let paragraphStarts: number[] | undefined;

  if (unit === 'paragraphs') {
    rows = splitIntoParagraphRows(text);
    for (let i = 0; i < rows.length; i++) {
      // Refs use the same synthetic ordinal addresses rowAddressSource emits
      // for document-spine paragraph works ("¶N" — d8 §1).
      const ref = `¶${i + 1}`;
      for (const offset of segmentSentences(rows[i])) {
        lineSplits.push({ ref, offset });
      }
    }
  } else {
    const split = splitIntoLineRows(text);
    rows = split.lines;
    // `[1]` alone carries no grouping signal (one blank-line group = the
    // whole document) — omit it, matching "absent field" semantics.
    if (split.paragraphStarts.length > 1) paragraphStarts = split.paragraphStarts;
  }

  if (rows.length === 0) {
    throw new Error('The document has no text — paste or choose a file first.');
  }

  const splitsByRow = new Map<string, number>();
  for (const s of lineSplits) splitsByRow.set(s.ref, (splitsByRow.get(s.ref) ?? 0) + 1);

  const addrOf = (n: number) => (unit === 'paragraphs' ? `¶${n}` : String(n));

  // Key order mirrors parseChapterFile's meta construction (autosave's
  // round-trip self-check compares JSON shapes).
  const meta: ChapterFileMeta = {
    schemaVersion: 1,
    work: workId,
    book,
    chapter,
    citationScheme: scheme,
    spanStart: addrOf(1),
    spanEnd: addrOf(rows.length),
    ...(lineSplits.length > 0 ? { lineSplits } : {}),
    ...(paragraphStarts ? { paragraphStarts } : {}),
  };

  return {
    meta,
    greekLines: rows,
    englishLines: rows.map((_, i) => emptyEnglishLine(1 + (splitsByRow.get(addrOf(i + 1)) ?? 0))),
    footnotes: [],
  };
}

/**
 * Build the chapter file + registration record for a corpus-free document.
 * Throws a plain-language Error when the title is blank or the text yields
 * no rows (the dialog disables Create in both cases; this is the backstop).
 */
export function createFreeDocument(
  spec: FreeDocumentSpec,
  existingIds: Iterable<string> = [],
): FreeDocument {
  const title = spec.title.trim();
  if (title.length === 0) {
    throw new Error('Give the document a title.');
  }

  // Unit → scheme (input-form branching, not scheme-id branching: `unit` is
  // the dialog's radio value; the scheme ids are assigned as data).
  const scheme: SchemeId = spec.unit === 'paragraphs' ? 'paragraph' : 'plain-line';
  const workId = slugForTitle(title, existingIds);
  const file = buildDocumentChapterFile({ workId, book: 1, chapter: 1, scheme, text: spec.text });

  const language = spec.language?.trim();
  const work: FreeWorkRecord = {
    id: workId,
    title,
    ...(language ? { language } : {}),
    scheme,
  };

  return { work, file };
}
