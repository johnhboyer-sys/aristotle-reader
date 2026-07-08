import type { CorpusConfig } from './corpus-config';
import { makeChangeId } from './changelist';
import type { ChangeRecord } from './changelist';
import { isDisplayShapedLine, parseHeadingResidual, ticSpanOnLine } from '../pdf-import/line-shape';

export interface FootnoteOutcome {
  text: string;
  changes: ChangeRecord[];
}

interface NoteBlock {
  start: number;
  end: number;
  folio: number;
}

interface HeadPassPage {
  lines: string[];
  changes: ChangeRecord[];
  noteNumbers: Set<number>;
  noteBlock?: NoteBlock;
}

const FOLIO_RE = /^\s{4,}\d{1,4}\s*$/u;
const NOTE_SIGNATURE_RE = /\b(?:Reading|Omitting|Retaining|Placing|Adding|Deleting|OCT|MSS)\b/u;
const NUM_RE = /^\s*(\d{1,3})\s*$/u;
const NUMTXT_RE = /^(\s*)(\d{1,3})\s+(\S.*)$/u;
const ROMAN_NUMTXT_RE = /^(\s*)([IVXLCDM]{1,8})\s+(\S.*)$/u;

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function restoreCr(line: string, cr: boolean): string {
  return cr ? `${line}\r` : line;
}

function changeFactory(): (page: number, line: number | undefined, col: number | undefined) => string {
  const counts = new Map<string, number>();
  return (page, line, col) => {
    const key = `${page}:${line ?? ''}:${col ?? ''}`;
    const seq = (counts.get(key) ?? 0) + 1;
    counts.set(key, seq);
    return makeChangeId(page, line, col, seq);
  };
}

function firstNonBlank(lines: string[]): string {
  return lines.find((line) => stripCr(line).trim() !== '') ?? '';
}

function assertDocumentInvariants(before: string, after: string) {
  if ((before.match(/\f/gu) ?? []).length !== (after.match(/\f/gu) ?? []).length) {
    throw new Error('stage 6 invariant failed: form-feed count changed');
  }
  const beforeHeads = before.split('\f').map((page) => firstNonBlank(page.split('\n')));
  const afterHeads = after.split('\f').map((page) => firstNonBlank(page.split('\n')));
  if (beforeHeads.some((head, i) => head !== afterHeads[i])) {
    throw new Error('stage 6 invariant failed: running head changed');
  }
}

function headRecord(
  nextId: ReturnType<typeof changeFactory>,
  page: number,
  line: number,
  before: string,
  after: string,
  evidence: Record<string, unknown>,
  tier: 1 | 2 = 1
): ChangeRecord {
  return {
    id: nextId(page, line, 0),
    stage: 6,
    tier,
    rule: 'footnote-head',
    page,
    line,
    col: 0,
    before,
    after,
    evidence,
  };
}

function markerRecord(
  nextId: ReturnType<typeof changeFactory>,
  page: number,
  line: number,
  col: number,
  before: string,
  after: string,
  evidence: Record<string, unknown>,
  tier: 1 | 2 = 1
): ChangeRecord {
  return {
    id: nextId(page, line, col),
    stage: 6,
    tier,
    rule: 'footnote-marker',
    page,
    line,
    col,
    before,
    after,
    evidence,
  };
}

function isPlainBody(line: string): boolean {
  const trimmed = stripCr(line).trim();
  if (trimmed === '') return false;
  if (NOTE_SIGNATURE_RE.test(trimmed)) return false;
  if (NUM_RE.test(trimmed) || NUMTXT_RE.test(trimmed) || ROMAN_NUMTXT_RE.test(trimmed)) return false;
  if (parseHeadingResidual(trimmed) || isDisplayShapedLine(trimmed)) return false;
  return /[A-Za-z]/u.test(trimmed);
}

function findNoteBlock(lines: string[]): NoteBlock | null {
  let folio = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (FOLIO_RE.test(stripCr(lines[i]))) {
      folio = i;
      break;
    }
  }
  if (folio < 0) return null;

  let end = folio;
  while (end > 0 && stripCr(lines[end - 1]).trim() === '') end -= 1;
  let start = end - 1;
  while (start > 0) {
    const line = stripCr(lines[start]);
    if (line.trim() === '') {
      const upper = stripCr(lines[start - 1]).trim();
      if (isPlainBody(lines[start - 1]) || NUM_RE.test(upper) || (!NOTE_SIGNATURE_RE.test(upper) && !NUMTXT_RE.test(upper) && !ROMAN_NUMTXT_RE.test(upper) && !isDisplayShapedLine(upper))) {
        start += 1;
        break;
      }
    }
    if (isPlainBody(line)) {
      start += 1;
      break;
    }
    start -= 1;
  }
  if (start < 0) start = 0;
  const block = lines.slice(start, end).join('\n');
  return NOTE_SIGNATURE_RE.test(block) ? { start, end, folio } : null;
}

