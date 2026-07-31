/**
 * pandocMarkdown.ts — pure transform: (parsed ChapterFile, WorkMeta) →
 * Pandoc-flavored Markdown string. No I/O, no pandoc invocation (see
 * pandoc.ts for that). See the export deliverable spec for the exact rules;
 * summarized here at each section.
 *
 * Row markup reuse: englishLines[i]/footnote bodies are raw one-line markup
 * strings in the SAME syntax the editor uses (workbench/src/lib/editor/serialize.ts:
 * **bold**, *italic*, ++underline++, {grc:...}, {^id:phrase}, backslash
 * escapes). We reuse `parseRow` + `runsOf` to get the same InlineRun[] model
 * the editor already round-trips, then re-render those runs as Pandoc
 * Markdown instead of re-parsing the syntax ourselves — one source of truth
 * for what the markup MEANS, two renderers (editor markup, Pandoc markup).
 */

import {
  parseRow,
  parseRowSegments,
  runsOf,
  serializeRow,
  stripFootnoteMarkupLine,
  decodeParaLine,
} from '../editor/serialize';
import type { InlineRun, MarkSet } from '../editor/serialize';
import { docFromJSON } from '../editor/schema';
import { getScheme } from '../citation/registry';
import type { WorkMeta } from '../citation/types';
import type { ChapterFile } from '../chapterfile/types';
import { isValidSplitOffset, rowAddress } from '../chapterfile';

export type StampMode = 'every-line' | 'every-5' | 'columns';

export interface PandocMarkdownOptions {
  /** Bekker-ref stamping density. Default 'every-5'. */
  stampMode?: StampMode;
}

// ── Bekker ref arithmetic, scoped to export stamping ────────────────────────
//
// PREFERRED PATH: when the chapter file carries frontmatter `column_starts`
// (files saved since the field was added), every row's address is derived
// EXACTLY via chapterfile's `rowAddress` — correct for any number of column
// transitions, and column-transition rows are known explicitly (a new column
// need not start at line 1).
//
// FALLBACK (older files without column_starts): a small LOCAL parser here,
// scoped strictly to Bekker-line address walking for stamping, that treats
// "1041a6" as page/side/line exactly as every other module in this codebase
// already does textually (chapterfile frontmatter, the gutter, the fixture
// data). citation/bekker.ts's parsed structs are deliberately NOT exported
// outside citation/ (see workbench-design/d2-citation-schemes.md's "opaque
// raw strings outside citation/" rule), and this module does not own
// citation/, so it cannot add a shared walker there.
//
// KNOWN LIMITATION of the fallback (documented — not silently wrong): with
// only (spanStart, spanEnd, rowCount) and no per-column line-count table, a
// chapter that spans MORE than one column transition (e.g. 1041a.. ->
// 1041b.. -> 1042a..) cannot be exactly reconstructed line-by-line. The
// fallback handles at most one transition (a->b, or a page rollover) exactly
// by solving for the split point. Anything wider throws a clear, diagnosable
// error rather than mis-stamping silently — resaving the chapter in the app
// stamps column_starts and removes the limitation.

// Exported (not just used internally) so compile.ts — the whole-work
// compiler, which stamps each chapter's rows with the exact same rules —
// reuses this single implementation instead of re-deriving it.
export interface BekkerLineAddr {
  page: number;
  side: 'a' | 'b';
  line: number;
}

const BEKKER_RE = /^(\d+)([ab])(\d+)$/;

export function parseBekkerLineAddr(raw: string): BekkerLineAddr {
  const m = BEKKER_RE.exec(raw);
  if (!m) throw new Error(`pandocMarkdown: not a Bekker line address: ${JSON.stringify(raw)}`);
  return { page: Number(m[1]), side: m[2] as 'a' | 'b', line: Number(m[3]) };
}

function formatBekkerLineAddr(addr: BekkerLineAddr): string {
  return `${addr.page}${addr.side}${addr.line}`;
}

function nextColumn(addr: BekkerLineAddr): { page: number; side: 'a' | 'b' } {
  return addr.side === 'a' ? { page: addr.page, side: 'b' } : { page: addr.page + 1, side: 'a' };
}

/**
 * FALLBACK heuristic for files without frontmatter `column_starts`: derive
 * the Bekker line address of each of `rowCount` consecutive rows, running
 * from `spanStart` through `spanEnd` inclusive. See module header for the
 * single-transition limitation (and its multi-transition diagnostic throw).
 * Files WITH column_starts never come through here — buildBody derives their
 * addresses exactly via chapterfile's rowAddress.
 */
