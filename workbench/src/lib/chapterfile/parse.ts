/**
 * Parser + serializer for the chapter save format (the app's canonical user
 * data). See workbench-design/d2-citation-schemes.md "Chapter-file
 * frontmatter" and the format block in the build spec.
 *
 * Format:
 * ---
 * schema_version: 1
 * work: metaphysics
 * book: 7
 * chapter: 17
 * citation_scheme: bekker-metaphysics
 * span_start: "1041a6"
 * span_end: "1041b33"
 * column_starts: "1041a6@1,1041b1@29"
 * ---
 * [GREEK]
 * <one line per Bekker line>
 * <structural blank line>
 * [ENGLISH]
 * <one line per Bekker line — RAW markup strings>
 * <structural blank line, only when [FOOTNOTES] follows>
 * [FOOTNOTES]
 * 1: footnote body text…
 * 2: another note…
 *
 * Frontmatter is flat scalars only, parsed with js-yaml. [FOOTNOTES] is
 * optional. A footnote entry starts at /^\d+: /; every other line appends
 * (with a newline) to the current entry's body — this is how multi-line
 * footnote bodies are represented.
 *
 * `column_starts` is OPTIONAL (older files lack it; consumers must handle
 * absence): comma-separated `<columnRef>@<rowIndex>` pairs, 1-based row
 * indexes. The FIRST pair's ref is the full span_start address (it carries
 * the chapter's starting line); each later pair is the full address of the
 * first row of a new column — usually line 1, but the actual line number is
 * always carried, never assumed. Within a segment, line numbers increment by
 * 1 per row (see `rowAddress`).
 *
 * Structural blanks: the serializer emits exactly one blank line after each
 * section's content when another section follows (at EOF the file's final
 * newline plays that role), and the parser drops exactly one trailing blank
 * line per section. This makes an EMPTY final content row (the common case —
 * an untranslated [ENGLISH] row) unambiguous: it serializes as an empty line
 * PLUS the structural blank, so parse(serialize(x)) round-trips by
 * construction. Files without the structural blanks (older serializer
 * output) still parse.
 */

import yaml from 'js-yaml';
import type { SchemeId } from '../citation/types';
import { getScheme, isKnownScheme } from '../citation/registry';
import type { ChapterFile, ChapterFileMeta, ColumnStart, Footnote } from './types';
import { ChapterFileError } from './types';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const FOOTNOTE_ENTRY_RE = /^(\d+):[ \t](.*)$/;
const SECTION_HEADERS = ['[GREEK]', '[ENGLISH]', '[FOOTNOTES]'] as const;
type SectionHeader = (typeof SECTION_HEADERS)[number];

function normalizeLineEndings(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ── raw-address splitting (presentation-level, not citation math) ───────────

// Trailing digits = line number, prefix = column. This is textual slicing of
// the same shape every module already relies on ("1041a6" = column "1041a",
// line 6); citation/'s parsed structs stay private to citation/.
const RAW_SPLIT_RE = /^(.*\D)(\d+)$/;

function splitRawAddress(raw: string): { column: string; line: number } | null {
  const m = RAW_SPLIT_RE.exec(raw);
  if (!m) return null;
  return { column: m[1], line: Number(m[2]) };
}

// ── frontmatter ─────────────────────────────────────────────────────────────

const COLUMN_STARTS_PAIR_RE = /^([^@]+)@(\d+)$/;

/** 1-based file line number of a frontmatter key (line 1 is the opening "---"). */
function frontmatterKeyLine(yamlText: string, key: string): number {
  const lines = yamlText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(`^${key}\\s*:`).test(lines[i])) return i + 2;
  }
  return 0;
}

