import type { CorpusConfig } from './corpus-config';
import { makeChangeId } from './changelist';
import type { ChangeRecord } from './changelist';

export interface SkeletonOutcome {
  text: string;
  changes: ChangeRecord[];
}

interface PageLines {
  lines: string[];
}

interface NumeralShape {
  value: number | null;
  confusions: string[];
}

interface FolioCandidate {
  page: number;
  line: number;
  token: string;
  compact: string;
  pureDigits: boolean;
  value: number | null;
}

const GREEK_ORDINALS: Record<string, { english: string; value: number }> = {
  ALPHA: { english: 'ONE', value: 1 },
  BETA: { english: 'TWO', value: 2 },
  GAMMA: { english: 'THREE', value: 3 },
  DELTA: { english: 'FOUR', value: 4 },
  EPSILON: { english: 'FIVE', value: 5 },
  ZETA: { english: 'SIX', value: 6 },
  ETA: { english: 'SEVEN', value: 7 },
  THETA: { english: 'EIGHT', value: 8 },
  IOTA: { english: 'NINE', value: 9 },
  KAPPA: { english: 'TEN', value: 10 },
};

const SPELLED_ORDINALS = new Set([
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN',
  'TWENTY',
]);

const CONFUSION_RE = /^[0-9IlrOoSsZz|]+$/;

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function hadCr(line: string): boolean {
  return line.endsWith('\r');
}

function restoreCr(line: string, cr: boolean): string {
  return cr ? `${line}\r` : line;
}

function firstNonBlankLine(lines: string[], start = 0): number | null {
  for (let i = start; i < lines.length; i += 1) {
    if (stripCr(lines[i]).trim() !== '') return i;
  }
  return null;
}

function lastNonBlankLine(lines: string[]): number | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (stripCr(lines[i]).trim() !== '') return i;
  }
  return null;
}

function shapeNumeral(token: string): NumeralShape {
  const compact = token.replace(/ /g, '');
  if (compact === '' || !CONFUSION_RE.test(compact)) return { value: null, confusions: [] };

  const confusions: string[] = [];
  const seen = new Set<string>();
  let digits = '';
  for (const ch of compact) {
    let digit = ch;
    if (ch === 'I' || ch === 'l' || ch === '|' || ch === 'r') digit = '1';
    else if (ch === 'O' || ch === 'o') digit = '0';
    else if (ch === 'S' || ch === 's') digit = '5';
    else if (ch === 'Z' || ch === 'z') digit = '2';

    if (digit !== ch) {
      const confusion = `${ch}->${digit}`;
      if (!seen.has(confusion)) {
        seen.add(confusion);
        confusions.push(confusion);
      }
    }
    digits += digit;
  }

  return { value: Number(digits), confusions };
}

export function degarbleNumeral(token: string): number | null {
  return shapeNumeral(token).value;
}

function parseArabic(token: string): number | null {
  return /^\d+$/u.test(token) ? Number(token) : null;
}

function romanFromNumber(value: number): string | null {
  if (!Number.isInteger(value) || value <= 0 || value > 399) return null;
  const table: [number, string][] = [
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let n = value;
  let out = '';
  for (const [amount, glyph] of table) {
    while (n >= amount) {
      out += glyph;
      n -= amount;
    }
  }
  return out;
}

function parseCleanRoman(token: string): number | null {
  const upper = token.toUpperCase();
  if (!/^[IVXLC]+$/u.test(upper)) return null;
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  for (let i = 0; i < upper.length; i += 1) {
    const current = values[upper[i]];
    const next = values[upper[i + 1]] ?? 0;
    total += current < next ? -current : current;
  }
  return romanFromNumber(total) === upper ? total : null;
}

function parseOpeningChapter(token: string): number | null {
  const arabic = parseArabic(token);
  if (arabic !== null) return arabic;
  if (token.toUpperCase() === 'I') return 1;
  return degarbleNumeral(token);
}

function isPlausibleBookToken(token: string): boolean {
  const upper = token.toUpperCase();
  return (
    GREEK_ORDINALS[upper] !== undefined ||
    parseArabic(token) !== null ||
    parseCleanRoman(token) !== null ||
    SPELLED_ORDINALS.has(upper)
  );
}

function tokenCol(prefix: string): number {
  return prefix.length;
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

function applyHeadInsert(pages: PageLines[], changes: ChangeRecord[], nextId: ReturnType<typeof changeFactory>, placeholder: string): void {
  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page].lines;
    const first = firstNonBlankLine(lines);
    if (first === null) continue;
    const second = firstNonBlankLine(lines, first + 1);
    if (second === null) continue;

    const firstTrimmed = stripCr(lines[first]).trim();
    const secondTrimmed = stripCr(lines[second]).trim();
    const chapterMatch = /^CHAPTER\s+(\S.*)$/iu.exec(secondTrimmed);
    if (!/^BOOK\s+\S+/iu.test(firstTrimmed) || !chapterMatch) continue;

    const chapterToken = chapterMatch[1].trim().split(/\s+/u)[0];
    if (parseOpeningChapter(chapterToken) !== 1) continue;

    pages[page].lines = [placeholder, '', ...lines];
    changes.push({
      id: nextId(page, 0, undefined),
      stage: 2,
      tier: 1,
      rule: 'head-insert',
      page,
      line: 0,
      before: '',
      after: placeholder,
      evidence: {
        reason: 'book-opening page, running head absent',
        firstLine: firstTrimmed,
        nextHeading: secondTrimmed,
      },
    });
  }
}