export function deriveRowAddresses(spanStart: string, spanEnd: string, rowCount: number): string[] {
  if (rowCount <= 0) return [];
  const start = parseBekkerLineAddr(spanStart);
  const end = parseBekkerLineAddr(spanEnd);

  if (start.page === end.page && start.side === end.side) {
    // Single column: straightforward run of consecutive line numbers.
    if (end.line - start.line + 1 !== rowCount) {
      throw new Error(
        `pandocMarkdown: span ${spanStart}-${spanEnd} implies ${end.line - start.line + 1} row(s) but chapter has ${rowCount}`,
      );
    }
    const out: string[] = [];
    for (let i = 0; i < rowCount; i++) out.push(formatBekkerLineAddr({ ...start, line: start.line + i }));
    return out;
  }

  // Exactly one column transition: the first `k` rows finish out the start
  // column (lines start.line..start.line+k-1), then the remaining rows begin
  // the next column at line 1 and run through end.line. This is fully
  // determined by rowCount and end.line alone: k = rowCount - end.line.
  const nc = nextColumn(start);
  if (nc.page === end.page && nc.side === end.side) {
    const k = rowCount - end.line;
    if (k < 1) {
      throw new Error(
        `pandocMarkdown: span ${spanStart}-${spanEnd} over ${rowCount} row(s) doesn't leave room for the first column (need at least 1 row before the ${nc.page}${nc.side} transition)`,
      );
    }
    const out: string[] = [];
    for (let i = 0; i < k; i++) out.push(formatBekkerLineAddr({ ...start, line: start.line + i }));
    for (let i = 0; i < rowCount - k; i++) out.push(formatBekkerLineAddr({ page: nc.page, side: nc.side, line: 1 + i }));
    return out;
  }

  throw new Error(
    `pandocMarkdown: span ${spanStart}-${spanEnd} crosses more than one Bekker column transition — ` +
      `per-row address derivation needs a page/column line-count table that doesn't exist in the ` +
      `workbench app (Phase 1 limitation; see module header). Split the chapter or supply addresses another way.`,
  );
}

// ── stamping ─────────────────────────────────────────────────────────────

/**
 * The stamp text to insert immediately before row `i`'s text, or null for no
 * stamp. `colStart` says whether this row begins a new column — taken from
 * column_starts when the file has it (a column segment can begin at any line
 * number), otherwise from the line===1 heuristic. Row 0 is never stamped
 * (the chapter heading already carries the opening ref, and row 0 IS
 * spanStart by construction).
 */
export function stampFor(addr: BekkerLineAddr, rowIndex: number, mode: StampMode, colStart: boolean): string | null {
  if (rowIndex === 0) return null; // heading already carries the opening ref
  const bare = `${addr.page}${addr.side}`;
  const full = formatBekkerLineAddr(addr);

  if (mode === 'columns') {
    return colStart ? `[${bare}]` : null;
  }
  if (mode === 'every-line') {
    return `[${full}]`;
  }
  // 'every-5': column transitions take priority (bare column ref) over the
  // multiple-of-5 case (full ref) when both coincide.
  if (colStart) return `[${bare}]`;
  if (addr.line % 5 === 0) return `[${full}]`;
  return null;
}

// ── per-row addressing, shared by both export paths ────────────────────────

/**
 * Per-row Bekker addresses for a chapter's rows, and which 0-based row
 * indexes begin a new column. Exact via `column_starts` when the file
 * carries it; the single-transition span heuristic otherwise (see the
 * module header for the fallback's documented limitation). Used internally
 * by `chapterSegments` below — the single implementation both the
 * single-chapter (`buildBody`) and whole-work (`compile.ts`) exporters
 * consume, since both render from `chapterSegments`' output.
 */
export function chapterRowAddresses(
  chapter: ChapterFile,
  rowCount: number,
): { addresses: string[]; transitionRows: Set<number> | null } {
  const columnStarts = chapter.meta.columnStarts;
  if (columnStarts && columnStarts.length > 0) {
    const addresses = Array.from({ length: rowCount }, (_, i) => rowAddress(chapter.meta, i + 1));
    const transitionRows = new Set(columnStarts.slice(1).map((s) => s.rowIndex - 1));
    return { addresses, transitionRows };
  }
  const addresses = deriveRowAddresses(chapter.meta.spanStart, chapter.meta.spanEnd, rowCount);
  return { addresses, transitionRows: null };
}

// ── paragraph segments (design doc D6 — line splits) ────────────────────────
//
// A Bekker LINE (one row) may be user-split into 1..N paragraph SEGMENTS
// sharing the row's one address (Codex's memo §6 "chapterSegments(chapter)"
// direction, adopted). Export's whole job downstream of this helper is:
// segments of one row flow within a paragraph joined by ' ' as today UNLESS
// a split forces a new paragraph group; the Bekker stamp — computed exactly
// as before, once per ROW — prefixes the first NON-EMPTY segment of that row
// and never repeats on a later segment of the same address.

export interface ChapterSegment {
  /** 0-based row index (one Bekker line) this segment belongs to. */
  rowIndex: number;
  /** 0-based segment index within the row (0 = the row's first segment). */
  segment: number;
  /** The row's raw Bekker address (shared by every segment of the row). */
  address: string;
  /** This segment's slice of the row's [GREEK] line (offsets, not copies). */
  greekSlice: string;
  /** This segment's raw [ENGLISH] markup (one parseRowSegments piece). */
  englishMarkup: string;
  /**
   * True for the first segment of the row whose ENGLISH markup is
   * non-empty (trimmed) — this is where the row's Bekker stamp belongs.
   * False for every other segment, including segment 0 when it is empty
   * and a later segment carries the row's text (the "stamp lands on the
   * later segment, once" case).
   */
  isStampSegment: boolean;
  /** Whether this ROW begins a new Bekker column (see stampFor's `colStart`); same value for every segment of the row. Always false when the scheme has no bekker-line addressing. */
  colStart: boolean;
}