function parseColumnStarts(
  val: unknown,
  spanStart: string,
  scheme: ReturnType<typeof getScheme>,
  lineNo: number,
  source: string,
): ColumnStart[] {
  const at = lineNo > 0 ? `line ${lineNo}: ` : '';
  if (typeof val !== 'string' || val.length === 0) {
    throw new ChapterFileError(
      `${source}: ${at}frontmatter field "column_starts", when present, must be a non-empty string of <columnRef>@<rowIndex> pairs`,
    );
  }
  const out: ColumnStart[] = [];
  const pairs = val.split(',');
  for (let i = 0; i < pairs.length; i++) {
    const pairRaw = pairs[i].trim();
    const m = COLUMN_STARTS_PAIR_RE.exec(pairRaw);
    if (!m) {
      throw new ChapterFileError(
        `${source}: ${at}column_starts pair ${i + 1} (${JSON.stringify(pairRaw)}) is not of the form <columnRef>@<rowIndex>`,
      );
    }
    const ref = m[1];
    const rowIndex = Number(m[2]);
    if (splitRawAddress(ref) === null) {
      throw new ChapterFileError(
        `${source}: ${at}column_starts pair ${i + 1}: ref ${JSON.stringify(ref)} does not end in a line number (expected e.g. "1041b1")`,
      );
    }
    try {
      scheme.parseAddress(ref);
    } catch (err) {
      throw new ChapterFileError(
        `${source}: ${at}column_starts pair ${i + 1}: ref ${JSON.stringify(ref)} does not parse under scheme "${scheme.id}": ${(err as Error).message}`,
      );
    }
    out.push({ ref, rowIndex });
  }

  if (out[0].ref !== spanStart) {
    throw new ChapterFileError(
      `${source}: ${at}column_starts first pair's ref (${JSON.stringify(out[0].ref)}) must equal span_start (${JSON.stringify(spanStart)})`,
    );
  }
  if (out[0].rowIndex !== 1) {
    throw new ChapterFileError(
      `${source}: ${at}column_starts first pair must have row index 1 (got ${out[0].rowIndex}) — rows before the first segment would have no address`,
    );
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i].rowIndex <= out[i - 1].rowIndex) {
      throw new ChapterFileError(
        `${source}: ${at}column_starts row indexes must be strictly increasing (pair ${i + 1} has ${out[i].rowIndex}, after ${out[i - 1].rowIndex})`,
      );
    }
  }
  return out;
}

