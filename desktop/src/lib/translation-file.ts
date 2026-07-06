// The shared translation-file format: YAML-ish frontmatter + inline {…} tags.
// One format for BOTH the official pre-tagged catalog downloads and personal
// uploads of copyrighted translations — only `license` and provenance differ.
//
// Tag syntax (tag, one space, then the word it precedes):
//   {1.7}    chapter anchor (book.chapter)
//   {1094a}  Bekker column anchor — resets the line-number context
//   {20}     literal Bekker line number, read as "line 20 of the current column"
// Tags are the TRUE printed numbers from the source edition, never a computed
// running count. Density is always DETECTED by scanning, never trusted from a
// self-reported field, and drives how much alignment fills the gaps.
//
// The frontmatter parser is deliberately tiny: the schema is flat scalars
// only (formatVersion, work, translator, license, year, source, language,
// id), written by the app's metadata form — users never hand-author YAML.
//
// Markdown emphasis (`_x_`, `*x*`, `**x**`) is classified and stripped BEFORE
// scanTags ever runs (see scanEmphasis in emphasis.ts) — the confident spans
// are auto-resolved here; ambiguous ones fall back to their pattern-based
// default UNLESS the caller already resolved them interactively. ImportDialog
// is the interactive path: it runs the same emphasis.ts review queue used
// here (mirroring the existing dehyphenation review step) BEFORE calling
// runImport, so by the time a fresh import reaches this module every marker
// is already gone from the text. parseTranslationFile still runs the pass
// itself (idempotent — no markers left, `scanEmphasis` is a no-op) so a
// re-import of a file that was never routed through the dialog (a hand-typed
// fixture, or a previously-exported file whose markers were never reviewed
// interactively the first time) still comes out clean rather than leaking
// literal `_`/`*` into stored text.
//
// Ordering matters: scanTags computes tag offsets by walking the body and
// stripping `{tag}` syntax as it goes, so emphasis markers MUST be gone
// before scanTags runs — otherwise every tag offset after a marker would be
// off by the marker syntax's length, and Bekker/annotation offsets would be
// computed against text that still had literal `_`/`*` in it. Emphasis
// ranges themselves are then rebased through scanTags's own tag-stripping
// pass (see scanTags) so they land in the SAME final offset space as tags.

import { scanEmphasis, resolveEmphasisReviews } from './emphasis';

export type License = 'public-domain' | 'cc-by' | 'cc-by-sa' | 'user-supplied';

export interface TranslationMeta {
  formatVersion: number;
  work: string;            // must match a corpus slug; the UI enforces via dropdown
  translator: string;
  license: License;        // unrecognised/omitted → 'user-supplied' (fail restrictive)
  year?: number;
  source?: string;
  language: string;        // default 'en'
  id: string;              // auto-slugged from translator+work if omitted
  // Free-text full bibliographic citation, e.g. "Aristotle. Parts of Animals
  // I–IV. Trans. James G. Lennox. Oxford: Clarendon Press, 2001." Optional —
  // when absent, callers compose a "translator (year), source" fallback
  // (see composeCitation below) rather than leaving Copy Citation empty.
  citation?: string;
}

export interface InlineTag {
  kind: 'chapter' | 'column' | 'line';
  raw: string;             // tag text without braces, e.g. "1.7", "1094a", "20"
  offset: number;          // char offset into the CLEAN text where the tagged word begins
  book?: number;           // chapter tags
  chapter?: number;        // chapter tags
  column?: string;         // column tags, and line tags once resolved ("1094a")
  line?: number;           // line tags
  citation?: string;       // resolved Bekker citation ("1094a20") for column/line tags
}

export type TagDensity = 'exhaustive' | 'five-line-or-column' | 'chapter-only' | 'none';

// A run of confident (or user-approved) markdown emphasis, offsets into the
// SAME clean `text` as InlineTag.offset — see emphasis.ts for classification.
export interface EmphasisSpan {
  start: number;
  end: number;           // exclusive
  style: 'italic' | 'bold';
}

export interface ParsedTranslation {
  meta: Partial<TranslationMeta>;   // {} when the file has no frontmatter yet
  hasFrontmatter: boolean;
  text: string;                     // body with all tags AND emphasis markers stripped
  tags: InlineTag[];                // in document order, offsets into `text`
  emphasis: EmphasisSpan[];         // in document order, offsets into `text`
  density: TagDensity;
  warnings: string[];               // suspect tag sequences — surfaced, never auto-fixed
}