/**
 * Derive per-row, per-segment views of a chapter's rows — the pure primitive
 * both `buildBody` (single-chapter) and `compile.ts` (whole-work) render
 * from. One row (`greekLines[i]`/`englishLines[i]`) yields 1 segment when
 * unsplit, or N segments when `meta.lineSplits` has (valid) offsets for that
 * row's address.
 *
 * VALIDITY, mirroring hydration's drift policy (d6 divergence E — degrade,
 * never refuse): an offset is honored only when `isValidSplitOffset` holds
 * against the file's OWN [GREEK] line for that row. A `line_splits` entry
 * for an address that doesn't parse as this scheme's addressing scheme, or
 * whose offset doesn't land at a word boundary inside the row's Greek, is
 * silently ignored here — the row exports as if unsplit (English `¶`
 * segmentation from `parseRowSegments` is honored independently and always
 * wins for how many ENGLISH segments exist; see below).
 *
 * ENGLISH VS GREEK SEGMENT COUNT: `parseRowSegments` on the [ENGLISH] row is
 * the source of truth for how many English segments exist (English `¶` count
 * wins over the frontmatter offset count, exactly like hydration — prose
 * over metadata). Greek offsets are paired positionally to those segments;
 * if there are fewer valid Greek offsets than English segments (skew, or the
 * row has no `line_splits` entry at all while English still has `¶` tokens
 * from a hand-edit), the extra trailing English segment(s) get an empty
 * `greekSlice` rather than losing English text or crashing.
 */
export function chapterSegments(chapter: ChapterFile): ChapterSegment[] {
  const rowCount = chapter.englishLines.length;
  const scheme = getScheme(chapter.meta.citationScheme);
  const useAddresses = scheme.gutter.rowUnit === 'bekker-line';
  let useParagraphRowText = false;
  switch (scheme.gutter.rowUnit) {
    case 'paragraph':
      useParagraphRowText = true;
      break;
    default:
      break;
  }
  const { addresses, transitionRows } = useAddresses
    ? chapterRowAddresses(chapter, rowCount)
    : { addresses: [] as string[], transitionRows: null as Set<number> | null };

  // Group this chapter's line_splits by address (offsets already validated
  // STRUCTURALLY and strictly ascending by the parser — see parse.ts).
  const splitsByAddress = new Map<string, number[]>();
  for (const s of chapter.meta.lineSplits ?? []) {
    const list = splitsByAddress.get(s.ref) ?? [];
    list.push(s.offset);
    splitsByAddress.set(s.ref, list);
  }

  const out: ChapterSegment[] = [];
  for (let i = 0; i < rowCount; i++) {
    const greek = chapter.greekLines[i];
    const address = useAddresses ? addresses[i] : '';
    const colStart = useAddresses
      ? transitionRows !== null
        ? transitionRows.has(i)
        : parseBekkerLineAddr(address).line === 1
      : false;
    // parseRowSegments returns PM doc JSON per segment (Slice 1's public
    // shape); re-serialize each back to the one-line editor markup string
    // this module's `markupToPandoc`/`parseRow` pipeline already consumes —
    // lossless by construction (Slice 1's round-trip guarantee), and keeps
    // export's contract as "raw editor markup in" for every row/segment.
    const englishSegments = useParagraphRowText
      ? rowEnglishSegmentsWithParaFallback(chapter, i)
      : parseRowSegments(chapter.englishLines[i]).map((doc) => serializeRow(docFromJSON(doc)));

    // Valid Greek offsets for this row (word-boundary-checked against the
    // row's OWN Greek — see module doc). Invalid/out-of-range offsets are
    // dropped, never thrown — a drifted split degrades, it doesn't refuse.
    const rawOffsets = address ? (splitsByAddress.get(address) ?? []) : [];
    const validOffsets = rawOffsets.filter((off) => isValidSplitOffset(greek, off));

    // Greek slice boundaries: 0, then each valid offset, then greek.length —
    // yields validOffsets.length + 1 slices. Paired positionally with the
    // English segments (English count wins on skew; see module doc).
    const bounds = [0, ...validOffsets, greek.length];
    const greekSliceCount = Math.max(1, bounds.length - 1);

    let stamped = false;
    for (let seg = 0; seg < englishSegments.length; seg++) {
      const englishMarkup = englishSegments[seg];
      const hasGreekSlice = seg < greekSliceCount;
      const greekSlice = hasGreekSlice ? greek.slice(bounds[seg], bounds[seg + 1]) : '';

      const isStampSegment = !stamped && rowTextNonEmpty(englishMarkup);
      if (isStampSegment) stamped = true;

      out.push({ rowIndex: i, segment: seg, address, greekSlice, englishMarkup, isStampSegment, colStart });
    }
  }
  return out;
}

