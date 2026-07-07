/**
 * Stage 1a: TLG Greek spine via Diogenes verse-mode export — TS port.
 *
 * Direct port of `parse_spine` in pipeline/aristotle_pipeline/stage1_greek.py.
 * Parses the verse-mode TEI (Bekker-page divs containing <l n="..."> lines),
 * rejoins words hyphenated across lines onto the first line, assigns each
 * line to a book from the manifest table, and emits spine segments keyed
 * (book, column) so book-straddling columns split into per-book segments.
 *
 * Uses fast-xml-parser's `preserveOrder` mode so interleaved text/elements
 * inside <l> (e.g. an inline <pb/> milestone) and sibling <l> order within a
 * <div> are preserved exactly as lxml's document-order walk sees them.
 */

import { XMLParser } from 'fast-xml-parser';
import { type XmlNode, attrs, children, findAll, isTextNode } from './xmlnode';

// ── manifest shape this module needs ────────────────────────────────────────

export interface BookRange {
  n: number;
  start: string;
  end: string;
}

export interface SpineManifest {
  work_id: string;
  greek_edition: string;
  citation_scheme?: string; // manifest.data.citation.scheme, default 'bekker'
  books: BookRange[];
}

/** Book number containing Bekker position (column, line), or null if the
 * position falls in an inter-book numbering gap. Port of Manifest.book_for_line
 * (pipeline/aristotle_pipeline/config.py) — kept private here per this task's
 * scope (citation/bekker.ts is owned by another concurrent task). */
function bookForLine(manifest: SpineManifest, column: string, line: number): number | null {
  const pos = lineKey(column, line);
  for (const b of manifest.books) {
    const start = refKey(b.start);
    const end = refKey(b.end);
    if (compareKey(start, pos) <= 0 && compareKey(pos, end) <= 0) {
      return b.n;
    }
  }
  return null;
}

// ── Bekker ref/column key helpers (private port of refs.py; tiny duplication
// with citation/bekker.ts is intentional per this task's scope) ─────────────

type ColumnKey = [page: number, side: 'a' | 'b'];
type RefKey = [page: number, side: 'a' | 'b', line: number];

const REF_RE = /^(\d+)([ab])(\d+)?$/;

function columnKey(column: string): ColumnKey {
  const m = REF_RE.exec(column);
  if (!m || m[3] !== undefined) {
    throw new Error(`not a Bekker column: ${column}`);
  }
  return [Number(m[1]), m[2] as 'a' | 'b'];
}

function refKey(ref: string): RefKey {
  const m = REF_RE.exec(ref);
  if (!m || m[3] === undefined) {
    throw new Error(`not a Bekker ref: ${ref}`);
  }
  return [Number(m[1]), m[2] as 'a' | 'b', Number(m[3])];
}

function lineKey(column: string, line: number): RefKey {
  const [page, side] = columnKey(column);
  return [page, side, line];
}

function compareKey(a: RefKey, b: RefKey): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1; // 'a' < 'b'
  return a[2] - b[2];
}

/** Flatten all text under an element (lxml's `el.itertext()`), collapsing
 * whitespace runs and trimming — port of `_line_text`. */
function elementText(node: XmlNode): string {
  const parts: string[] = [];
  const walk = (n: XmlNode) => {
    if (isTextNode(n)) {
      parts.push(n['#text']);
      return;
    }
    for (const child of children(n)) walk(child);
  };
  walk(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

// ── compound-numbered line expansion (port of _expand_compound) ────────────

const COMPOUND_N = /^\d+(?:\s*,\s*\d+)+$/;

function lineNo(n: string | undefined | null): number | null {
  if (n && /^\d+$/.test(n)) return Number(n);
  return null;
}

function expandCompound(items: Array<[nStr: string, raw: string]>): Array<[number, string]> {
  const byLine = new Map<number, string[]>();
  const order: number[] = [];
  for (const [nStr, raw] of items) {
    const nums = nStr.split(',').map((x) => Number(x.trim()));
    // rejoin mid-word break: remove `|` between two non-space chars
    const text = raw.replace(/(?<=\S)\|(?=\S)/g, '');
    // split word-boundary breaks
    const pieces = text.split(/\s*\|\s*/);
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i].trim();
      if (!piece) continue;
      const num = i < nums.length ? nums[i] : nums[nums.length - 1];
      if (!byLine.has(num)) {
        byLine.set(num, []);
        order.push(num);
      }
      byLine.get(num)!.push(piece);
    }
  }
  return order.map((num) => [num, byLine.get(num)!.join(' ').replace(/\s+/g, ' ').trim()]);
}

// ── output shapes ────────────────────────────────────────────────────────

export interface SpineLine {
  n: number;
  text: string;
  joined?: true;
}

export interface SpineSegment {
  id: string;
  book: number;
  column: string;
  lines: SpineLine[];
}

