/**
 * compile.ts — whole-work compile export (build spec §8, Phase 2).
 *
 * Pure transforms only (no I/O, no pandoc invocation — see pandoc.ts/index.ts
 * for that layer, mirroring the single-chapter split). Given every saved
 * chapter of a work (in whatever order the caller happened to read them),
 * this module:
 *
 *   1. orders them in MANIFEST order (book order per WorkMeta.books, then
 *      chapter number within a book) — never file-listing string order,
 *   2. reports gaps (books/chapters with no saved file) as one compact line,
 *   3. concatenates book/chapter headings + bodies into one Pandoc Markdown
 *      document, with footnote ids namespaced per chapter (`c<n>-<id>`) so
 *      two chapters that both used local id "1" never collide — Word then
 *      auto-numbers every native footnote sequentially through the WHOLE
 *      document (verified: pandoc's docx writer does not renumber ids itself,
 *      and a single-section document has no numRestart boundary, so the
 *      display numbers Word shows are continuous by construction; see
 *      scripts/export-harness.mjs's whole-work checks),
 *   4. supports two modes: 'english' (default manuscript) and 'bilingual'
 *      (source and translation together, per chapter), the latter laid out
 *      per `bilingualLayout`: stacked blocks (the default and original
 *      behaviour), alternating paragraphs, or a two-column table — a table
 *      being the only way docx gets row-locked parallel columns.
 *
 * The stored chapter files are NEVER mutated by any function here — every
 * function takes ChapterFile values and returns strings/data, never writes
 * back through library storage.
 */

import { getScheme } from '../citation/registry';
import type { WorkMeta } from '../citation/types';
import type { ChapterFile } from '../chapterfile/types';
import type { BilingualLayout, BilingualOrder, StampMode } from './pandocMarkdown';
import {
  assembleBilingual,
  chapterSegments,
  documentChapterSections,
  documentHeadings,
  documentRowSourceLine,
  profileOf,
  documentToPandocMarkdown,
  markupToPandoc,
  renderSegmentsGrouped,
  renderSegmentsPaired,
} from './pandocMarkdown';
import type { DocumentBook } from '../works/manifest';

export type CompileMode = 'english' | 'bilingual';

export interface CompileOptions {
  /** Bekker-ref stamping density, same knob as single-chapter export. Default 'every-5'. */
  stampMode?: StampMode;
  /** 'english' = manuscript only (default); 'bilingual' = source and translation together. */
  mode?: CompileMode;
  /**
   * How the two languages sit together in bilingual mode. UNSET means this
   * path's historical shape — 'block' (the whole chapter's Greek, then the
   * whole chapter's English) — so an export made before this option existed
   * is unchanged. See BilingualLayout.
   */
  bilingualLayout?: BilingualLayout;
  /** Which language leads in bilingual mode. Default 'original-first'. */
  bilingualOrder?: BilingualOrder;
}

export interface CompiledChapterRef {
  book: number;
  chapter: number;
}

export interface CompileGapReport {
  /** True when at least one book has zero saved chapters, or a book with some saved chapters is missing others. */
  hasGaps: boolean;
  /** One compact line per book with any gap, e.g. "Γ missing chapters 3, 7". Books fully present are omitted. Books fully absent get their own line, e.g. "Δ missing entirely". */
  lines: string[];
  /** Human summary combining "complete" ranges and gaps in one line, per the spec's example wording ("Books Α–Β complete; Γ missing chapters 3, 7"). */
  summary: string;
}

// ── ordering ─────────────────────────────────────────────────────────────

/** Rank of a book in the work's manifest order; unknown book numbers sort after all known ones, by book number. */
function bookRank(work: WorkMeta, book: number): number {
  const at = work.books.findIndex((b) => b.n === book);
  if (at >= 0) return at;
  return work.books.length + book;
}

/**
 * Sort chapters into manifest order: book order per `work.books`, then
 * chapter number ascending within a book. Stable for duplicate (book,
 * chapter) pairs (shouldn't occur — one file per chapter — but sorting
 * doesn't assume it). `keyOf` extracts the (book, chapter) pair from each
 * element — defaults to reading `.book`/`.chapter` directly (for plain
 * CompiledChapterRef[] callers, e.g. tests) so most callers don't need to
 * pass it; compileWorkMarkdown passes one that reads `.meta`.
 */
export function sortChaptersManifestOrder<T>(
  chapters: T[],
  work: WorkMeta,
  keyOf: (item: T) => CompiledChapterRef = (item) => item as unknown as CompiledChapterRef,
): T[] {
  return [...chapters].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    const ra = bookRank(work, ka.book);
    const rb = bookRank(work, kb.book);
    if (ra !== rb) return ra - rb;
    return ka.chapter - kb.chapter;
  });
}

