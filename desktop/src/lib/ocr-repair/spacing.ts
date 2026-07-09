import type { CorpusConfig } from './corpus-config';
import { makeChangeId } from './changelist';
import type { ChangeRecord } from './changelist';
import { isDisplayShapedLine, parseHeadingResidual, ticSpanOnLine } from '../pdf-import/line-shape';
import { setLeadingIndent } from './vote';

export interface SpacingOutcome {
  text: string;
  changes: ChangeRecord[];
}

type LineSide = 'plain' | 'recto' | 'verso';

interface SplitLine {
  side: LineSide;
  indent: string;
  body: string;
  ticHead?: string;
  ticToken?: string;
  ticStart?: number;
  ticEnd?: number;
  trailing?: string;
}

interface CollapsedBody {
  text: string;
  runsCollapsed: number;
  firstRunCol?: number;
}

const PROSE_ALPHA_FLOOR = 20;
const FOOTNOTE_LINE_RE = /^\s*(\d+\.\s|[*†])/u;
const LONE_INTEGER_RE = /^\s*\d+\s*\r?$/u;

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function restoreCr(line: string, cr: boolean): string {
  return cr ? `${line}\r` : line;
}

function firstNonBlankLine(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i += 1) {
    if (stripCr(lines[i]).trim() !== '') return i;
  }
  return null;
}

function stripLikelyTicEnds(line: string): string {
  let s = line.replace(/^\s*\d{1,4}[ab]?\d{0,2}\s{2,}/u, '');
  s = s.replace(/\s{2,}\d{1,4}[ab]?\d{0,2}\s*$/u, '');
  return s;
}

function findBottomFurnitureStart(lines: string[]): number | null {
  let lastNonBlank = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (stripCr(lines[i]).trim() !== '') lastNonBlank = i;
  }
  if (lastNonBlank === -1) return null;

  let i = lastNonBlank;
  let boundary: number | null = null;
  if (LONE_INTEGER_RE.test(stripCr(lines[i]))) {
    boundary = i;
    i -= 1;
    while (i >= 0 && stripCr(lines[i]).trim() === '') i -= 1;
  }

  let topmostNote: number | null = null;
  while (i >= 0) {
    const line = stripCr(lines[i]);
    if (line.trim() === '') {
      let k = i;
      while (k >= 0 && stripCr(lines[k]).trim() === '') k -= 1;
      if (k < 0 || !isDisplayShapedLine(stripLikelyTicEnds(stripCr(lines[k])).trim())) break;
      i = k;
      continue;
    }
    if (FOOTNOTE_LINE_RE.test(line)) topmostNote = i;
    i -= 1;
  }
  if (topmostNote !== null) boundary = topmostNote;
  return boundary;
}

function pageExcluded(lines: string[]): Set<number> {
  const excluded = new Set<number>();
  const head = firstNonBlankLine(lines);
  if (head !== null) excluded.add(head);
  const bottom = findBottomFurnitureStart(lines);
  if (bottom !== null) {
    for (let i = bottom; i < lines.length; i += 1) excluded.add(i);
  }
  return excluded;
}

function changeFactory(): (
  page: number,
  line: number | undefined,
  col: number | undefined
) => string {
  const counts = new Map<string, number>();
  return (page, line, col) => {
    const key = `${page}:${line ?? ''}:${col ?? ''}`;
    const seq = (counts.get(key) ?? 0) + 1;
    counts.set(key, seq);
    return makeChangeId(page, line, col, seq);
  };
}

function flagRecord(
  nextId: ReturnType<typeof changeFactory>,
  page: number,
  kind: string,
  evidence: Record<string, unknown>,
  line?: number,
  col?: number
): ChangeRecord {
  return {
    id: nextId(page, line, col),
    stage: 4,
    tier: 2,
    rule: 'flag',
    page,
    line,
    col,
    evidence: { kind, ...evidence },
  };
}

function alphaCount(s: string): number {
  return (s.match(/\p{L}/gu) ?? []).length;
}

function internalSpaceRunWidths(s: string): number[] {
  const widths: number[] = [];
  const re = /\S( {2,})(?=\S)/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(s)) !== null) widths.push(match[1].length);
  return widths;
}

// OCR sometimes leaves a space between a word/number and a following comma,
// semicolon, or closing paren ("necessary ,9", "anything15 )"). Strip it —
// but ONLY when a letter/digit precedes the space, which excludes Barnes's
// own spaced ellipses ("number ... ,", "posited ... )") whose space follows
// a period. Also drives the reader wrap fix: the space before ")" is what
// let the paren break away from its footnote marker.
function stripSpaceBeforePunct(body: string): { text: string; removed: number } {
  let removed = 0;
  const text = body.replace(/(?<=[\p{L}\p{N}]) +(?=[,;)])/gu, () => {
    removed += 1;
    return '';
  });
  return { text, removed };
}