export interface SpineHeading {
  column: string;
  text: string;
}

export interface SpineUnassignedLine {
  column: string;
  n: number;
  text: string;
  joined?: true;
}

export interface Spine {
  work: string;
  edition: string;
  segments: SpineSegment[];
  headings: SpineHeading[];
  unassigned_lines: SpineUnassignedLine[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  // lxml never trims .text/.tail; fast-xml-parser trims text-node boundaries
  // by default, which silently swallows the space around inline elements
  // like <hi>α</hi> (turning "τοῦ <hi>α</hi> ἀποφάσεις" into "τοῦαἀποφάσεις").
  // We collapse whitespace ourselves after flattening, so trimming here would
  // only destroy real inter-word spaces.
  trimValues: false,
});

/** Parse verse-mode Diogenes TEI XML into a Bekker spine. Direct port of
 * `parse_spine` (stage1_greek.py); `xml` is the raw file text (read by the
 * caller — this module does no file I/O so it runs in the browser/Tauri
 * webview as well as Node parity tooling). */
export function parseSpine(xml: string, manifest: SpineManifest): Spine {
  const root = xmlParser.parse(xml) as XmlNode[];

  // A non-Bekker treatise (citation.scheme: busse) is cited by Busse CAG
  // page.line — the export types each page <div type="page" n="1">. We map
  // Busse page N onto a SYNTHETIC Bekker column "Na" (a-side only).
  const scheme = manifest.citation_scheme ?? 'bekker';
  const pageType = scheme === 'busse' ? 'page' : 'Bekker-page';

  // Flat list of {column, n, text} in document order.
  interface FlatLine {
    column: string;
    n: number;
    text: string;
    joined?: true;
  }
  const flat: FlatLine[] = [];
  const headings: SpineHeading[] = [];

  // Walk the whole document for <div> elements (lxml's tree.iter("{*}div")).
  const divs = findAll(root, 'div');

  for (const div of divs) {
    const dAttrs = attrs(div);
    if (dAttrs['@_type'] !== pageType) continue;
    const column = scheme === 'busse' ? `${dAttrs['@_n']}a` : dAttrs['@_n'];

    let compound: Array<[string, string]> = [];
    const flush = () => {
      for (const [n, text] of expandCompound(compound)) {
        flat.push({ column, n, text });
      }
      compound = [];
    };

    for (const l of findAll(children(div), 'l')) {
      const lAttrs = attrs(l);
      const n = lAttrs['@_n'];
      if (n && !/^\d+$/.test(n) && COMPOUND_N.test(n)) {
        compound.push([n, elementText(l)]);
        continue;
      }
      if (compound.length) flush();
      const ln = lineNo(n);
      if (ln === null) {
        headings.push({ column, text: elementText(l) });
        continue;
      }
      flat.push({ column, n: ln, text: elementText(l) });
    }
    if (compound.length) flush();
  }

  // Rejoin hyphenated words: a line ending in "-" takes the first
  // whitespace-delimited token of the next line (which may sit in the next
  // column).
  for (let i = 0; i < flat.length; i++) {
    const line = flat[i];
    if (!line.text.endsWith('-')) continue;
    if (i + 1 >= flat.length || !flat[i + 1].text) {
      throw new Error(`hyphenated line with no continuation: ${line.column}${line.n}`);
    }
    const nxt = flat[i + 1];
    const spaceIdx = nxt.text.indexOf(' ');
    const head = spaceIdx === -1 ? nxt.text : nxt.text.slice(0, spaceIdx);
    const rest = spaceIdx === -1 ? '' : nxt.text.slice(spaceIdx + 1);
    line.text = line.text.slice(0, -1) + head;
    line.joined = true;
    nxt.text = rest;
  }

  // Group into per-(book, column) segments, preserving document order.
  const segments: SpineSegment[] = [];
  const segByKey = new Map<string, SpineSegment>();
  const unassigned: SpineUnassignedLine[] = [];
  for (const line of flat) {
    const book = bookForLine(manifest, line.column, line.n);
    if (book === null) {
      const entry: SpineUnassignedLine = { column: line.column, n: line.n, text: line.text };
      if (line.joined) entry.joined = true;
      unassigned.push(entry);
      continue;
    }
    const key = `${book} ${line.column}`;
    let seg = segByKey.get(key);
    if (!seg) {
      seg = { id: `${book}:${line.column}`, book, column: line.column, lines: [] };
      segByKey.set(key, seg);
      segments.push(seg);
    }
    const entry: SpineLine = { n: line.n, text: line.text };
    if (line.joined) entry.joined = true;
    seg.lines.push(entry);
  }

  return {
    work: manifest.work_id,
    edition: manifest.greek_edition,
    segments,
    headings,
    unassigned_lines: unassigned,
  };
}