// ── gap reporting ────────────────────────────────────────────────────────

/**
 * Build the gap notice from the set of (book, chapter) pairs actually saved,
 * given the manifest's book list. Gap detection is scoped to what's
 * DERIVABLE from saved files alone (this module has no ground-truth
 * chapter-count source per book): within a book that has at least one saved
 * chapter, any chapter number strictly between the min and max saved chapter
 * that is itself absent counts as a gap ("missing chapters 3, 7"). A book
 * with zero saved chapters is reported as missing entirely. A book whose
 * saved chapters form a contiguous run from its minimum is NOT flagged even
 * if the book plausibly has further untranslated chapters beyond the last
 * saved one — there is no way to know the true chapter count here, so this
 * intentionally under-reports at the tail rather than guessing.
 */
export function buildGapReport(present: CompiledChapterRef[], work: WorkMeta): CompileGapReport {
  const workScheme = getScheme(work.scheme);
  if (workScheme.spineSource === 'document') {
    return present.length > 0
      ? { hasGaps: false, lines: [], summary: 'Document present.' }
      : { hasGaps: true, lines: ['Document missing.'], summary: 'Document missing.' };
  }

  const byBook = new Map<number, number[]>();
  for (const p of present) {
    const list = byBook.get(p.book) ?? [];
    list.push(p.chapter);
    byBook.set(p.book, list);
  }

  const scheme = getScheme(work.scheme);

  type BookStatus = { label: string; complete: boolean; note?: string };
  const statuses: BookStatus[] = work.books.map((b) => {
    const label = scheme.bookLabel(b.n, work);
    const chapters = (byBook.get(b.n) ?? []).slice().sort((x, y) => x - y);

    if (chapters.length === 0) {
      return { label, complete: false, note: `${label} missing entirely` };
    }

    const min = chapters[0];
    const max = chapters[chapters.length - 1];
    const have = new Set(chapters);
    const missing: number[] = [];
    for (let c = min; c <= max; c++) {
      if (!have.has(c)) missing.push(c);
    }

    if (missing.length === 0) {
      return { label, complete: true };
    }
    return {
      label,
      complete: false,
      note: `${label} missing chapter${missing.length > 1 ? 's' : ''} ${missing.join(', ')}`,
    };
  });

  const lines = statuses.filter((s) => s.note).map((s) => s.note!);
  const hasGaps = lines.length > 0;

  // Build the summary in manifest order, collapsing RUNS of consecutive
  // (manifest-adjacent, not just both-complete) complete books into one
  // "Books X–Y complete" clause — collapsing non-adjacent complete books
  // (e.g. book 1 and book 7, with 5 absent books between them) would falsely
  // imply everything between them is also complete, so a run only forms
  // from books that are back-to-back in `statuses`.
  const summaryParts: string[] = [];
  let i = 0;
  while (i < statuses.length) {
    if (statuses[i].complete) {
      let j = i;
      while (j < statuses.length && statuses[j].complete) j++;
      const run = statuses.slice(i, j).map((s) => s.label);
      const rangeLabel = run.length === 1 ? run[0] : `${run[0]}–${run[run.length - 1]}`;
      summaryParts.push(`Book${run.length > 1 ? 's' : ''} ${rangeLabel} complete`);
      i = j;
    } else {
      if (statuses[i].note) summaryParts.push(statuses[i].note!);
      i++;
    }
  }

  const summary = summaryParts.length > 0 ? summaryParts.join('; ') : 'All chapters present.';

  return { hasGaps, lines, summary };
}

// ── heading (through the citation contract only) ────────────────────────

function bookHeading(book: number, work: WorkMeta): string {
  const scheme = getScheme(work.scheme);
  return `# ${scheme.bookLabel(book, work)}`;
}

/**
 * The row a document part's heading was taken FROM, or null when the part
 * opens on unmarked text (a preface). splitDocument cuts at Book/Chapter marks
 * and re-bases `headers` onto each part, so a mark on the part's first row is
 * exactly the line that supplied its heading — and must not be printed again
 * as body text.
 */
function documentHeadingRow(chapter: ChapterFile): number | null {
  return (chapter.meta.headers ?? []).some((h) => h.row === 1) ? 0 : null;
}

/** A container chapter slot's display label ("Question 2") for the export
 * heading, read defensively from the work's documentBooks (the runtime work is
 * a WorkManifest even where the type is WorkMeta). Falls back to "Chapter N". */