function rowTextNonEmpty(markup: string): boolean {
  return markup.trim().length > 0;
}

// ── paragraph grouping (design doc D6 §6) ───────────────────────────────────
//
// Rendering a chapter's segments into Pandoc paragraphs: within a row,
// segments 1..N-1 each start a NEW paragraph group relative to segment 0
// (that's what a split IS — a paragraph boundary); consecutive ROWS with no
// split between them keep flowing into the CURRENT group, joined by ' ',
// exactly as before the feature existed. Concretely: a new group starts at
// every segment whose `segment > 0`. Groups are later joined by '\n\n';
// pieces within a group are joined by ' '.
//
// This function renders ONE side (Greek or English) of `chapterSegments`
// output — callers pick `greekSlice` or `englishMarkup` via `textOf`, so the
// exact same grouping logic drives both the English body (buildBody /
// compile.ts's English pass) and the bilingual Greek block (compile.ts).
// Exported so compile.ts reuses this single implementation for its
// Greek-block and English-block rendering, instead of re-deriving the
// grouping/stamping rules a second time.

export interface RenderedParagraphs {
  /** One entry per paragraph group, already joined with ' ' within the group.
   * A run of untranslated (blank) segments BETWEEN translated content becomes a
   * single ellipsis paragraph so gaps read as gaps instead of collapsing the
   * surrounding text together. Leading/trailing all-untranslated stretches emit
   * no ellipsis. (Greek slices are never blank, so the Greek side is unaffected.) */
  paragraphs: string[];
  footnoteIdsUsed: string[];
}

/** A blank-span placeholder: one line reading `…` marks skipped/untranslated
 * lines so the export doesn't silently run the translated fragments together. */
const ELLIPSIS_PARAGRAPH = '…';

/**
 * Render segments of one side (English markup, or Greek slices) into
 * paragraph groups, applying Bekker stamps (English/Greek both stamp — see
 * module doc; bilingual Greek carries no footnotes, so Greek-side callers
 * simply never see footnote ids because Greek text has no `{^id:}` syntax).
 * `textOf` extracts the raw one-line markup to render for a segment;
 * `useStamps` + `stampMode` control Bekker-ref stamping exactly as before.
 *
 * Untranslated segments no longer vanish silently: a maximal run of blank
 * segments sitting BETWEEN translated content is emitted as a single `…`
 * paragraph (John's export QA — a sparse chapter was collapsing distant
 * translated lines into one paragraph with no sign of the gap).
 */
export function renderSegmentsGrouped(
  segments: ChapterSegment[],
  textOf: (seg: ChapterSegment) => string,
  useStamps: boolean,
  stampMode: StampMode,
): RenderedParagraphs {
  const paragraphs: string[] = [];
  const footnoteIdsUsed: string[] = [];
  let current: string[] = []; // pieces of the flowing paragraph currently open
  let gap = false; // ≥1 blank segment seen since the last emitted content

  const flush = () => {
    if (current.length > 0) {
      paragraphs.push(current.join(' '));
      current = [];
    }
  };

  for (const seg of segments) {
    // A new segment of the SAME row (segment > 0) forces a new paragraph
    // group — that is the split, full stop. Segment 0 of every row
    // continues flowing into whatever group is currently open.
    if (seg.segment > 0) flush();

    const raw = textOf(seg);
    if (raw.trim().length === 0) {
      gap = true; // untranslated segment — remember the gap, mark it once content resumes
      continue;
    }

    const { markdown, footnoteIdsUsed: used } = markupToPandoc(raw);
    if (markdown.length === 0) {
      gap = true;
      continue;
    }
    footnoteIdsUsed.push(...used);

    let piece = markdown;
    if (useStamps && seg.isStampSegment && seg.address) {
      const addr = parseBekkerLineAddr(seg.address);
      const stamp = stampFor(addr, seg.rowIndex, stampMode, seg.colStart);
      if (stamp) piece = `${stamp} ${piece}`;
    }

    // A gap BETWEEN emitted content becomes its own ellipsis paragraph. Never
    // leads the chapter (no content emitted yet → no stray opening ellipsis).
    if (gap && (paragraphs.length > 0 || current.length > 0)) {
      flush();
      paragraphs.push(ELLIPSIS_PARAGRAPH);
    }
    gap = false;

    current.push(piece);
  }
  flush(); // a trailing gap after the last content emits nothing — correct

  return { paragraphs, footnoteIdsUsed };
}

function rowEnglishSegments(chapter: ChapterFile, rowIndex: number): string[] {
  return parseRowSegments(chapter.englishLines[rowIndex]).map((doc) => serializeRow(docFromJSON(doc)));
}

function rowEnglishSegmentsWithParaFallback(chapter: ChapterFile, rowIndex: number): string[] {
  const sentenceSegments = rowEnglishSegments(chapter, rowIndex);
  if (sentenceSegments.some((s) => s.trim().length > 0)) return sentenceSegments;

  const para = chapter.englishParaLines?.[rowIndex] ?? '';
  if (para.trim().length > 0) return [stripFootnoteMarkupLine(flattenParaLineForExport(para))];

  return [''];
}