function romanValue(raw: string): number | null {
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let previous = 0;
  for (const ch of [...raw.toUpperCase()].reverse()) {
    const value = values[ch];
    if (!value) return null;
    total += value < previous ? -value : value;
    previous = Math.max(previous, value);
  }
  return total > 0 && total <= 999 ? total : null;
}

function noteLineWithNumber(line: string, n: number): string {
  const cr = line.endsWith('\r');
  const bare = stripCr(line);
  const indent = /^ */u.exec(bare)?.[0] ?? '';
  return restoreCr(`${indent}${n}. ${bare.trimStart()}`, cr);
}

function normalizeHeadPage(
  input: string[],
  page: number,
  nextId: ReturnType<typeof changeFactory>,
  nextExpected: number
): HeadPassPage & { nextExpected: number } {
  const block = findNoteBlock(input);
  if (!block) return { lines: input, changes: [], noteNumbers: new Set(), nextExpected };

  const out = [...input];
  const changes: ChangeRecord[] = [];
  const noteNumbers = new Set<number>();
  const deleteLines = new Set<number>();
  let blanksInserted = 0;
  let numsRemoved = 0;
  let interiorBlanksRemoved = 0;

  const remember = (n: number) => {
    if (nextExpected > 20 && n === 1) nextExpected = 1;
    noteNumbers.add(n);
    nextExpected = Math.max(nextExpected, n + 1);
  };

  for (let i = block.start; i < block.end; i += 1) {
    if (deleteLines.has(i)) continue;
    const line = stripCr(out[i]);
    const num = NUM_RE.exec(line);
    if (num) {
      const n = Number(num[1]);
      const following = i + 1 < block.end && NOTE_SIGNATURE_RE.test(stripCr(out[i + 1]));
      const preceding = i - 1 >= block.start && NOTE_SIGNATURE_RE.test(stripCr(out[i - 1]));
      const textLine = following ? i + 1 : preceding ? i - 1 : null;
      if (textLine !== null) {
        const before = out[textLine];
        out[textLine] = noteLineWithNumber(out[textLine], n);
        deleteLines.add(i);
        numsRemoved += 1;
        remember(n);
        changes.push(headRecord(nextId, page, textLine, before, out[textLine], { kind: 'footnote-head-join', number: n, numberLine: i }));
      }
      continue;
    }

    const numtxt = NUMTXT_RE.exec(line);
    if (numtxt && NOTE_SIGNATURE_RE.test(numtxt[3])) {
      const n = Number(numtxt[2]);
      const before = out[i];
      out[i] = restoreCr(`${numtxt[1]}${n}. ${numtxt[3]}`, out[i].endsWith('\r'));
      remember(n);
      changes.push(headRecord(nextId, page, i, before, out[i], { kind: 'footnote-head-period', number: n }));
      continue;
    }

    const roman = ROMAN_NUMTXT_RE.exec(line);
    if (roman && NOTE_SIGNATURE_RE.test(roman[3])) {
      const n = romanValue(roman[2]);
      if (n !== null && n === nextExpected) {
        const before = out[i];
        out[i] = restoreCr(`${roman[1]}${n}. ${roman[3]}`, out[i].endsWith('\r'));
        remember(n);
        changes.push(headRecord(nextId, page, i, before, out[i], { kind: 'footnote-head-roman', raw: roman[2], number: n }));
      } else {
        changes.push(headRecord(nextId, page, i, out[i], out[i], { kind: 'footnote-head-roman-ambiguous', raw: roman[2] }, 2));
      }
    }
  }

  let kept = out.filter((_, i) => !deleteLines.has(i));
  const removedBefore = (idx: number) => [...deleteLines].filter((line) => line < idx).length;
  let start = block.start - removedBefore(block.start);
  let end = block.end - removedBefore(block.end);

  while (start < end && stripCr(kept[start]).trim() === '') start += 1;
  if (start > 0 && stripCr(kept[start - 1]).trim() !== '') {
    kept.splice(start, 0, '');
    blanksInserted += 1;
    start += 1;
    end += 1;
  }

  for (let i = start + 1; i < end - 1; i += 1) {
    if (stripCr(kept[i]).trim() !== '') continue;
    const prev = stripCr(kept[i - 1]).trim();
    const next = stripCr(kept[i + 1]).trim();
    if (!isDisplayShapedLine(prev) && !isDisplayShapedLine(next)) {
      kept.splice(i, 1);
      interiorBlanksRemoved += 1;
      end -= 1;
      i -= 1;
    }
  }

  const expectedDelta = blanksInserted - numsRemoved - interiorBlanksRemoved;
  if (kept.length - input.length !== expectedDelta) {
    throw new Error('stage 6 invariant failed: footnote head line-count delta mismatch');
  }

  return {
    lines: kept,
    changes,
    noteNumbers,
    noteBlock: { start, end, folio: block.folio + expectedDelta },
    nextExpected,
  };
}

