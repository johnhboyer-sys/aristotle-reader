// pdf-import/emit.ts
//
// Phase 4A: emission — turn the Phase-1/2/3 per-page analyses (gutter tics,
// divisions, footnotes) into a tagged translation-file body that
// parseTranslationFile consumes unchanged.
//
// The model. Emission walks the pages in order and rebuilds a single flowing
// text stream out of the BODY lines (everything that is not furniture, not a
// division heading, not a captured title, not the footnote block):
//
//   - Tags. A chapter division becomes `{b.c}` immediately before the first
//     body word of the chapter (same forward target as the Phase-2 §7b
//     anchor rule); a book heading emits nothing itself (it only sets b);
//     titles go to a separate `titles` map keyed "b.c" (never into the
//     stream — the format has no title syntax, and inventing one would
//     corrupt alignment). A gutter tic becomes a tag at its ANCHOR word:
//     full-form → `{<page><col>}` (line 1) or `{<page><col><L>}` (the
//     Phase-4A grammar extension); bare → `{L}`. Tics the audit refused to
//     trust (non-monotonic, unmarked-roll, position-unresolved*,
//     anchor-unresolved) are never emitted — counted per flag in the report;
//     off-cadence and anchor-forwarded tics ARE emitted (printed truth; the
//     forwarded anchor is the designed binding).
//   - Footnotes. Each PAIRED body marker's printed digits are replaced in
//     place by `[^label]` (glued after the word/punct they abut); the notes
//     become a sentinel-delimited definitions block appended after the body
//     (Phase-3 §B1/AM2), labels scoped by the Phase-3 verdict. An UNMATCHED
//     marker's digits stay verbatim in the body (never turned into a
//     [^label] on a flagged guess) and are reported.
//   - Paragraphs. The app renders EVERY newline as a paragraph break (the
//     Lennox defect class), so the body carries newlines ONLY at real
//     paragraph boundaries: a line opening 2–8 columns past the page's
//     body-left margin starts a paragraph (Reeve indents +4); division
//     boundaries start one; everything else joins with a single space,
//     seamlessly across page breaks.
//   - Hyphenation. Line-end hyphens are resolved HERE (spec §3.4's safe
//     default): the alternative — emitting `frag-\nfrag` for the
//     ImportDialog dehyphenate pass — provably leaks bare newlines into the
//     body (dehyphenate is skipped entirely when the dictionary fails to
//     load, and its site regex requires the continuation to start with a
//     letter, which an inserted tag breaks), and every leaked newline
//     renders as a bogus paragraph break. So: previous line ends
//     /[A-Za-z]-$/ → join directly; drop the hyphen when the fragment
//     starts lowercase (compositor break), keep it when uppercase/other
//     (likely lexical compound). Counted in report.dehyphenation; the
//     ImportDialog's spellcheck queue still runs downstream and can catch a
//     wrongly fused word.
//   - Display blocks (the Categories-4 table case). A body line whose
//     trimmed content has <3 alphabetic chars OR an internal run of ≥4
//     spaces is display-shaped (same predicate as Phase-3 AM1); a bounded
//     run of them (≥2 lines, or a single line with a wide internal run)
//     is a DISPLAY BLOCK: each line becomes its own paragraph (internal
//     multi-space collapsed to a single space — HTML collapses spaces
//     anyway; line structure is what's preserved), tics anchored on them
//     stay bound but gain the report flag `display-block-anchor`, and the
//     block is recorded in report.displayBlocks for hand review.
//
// No I/O, no Tauri imports. The orchestrator (convertLayoutExtraction in
// index.ts) threads the Phase-1/2/3 state across pages and hands the
// per-page bundles here.

import type { Page } from './pages';
import type { PageScan, Tic } from './gutter';
import type { Division, DivisionState } from './divisions';
import type { PageFootnotes, FootnoteState, FootnoteNote, ScopeKind } from './footnotes';
import { computeNoteBlockStart } from './footnotes';
import { ticSpanOnLine, isDisplayShapedLine } from './line-shape';

// ---------------------------------------------------------------------------
// Public shapes (spec §2)
// ---------------------------------------------------------------------------