function parseFrontmatter(
  normalized: string,
  source: string,
): { meta: ChapterFileMeta; rest: string; columnStartsLine: number } {
  const m = FRONTMATTER_RE.exec(normalized);
  if (!m) {
    throw new ChapterFileError(`${source}: missing YAML frontmatter (expected a leading "---" block)`);
  }
  const rest = normalized.slice(m[0].length);
  let parsed: unknown;
  try {
    parsed = yaml.load(m[1]);
  } catch (err) {
    throw new ChapterFileError(`${source}: frontmatter is not valid YAML (${(err as Error).message})`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ChapterFileError(`${source}: frontmatter must be a YAML mapping of flat scalars`);
  }
  const v = parsed as Record<string, unknown>;

  const requireString = (key: string): string => {
    const val = v[key];
    if (typeof val !== 'string' || val.length === 0) {
      throw new ChapterFileError(`${source}: frontmatter field "${key}" is required and must be a non-empty string`);
    }
    return val;
  };
  const requireInt = (key: string): number => {
    const val = v[key];
    if (typeof val !== 'number' || !Number.isInteger(val)) {
      throw new ChapterFileError(`${source}: frontmatter field "${key}" is required and must be an integer`);
    }
    return val;
  };

  const schemaVersion = requireInt('schema_version');
  const work = requireString('work');
  const book = requireInt('book');
  const chapter = requireInt('chapter');
  const citationSchemeRaw = requireString('citation_scheme');
  const spanStart = requireString('span_start');
  const spanEnd = requireString('span_end');

  if (!isKnownScheme(citationSchemeRaw)) {
    throw new ChapterFileError(`${source}: frontmatter field "citation_scheme" is unknown: ${JSON.stringify(citationSchemeRaw)}`);
  }
  const citationScheme: SchemeId = citationSchemeRaw;

  // span_start/span_end must parse under the declared scheme.
  const scheme = getScheme(citationScheme);
  try {
    scheme.parseAddress(spanStart);
  } catch (err) {
    throw new ChapterFileError(`${source}: frontmatter field "span_start" (${JSON.stringify(spanStart)}) does not parse under scheme "${citationScheme}": ${(err as Error).message}`);
  }
  try {
    scheme.parseAddress(spanEnd);
  } catch (err) {
    throw new ChapterFileError(`${source}: frontmatter field "span_end" (${JSON.stringify(spanEnd)}) does not parse under scheme "${citationScheme}": ${(err as Error).message}`);
  }

  // Optional column_starts (older files lack it).
  let columnStarts: ColumnStart[] | undefined;
  let columnStartsLine = 0;
  if ('column_starts' in v) {
    columnStartsLine = frontmatterKeyLine(m[1], 'column_starts');
    columnStarts = parseColumnStarts(v['column_starts'], spanStart, scheme, columnStartsLine, source);
  }

  const meta: ChapterFileMeta = {
    schemaVersion,
    work,
    book,
    chapter,
    citationScheme,
    spanStart,
    spanEnd,
    ...(columnStarts ? { columnStarts } : {}),
  };
  return { meta, rest, columnStartsLine };
}

// ── body sections ────────────────────────────────────────────────────────────

function isSectionHeader(line: string): line is SectionHeader {
  return (SECTION_HEADERS as readonly string[]).includes(line);
}

/** Split the post-frontmatter body into raw line arrays per section header. */
function splitSections(body: string, source: string): Map<SectionHeader, { lines: string[]; startLine: number }> {
  const lines = body.split('\n');
  const sections = new Map<SectionHeader, { lines: string[]; startLine: number }>();
  let current: SectionHeader | null = null;
  let currentLines: string[] = [];
  let currentStart = 0;

  // Frontmatter occupies the lines before `body`; callers pass 1-based line
  // numbers that already account for that offset via `lineOffset` below.
  const flush = () => {
    if (current) {
      if (sections.has(current)) {
        throw new ChapterFileError(`${source}: duplicate section header ${current}`);
      }
      sections.set(current, { lines: currentLines, startLine: currentStart });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isSectionHeader(line)) {
      flush();
      current = line;
      currentLines = [];
      currentStart = i + 1;
    } else if (current === null) {
      if (line.trim() !== '') {
        throw new ChapterFileError(`${source}: unexpected content before a section header: ${JSON.stringify(line)}`);
      }
      // blank line(s) between frontmatter and first section header: ignore
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (!sections.has('[GREEK]')) {
    throw new ChapterFileError(`${source}: missing required [GREEK] section`);
  }
  if (!sections.has('[ENGLISH]')) {
    throw new ChapterFileError(`${source}: missing required [ENGLISH] section`);
  }
  return sections;
}

/**
 * A section's raw lines end with one trailing empty line representing the
 * newline before the next header (or EOF). Drop exactly one trailing blank
 * line — that's serialization structure, not content.
 */
function trimTrailingBlank(lines: string[]): string[] {
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    return lines.slice(0, -1);
  }
  return lines;
}

function parseFootnotes(lines: string[], sectionStartLine: number, source: string): Footnote[] {
  const content = trimTrailingBlank(lines);
  const footnotes: Footnote[] = [];
  let current: Footnote | null = null;

  for (let i = 0; i < content.length; i++) {
    const lineNo = sectionStartLine + i + 1; // +1 for the [FOOTNOTES] header line itself
    const line = content[i];
    const m = FOOTNOTE_ENTRY_RE.exec(line);
    if (m) {
      const id = Number(m[1]);
      current = { id, body: m[2] };
      footnotes.push(current);
    } else {
      if (current === null) {
        throw new ChapterFileError(
          `${source}: line ${lineNo}: footnote continuation line before any "N: " entry: ${JSON.stringify(line)}`
        );
      }
      current.body += `\n${line}`;
    }
  }

  const seen = new Set<number>();
  for (const fn of footnotes) {
    if (!Number.isInteger(fn.id) || fn.id <= 0) {
      throw new ChapterFileError(`${source}: footnote id ${fn.id} must be a positive integer`);
    }
    if (seen.has(fn.id)) {
      throw new ChapterFileError(`${source}: duplicate footnote id ${fn.id}`);
    }
    seen.add(fn.id);
  }

  return footnotes;
}

// ── entry points ─────────────────────────────────────────────────────────────

export function parseChapterFile(raw: string, source = '<chapterfile>'): ChapterFile {
  const normalized = normalizeLineEndings(raw);
  const { meta, rest, columnStartsLine } = parseFrontmatter(normalized, source);
  const sections = splitSections(rest, source);

  const greekLines = trimTrailingBlank(sections.get('[GREEK]')!.lines);
  const englishLines = trimTrailingBlank(sections.get('[ENGLISH]')!.lines);
  const footnotesSection = sections.get('[FOOTNOTES]');
  const footnotes = footnotesSection ? parseFootnotes(footnotesSection.lines, footnotesSection.startLine, source) : [];

  if (greekLines.length !== englishLines.length) {
    throw new ChapterFileError(
      `${source}: [GREEK] has ${greekLines.length} line(s) but [ENGLISH] has ${englishLines.length} line(s) — they must match 1:1`
    );
  }

  if (meta.columnStarts) {
    const at = columnStartsLine > 0 ? `line ${columnStartsLine}: ` : '';
    const last = meta.columnStarts[meta.columnStarts.length - 1];
    if (last.rowIndex > greekLines.length) {
      throw new ChapterFileError(
        `${source}: ${at}column_starts row index ${last.rowIndex} is out of range — the chapter has ${greekLines.length} row(s)`,
      );
    }
  }

  return { meta, greekLines, englishLines, footnotes };
}

/**
 * The raw address of row `rowIndex` (1-BASED, matching the file format),
 * derived from `meta.columnStarts`. Pure arithmetic within a column segment:
 * the segment ref's line + (rowIndex - segment's start index). Exact for any
 * number of column transitions. Throws ChapterFileError when the meta has no
 * column_starts (older files — callers must handle absence BEFORE calling)
 * or when rowIndex is not a positive integer. The upper bound (the chapter's
 * row count) is not known to the meta and is the caller's responsibility.
 */
export function rowAddress(meta: ChapterFileMeta, rowIndex: number): string {
  const starts = meta.columnStarts;
  if (!starts || starts.length === 0) {
    throw new ChapterFileError('rowAddress: this chapter file has no column_starts — derive addresses another way');
  }
  if (!Number.isInteger(rowIndex) || rowIndex < starts[0].rowIndex) {
    throw new ChapterFileError(
      `rowAddress: row index ${rowIndex} is out of range (column_starts begins at row ${starts[0].rowIndex})`,
    );
  }
  let segment = starts[0];
  for (const s of starts) {
    if (s.rowIndex <= rowIndex) segment = s;
    else break;
  }
  const split = splitRawAddress(segment.ref);
  if (split === null) {
    // Unreachable for parser-produced metas (refs are validated); guards hand-built ones.
    throw new ChapterFileError(`rowAddress: column_starts ref ${JSON.stringify(segment.ref)} does not end in a line number`);
  }
  return `${split.column}${split.line + (rowIndex - segment.rowIndex)}`;
}

function serializeFrontmatter(meta: ChapterFileMeta): string {
  const lines = [
    '---',
    `schema_version: ${meta.schemaVersion}`,
    `work: ${meta.work}`,
    `book: ${meta.book}`,
    `chapter: ${meta.chapter}`,
    `citation_scheme: ${meta.citationScheme}`,
    `span_start: "${meta.spanStart}"`,
    `span_end: "${meta.spanEnd}"`,
  ];
  if (meta.columnStarts !== undefined) {
    if (meta.columnStarts.length === 0) {
      // An empty list would serialize to nothing and silently round-trip to
      // "absent" — refuse loudly instead of writing a lossy file.
      throw new ChapterFileError('serializeChapterFile: column_starts, when present, must contain at least one <columnRef>@<rowIndex> pair');
    }
    lines.push(`column_starts: "${meta.columnStarts.map((s) => `${s.ref}@${s.rowIndex}`).join(',')}"`);
  }
  lines.push('---');
  return lines.join('\n');
}

/**
 * Serialize in the exact shape parseChapterFile expects back: one structural
 * blank line after each section's content when another section follows; the
 * file's single trailing newline is the structural terminator for the last
 * section. The parser drops exactly one trailing blank per section, so a
 * genuinely EMPTY final content row (trailing untranslated [ENGLISH] rows,
 * empty sections, footnote bodies ending in newlines) survives the round
 * trip by construction.
 */
export function serializeChapterFile(doc: ChapterFile): string {
  const parts: string[] = [serializeFrontmatter(doc.meta)];

  parts.push('[GREEK]');
  parts.push(...doc.greekLines);
  parts.push(''); // structural blank before the next header

  parts.push('[ENGLISH]');
  parts.push(...doc.englishLines);

  if (doc.footnotes.length > 0) {
    parts.push(''); // structural blank before the next header
    parts.push('[FOOTNOTES]');
    for (const fn of doc.footnotes) {
      const bodyLines = fn.body.split('\n');
      parts.push(`${fn.id}: ${bodyLines[0]}`);
      parts.push(...bodyLines.slice(1));
    }
  }

  return parts.join('\n') + '\n';
}