function flattenParaLineForExport(line: string): string {
  return decodeParaLine(line).replace(/\n/g, ' ').replace(/ {2,}/g, ' ');
}

function renderMarkupPieces(markup: string[]): { markdown: string | null; footnoteIdsUsed: string[] } {
  const pieces: string[] = [];
  const footnoteIdsUsed: string[] = [];
  for (const raw of markup) {
    if (raw.trim().length === 0) continue;
    const rendered = markupToPandoc(raw);
    if (rendered.markdown.length === 0) continue;
    pieces.push(rendered.markdown);
    footnoteIdsUsed.push(...rendered.footnoteIdsUsed);
  }
  if (pieces.length === 0) return { markdown: null, footnoteIdsUsed };
  return { markdown: pieces.join(' '), footnoteIdsUsed };
}

/**
 * D8 paragraph-layer precedence for paragraph-row export: sentence layer wins
 * when any sentence segment is non-empty; otherwise the paragraph layer wins;
 * otherwise the row is untranslated.
 *
 * Footnotes are a SENTENCE-LAYER feature (D8 v1 rule — see
 * editor/serialize.ts stripFootnoteRuns): marker markup a paste or hand edit
 * left in [ENGLISH.PARA] is stripped at this export boundary — the phrase
 * renders as plain text, no `[^id]` reference is emitted, no footnote body is
 * pulled in — matching hydration, which strips the same markers on load. A
 * marker-only para line strips to nothing and counts as untranslated.
 */
function renderDocumentRow(chapter: ChapterFile, rowIndex: number): { markdown: string | null; footnoteIdsUsed: string[] } {
  const sentenceSegments = rowEnglishSegments(chapter, rowIndex);
  if (sentenceSegments.some((s) => s.trim().length > 0)) {
    return renderMarkupPieces(sentenceSegments);
  }

  const para = chapter.englishParaLines?.[rowIndex] ?? '';
  if (para.trim().length > 0) {
    return renderMarkupPieces([stripFootnoteMarkupLine(flattenParaLineForExport(para))]);
  }

  return { markdown: null, footnoteIdsUsed: [] };
}

function renderDocumentParagraphRows(chapter: ChapterFile, skipRow?: number): RenderedParagraphs {
  const paragraphs: string[] = [];
  const footnoteIdsUsed: string[] = [];
  let gap = false;

  for (let i = 0; i < chapter.englishLines.length; i++) {
    if (i === skipRow) continue; // already rendered as this part's heading
    const rendered = renderDocumentRow(chapter, i);
    if (rendered.markdown === null) {
      gap = true;
      continue;
    }

    if (gap && paragraphs.length > 0) paragraphs.push(ELLIPSIS_PARAGRAPH);
    gap = false;
    paragraphs.push(rendered.markdown);
    footnoteIdsUsed.push(...rendered.footnoteIdsUsed);
  }

  return { paragraphs, footnoteIdsUsed };
}

function renderDocumentPlainLineRows(chapter: ChapterFile, skipRow?: number): RenderedParagraphs {
  const paragraphs: string[] = [];
  const footnoteIdsUsed: string[] = [];
  const paragraphStarts = new Set(chapter.meta.paragraphStarts ?? []);
  const hardLineBreak = '\\' + '\n';
  let currentLines: string[] = [];
  let gap = false;

  const flush = () => {
    if (currentLines.length > 0) {
      paragraphs.push(currentLines.join(hardLineBreak));
      currentLines = [];
    }
  };

  for (let i = 0; i < chapter.englishLines.length; i++) {
    if (i === 0 || paragraphStarts.has(i + 1)) flush();
    if (i === skipRow) continue; // already rendered as this part's heading

    const rendered = renderDocumentRow(chapter, i);
    if (rendered.markdown === null) {
      flush();
      gap = true;
      continue;
    }

    if (gap && (paragraphs.length > 0 || currentLines.length > 0)) {
      flush();
      paragraphs.push(ELLIPSIS_PARAGRAPH);
    }
    gap = false;
    currentLines.push(rendered.markdown);
    footnoteIdsUsed.push(...rendered.footnoteIdsUsed);
  }
  flush();

  return { paragraphs, footnoteIdsUsed };
}

export function renderDocumentSpineEnglish(chapter: ChapterFile, skipRow?: number): RenderedParagraphs {
  const scheme = getScheme(chapter.meta.citationScheme);
  switch (scheme.gutter.rowUnit) {
    case 'paragraph':
      return renderDocumentParagraphRows(chapter, skipRow);
    case 'plain-line':
      return renderDocumentPlainLineRows(chapter, skipRow);
    default:
      return renderSegmentsGrouped(chapterSegments(chapter), (seg) => seg.englishMarkup, false, 'every-5');
  }
}