function superscriptPatterns(n: number): RegExp[] {
  const superscripts: Record<string, string> = { '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '0': '⁰' };
  const unicode = String(n).replace(/\d/gu, (d) => superscripts[d]);
  return [
    new RegExp(`<sup>\\s*${n}\\s*<\\/sup>`, 'iu'),
    new RegExp(`\\^\\s*${n}(?!\\d)`, 'u'),
    new RegExp(`\\$\\^\\{?${n}\\}?\\$`, 'u'),
    new RegExp(unicode, 'u'),
  ];
}

function witnessHasSuperscript(witness: string, n: number): boolean {
  return superscriptPatterns(n).some((re) => re.test(witness));
}

function normalizeMarkerPage(
  lines: string[],
  page: number,
  noteNumbers: Set<number>,
  noteBlock: NoteBlock | undefined,
  witness: string,
  nextId: ReturnType<typeof changeFactory>
): { lines: string[]; changes: ChangeRecord[] } {
  const out = [...lines];
  const changes: ChangeRecord[] = [];
  for (let i = 0; i < out.length; i += 1) {
    if (noteBlock && i >= noteBlock.start && i < noteBlock.end) continue;
    const bare = stripCr(out[i]);
    const trimmed = bare.trim();
    if (/^(?:BOOK|CHAPTER)\b/iu.test(trimmed)) continue;
    const ownLine = /^\s*(\d{1,2})\s*$/u.exec(bare);
    if (ownLine && noteNumbers.has(Number(ownLine[1]))) {
      changes.push(markerRecord(nextId, page, i, bare.indexOf(ownLine[1]), ownLine[1], ownLine[1], { kind: 'footnote-marker-detached', number: Number(ownLine[1]) }, 2));
      continue;
    }
    if (parseHeadingResidual(trimmed)) continue;
    out[i] = restoreCr(bare.replace(/(\S)( +)(\d{1,2})(?=[\s).,;:\]]|$)/gu, (match, prev: string, gap: string, num: string, offset: number) => {
      const n = Number(num);
      const markerCol = offset + prev.length + gap.length;
      const following = bare[markerCol + num.length] ?? '';
      const edgeTic = ticSpanOnLine(bare, 'recto')?.[0] === markerCol || ticSpanOnLine(bare, 'verso')?.[0] === markerCol;
      if (!noteNumbers.has(n) || gap.length >= 4 || edgeTic || /[ab\d]/iu.test(following)) return match;
      if (!witnessHasSuperscript(witness, n)) {
        changes.push(markerRecord(nextId, page, i, markerCol, match, match, { kind: 'footnote-marker-unconfirmed', number: n }, 2));
        return match;
      }
      const after = `${prev}${num}`;
      changes.push(markerRecord(nextId, page, i, markerCol, match, after, { kind: 'footnote-marker-glue', number: n, joinedTokens: 1 }));
      return after;
    }), out[i].endsWith('\r'));
  }
  return { lines: out, changes };
}

export function normalizeFootnotes(text: string, config: CorpusConfig, witnessText = ''): FootnoteOutcome {
  void config;
  const nextId = changeFactory();
  const pages = text.split('\f').map((page) => page.split('\n'));
  const changes: ChangeRecord[] = [];
  let nextExpected = 1;
  const headPages: HeadPassPage[] = [];

  for (let page = 0; page < pages.length; page += 1) {
    const normalized = normalizeHeadPage(pages[page], page, nextId, nextExpected);
    nextExpected = normalized.nextExpected;
    headPages.push(normalized);
    changes.push(...normalized.changes);
  }

  const finalPages: string[][] = [];
  for (let page = 0; page < headPages.length; page += 1) {
    const normalized = normalizeMarkerPage(headPages[page].lines, page, headPages[page].noteNumbers, headPages[page].noteBlock, witnessText, nextId);
    finalPages.push(normalized.lines);
    changes.push(...normalized.changes);
  }

  const out = finalPages.map((page) => page.join('\n')).join('\f');
  assertDocumentInvariants(text, out);
  return { text: out, changes };
}