export interface ConvertOptions {
  /** Collapsed-page fallback mode: emit only full-form tics on collapsed pages. */
  pageLevelOnly?: boolean;
}

export interface ConvertReport {
  pages: number;
  ticsEmitted: number;
  /** Suppressed tics counted by their (base) exclusion flag. */
  ticsSuppressed: { flag: string; count: number }[];
  /** Addresses from dropped-line flags (printed marks genuinely missing). */
  droppedLines: string[];
  collapsedPages: number[];
  divisions: { books: number; chapters: number; titled: number };
  footnotes: { scope: string; notes: number; markers: number; unmatched: string[] };
  displayBlocks: { page: number; lines: [number, number] }[];
  dehyphenation: { joined: number; kept: number; queued?: number };
  /** book-sequence:restart seams — multi-work input warning (§3.7). */
  seams: string[];
  /** Full flag histogram, for the honest summary. */
  flags: Record<string, number>;
}

export interface ConvertSuccess {
  ok: true;
  /** Body with {tags} + [^labels] + \n\n paragraph breaks + trailing footnote block. */
  tagged: string;
  /** 'b.c' -> chapter title, verbatim. */
  titles: Record<string, string>;
  report: ConvertReport;
}

export interface ConvertRefusal {
  ok: false;
  refused: true;
  reason: string;
  scanned: { pages: number; nonEmptyPages: number };
}

export interface ConvertNeedsChoice {
  ok: false;
  needsChoice: true;
  collapsedPages: number[];
}

export type ConvertResult = ConvertSuccess | ConvertRefusal | ConvertNeedsChoice;