// ── document-spine bilingual rendering (compile mode 'bilingual') ───────────
//
// Per UNIT: the source block, then the English block — a paragraph doc
// interleaves per paragraph row (source paragraph, English paragraph); a
// plain-line doc interleaves per paragraph GROUP (paragraph_starts), keeping
// the hard-line-break treatment on both sides so the line structure survives.
// Conventions reused from the Bekker bilingual mode: the source text runs
// through the SAME markup renderer as the English (markupToPandoc — one
// escaping/styling path for both sides), and only the ENGLISH side ever
// contributes footnote ids (the source has no `{^id:}` syntax). No Bekker
// stamps — document spines have no corpus addresses. Untranslated units
// differ from the English-only mode deliberately: the source of an
// untranslated unit still renders, so EVERY maximal run of untranslated rows
// inside a unit is marked with one `…` paragraph (including a fully
// untranslated unit) instead of collapsing runs across units — the gap sits
// next to the source it belongs to.

/** Source text of row i rendered as one Pandoc piece ('' when blank). */
function renderSourceLine(chapter: ChapterFile, rowIndex: number): string {
  const raw = chapter.greekLines[rowIndex];
  if (raw.trim().length === 0) return '';
  return markupToPandoc(raw).markdown;
}

function renderDocumentParagraphRowsBilingual(chapter: ChapterFile, skipRow?: number): RenderedParagraphs {
  const paragraphs: string[] = [];
  const footnoteIdsUsed: string[] = [];

  for (let i = 0; i < chapter.englishLines.length; i++) {
    if (i === skipRow) continue; // already rendered as this part's heading
    const source = renderSourceLine(chapter, i);
    const english = renderDocumentRow(chapter, i);
    if (source.length === 0 && english.markdown === null) continue; // fully empty unit

    if (source.length > 0) paragraphs.push(source);
    if (english.markdown !== null) {
      paragraphs.push(english.markdown);
      footnoteIdsUsed.push(...english.footnoteIdsUsed);
    } else {
      paragraphs.push(ELLIPSIS_PARAGRAPH);
    }
  }

  return { paragraphs, footnoteIdsUsed };
}

function renderDocumentPlainLineRowsBilingual(chapter: ChapterFile, skipRow?: number): RenderedParagraphs {
  const paragraphs: string[] = [];
  const footnoteIdsUsed: string[] = [];
  const starts = new Set(chapter.meta.paragraphStarts ?? []);
  const hardLineBreak = '\\' + '\n';

  // Row indexes grouped by paragraph_starts (row 1 implicitly opens group 1,
  // exactly like renderDocumentPlainLineRows / the editor's chunk view).
  const groups: number[][] = [];
  for (let i = 0; i < chapter.englishLines.length; i++) {
    if (i === 0 || starts.has(i + 1)) groups.push([]);
    if (i === skipRow) continue; // already rendered as this part's heading
    groups[groups.length - 1].push(i);
  }

  for (const group of groups) {
    // Source block: the group's non-blank lines, hard-line-break joined.
    const sourceLines = group.map((i) => renderSourceLine(chapter, i)).filter((s) => s.length > 0);
    const source = sourceLines.join(hardLineBreak);

    // English block(s): translated rows flow with hard line breaks; each
    // maximal run of untranslated rows becomes one `…` paragraph (see the
    // section comment for why bilingual marks leading/trailing runs too).
    const englishBlocks: string[] = [];
    let currentLines: string[] = [];
    let pendingGap = false;
    const flush = () => {
      if (currentLines.length > 0) {
        englishBlocks.push(currentLines.join(hardLineBreak));
        currentLines = [];
      }
    };
    for (const i of group) {
      const rendered = renderDocumentRow(chapter, i);
      if (rendered.markdown === null) {
        flush();
        pendingGap = true;
        continue;
      }
      if (pendingGap) {
        englishBlocks.push(ELLIPSIS_PARAGRAPH);
        pendingGap = false;
      }
      currentLines.push(rendered.markdown);
      footnoteIdsUsed.push(...rendered.footnoteIdsUsed);
    }
    flush();
    if (pendingGap) englishBlocks.push(ELLIPSIS_PARAGRAPH);
    // A group always yields ≥1 English block (every row either adds a line or
    // ends as a pending gap → one `…`), so no empty-group special case.

    if (source.length > 0) paragraphs.push(source);
    paragraphs.push(...englishBlocks);
  }

  return { paragraphs, footnoteIdsUsed };
}

export function renderDocumentSpineBilingual(chapter: ChapterFile, skipRow?: number): RenderedParagraphs {
  const scheme = getScheme(chapter.meta.citationScheme);
  switch (scheme.gutter.rowUnit) {
    case 'paragraph':
      return renderDocumentParagraphRowsBilingual(chapter, skipRow);
    case 'plain-line':
      return renderDocumentPlainLineRowsBilingual(chapter, skipRow);
    default:
      // Unreachable for the shipped document-spine schemes (paragraph /
      // plain-line are the only two); degrade to the English-only rendering
      // rather than throw, mirroring renderDocumentSpineEnglish's default.
      return renderDocumentSpineEnglish(chapter, skipRow);
  }
}

function usesDocumentRowRenderer(scheme: ReturnType<typeof getScheme>): boolean {
  switch (scheme.gutter.rowUnit) {
    case 'paragraph':
      return true;
    case 'plain-line':
      return scheme.spineSource === 'document';
    default:
      return scheme.spineSource === 'document';
  }
}