const LICENSES: License[] = ['public-domain', 'cc-by', 'cc-by-sa', 'user-supplied'];

export function slugId(translator: string, work: string): string {
  return `${translator}-${work}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── frontmatter ─────────────────────────────────────────────────────────────

function parseFrontmatter(raw: string): { meta: Partial<TranslationMeta>; body: string; has: boolean } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw, has: false };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    // Frontmatter values are single physical lines; a multiline citation typed
    // into the form is stored with escaped `\n` (see serializeFrontmatter) and
    // unescaped back here.
    meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  }
  const out: Partial<TranslationMeta> = {};
  if (meta.formatVersion) out.formatVersion = Number(meta.formatVersion);
  if (meta.work) out.work = meta.work;
  if (meta.translator) out.translator = meta.translator;
  // Fail toward the restrictive reading: anything unrecognised is user-supplied.
  out.license = LICENSES.includes(meta.license as License)
    ? (meta.license as License) : 'user-supplied';
  if (meta.year && !Number.isNaN(Number(meta.year))) out.year = Number(meta.year);
  if (meta.source) out.source = meta.source;
  out.language = meta.language || 'en';
  if (meta.id) out.id = meta.id;
  if (meta.citation) out.citation = meta.citation;
  return { meta: out, body: raw.slice(m[0].length), has: true };
}

export function serializeFrontmatter(meta: TranslationMeta): string {
  const lines = [
    '---',
    `formatVersion: ${meta.formatVersion}`,
    `work: ${meta.work}`,
    `translator: ${meta.translator}`,
    `license: ${meta.license}`,
    ...(meta.year !== undefined ? [`year: ${meta.year}`] : []),
    ...(meta.source ? [`source: "${meta.source.replace(/"/g, "'")}"`] : []),
    `language: ${meta.language}`,
    `id: ${meta.id}`,
    ...(meta.citation ? [`citation: "${meta.citation.replace(/"/g, "'").replace(/\r?\n/g, '\\n')}"`] : []),
    '---',
    '',
  ];
  return lines.join('\n');
}

/**
 * The Copy Citation / picker fallback for an import that lacks a `citation`:
 * "Translator (Year), Source" with either piece dropped if absent. Shared by
 * the ImportDialog (to pre-fill the form) and imports.ts (read-time default
 * for records — including pre-existing ones — stored without a citation).
 */
export function composeCitation(meta: Pick<TranslationMeta, 'translator' | 'year' | 'source'>): string {
  const who = meta.year ? `${meta.translator} (${meta.year})` : meta.translator;
  return meta.source ? `${who}, ${meta.source}` : who;
}

// ── inline tags ─────────────────────────────────────────────────────────────

const TAG = /\{([0-9]+\.[0-9]+|[0-9]{3,4}[ab]|[0-9]{1,2})\}[ \t]?/g;
const CHAPTER_TAG = /^[0-9]+\.[0-9]+$/;
const COLUMN_TAG = /^[0-9]{3,4}[ab]$/;

// Markdown/plain-text sources mark a paragraph break with a blank line (one
// or more), i.e. two-or-more `\n` in the raw text. The Reader's flowing-prose
// renderer (Reader.svelte's flowParts/addText) instead expects exactly ONE
// `\n` per paragraph break — it splits on `\n` and turns every piece (including
// the empty string between two adjacent `\n`s) into a `<br class="para-br">`,
// so a source's blank-line convention would render as TWO breaks per
// paragraph, doubling the vertical rhythm vs. built-in translations (whose
// pipeline-emitted text already uses the single-`\n` convention). Collapsing
// here — before tag offsets are computed — also absorbs any stray double
// blank lines in the source (e.g. Gutenberg files sometimes have two blank
// lines before a section break) into the same single paragraph break, rather
// than emitting an extra blank line's worth of gap.
const BLANK_RUN = /[ \t]*\n(?:[ \t]*\n)+[ \t]*/g;

function normalizeParagraphBreaks(body: string): string {
  return body.replace(BLANK_RUN, '\n');
}