function applyHeadingNormalize(
  pages: PageLines[],
  changes: ChangeRecord[],
  nextId: ReturnType<typeof changeFactory>
): void {
  let book = 0;
  let chapter = 0;

  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page].lines;
    const skipped = firstNonBlankLine(lines);

    for (let line = 0; line < lines.length; line += 1) {
      if (line === skipped) continue;
      const rawLine = lines[line];
      const content = stripCr(rawLine);
      const trimmed = content.trim();

      if (/^BOOK\s+(\S{1,12})$/iu.test(trimmed)) {
        const match = /^(\s*)(BOOK)(\s+)(\S{1,12})(\s*)$/iu.exec(content);
        if (!match) continue;
        const [, leading, keyword, gap, token, suffix] = match;
        const prefix = `${leading}${keyword}${gap}`;
        const col = tokenCol(prefix);
        const upper = token.toUpperCase();
        const greek = GREEK_ORDINALS[upper];
        const expectedBook = book + 1;

        if (greek) {
          if (greek.value === expectedBook) {
            const after = greek.english;
            lines[line] = restoreCr(`${leading}${keyword} ${after}${suffix}`, hadCr(rawLine));
            changes.push({
              id: nextId(page, line, col),
              stage: 2,
              tier: 1,
              rule: 'heading-normalize',
              page,
              line,
              col,
              before: token,
              after,
              evidence: { greekOrdinal: upper, value: greek.value, bookSequence: expectedBook },
            });
          } else {
            changes.push({
              id: nextId(page, line, col),
              stage: 2,
              tier: 2,
              rule: 'flag',
              page,
              line,
              col,
              before: token,
              evidence: {
                kind: 'book-sequence-conflict',
                greekOrdinal: upper,
                value: greek.value,
                bookSequence: expectedBook,
              },
            });
          }
        }

        if (isPlausibleBookToken(token)) {
          // A wide keyword->numeral gap puts the numeral where the gutter
          // scanner reads a trailing tic (>=4-space gap at col >=40) and
          // silently claims it, leaving a bare keyword. Hug the numeral.
          if (!greek && gap.length > 1) {
            lines[line] = restoreCr(`${leading}${keyword} ${token}${suffix}`, hadCr(rawLine));
            changes.push({
              id: nextId(page, line, col),
              stage: 2,
              tier: 1,
              rule: 'heading-normalize',
              page,
              line,
              col,
              before: `${keyword}${gap}${token}`,
              after: `${keyword} ${token}`,
              evidence: { kind: 'heading-spacing', gapWidth: gap.length },
            });
          }
          book += 1;
          chapter = 0;
        }
        continue;
      }

      if (/^CHAPTER\s+(\S{1,8}(?:\s\S{1,4})?)$/iu.test(trimmed)) {
        const match = /^(\s*)(CHAPTER)(\s+)(\S{1,8}(?:\s\S{1,4})?)(\s*)$/iu.exec(content);
        if (!match) continue;
        const [, leading, keyword, gap, token, suffix] = match;
        const prefix = `${leading}${keyword}${gap}`;
        const col = tokenCol(prefix);
        const expected = chapter + 1;
        const cleanValue = parseArabic(token) ?? parseCleanRoman(token);

        if (cleanValue !== null) {
          if (gap.length > 1) {
            // Same trailing-tic hazard as book headings: 'CHAPTER      10'
            // ends in what the gutter scanner reads as a bare tic.
            lines[line] = restoreCr(`${leading}${keyword} ${token}${suffix}`, hadCr(rawLine));
            changes.push({
              id: nextId(page, line, col),
              stage: 2,
              tier: 1,
              rule: 'heading-normalize',
              page,
              line,
              col,
              before: `${keyword}${gap}${token}`,
              after: `${keyword} ${token}`,
              evidence: { kind: 'heading-spacing', gapWidth: gap.length },
            });
          }
          if (cleanValue !== expected) {
            changes.push({
              id: nextId(page, line, col),
              stage: 2,
              tier: 2,
              rule: 'flag',
              page,
              line,
              col,
              before: token,
              evidence: { kind: 'chapter-sequence-jump', expected, got: cleanValue },
            });
          }
          chapter = cleanValue;
          continue;
        }

        const shaped = shapeNumeral(token);
        if (shaped.value === expected) {
          const after = String(expected);
          lines[line] = restoreCr(`${leading}${keyword} ${after}${suffix}`, hadCr(rawLine));
          changes.push({
            id: nextId(page, line, col),
            stage: 2,
            tier: 1,
            rule: 'heading-normalize',
            page,
            line,
            col,
            before: token,
            after,
            evidence: {
              book,
              expectedChapter: expected,
              prevChapter: chapter,
              confusions: shaped.confusions,
              spacingCollapsed: gap.length > 1,
            },
          });
          chapter = expected;
        } else {
          changes.push({
            id: nextId(page, line, col),
            stage: 2,
            tier: 2,
            rule: 'flag',
            page,
            line,
            col,
            before: token,
            evidence: {
              kind: 'chapter-numeral-unresolved',
              token,
              expected,
              degarbled: shaped.value,
            },
          });
        }
      }
    }
  }
}