function documentChapterLabel(work: WorkMeta, book: number, chapter: number): string {
  const books = (work as { documentBooks?: DocumentBook[] }).documentBooks;
  const label = books?.[book - 1]?.chapters?.[chapter - 1]?.label?.trim();
  return label && label.length > 0 ? label : `Chapter ${chapter}`;
}

function chapterHeading(chapter: ChapterFile, work: WorkMeta): string {
  const scheme = getScheme(chapter.meta.citationScheme);
  const range = scheme.formatRange({
    scheme: chapter.meta.citationScheme,
    book: chapter.meta.book,
    chapter: chapter.meta.chapter,
    start: scheme.parseAddress(chapter.meta.spanStart),
    end: scheme.parseAddress(chapter.meta.spanEnd),
  });
  return `## Chapter ${chapter.meta.chapter} (${range})`;
}

/** Italic work byline, omitted for anonymous works. */
function authorByline(work: WorkMeta): string | null {
  const author = work.author.trim();
  return author.length > 0 ? `*${author}*` : null;
}

/** Insert the byline under a rendered document's existing title heading. */
function addAuthorByline(markdown: string, work: WorkMeta): string {
  const byline = authorByline(work);
  if (!byline) return markdown;
  const title = `# ${work.title}\n\n`;
  return markdown.startsWith(title) ? `${title}${byline}\n\n${markdown.slice(title.length)}` : markdown;
}

// ── Bekker stamping (shared row-address + stamp-text logic, same rules as
// single-chapter export — see pandocMarkdown.ts for the authoritative
// commentary on the column_starts vs fallback-heuristic split) ─────────────

// chapterSegments/parseBekkerLineAddr/stampFor are imported from
// pandocMarkdown.ts (exported from there specifically so this module reuses
// the single-chapter exporter's segment-derivation and stamping rules
// verbatim instead of re-deriving them — see that module's header for the
// full commentary on the column_starts-exact vs single-transition-fallback
// split, and on the segment/paragraph-grouping shape).

// ── per-chapter body rendering ───────────────────────────────────────────
//
// renderSegmentsGrouped (imported from pandocMarkdown.ts) renders a
// chapter's segments (Greek slices OR English markup — chosen via `textOf`)
// as one or more Pandoc Markdown paragraphs, with Bekker stamps and footnote
// markers, applying the split-driven paragraph grouping of design doc D6 §6:
// a paragraph break lands at every segment boundary (`seg.segment > 0`), in
// both the Greek and English blocks of bilingual mode below, keeping the two
// blocks' manuscript structure parallel (John's confirmed decision) — both
// calls below are given the SAME `segments` array (one chapterSegments call
// per chapter), so the split points are identical between blocks by
// construction. Footnote ids referenced in the ENGLISH pass are namespaced
// BEFORE `chapterSegments` runs (see below); the Greek block never carries
// footnote markers (footnotes anchor to English prose only in this app —
// Greek row text has no {^id:} syntax in the format).

/**
 * Rewrite a raw editor-markup line's `{^id:...}` footnote references to a
 * namespaced id, so ids stay unique across chapters after concatenation.
 * Only the `{^id:` opening token is rewritten (the syntax the parser reads);
 * this is textual, scoped to the footnote-ref token shape from
 * editor/serialize.ts, and is a rendering-time-only transform — the ORIGINAL
 * chapter file text this came from is never touched.
 */
function namespaceFootnoteRefs(line: string, prefix: string): string {
  return line.replace(/\{\^([^:}]*):/g, (_m, id: string) => `{^${prefix}${id}:`);
}

// ── entry point ──────────────────────────────────────────────────────────

export interface CompileWorkResult {
  markdown: string;
  gapReport: CompileGapReport;
  /** Chapters actually included, in the order they were rendered (manifest order). */
  included: CompiledChapterRef[];
}

/**
 * Compile every given chapter (already parsed) into one Pandoc Markdown
 * document. `chapters` may be given in any order and any subset (gaps are
 * fine — this is the caller's "what's on disk" list); this function orders
 * them, builds the gap report, and renders headings/bodies/footnotes.
 *
 * Footnote id namespacing: chapter N's local footnote ids are rewritten to
 * `c<index>-<id>` (index = the chapter's 1-based position in the compiled
 * order) before rendering, both in the row text and in the trailing
 * `[^id]: body` blocks — so two chapters that each used local id "1" don't
 * collide when pandoc parses the single concatenated document. This never
 * touches the stored ChapterFile objects (new strings are built from their
 * content; the objects themselves are read-only here).
 */