function scanTags(body: string): { text: string; tags: InlineTag[]; warnings: string[] } {
  body = normalizeParagraphBreaks(body);
  const tags: InlineTag[] = [];
  const warnings: string[] = [];
  let clean = '';
  let last = 0;
  let column: string | null = null;
  let lastLine = 0;
  for (const m of body.matchAll(TAG)) {
    clean += body.slice(last, m.index!);
    last = m.index! + m[0].length;
    const raw = m[1];
    const offset = clean.length;
    if (CHAPTER_TAG.test(raw)) {
      const [b, c] = raw.split('.').map(Number);
      tags.push({ kind: 'chapter', raw, offset, book: b, chapter: c });
    } else if (COLUMN_TAG.test(raw)) {
      if (column !== null && columnKey(raw) <= columnKey(column)) {
        warnings.push(`column {${raw}} does not advance from {${column}} — check the source tags`);
      }
      column = raw;
      lastLine = 0;
      tags.push({ kind: 'column', raw, offset, column, line: 1, citation: `${column}1` });
    } else {
      const n = Number(raw);
      if (column === null) {
        warnings.push(`line tag {${raw}} before any column tag — ignored (no column context)`);
        continue;
      }
      if (n <= lastLine) {
        warnings.push(`line {${raw}} does not advance within ${column} (previous: ${lastLine})`);
      }
      lastLine = n;
      tags.push({ kind: 'line', raw, offset, column, line: n, citation: `${column}${n}` });
    }
  }
  clean += body.slice(last);
  return { text: clean, tags, warnings };
}

/**
 * Rebase offsets (e.g. emphasis ranges) computed against `body` — the SAME
 * pre-tag-stripped text scanTags(body) walks — into the post-strip text's
 * offset space, by replaying the identical left-to-right `{tag}` removal and
 * accumulating how much each removal shifts everything after it. Mirrors
 * scanTags' own `clean += …` accumulation exactly, so an offset that scanTags
 * would place at clean-text position P is rebased to that same P here.
 */
function rebaseThroughTagStrip(body: string, offsets: number[]): number[] {
  body = normalizeParagraphBreaks(body);
  const shifts: { at: number; amount: number }[] = [];
  let removed = 0;
  for (const m of body.matchAll(TAG)) {
    removed += m[0].length;
    shifts.push({ at: m.index! + m[0].length, amount: removed });
  }
  return offsets.map(off => {
    let shift = 0;
    for (const s of shifts) {
      if (s.at > off) break;
      shift = s.amount;
    }
    return off - shift;
  });
}

/** Bekker column sort key: 1094a < 1094b < 1095a … */
export function columnKey(col: string): number {
  const m = col.match(/^(\d{3,4})([ab])$/);
  return m ? Number(m[1]) * 2 + (m[2] === 'b' ? 1 : 0) : -1;
}

// ── density detection ───────────────────────────────────────────────────────

function detectDensity(tags: InlineTag[]): TagDensity {
  const lines = tags.filter(t => t.kind === 'line');
  const columns = tags.filter(t => t.kind === 'column');
  const chapters = tags.filter(t => t.kind === 'chapter');
  if (!lines.length && !columns.length) {
    return chapters.length ? 'chapter-only' : 'none';
  }
  if (!lines.length) return 'five-line-or-column';
  // Median gap between consecutive line numbers within a column: an
  // exhaustively-tagged source advances by 1–2, a five-line apparatus by ~5.
  const gaps: number[] = [];
  const byCol = new Map<string, number[]>();
  for (const t of [...columns, ...lines]) {
    const arr = byCol.get(t.column!) ?? [];
    arr.push(t.line!);
    byCol.set(t.column!, arr);
  }
  for (const ns of byCol.values()) {
    const sorted = [...ns].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  }
  if (!gaps.length) return 'five-line-or-column';
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return median <= 2 ? 'exhaustive' : 'five-line-or-column';
}

// ── entry point ─────────────────────────────────────────────────────────────

/**
 * The exact text scanEmphasis will run over inside parseTranslationFile:
 * frontmatter stripped, paragraph breaks normalized. ImportDialog's review
 * queue calls this (rather than passing `file.text` straight to scanEmphasis)
 * so its review-item indices are guaranteed to match the indices
 * parseTranslationFile's OWN internal scanEmphasis call produces later —
 * scanEmphasis is a pure function, so identical input text is what makes the
 * dialog's collected choices replay correctly (see parseTranslationFile).
 */
export function emphasisScanInput(raw: string): string {
  return normalizeParagraphBreaks(parseFrontmatter(raw).body);
}