function getFolioCandidate(page: number, lines: string[]): FolioCandidate | null {
  const line = lastNonBlankLine(lines);
  if (line === null) return null;
  const token = stripCr(lines[line]).trim();
  const compact = token.replace(/ /g, '');
  if (compact.length < 1 || compact.length > 4 || !CONFUSION_RE.test(compact)) return null;
  const pureDigits = /^\d+$/u.test(compact);
  return {
    page,
    line,
    token,
    compact,
    pureDigits,
    value: pureDigits ? Number(compact) : degarbleNumeral(compact),
  };
}

function cadenceConstant(clean: FolioCandidate[]): number | null {
  if (clean.length === 0) return null;
  if (clean.length === 1) return clean[0].value! - clean[0].page;

  const counts = new Map<number, number>();
  for (const anchor of clean) {
    const constant = anchor.value! - anchor.page;
    counts.set(constant, (counts.get(constant) ?? 0) + 1);
  }

  let best: { constant: number; count: number } | null = null;
  for (const [constant, count] of counts) {
    if (count < 2) continue;
    if (!best || count > best.count) best = { constant, count };
  }
  return best?.constant ?? null;
}

function nearestAnchor(page: number, anchors: FolioCandidate[]): FolioCandidate | null {
  let best: FolioCandidate | null = null;
  for (const anchor of anchors) {
    if (!best) {
      best = anchor;
      continue;
    }
    const distance = Math.abs(anchor.page - page);
    const bestDistance = Math.abs(best.page - page);
    if (distance < bestDistance || (distance === bestDistance && anchor.page < best.page)) {
      best = anchor;
    }
  }
  return best;
}

function evidenceAnchor(page: number, anchors: FolioCandidate[]): FolioCandidate | null {
  let previous: FolioCandidate | null = null;
  for (const anchor of anchors) {
    if (anchor.page <= page && (!previous || anchor.page > previous.page)) previous = anchor;
  }
  return previous ?? nearestAnchor(page, anchors);
}