/** One page's Phase-1/2/3 analyses, threaded by convertLayoutExtraction. */
export interface PageBundle {
  page: Page;
  scan: PageScan;
  divisions: Division[];
  footnotes: PageFootnotes;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// §3.3: a body line opening indented past bodyLeft by this window starts a
// NEW paragraph. Reeve's paragraph indent is +4; block quotes sit at ≤ +11
// and must NOT split the paragraph, so the ceiling stays well below them.
const PARA_INDENT_MIN = 2;
const PARA_INDENT_MAX = 8;

// §3.2: exclusion set — tics carrying any of these are never emitted (base
// flag names; the actual flags carry `:detail` suffixes). off-cadence-tic and
// anchor-forwarded-past-heading are deliberately NOT here.
const SUPPRESS_FLAGS = [
  'non-monotonic',
  'unmarked-roll',
  'position-unresolved',
  'anchor-unresolved',
  'footnote-tic-ambiguous',
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function suppressionFlag(tic: Tic): string | null {
  for (const base of SUPPRESS_FLAGS) {
    if (tic.flags.some((f) => f === base || f.startsWith(`${base}:`))) return base;
  }
  return null;
}

/** The printed tag for an emittable tic (full-form → column tag with the
 *  Phase-4A optional starting line; bare → line tag). */
function ticTagText(t: Tic): string {
  if (/[ab]/.test(t.raw)) {
    return t.line === 1 ? `{${t.column}}` : `{${t.column}${t.line}}`;
  }
  return `{${t.line}}`;
}

/** Blank a span in place — spaces, positions preserved. */
function blankSpan(line: string, span: [number, number]): string {
  return line.slice(0, span[0]) + ' '.repeat(span[1] - span[0]) + line.slice(span[1]);
}

/** Phase-3 §B1 label scoping: continuous → printed number; per-book → b.N;
 *  per-chapter → b.c.N; star/dagger glyphs are always work-level identities. */
function scopedLabel(base: string, scope: ScopeKind, book: number | null, chapter: number | null): string {
  if (base === '*' || base === '†') return base;
  if (scope === 'per-book') return `${book ?? 0}.${base}`;
  if (scope === 'per-chapter') return `${book ?? 0}.${chapter ?? 0}.${base}`;
  return base;
}

// A pending tag waiting for the next body word (a chapter tag forward-binding
// past its heading block, or a tic whose anchor crossed the page boundary).
// Chapter tags always emit before column/line tags on the same word (§3.2).
interface PendingTag {
  kind: 'chapter' | 'tic';
  text: string;
}

interface Edit {
  col: number;
  /** 0 for inserts; the replaced span's length for marker replacements. */
  len: number;
  /** Emission order at equal col: chapter tag < tic tag < marker replace. */
  prio: number;
  text: string;
}

// ---------------------------------------------------------------------------
// emitDocument
// ---------------------------------------------------------------------------

export function emitDocument(
  bundles: PageBundle[],
  divisionState: DivisionState,
  footnoteState: FootnoteState,
  collapsedPages: number[]
): ConvertSuccess {
  const titles: Record<string, string> = {};
  const paragraphs: string[] = [];
  let para = '';
  let forceNewPara = true;
  const pending: PendingTag[] = [];
  const lastBodyLeft: { recto: number | null; verso: number | null } = { recto: null, verso: null };

  let ticsEmitted = 0;
  const suppressed = new Map<string, number>();
  let joined = 0;
  let kept = 0;
  const displayBlocks: { page: number; lines: [number, number] }[] = [];
  const droppedLines: string[] = [];
  const flags = new Map<string, number>();
  const bump = (flag: string, n = 1) => flags.set(flag, (flags.get(flag) ?? 0) + n);

  // Footnotes: the scope verdict is known before emission starts (the whole
  // document has been scanned), so labels can be scoped in one pass.
  const scope: ScopeKind = footnoteState.verdict ?? 'continuous';
  const noteDefs: { label: string; text: string }[] = [];
  const noteLabel = new Map<FootnoteNote, string>();
  let pairedMarkerCount = 0;
  const unmatched: string[] = [];

  // Division audit counters + the running (book, chapter) position that
  // scoped footnote labels are minted against.
  let bookCount = 0;
  let chapterCount = 0;
  let titledCount = 0;
  let curBook: number | null = null;
  let curChapter: number | null = null;

  const flushPara = () => {
    if (para.trim().length > 0) paragraphs.push(para);
    para = '';
  };

  for (const { page, scan, divisions, footnotes: pf } of bundles) {
    // Flag bookkeeping happens for every page, emitted or blank.
    for (const f of scan.flags) {
      bump(f);
      if (f.startsWith('dropped-line:')) droppedLines.push(f.slice('dropped-line:'.length));
    }
    for (const t of scan.tics) for (const f of t.flags) bump(f);
    for (const f of pf.flags) bump(f);
    for (const d of divisions) for (const f of d.flags) bump(f);

    if (scan.side === null) continue; // fully blank page
    const lines = page.lines;
    const side = scan.side;
    const bodyLeft = scan.bodyLeft ?? lastBodyLeft[side] ?? 0;
    if (scan.bodyLeft !== null) lastBodyLeft[side] = scan.bodyLeft;

    // Everything from the earlier of the two furniture boundaries down is
    // dropped from the body (footnotes.ts re-derives its own block bounds
    // defensively; body emission must respect whichever starts first).
    const noteStart = computeNoteBlockStart(lines);
    const dropFrom = Math.min(
      scan.bottomFurnitureStartIdx ?? lines.length,
      noteStart ?? lines.length
    );

    const headingDivision = new Map<number, Division>();
    const titleLines = new Set<number>();
    for (const d of divisions) {
      headingDivision.set(d.lineIdx, d);
      if (d.titleLineIdx !== null) titleLines.add(d.titleLineIdx);
      if (d.kind === 'book') bookCount += 1;
      else {
        chapterCount += 1;
        if (d.title !== null) titledCount += 1;
      }
    }

    // --- Tic triage: suppression counts + per-anchor-line tag inserts ------
    const ticByLine = new Map<number, Tic>();
    const insertsByLine = new Map<number, Edit[]>();
    const emittedTics: Tic[] = [];
    for (const t of scan.tics) {
      ticByLine.set(t.lineIdx, t);
      const sup = suppressionFlag(t);
      if (sup) {
        suppressed.set(sup, (suppressed.get(sup) ?? 0) + 1);
        continue;
      }
      if (t.column === null || t.line === null) {
        // Defensive: an unresolved address without its flag should not exist.
        suppressed.set('position-unresolved', (suppressed.get('position-unresolved') ?? 0) + 1);
        continue;
      }
      if (t.anchorLineIdx === null || t.anchorCol === null) {
        if (t.flags.includes('anchor-forwarded-cross-page')) {
          // §7b: bind to the NEXT page's first body word.
          pending.push({ kind: 'tic', text: ticTagText(t) });
          emittedTics.push(t);
          ticsEmitted += 1;
          continue;
        }
        suppressed.set('anchor-unresolved', (suppressed.get('anchor-unresolved') ?? 0) + 1);
        continue;
      }
      const arr = insertsByLine.get(t.anchorLineIdx) ?? [];
      arr.push({ col: t.anchorCol, len: 0, prio: 1, text: `${ticTagText(t)} ` });
      insertsByLine.set(t.anchorLineIdx, arr);
      emittedTics.push(t);
      ticsEmitted += 1;
    }

    // --- Display-block detection (§3.5), on tic-blanked body lines ---------
    const isBodyLine = (i: number): boolean =>
      i !== scan.headerLineIdx &&
      i < dropFrom &&
      !headingDivision.has(i) &&
      !titleLines.has(i) &&
      !isBlank(lines[i]);
    const blankedCache = new Map<number, string>();
    const blankedLine = (i: number): string => {
      let b = blankedCache.get(i);
      if (b === undefined) {
        b = lines[i];
        if (ticByLine.has(i)) {
          const span = ticSpanOnLine(b, side);
          if (span) b = blankSpan(b, span);
        }
        blankedCache.set(i, b);
      }
      return b;
    };

    const displayLines = new Set<number>();
    let run: number[] = [];
    const closeRun = () => {
      if (run.length > 0) {
        const qualifies = run.length >= 2 || / {4,}/.test(blankedLine(run[0]).trim());
        if (qualifies) {
          for (const i of run) displayLines.add(i);
          displayBlocks.push({ page: page.index, lines: [run[0], run[run.length - 1]] });
        }
      }
      run = [];
    };
    for (let i = 0; i < Math.min(dropFrom, lines.length); i++) {
      if (!isBodyLine(i)) {
        closeRun();
        continue;
      }
      if (isDisplayShapedLine(blankedLine(i).trim())) run.push(i);
      else closeRun();
    }
    closeRun();

    for (const t of emittedTics) {
      if (t.anchorLineIdx !== null && displayLines.has(t.anchorLineIdx)) {
        bump('display-block-anchor');
      }
    }

    // --- Line walk ----------------------------------------------------------
    for (let i = 0; i < Math.min(dropFrom, lines.length); i++) {
      if (i === scan.headerLineIdx || isBlank(lines[i])) continue;

      const div = headingDivision.get(i);
      if (div) {
        forceNewPara = true;
        if (div.kind === 'chapter') {
          const key = `${div.book}.${div.chapter}`;
          pending.push({ kind: 'chapter', text: `{${key}}` });
          if (div.title !== null) titles[key] = div.title;
          curBook = div.book;
          curChapter = div.chapter;
        } else {
          curBook = div.book;
          curChapter = null;
        }
        continue;
      }
      if (titleLines.has(i)) continue; // consumed by its division

      // Body line.
      const blanked = blankedLine(i);
      const firstCol = blanked.search(/\S/);
      const edits: Edit[] = [];

      // Paired footnote markers on this line: printed digits → [^label].
      for (const pr of pf.pairs) {
        if (pr.marker.lineIdx !== i || pr.marker.col < 0) continue;
        if (pr.marker.flags.includes('footnote-star-worklevel')) continue; // running head, never body
        const label = scopedLabel(pr.label, scope, curBook, curChapter);
        noteLabel.set(pr.note, label);
        edits.push({ col: pr.marker.col, len: pr.marker.raw.length, prio: 2, text: `[^${label}]` });
        pairedMarkerCount += 1;
      }

      // Tic tags anchored on this line.
      for (const ins of insertsByLine.get(i) ?? []) edits.push(ins);

      // Pending forward-bound tags land on this line's first word — chapter
      // tags first, then carried tic tags (§3.2's emission order).
      if (pending.length > 0) {
        for (const p of pending) {
          edits.push({ col: firstCol, len: 0, prio: p.kind === 'chapter' ? 0 : 0.5, text: `${p.text} ` });
        }
        pending.length = 0;
      }

      // Apply right-to-left so earlier columns stay valid; the sort is
      // stable, so equal (col, prio) keeps insertion order.
      edits.sort((a, b) => a.col - b.col || a.prio - b.prio);
      let rendered = blanked;
      for (let k = edits.length - 1; k >= 0; k--) {
        const e = edits[k];
        rendered = rendered.slice(0, e.col) + e.text + rendered.slice(e.col + e.len);
      }
      const text = rendered.trim();
      if (text.length === 0) continue;

      if (displayLines.has(i)) {
        // §3.5: each display line is its own paragraph, internal multi-space
        // collapsed (HTML collapses runs anyway — line structure is the
        // preserved thing), content otherwise verbatim.
        flushPara();
        paragraphs.push(text.replace(/ {2,}/g, ' '));
        forceNewPara = true;
        continue;
      }

      const indent = firstCol - bodyLeft;
      const paraIndent = indent >= PARA_INDENT_MIN && indent <= PARA_INDENT_MAX;
      if (forceNewPara || paraIndent) {
        flushPara();
        para = text;
        forceNewPara = false;
      } else if (para.length === 0) {
        para = text;
      } else if (/[A-Za-z]-$/.test(para)) {
        // §3.4 (converter-joins route): hyphen at line end. Case-decide on
        // the RAW fragment's first character (an inserted tag never starts a
        // line's raw text — anchors hyphen-skip past fragments).
        const fragFirst = blanked.trim().charAt(0);
        if (/[a-z]/.test(fragFirst)) {
          para = para.slice(0, -1) + text; // compositor break: drop hyphen
          joined += 1;
        } else {
          para = para + text; // likely lexical compound: keep hyphen
          kept += 1;
        }
      } else {
        para = `${para} ${text}`;
      }
    }

    // --- This page's footnote definitions, in document order ----------------
    for (const n of pf.notes) {
      const label = noteLabel.get(n) ?? scopedLabel(n.label, scope, curBook, curChapter);
      noteDefs.push({ label, text: n.text });
    }
    for (const m of pf.unmatchedMarkers) unmatched.push(m.label);
    for (const n of pf.unmatchedNotes) unmatched.push(n.label);
  }
  flushPara();

  // Doc-level flags (division sequence audit, footnote scope machine).
  for (const f of divisionState.flags) bump(f);
  for (const f of footnoteState.flags) bump(f);

  // --- Assemble the file ----------------------------------------------------
  let tagged = paragraphs.join('\n\n');
  if (noteDefs.length > 0) {
    // Phase-3 §B1/AM2: sentinel + definitions, appended after a blank line.
    // Emission always writes the scope attribute. A note's own line breaks
    // (AM1 display lines) become ≥3-space-indented continuation lines; the
    // definition grammar has no blank-interior-line form, so newline runs
    // collapse to single continuations.
    const defs = noteDefs.map((d) => {
      const noteLines = d.text.split('\n').filter((l) => l.trim().length > 0);
      const first = `[^${d.label}]: ${noteLines[0] ?? ''}`;
      return [first, ...noteLines.slice(1).map((l) => `   ${l}`)].join('\n');
    });
    const render = footnoteState.declaredRender ? ` render=${footnoteState.declaredRender}` : '';
    tagged += `\n\n<!-- footnotes scope=${scope}${render} -->\n${defs.join('\n')}\n`;
  } else {
    tagged += '\n';
  }

  const report: ConvertReport = {
    pages: bundles.length,
    ticsEmitted,
    ticsSuppressed: [...suppressed.entries()]
      .map(([flag, count]) => ({ flag, count }))
      .sort((a, b) => (a.flag < b.flag ? -1 : 1)),
    droppedLines,
    collapsedPages,
    divisions: { books: bookCount, chapters: chapterCount, titled: titledCount },
    footnotes: { scope, notes: noteDefs.length, markers: pairedMarkerCount, unmatched },
    displayBlocks,
    dehyphenation: { joined, kept },
    seams: divisionState.flags.filter((f) => f.startsWith('book-sequence:restart')),
    flags: Object.fromEntries(flags),
  };

  return { ok: true, tagged, titles, report };
}