/**
 * `emphasisChoices` (marker-review index → 'keep'/'remove') carries the
 * decisions ImportDialog's interactive emphasis review queue already
 * collected — scanEmphasis is a pure function of the input text, so re-
 * running it here on the SAME raw body reproduces the identical review-item
 * indices the dialog saw, and the user's choices replay exactly rather than
 * falling back to defaults. Omitted (undefined) for any caller that hands
 * this function text that never went through the dialog's review step (a
 * re-import of a file whose markers were never reviewed interactively, a test
 * fixture, or a hand-authored file) — suspicious spans then auto-resolve to
 * scanEmphasis's own pattern-based default rather than fail or leave literal
 * markers in stored text. This is what makes "re-import an existing
 * translation" safe without forcing a second review pass, at the
 * acknowledged cost that a file WITH markers that change classification
 * between versions could shift annotation offsets on that translation —
 * flagged in the import summary, not silently absorbed.
 */
export function parseTranslationFile(
  raw: string,
  emphasisChoices?: Map<number, 'keep' | 'remove'>,
): ParsedTranslation {
  const { meta, body: rawBody, has } = parseFrontmatter(raw);
  const body = normalizeParagraphBreaks(rawBody);
  const emphResult = scanEmphasis(body);
  let emphText = emphResult.text;      // {tag} syntax still present, emphasis markers gone
  let emphRanges = emphResult.ranges;  // offsets into emphText
  if (emphResult.reviewItems.length) {
    const choices = emphasisChoices ?? new Map<number, 'keep' | 'remove'>(
      emphResult.reviewItems.map(it => [it.index, it.defaultKeep ? 'keep' : 'remove']),
    );
    const resolved = resolveEmphasisReviews(emphText, emphRanges, choices);
    emphText = resolved.text;
    emphRanges = resolved.ranges;
  }
  // scanTags strips {tag} syntax out of emphText, shifting every offset after
  // each tag — rebase the emphasis ranges (computed against emphText) through
  // that same left-to-right removal so they land in the FINAL clean text's
  // offset space, identically to how scanTags places its own tag offsets.
  const { text, tags, warnings } = scanTags(emphText);
  const starts = rebaseThroughTagStrip(emphText, emphRanges.map(r => r.start));
  const ends = rebaseThroughTagStrip(emphText, emphRanges.map(r => r.end));
  const emphasis: EmphasisSpan[] = emphRanges.map((r, i) => ({ start: starts[i], end: ends[i], style: r.style }));
  return { meta, hasFrontmatter: has, text, tags, emphasis, warnings, density: detectDensity(tags) };
}

/**
 * Split the parsed body into per-chapter prose keyed "book:chapter", with each
 * chapter's own tags AND emphasis spans rebased to chapter-local offsets — the
 * unit the aligner consumes. Text before the first chapter tag (translator's
 * preface etc.) is returned under `preamble` rather than silently dropped.
 *
 * Chapter-local offsets are relative to the slice BEFORE `.trim()` (matching
 * the existing tag-rebasing behaviour) — a chapter's leading whitespace is
 * never nonzero in practice since a tag always precedes the first WORD, and
 * emphasis spans/tags alike never fall in that leading gap.
 */
export function splitChapters(p: ParsedTranslation): {
  preamble: string;
  chapters: { book: number; chapter: number; text: string; tags: InlineTag[]; emphasis: EmphasisSpan[] }[];
} {
  const chapterTags = p.tags.filter(t => t.kind === 'chapter');
  if (!chapterTags.length) return { preamble: '', chapters: [] };
  const preamble = p.text.slice(0, chapterTags[0].offset).trim();
  const chapters = chapterTags.map((ct, i) => {
    const start = ct.offset;
    const end = i + 1 < chapterTags.length ? chapterTags[i + 1].offset : p.text.length;
    return {
      book: ct.book!,
      chapter: ct.chapter!,
      text: p.text.slice(start, end).trim(),
      tags: p.tags
        .filter(t => t.kind !== 'chapter' && t.offset >= start && t.offset < end)
        .map(t => ({ ...t, offset: Math.min(t.offset - start, end - start) })),
      emphasis: p.emphasis
        .filter(e => e.start >= start && e.end <= end)
        .map(e => ({ ...e, start: e.start - start, end: e.end - start })),
    };
  });
  return { preamble, chapters };
}