function applyFolioRepair(
  pages: PageLines[],
  changes: ChangeRecord[],
  nextId: ReturnType<typeof changeFactory>
): void {
  const candidates = pages
    .map((page, index) => getFolioCandidate(index, page.lines))
    .filter((candidate): candidate is FolioCandidate => candidate !== null);
  const clean = candidates.filter((candidate) => candidate.pureDigits);
  const constant = cadenceConstant(clean);
  if (constant === null) return;
  const anchors = clean.filter((candidate) => candidate.value! - candidate.page === constant);

  for (const candidate of candidates) {
    const expected = candidate.page + constant;
    const col = stripCr(pages[candidate.page].lines[candidate.line]).search(/\S/u);

    if (candidate.pureDigits) {
      if (candidate.value !== expected) {
        changes.push({
          id: nextId(candidate.page, candidate.line, col),
          stage: 2,
          tier: 2,
          rule: 'flag',
          page: candidate.page,
          line: candidate.line,
          col,
          before: candidate.token,
          evidence: {
            kind: 'folio-cadence-jump',
            token: candidate.token,
            cadenceExpected: expected,
            got: candidate.value,
          },
        });
      }
      continue;
    }

    const shaped = shapeNumeral(candidate.compact);
    const anchor = evidenceAnchor(candidate.page, anchors);
    if (shaped.value === expected) {
      const rawLine = pages[candidate.page].lines[candidate.line];
      const content = stripCr(rawLine);
      const leading = content.match(/^\s*/u)?.[0] ?? '';
      const trailing = content.match(/\s*$/u)?.[0] ?? '';
      const after = String(expected);
      pages[candidate.page].lines[candidate.line] = restoreCr(
        `${leading}${after}${trailing}`,
        hadCr(rawLine)
      );
      changes.push({
        id: nextId(candidate.page, candidate.line, col),
        stage: 2,
        tier: 1,
        rule: 'folio-repair',
        page: candidate.page,
        line: candidate.line,
        col,
        before: candidate.token,
        after,
        evidence: {
          cadenceExpected: expected,
          prevFolio: anchor?.value,
          prevFolioPage: anchor?.page,
          confusions: shaped.confusions,
        },
      });
    } else {
      changes.push({
        id: nextId(candidate.page, candidate.line, col),
        stage: 2,
        tier: 2,
        rule: 'flag',
        page: candidate.page,
        line: candidate.line,
        col,
        before: candidate.token,
        evidence: {
          kind: 'folio-conflict',
          token: candidate.token,
          cadenceExpected: expected,
          shapeMaps: shaped.value,
          action: 'left-in-place',
        },
      });
    }
  }
}

// §F of stage6-fixes-2-spec: the print's bottom-center page numbers survive
// as bare-digit lines. When a blank line separates them from the prose the
// frozen converter absorbs them as furniture, but on glued pages (31 in
// Barnes) the number is joined INTO the paragraph ("...many terms 31 are
// predicated"). Furniture is furniture: strip every cadence-consistent
// bottom folio line outright (after folio repair has already canonicalized
// garbled ones). Garbled or off-cadence candidates stay flagged in place.
function applyBottomFolioStrip(
  pages: PageLines[],
  changes: ChangeRecord[],
  nextId: ReturnType<typeof changeFactory>
): void {
  const candidates = pages
    .map((page, index) => getFolioCandidate(index, page.lines))
    .filter((candidate): candidate is FolioCandidate => candidate !== null)
    .filter((candidate) => candidate.pureDigits);
  const constant = cadenceConstant(candidates);
  if (constant === null) return;

  for (const candidate of candidates) {
    if (candidate.value !== candidate.page + constant) continue;
    const col = stripCr(pages[candidate.page].lines[candidate.line]).search(/\S/u);
    pages[candidate.page].lines.splice(candidate.line, 1);
    changes.push({
      id: nextId(candidate.page, candidate.line, col),
      stage: 2,
      tier: 1,
      rule: 'folio-repair',
      page: candidate.page,
      line: candidate.line,
      col,
      before: candidate.token,
      evidence: { kind: 'bottom-folio-strip', cadenceConstant: constant, value: candidate.value },
    });
  }
}

export function repairSkeleton(raw: string, config: CorpusConfig): SkeletonOutcome {
  const pages = raw.split('\f').map((segment) => ({ lines: segment.split('\n') }));
  const changes: ChangeRecord[] = [];
  const nextId = changeFactory();

  applyHeadInsert(pages, changes, nextId, config.runningHeadPlaceholder);
  applyHeadingNormalize(pages, changes, nextId);
  applyFolioRepair(pages, changes, nextId);
  applyBottomFolioStrip(pages, changes, nextId);

  return { text: pages.map((page) => page.lines.join('\n')).join('\f'), changes };
}