export function compileWorkMarkdown(
  chapters: ChapterFile[],
  work: WorkMeta,
  options: CompileOptions = {},
): CompileWorkResult {
  const resolved = {
    stampMode: options.stampMode ?? 'every-5',
    mode: options.mode ?? 'english',
    // Undefined stays undefined here and is resolved per rendering path — the
    // corpus path below defaults to 'block', the document-spine path to
    // 'alternating' (see BilingualLayout's note on historical shapes).
    bilingualLayout: options.bilingualLayout,
    bilingualOrder: options.bilingualOrder ?? ('original-first' as BilingualOrder),
  };

  const ordered = sortChaptersManifestOrder(chapters, work, (c) => ({ book: c.meta.book, chapter: c.meta.chapter }));
  const gapReport = buildGapReport(
    ordered.map((c) => ({ book: c.meta.book, chapter: c.meta.chapter })),
    work,
  );
  const workScheme = getScheme(work.scheme);

  if (workScheme.spineSource === 'document') {
    // Document-spine works honour the export mode too: 'bilingual' renders
    // source + English per unit (renderDocumentSpineBilingual) — previously
    // this branch ignored `mode` and silently produced English-only output
    // under the bilingual filename.
    const included = ordered.map((c) => ({ book: c.meta.book, chapter: c.meta.chapter }));

    // Bookless single document (no explicit containers): unchanged,
    // byte-identical. Gate on the ABSENCE of documentBooks, NOT on chapter
    // count — a container work with only one saved chapter (e.g. just after
    // "+ Book" absorbed the existing document) must still emit its Book/Chapter
    // headings, so it takes the container branch below.
    const containerBooks = (work as { documentBooks?: DocumentBook[] }).documentBooks;
    if (!containerBooks || containerBooks.length === 0) {
      const markdown =
        ordered.length > 0
          ? addAuthorByline(
              documentToPandocMarkdown(
                ordered[0],
                work,
                resolved.mode,
                resolved.bilingualLayout,
                resolved.bilingualOrder,
              ),
              work,
            )
          : [`# ${work.title}`, authorByline(work)].filter((section) => section !== null).join('\n\n') + '\n\n';
      return { markdown, gapReport, included };
    }

    // Container work (D8 Book/Chapter structure): the work title once,
    // then each chapter's body under its Book/Chapter heading. Footnote ids are
    // namespaced per chapter so two chapters' local id "1" don't collide in the
    // concatenated pandoc document (same rule as the corpus arm below).
    const docSections: string[] = [`# ${work.title}`];
    const docByline = authorByline(work);
    if (docByline) docSections.push(docByline);
    let docBook: number | null = null;
    ordered.forEach((chapter, index) => {
      if (chapter.meta.book !== docBook) {
        docBook = chapter.meta.book;
        docSections.push(`## ${workScheme.bookLabel(chapter.meta.book, work) || `Book ${chapter.meta.book}`}`);
      }
      docSections.push(`### ${documentChapterLabel(work, chapter.meta.book, chapter.meta.chapter)}`);
      const prefix = `c${index + 1}-`;
      const namespaced: ChapterFile = {
        ...chapter,
        englishLines: chapter.englishLines.map((l) => namespaceFootnoteRefs(l, prefix)),
      };
      // The marked line BECAME the heading just above, so it must not also run
      // as the first paragraph of the body — that printed "Question 2" twice
      // (three times bilingual: heading, Latin, English). In bilingual the
      // source half of that line still belongs on the page, as an italic line
      // under the English heading, or the Latin would simply vanish.
      const headingRow = documentHeadingRow(chapter);
      if (headingRow !== null && resolved.mode === 'bilingual') {
        const sourceLine = documentRowSourceLine(namespaced, headingRow);
        if (sourceLine) docSections.push(sourceLine);
      }
      const { paragraphs, footnoteIdsUsed } = documentChapterSections(
        namespaced,
        resolved.mode,
        headingRow ?? undefined,
        resolved.bilingualLayout,
        resolved.bilingualOrder,
        documentHeadings(namespaced, profileOf(work)),
      );
      if (paragraphs.length > 0) docSections.push(...paragraphs);
      // Footnote-definition blocks with the SAME namespacing as the corpus arm
      // (prefix + local id), so two chapters' local id "1" resolve distinctly.
      const used = new Set(footnoteIdsUsed);
      const fnBlocks: string[] = [];
      for (const fn of chapter.footnotes) {
        const namespacedId = `${prefix}${fn.id}`;
        if (!used.has(namespacedId)) continue;
        const bodyLines = fn.body.split('\n').map((l) => namespaceFootnoteRefs(l, prefix));
        const rendered = bodyLines.map((l) => markupToPandoc(l).markdown);
        const [first, ...rest] = rendered;
        let block = `[^${namespacedId}]: ${first}`;
        for (const line of rest) block += `\n    ${line}`;
        fnBlocks.push(block);
      }
      if (fnBlocks.length > 0) docSections.push(fnBlocks.join('\n\n'));
    });
    return { markdown: docSections.join('\n\n') + '\n', gapReport, included };

  }

  // Corpus arm: deliberately unchanged. These exports have always opened on
  // the BOOK heading; handing them a title page because the manifest happens to
  // name an author is a different change from the one asked for — a byline on
  // the imported documents, which already print their own title.
  const sections: string[] = [];
  let currentBook: number | null = null;

  ordered.forEach((chapter, index) => {
    const prefix = `c${index + 1}-`;
    if (chapter.meta.book !== currentBook) {
      currentBook = chapter.meta.book;
      sections.push(bookHeading(chapter.meta.book, work));
    }
    sections.push(chapterHeading(chapter, work));

    const scheme = getScheme(chapter.meta.citationScheme);
    const useStamps = scheme.gutter.rowUnit === 'bekker-line';

    // Footnote ids are namespaced BEFORE segment derivation (a textual
    // rewrite of `{^id:` tokens — untouched by, and unaffected by, any `¶`
    // segment delimiters already in the row), so chapterSegments sees the
    // already-namespaced markup and both the Greek and English passes below
    // share ONE segment derivation per chapter — the split points (and thus
    // the paragraph groups) are identical between the two blocks by
    // construction, which is exactly John's confirmed bilingual parity.
    const namespacedChapter: ChapterFile = {
      ...chapter,
      englishLines: chapter.englishLines.map((l) => namespaceFootnoteRefs(l, prefix)),
    };
    const segments = chapterSegments(namespacedChapter);

    // Footnote ids collected from whichever rendering path ran below.
    let footnoteIdsUsed: string[];

    const layout = resolved.bilingualLayout ?? 'block';
    if (resolved.mode === 'bilingual' && layout !== 'block') {
      // Alternating and table need matched pairs, so both sides render in one
      // walk — see renderSegmentsPaired for why zipping two independent passes
      // would mis-pair.
      const paired = renderSegmentsPaired(segments, useStamps, resolved.stampMode);
      footnoteIdsUsed = paired.footnoteIdsUsed;
      const assembled = assembleBilingual(paired.pairs, layout, resolved.bilingualOrder);
      if (assembled.length > 0) sections.push(assembled.join('\n\n'));
    } else {
      // English mode, and bilingual 'block' — the original two-independent-
      // passes path, kept verbatim so the default export is unchanged.
      const english = renderSegmentsGrouped(
        segments,
        (seg) => seg.englishMarkup,
        useStamps,
        resolved.stampMode,
      );
      footnoteIdsUsed = english.footnoteIdsUsed;

      if (resolved.mode === 'bilingual') {
        const { paragraphs: greekParagraphs } = renderSegmentsGrouped(
          segments,
          (seg) => seg.greekSlice,
          useStamps,
          resolved.stampMode,
        );
        const blocks =
          resolved.bilingualOrder === 'translation-first'
            ? [english.paragraphs, greekParagraphs]
            : [greekParagraphs, english.paragraphs];
        for (const block of blocks) {
          if (block.length > 0) sections.push(block.join('\n\n'));
        }
      } else if (english.paragraphs.length > 0) {
        sections.push(english.paragraphs.join('\n\n'));
      }
    }

    const used = new Set(footnoteIdsUsed);
    const footnoteBlocks: string[] = [];
    for (const fn of chapter.footnotes) {
      const namespacedId = `${prefix}${fn.id}`;
      if (!used.has(namespacedId)) continue;
      const bodyLines = fn.body.split('\n').map((l) => namespaceFootnoteRefs(l, prefix));
      const rendered = bodyLines.map((l) => markupToPandoc(l).markdown);
      const [first, ...rest] = rendered;
      let block = `[^${namespacedId}]: ${first}`;
      for (const line of rest) block += `\n    ${line}`;
      footnoteBlocks.push(block);
    }
    if (footnoteBlocks.length > 0) sections.push(footnoteBlocks.join('\n\n'));
  });

  const markdown = sections.join('\n\n') + '\n';
  return {
    markdown,
    gapReport,
    included: ordered.map((c) => ({ book: c.meta.book, chapter: c.meta.chapter })),
  };
}
