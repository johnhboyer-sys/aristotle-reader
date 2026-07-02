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

export interface ParsedTranslation {
  meta: Partial<TranslationMeta>;   // {} when the file has no frontmatter yet
  hasFrontmatter: boolean;
  text: string;                     // body with all tags stripped
  tags: InlineTag[];                // in document order, offsets into `text`
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
    meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
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
    '---',
    '',
  ];
  return lines.join('\n');
}

// ── inline tags ─────────────────────────────────────────────────────────────

const TAG = /\{([0-9]+\.[0-9]+|[0-9]{3,4}[ab]|[0-9]{1,2})\}[ \t]?/g;
const CHAPTER_TAG = /^[0-9]+\.[0-9]+$/;
const COLUMN_TAG = /^[0-9]{3,4}[ab]$/;

function scanTags(body: string): { text: string; tags: InlineTag[]; warnings: string[] } {
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

export function parseTranslationFile(raw: string): ParsedTranslation {
  const { meta, body, has } = parseFrontmatter(raw);
  const { text, tags, warnings } = scanTags(body);
  return { meta, hasFrontmatter: has, text, tags, warnings, density: detectDensity(tags) };
}

/**
 * Split the parsed body into per-chapter prose keyed "book:chapter", with each
 * chapter's own tags rebased to chapter-local offsets — the unit the aligner
 * consumes. Text before the first chapter tag (translator's preface etc.) is
 * returned under `preamble` rather than silently dropped.
 */
export function splitChapters(p: ParsedTranslation): {
  preamble: string;
  chapters: { book: number; chapter: number; text: string; tags: InlineTag[] }[];
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
    };
  });
  return { preamble, chapters };
}
