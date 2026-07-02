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

import { parseRow, runsOf } from '../editor/serialize';
import type { InlineRun, MarkSet } from '../editor/serialize';
import { getScheme } from '../citation/registry';
import type { WorkMeta } from '../citation/types';
import type { ChapterFile } from '../chapterfile/types';
import { rowAddress } from '../chapterfile';

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

interface BekkerLineAddr {
  page: number;
  side: 'a' | 'b';
  line: number;
}

const BEKKER_RE = /^(\d+)([ab])(\d+)$/;

function parseBekkerLineAddr(raw: string): BekkerLineAddr {
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
function stampFor(addr: BekkerLineAddr, rowIndex: number, mode: StampMode, colStart: boolean): string | null {
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

function buildBody(chapter: ChapterFile, options: Required<PandocMarkdownOptions>): { paragraph: string; footnoteIdsUsed: string[] } {
  const scheme = getScheme(chapter.meta.citationScheme);
  const useStamps = scheme.gutter.rowUnit === 'bekker-line';
  const rowCount = chapter.englishLines.length;
  const columnStarts = chapter.meta.columnStarts;

  // Per-row addresses: exact via column_starts when the file carries it
  // (rowAddress is pure segment arithmetic — any number of transitions);
  // otherwise the single-transition span heuristic for older files.
  let addresses: string[] = [];
  // 0-based row indexes that begin a new column — known exactly from
  // column_starts; null means "fall back to the line===1 heuristic".
  let transitionRows: Set<number> | null = null;
  if (useStamps) {
    if (columnStarts && columnStarts.length > 0) {
      addresses = Array.from({ length: rowCount }, (_, i) => rowAddress(chapter.meta, i + 1));
      transitionRows = new Set(columnStarts.slice(1).map((s) => s.rowIndex - 1));
    } else {
      addresses = deriveRowAddresses(chapter.meta.spanStart, chapter.meta.spanEnd, rowCount);
    }
  }

  const parts: string[] = [];
  const footnoteIdsUsed: string[] = [];

  for (let i = 0; i < rowCount; i++) {
    const raw = chapter.englishLines[i];
    if (raw.trim().length === 0) continue; // untranslated row, skipped silently

    const { markdown, footnoteIdsUsed: used } = markupToPandoc(raw);
    footnoteIdsUsed.push(...used);
    if (markdown.length === 0) continue;

    let piece = markdown;
    if (useStamps) {
      const addr = parseBekkerLineAddr(addresses[i]);
      const colStart = transitionRows !== null ? transitionRows.has(i) : addr.line === 1;
      const stamp = stampFor(addr, i, options.stampMode, colStart);
      if (stamp) piece = `${stamp} ${piece}`;
    }
    parts.push(piece);
  }

  return { paragraph: parts.join(' '), footnoteIdsUsed };
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

  const heading = buildHeading(chapter, work);
  const { paragraph, footnoteIdsUsed } = buildBody(chapter, resolved);
  const footnoteBlocks = buildFootnoteBlocks(chapter, footnoteIdsUsed);

  const sections = [heading, paragraph];
  if (footnoteBlocks.length > 0) sections.push(footnoteBlocks.join('\n\n'));

  return sections.join('\n\n') + '\n';
}
