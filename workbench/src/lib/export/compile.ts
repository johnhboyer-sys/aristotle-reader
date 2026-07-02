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
 *      (Greek block, Bekker-stamped, then the English block, per chapter —
 *      stacked, not interleaved; docx cannot do row-locked parallel columns).
 *
 * The stored chapter files are NEVER mutated by any function here — every
 * function takes ChapterFile values and returns strings/data, never writes
 * back through library storage.
 */

import { getScheme } from '../citation/registry';
import type { WorkMeta } from '../citation/types';
import type { ChapterFile } from '../chapterfile/types';
import { rowAddress } from '../chapterfile';
import type { BekkerLineAddr, StampMode } from './pandocMarkdown';
import { markupToPandoc, deriveRowAddresses, parseBekkerLineAddr, stampFor } from './pandocMarkdown';

export type CompileMode = 'english' | 'bilingual';

export interface CompileOptions {
  /** Bekker-ref stamping density, same knob as single-chapter export. Default 'every-5'. */
  stampMode?: StampMode;
  /** 'english' = manuscript only (default); 'bilingual' = Greek block + English block per chapter. */
  mode?: CompileMode;
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

// ── Bekker stamping (shared row-address + stamp-text logic, same rules as
// single-chapter export — see pandocMarkdown.ts for the authoritative
// commentary on the column_starts vs fallback-heuristic split) ─────────────

// BekkerLineAddr/parseBekkerLineAddr/stampFor are imported from
// pandocMarkdown.ts (exported from there specifically so this module reuses
// the single-chapter exporter's stamping rules verbatim instead of
// re-deriving them — see that module's header for the full commentary on
// the column_starts-exact vs single-transition-fallback split).

/** Per-row Bekker addresses for one chapter's rows, and which 0-based row indexes begin a new column. Exact via column_starts when present; single-transition fallback heuristic otherwise (same limitation as pandocMarkdown.ts). */
function chapterRowAddresses(chapter: ChapterFile, rowCount: number): { addresses: string[]; transitionRows: Set<number> | null } {
  const columnStarts = chapter.meta.columnStarts;
  if (columnStarts && columnStarts.length > 0) {
    const addresses = Array.from({ length: rowCount }, (_, i) => rowAddress(chapter.meta, i + 1));
    const transitionRows = new Set(columnStarts.slice(1).map((s) => s.rowIndex - 1));
    return { addresses, transitionRows };
  }
  const addresses = deriveRowAddresses(chapter.meta.spanStart, chapter.meta.spanEnd, rowCount);
  return { addresses, transitionRows: null };
}

// ── per-chapter body rendering ───────────────────────────────────────────

/**
 * Render one chapter's row text (Greek or English lines) as a single Pandoc
 * Markdown paragraph, with Bekker stamps and footnote markers. Footnote ids
 * referenced in the ENGLISH pass are namespaced by the caller (compileWork)
 * before this function is invoked in the bilingual English block; the Greek
 * block never carries footnote markers (footnotes anchor to English prose
 * only in this app — Greek row text has no {^id:} syntax in the format).
 */
function renderRowsParagraph(
  lines: string[],
  addresses: string[],
  transitionRows: Set<number> | null,
  useStamps: boolean,
  stampMode: StampMode,
): { paragraph: string; footnoteIdsUsed: string[] } {
  const parts: string[] = [];
  const footnoteIdsUsed: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim().length === 0) continue;
    const { markdown, footnoteIdsUsed: used } = markupToPandoc(raw);
    footnoteIdsUsed.push(...used);
    if (markdown.length === 0) continue;
    let piece = markdown;
    if (useStamps) {
      const addr = parseBekkerLineAddr(addresses[i]);
      const colStart = transitionRows !== null ? transitionRows.has(i) : addr.line === 1;
      const stamp = stampFor(addr, i, stampMode, colStart);
      if (stamp) piece = `${stamp} ${piece}`;
    }
    parts.push(piece);
  }
  return { paragraph: parts.join(' '), footnoteIdsUsed };
}

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
  const resolved: Required<CompileOptions> = {
    stampMode: options.stampMode ?? 'every-5',
    mode: options.mode ?? 'english',
  };

  const ordered = sortChaptersManifestOrder(chapters, work, (c) => ({ book: c.meta.book, chapter: c.meta.chapter }));
  const gapReport = buildGapReport(
    ordered.map((c) => ({ book: c.meta.book, chapter: c.meta.chapter })),
    work,
  );

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
    const rowCount = chapter.englishLines.length;
    const { addresses, transitionRows } = useStamps
      ? chapterRowAddresses(chapter, rowCount)
      : { addresses: [], transitionRows: null };

    if (resolved.mode === 'bilingual') {
      const { paragraph: greekParagraph } = renderRowsParagraph(
        chapter.greekLines,
        addresses,
        transitionRows,
        useStamps,
        resolved.stampMode,
      );
      if (greekParagraph.length > 0) sections.push(greekParagraph);
    }

    const namespacedEnglish = chapter.englishLines.map((l) => namespaceFootnoteRefs(l, prefix));
    const { paragraph: englishParagraph, footnoteIdsUsed } = renderRowsParagraph(
      namespacedEnglish,
      addresses,
      transitionRows,
      useStamps,
      resolved.stampMode,
    );
    if (englishParagraph.length > 0) sections.push(englishParagraph);

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