function collapseInternalSpaces(body: string): CollapsedBody {
  let runsCollapsed = 0;
  let firstRunCol: number | undefined;
  const text = body.replace(/\S( {2,})(?=\S)/gu, (match, run: string, offset: number) => {
    runsCollapsed += 1;
    firstRunCol ??= offset + 1;
    return `${match[0]} `;
  });
  return { text, runsCollapsed, firstRunCol };
}

function splitLine(line: string): SplitLine {
  const recto = ticSpanOnLine(line, 'recto');
  if (recto) {
    const [ticStart, ticEnd] = recto;
    const ticToken = line.slice(ticStart, ticEnd);
    const trailing = line.slice(ticEnd);
    const prefix = line.slice(0, ticStart).replace(/\s+$/u, '');
    const indent = /^ */u.exec(prefix)?.[0] ?? '';
    return {
      side: 'recto',
      indent,
      body: prefix.slice(indent.length),
      ticToken,
      ticStart,
      ticEnd,
      trailing,
    };
  }

  const verso = ticSpanOnLine(line, 'verso');
  if (verso) {
    const [, ticEnd] = verso;
    const rest = line.slice(ticEnd);
    const gap = /^\s*/u.exec(rest)?.[0] ?? '';
    const bodyStart = ticEnd + gap.length;
    return {
      side: 'verso',
      indent: '',
      body: line.slice(bodyStart),
      ticHead: line.slice(0, bodyStart),
    };
  }

  const indent = /^ */u.exec(line)?.[0] ?? '';
  return { side: 'plain', indent, body: line.slice(indent.length) };
}

function reassemble(split: SplitLine, collapsed: string): string | null {
  if (split.side === 'verso') return `${split.ticHead ?? ''}${collapsed}`;
  if (split.side === 'recto') {
    const prefix = `${split.indent}${collapsed}`;
    const ticStart = split.ticStart ?? 0;
    const gap = ticStart - prefix.length;
    if (gap < 4) return null;
    return `${prefix}${' '.repeat(gap)}${split.ticToken ?? ''}${split.trailing ?? ''}`;
  }
  return `${split.indent}${collapsed}`;
}

function absoluteRunCol(split: SplitLine, bodyRunCol: number | undefined): number | undefined {
  if (bodyRunCol === undefined) return undefined;
  if (split.side === 'verso') return (split.ticHead?.length ?? 0) + bodyRunCol;
  return split.indent.length + bodyRunCol;
}

function inPreserveRange(config: CorpusConfig, page: number, line: number): boolean {
  return (config.preserveDisplayLines ?? []).some(
    (range) => range.page === page && line >= range.from && line <= range.to
  );
}

function isHeadingResidual(residual: string, config: CorpusConfig): boolean {
  const parsed = parseHeadingResidual(residual);
  if (!parsed) return false;
  if (parsed.kind === 'chapter' && parsed.bare && config.divisions.books !== 1) return false;
  return true;
}

function normalizePage(
  lines: string[],
  page: number,
  config: CorpusConfig,
  nextId: ReturnType<typeof changeFactory>
): { lines: string[]; changes: ChangeRecord[] } {
  const excluded = pageExcluded(lines);
  const out = [...lines];
  const changes: ChangeRecord[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const original = lines[i];
    const cr = original.endsWith('\r');
    const bare = stripCr(original);
    if (excluded.has(i) || bare.trim() === '') continue;

    const split = splitLine(bare);
    const residual = split.body.trim();
    const alpha = alphaCount(residual);
    const runs = internalSpaceRunWidths(residual);

    if (inPreserveRange(config, page, i)) {
      changes.push(flagRecord(nextId, page, 'preserved-display', {
        alpha,
        runs,
        sample: residual.slice(0, 80),
        source: 'config',
      }, i));
      continue;
    }

    if (isHeadingResidual(residual, config)) {
      if (/ {4,}/u.test(residual)) {
        changes.push(flagRecord(nextId, page, 'heading-residual-wide-run', {
          runs,
          sample: residual.slice(0, 80),
        }, i));
      }
      continue;
    }

    if (isDisplayShapedLine(residual) && alpha < PROSE_ALPHA_FLOOR) {
      changes.push(flagRecord(nextId, page, 'preserved-display', {
        alpha,
        runs,
        sample: residual.slice(0, 80),
      }, i));
      continue;
    }

    const collapsed = collapseInternalSpaces(split.body);
    const punct = stripSpaceBeforePunct(collapsed.text);
    if (collapsed.runsCollapsed === 0 && punct.removed === 0) continue;

    const nextBare = reassemble(split, punct.text);
    if (nextBare === null || nextBare === bare) continue;

    const col = absoluteRunCol(split, collapsed.firstRunCol);
    out[i] = restoreCr(nextBare, cr);
    changes.push({
      id: nextId(page, i, col),
      stage: 4,
      tier: 1,
      rule: 'spacing-collapse',
      page,
      line: i,
      col,
      before: original,
      after: out[i],
      evidence: {
        runsCollapsed: collapsed.runsCollapsed,
        ...(punct.removed ? { spaceBeforePunct: punct.removed } : {}),
        side: split.side,
        ...(split.side === 'recto' ? { ticColPreserved: true } : {}),
      },
    });
  }

  return { lines: out, changes };
}