// ── inline markup: InlineRun[] -> Pandoc markdown ───────────────────────────

const PANDOC_SPECIAL = /[\\*_[\]^~`<>&]/g;

/** Escape text for literal Pandoc markdown (outside any span). */
function escapePandocText(text: string): string {
  return text.replace(PANDOC_SPECIAL, (ch) => `\\${ch}`);
}

/** Escape text for inside a bracketed span attribute-bearing construct — same escaping as body text; Pandoc spans nest markdown normally. */
function escapePandocSpanText(text: string): string {
  return escapePandocText(text);
}

interface RenderInlineResult {
  markdown: string;
  /** Footnote ids referenced (marker order), for building the trailing [^id]: blocks. */
  footnoteIdsUsed: string[];
}

/**
 * Render InlineRun[] (the editor's parsed markup model) as Pandoc Markdown.
 * `phrase[^id]` markers go at the end of the fnRef-marked run, matching the
 * chapter markup's own "marker at phrase end" placement.
 */
function renderRuns(runs: InlineRun[]): RenderInlineResult {
  let out = '';
  const footnoteIdsUsed: string[] = [];
  // Track which fnRef id is "open" so we know when a marker closes it.
  let openFnRef: string | undefined;

  const wrap = (text: string, marks: MarkSet): string => {
    let s = escapePandocText(text);
    if (marks.bold) s = `**${s}**`;
    if (marks.italic) s = `*${s}*`;
    if (marks.underline) s = `[${s}]{.underline}`;
    if (marks.greek) s = `[${s}]{lang=el-GR}`;
    return s;
  };

  for (const run of runs) {
    if (run.kind === 'marker') {
      if (openFnRef === run.id) {
        out += `[^${run.id}]`;
        footnoteIdsUsed.push(run.id);
        openFnRef = undefined;
      }
      // A marker with no open matching fnRef run (bare `{^id:}`, anchor
      // phrase deleted) has no phrase to attach to — nothing renders; the
      // editor invariant means this shouldn't occur in a saved chapter file
      // outside of a hand-edited one, and dropping it silently here would
      // hide data loss, so we still record the reference:
      else if (run.id) {
        out += `[^${run.id}]`;
        footnoteIdsUsed.push(run.id);
      }
      continue;
    }
    if (run.text.length === 0) continue;
    if (run.marks.fnRef !== undefined) openFnRef = run.marks.fnRef;
    out += wrap(run.text, run.marks);
  }
  return { markdown: out, footnoteIdsUsed };
}

/** Parse one row's raw editor markup and render it as Pandoc Markdown. */
export function markupToPandoc(line: string): RenderInlineResult {
  const doc = parseRow(line);
  const runs = runsOf(doc);
  return renderRuns(runs);
}

// ── heading ──────────────────────────────────────────────────────────────

function buildHeading(chapter: ChapterFile, work: WorkMeta): string {
  const scheme = getScheme(chapter.meta.citationScheme);
  const bookLabel = scheme.bookLabel(chapter.meta.book, work);
  const range = scheme.formatRange({
    scheme: chapter.meta.citationScheme,
    book: chapter.meta.book,
    chapter: chapter.meta.chapter,
    start: scheme.parseAddress(chapter.meta.spanStart),
    end: scheme.parseAddress(chapter.meta.spanEnd),
  });
  // Title NOT italicized in the heading (unlike formatCitation's "*Title*").
  return `## ${work.title} ${bookLabel}.${chapter.meta.chapter} (${range})`;
}

// ── body ─────────────────────────────────────────────────────────────────

/**
 * Render a chapter's English body as one or more Pandoc paragraphs (design
 * doc D6): unsplit chapters produce exactly one paragraph, byte-identical to
 * the pre-D6 behavior; a paragraph split produces a `\n\n` boundary at the
 * split point, in both single-chapter and (via compile.ts, which shares
 * `chapterSegments`/`renderSegmentsGrouped`) whole-work exports.
 */
function buildBody(chapter: ChapterFile, options: Required<PandocMarkdownOptions>): { paragraphs: string[]; footnoteIdsUsed: string[] } {
  const scheme = getScheme(chapter.meta.citationScheme);
  if (usesDocumentRowRenderer(scheme)) return renderDocumentSpineEnglish(chapter);
  const useStamps = scheme.gutter.rowUnit === 'bekker-line';
  const segments = chapterSegments(chapter);
  return renderSegmentsGrouped(segments, (seg) => seg.englishMarkup, useStamps, options.stampMode);
}

// ── footnote blocks ──────────────────────────────────────────────────────

function buildFootnoteBlocks(chapter: ChapterFile, idsUsed: string[]): string[] {
  const used = new Set(idsUsed);
  const blocks: string[] = [];
  for (const fn of chapter.footnotes) {
    if (!used.has(String(fn.id))) continue; // unanchored footnote body: not referenced, skip
    const bodyLines = fn.body.split('\n');
    const rendered = bodyLines.map((l) => markupToPandoc(l).markdown);
    // Continuation lines of a multi-line footnote body are indented per
    // Pandoc's footnote-block convention (a blank-line-free "lazy" block:
    // first line unindented after the marker, subsequent lines indented).
    const [first, ...rest] = rendered;
    let block = `[^${fn.id}]: ${first}`;
    for (const line of rest) block += `\n    ${line}`;
    blocks.push(block);
  }
  return blocks;
}