function bodyStartColOf(split: SplitLine): number {
  if (split.side === 'verso') return split.ticHead?.length ?? 0;
  return split.indent.length;
}

// §E of stage6-fixes-2-spec: both editions paragraph-indent chapter-opening
// lines, and the frozen converter's §5 title capture reads an indented,
// centered-enough first line after a division heading as the chapter TITLE —
// removing a line of body text from the stream. Editions without real
// chapter titles (config.chapterTitles !== true) get the first body line
// after every BOOK/CHAPTER heading re-seated to the page's modal body margin,
// so §5 has nothing title-shaped to capture.
function deindentChapterFirstLines(
  lines: string[],
  page: number,
  config: CorpusConfig,
  nextId: ReturnType<typeof changeFactory>
): { lines: string[]; changes: ChangeRecord[] } {
  const excluded = pageExcluded(lines);
  const out = [...lines];
  const changes: ChangeRecord[] = [];

  const splits = new Map<number, SplitLine>();
  const proseCols: number[] = [];
  let sawVerso = false;
  let sawRecto = false;
  for (let i = 0; i < lines.length; i += 1) {
    const bare = stripCr(lines[i]);
    if (excluded.has(i) || bare.trim() === '') continue;
    const split = splitLine(bare);
    splits.set(i, split);
    if (split.side === 'verso') sawVerso = true;
    if (split.side === 'recto') sawRecto = true;
    const residual = split.body.trim();
    if (isHeadingResidual(residual, config) || isDisplayShapedLine(residual)) continue;
    if (inPreserveRange(config, page, i)) continue; // preserved display must not skew the modal margin
    proseCols.push(bodyStartColOf(split));
  }
  if (proseCols.length === 0) return { lines: out, changes };
  const counts = new Map<number, number>();
  for (const col of proseCols) counts.set(col, (counts.get(col) ?? 0) + 1);
  const modal = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const side: 'recto' | 'verso' = sawVerso && !sawRecto ? 'verso' : 'recto';

  const done = new Set<number>();
  for (let i = 0; i < lines.length; i += 1) {
    const split = splits.get(i);
    if (!split || !isHeadingResidual(split.body.trim(), config)) continue;
    // First prose line after the heading: skip blanks and further headings.
    let j = i + 1;
    while (j < lines.length) {
      const s = splits.get(j);
      if (stripCr(lines[j]).trim() === '' || (s && isHeadingResidual(s.body.trim(), config))) {
        j += 1;
        continue;
      }
      break;
    }
    const target = splits.get(j);
    if (!target || done.has(j) || excluded.has(j)) continue;
    const residual = target.body.trim();
    if (isDisplayShapedLine(residual) && alphaCount(residual) < PROSE_ALPHA_FLOOR) continue;
    if (inPreserveRange(config, page, j)) continue;
    const fromCol = bodyStartColOf(target);
    if (fromCol === modal) continue;
    const original = out[j];
    const cr = original.endsWith('\r');
    const bare = stripCr(original);
    const reseated = setLeadingIndent(bare, modal, side);
    if (reseated === null || reseated === bare) continue;
    out[j] = restoreCr(reseated, cr);
    done.add(j);
    changes.push({
      id: nextId(page, j, fromCol),
      stage: 4,
      tier: 1,
      rule: 'heading-normalize',
      page,
      line: j,
      col: fromCol,
      before: original,
      after: out[j],
      evidence: { kind: 'chapter-first-line-deindent', fromCol, toCol: modal },
    });
  }
  return { lines: out, changes };
}

export function normalizeSpacing(raw: string, config: CorpusConfig): SpacingOutcome {
  const nextId = changeFactory();
  const pages = raw.split('\f');
  const allChanges: ChangeRecord[] = [];
  const normalized = pages.map((pageText, page) => {
    const result = normalizePage(pageText.split('\n'), page, config, nextId);
    let lines = result.lines;
    allChanges.push(...result.changes);
    if (config.chapterTitles !== true) {
      const deindented = deindentChapterFirstLines(lines, page, config, nextId);
      lines = deindented.lines;
      allChanges.push(...deindented.changes);
    }
    return lines.join('\n');
  });
  return { text: normalized.join('\f'), changes: allChanges };
}