// ── entry point ──────────────────────────────────────────────────────────

/**
 * Transform a parsed ChapterFile into Pandoc-flavored Markdown, ready to feed
 * `pandoc -f markdown -t docx`. Pure — no I/O.
 */
export function chapterToPandocMarkdown(chapter: ChapterFile, work: WorkMeta, options: PandocMarkdownOptions = {}): string {
  const resolved: Required<PandocMarkdownOptions> = { stampMode: options.stampMode ?? 'every-5' };
  const scheme = getScheme(chapter.meta.citationScheme);
  if (scheme.spineSource === 'document') return documentToPandocMarkdown(chapter, work);

  const heading = buildHeading(chapter, work);
  const { paragraphs, footnoteIdsUsed } = buildBody(chapter, resolved);
  const footnoteBlocks = buildFootnoteBlocks(chapter, footnoteIdsUsed);

  // An all-empty chapter still emits one (empty) paragraph, matching the
  // pre-D6 shape (md.split('\n\n')[1] === '' in that case).
  const sections = [heading, ...(paragraphs.length > 0 ? paragraphs : [''])];
  if (footnoteBlocks.length > 0) sections.push(footnoteBlocks.join('\n\n'));

  return sections.join('\n\n') + '\n';
}

/**
 * Whole document for a document-spine work. `mode` mirrors compile.ts's
 * CompileMode (single-chapter export always passes 'english'; the whole-work
 * compile dialog passes its selected mode): 'bilingual' interleaves source
 * and English per unit — see renderDocumentSpineBilingual.
 */
/**
 * A single document-spine chapter's rendered body paragraphs + the footnote
 * ids they reference, WITHOUT any title/heading or footnote-definition blocks.
 * The reusable core of documentToPandocMarkdown; a multi-chapter document work
 * composes several of these under its own Book/Chapter headings, building the
 * footnote-definition blocks itself so it can namespace ids across chapters
 * (compile.ts). Selecting english vs bilingual is the only mode logic here.
 */
export function documentChapterSections(
  chapter: ChapterFile,
  mode: 'english' | 'bilingual' = 'english',
  skipRow?: number,
): { paragraphs: string[]; footnoteIdsUsed: string[] } {
  const { paragraphs, footnoteIdsUsed } =
    mode === 'bilingual'
      ? renderDocumentSpineBilingual(chapter, skipRow)
      : renderDocumentSpineEnglish(chapter, skipRow);
  return { paragraphs, footnoteIdsUsed };
}

/**
 * The SOURCE text of one row, rendered as an italic line — the second half of a
 * bilingual heading. The compiled heading carries the translation ("Question
 * 2"); this keeps the line the translator actually marked ("Quaestio 2") on the
 * page under it, instead of dropping source text on the floor.
 */
export function documentRowSourceLine(chapter: ChapterFile, rowIndex: number): string | null {
  const source = renderSourceLine(chapter, rowIndex);
  return source.length > 0 ? `*${source}*` : null;
}

/**
 * Strip the language spans from compiled markdown, for an export whose
 * deliverable IS the markdown file.
 *
 * `[τὸ κατὰ παντὸς]{lang=el-GR}` exists so pandoc tags that run as Greek in
 * Word — it does the job and then disappears. Read as markdown, it is noise
 * wrapped around every Greek phrase. Only the language attribute goes: the
 * `{.underline}` span still carries editorial meaning that plain text cannot.
 *
 * Safe to do textually: renderRuns escapes `[` and `]` in the user's own text
 * (PANDOC_SPECIAL), so an UNescaped bracketed span is always one we emitted.
 * Runs until stable, since spans nest (Greek inside an underline).
 */
export function stripLanguageSpans(markdown: string): string {
  // The leading group keeps an ESCAPED bracket from opening a span: a literal
  // "\[" in the user's own prose is text, not markup we emitted.
  const LANG_SPAN = /(^|[^\\])\[((?:\\.|[^\]\\])*)\]\{lang=[A-Za-z-]+\}/g;
  let out = markdown;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = out.replace(LANG_SPAN, '$1$2');
    if (next === out) break;
    out = next;
  }
  return out;
}

export function documentToPandocMarkdown(
  chapter: ChapterFile,
  work: WorkMeta,
  mode: 'english' | 'bilingual' = 'english',
): string {
  const { paragraphs, footnoteIdsUsed } = documentChapterSections(chapter, mode);
  const footnoteBlocks = buildFootnoteBlocks(chapter, footnoteIdsUsed);
  const sections = [`# ${work.title}`, ...(paragraphs.length > 0 ? paragraphs : [''])];
  if (footnoteBlocks.length > 0) sections.push(footnoteBlocks.join('\n\n'));
  return sections.join('\n\n') + '\n';
}
