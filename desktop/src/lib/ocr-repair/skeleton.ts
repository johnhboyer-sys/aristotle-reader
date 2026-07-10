import type { CorpusConfig } from './corpus-config';
import { makeChangeId } from './changelist';
import type { ChangeRecord } from './changelist';
import type { ReviewDecisions } from './review';

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

const SPELLED = [
  '',
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
];

const SPELLED_ORDINALS = new Set(SPELLED.filter((w) => w !== ''));

function spelledOrdinal(value: number): string | null {
  return SPELLED[value] ?? null;
}

// Single-letter book ordinals: the classical 24-letter Greek alphabet used for
// book numbering (Aristotle's editors letter books Α=1 … Ω=24), plus the
// OCR-Latin lookalikes a rough scan produces for them. Consulted ONLY when a
// corpus config declares headingStyle.bookOrdinal === 'greek-letter', and every
// hit is sequence-forced against the running book count, so the collisions with
// Roman-numeral letters (I, K→none, X…) or an OCR misread can never renumber a
// book silently — a mismatch is flagged instead.
const GREEK_LETTER_ORDINALS: Record<string, number> = {
  Α: 1, A: 1,
  Β: 2, B: 2,
  Γ: 3,
  Δ: 4,
  Ε: 5, E: 5,
  Ζ: 6,
  Η: 7, H: 7,
  Θ: 8,
  Ι: 9, I: 9,
  Κ: 10, K: 10,
  Λ: 11,
  Μ: 12, M: 12,
  Ν: 13, N: 13,
  Ξ: 14,
  Ο: 15, O: 15,
  Π: 16,
  Ρ: 17, P: 17,
  Σ: 18,
  Τ: 19, T: 19,
  Υ: 20, Y: 20,
  Φ: 21,
  Χ: 22, X: 22,
  Ψ: 23,
  Ω: 24,
};

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

function normWs(s: string): string {
  return s.replace(/\s+/gu, ' ').trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

// A bare folio / book-number remnant the scan strands on its own line above the
// running head ("3", "668 3", "665").
function isPageNumberStray(trimmed: string): boolean {
  return /^\d{1,4}( \d{1,3})?$/u.test(normWs(trimmed));
}

// A running-head furniture line: the work title (± a folio number), or a book
// running head that carries a folio — "BOOK THREE 665". The folio is REQUIRED
// for the BOOK form so a bare "BOOK THREE" division heading is never matched.
function isRunningHeadLine(trimmed: string, placeholder: string): boolean {
  const n = normWs(trimmed);
  if (new RegExp(`^(\\d{3,4} )?${escapeRe(normWs(placeholder))}( \\d{3,4})?$`, 'u').test(n)) return true;
  return /^BOOK [A-Z]+ \d{3,4}$/u.test(n);
}

// When the OCR doubles the page-top furniture — a bare page/book-number line
// ABOVE the running head — the frozen converter strips only the first
// non-blank line, so the running head ("655 PARTS OF ANIMALS", "BOOK THREE
// 665") leaks into the reflowed body. Blank the running-head line; the bare
// number above it stays the page's first line and the converter strips that.
function applyPageHeadStrayStrip(pages: PageLines[], changes: ChangeRecord[], nextId: ReturnType<typeof changeFactory>, placeholder: string): void {
  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page].lines;
    const first = firstNonBlankLine(lines);
    if (first === null) continue;
    const second = firstNonBlankLine(lines, first + 1);
    if (second === null) continue;
    const stray = stripCr(lines[first]).trim();
    const head = stripCr(lines[second]).trim();
    if (!isPageNumberStray(stray) || !isRunningHeadLine(head, placeholder)) continue;
    changes.push({
      id: nextId(page, second, undefined),
      stage: 2,
      tier: 1,
      rule: 'folio-repair',
      page,
      line: second,
      before: head,
      after: '',
      evidence: { kind: 'page-head-running-strip', strayAbove: stray },
    });
    lines[second] = '';
  }
}

function applyHeadInsert(pages: PageLines[], changes: ChangeRecord[], nextId: ReturnType<typeof changeFactory>, placeholder: string, config: CorpusConfig): void {
  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page].lines;
    const first = firstNonBlankLine(lines);
    if (first === null) continue;
    const firstTrimmed = stripCr(lines[first]).trim();

    // Letter-ordinal editions (Apostle) open a book on a fresh page with the
    // division heading as the first line and NO running head above it and NO
    // labelled chapter after it. The frozen converter strips line 1 as the
    // page head, so the book heading would vanish. Insert the placeholder;
    // the CHAPTER-1 pair rule below can't fire here (chapter 1 is unlabelled).
    if (config.headingStyle?.bookOrdinal === 'greek-letter') {
      const bookLetter = /^BOOK\s+(\S{1,2})$/iu.exec(firstTrimmed);
      const letter = bookLetter?.[1];
      if (
        letter &&
        (GREEK_LETTER_ORDINALS[letter] ?? GREEK_LETTER_ORDINALS[letter.toUpperCase()]) !== undefined
      ) {
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
          evidence: { reason: 'letter-ordinal book-opening page, running head absent', firstLine: firstTrimmed },
        });
        continue;
      }
    }

    const second = firstNonBlankLine(lines, first + 1);
    if (second === null) continue;

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
  nextId: ReturnType<typeof changeFactory>,
  config: CorpusConfig,
  decisions?: ReviewDecisions
): void {
  let book = 0;
  let chapter = 0;
  // The current book heading's centred indent, reused so synthesized/rewritten
  // chapter headings clear the converter's LEFT_MIN heading gate (a numeral at
  // its shallow printed indent reads as body text). Safe default until the
  // first book heading is seen.
  let bookHeadingLeading = 32;
  // "CHAPTER 1" lines to splice in after a book heading for bare-numeral
  // editions (the print leaves the opening chapter unlabelled). Applied after
  // the walk so line indices stay stable during it.
  const chapterOneInserts: { page: number; afterLine: number; indent: number }[] = [];

  // SEAT-chapter directives (John's ground truth for chapter numerals the
  // scan dropped). Each anchor must resolve to exactly ONE line in the whole
  // corpus — an ambiguous or absent anchor is flagged up front and never
  // seats, mirroring the tick SEAT contract.
  const seatChapters = (decisions?.seatChapters ?? []).map((d) => ({ ...d, done: false }));
  const seatLines = new Map<string, typeof seatChapters>();
  for (const seat of seatChapters) {
    let matches = 0;
    let firstPage = 0;
    let firstLine: number | undefined;
    for (let page = 0; page < pages.length; page += 1) {
      const lines = pages[page].lines;
      for (let line = 0; line < lines.length; line += 1) {
        if (!stripCr(lines[line]).includes(seat.anchor)) continue;
        matches += 1;
        if (matches === 1) {
          firstPage = page;
          firstLine = line;
        }
      }
    }
    if (matches !== 1) {
      seat.done = true;
      changes.push({
        id: nextId(firstPage, firstLine, undefined),
        stage: 2,
        tier: 2,
        rule: 'flag',
        page: firstPage,
        line: firstLine,
        before: seat.anchor,
        evidence: { kind: 'seat-chapter-anchor-ambiguous', book: seat.book, chapter: seat.chapter, matches },
      });
      continue;
    }
    const key = `${firstPage}:${firstLine}`;
    seatLines.set(key, [...(seatLines.get(key) ?? []), seat]);
  }
  // Two directives whose (individually unique) anchors resolve to the SAME
  // line would stack two headings there — the second can even pass the
  // sequence gate, so it must be refused up front, not silently applied.
  for (const collided of seatLines.values()) {
    if (collided.length < 2) continue;
    for (const seat of collided) {
      seat.done = true;
      changes.push({
        id: nextId(0, undefined, undefined),
        stage: 2,
        tier: 2,
        rule: 'flag',
        page: 0,
        before: seat.anchor,
        evidence: {
          kind: 'seat-chapter-anchor-collision',
          book: seat.book,
          chapter: seat.chapter,
          collidesWith: collided.filter((s) => s !== seat).map((s) => `${s.book}.${s.chapter}`),
        },
      });
    }
  }

  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page].lines;
    const skipped = firstNonBlankLine(lines);

    for (let line = 0; line < lines.length; line += 1) {
      if (line === skipped) continue;
      const rawLine = lines[line];
      const content = stripCr(rawLine);
      const trimmed = content.trim();

      // A pending SEAT-chapter anchor names this line as the opening of a
      // chapter whose printed numeral the scan lost. Sequence-forced against
      // the walk's running counters — a directive that lands in the wrong
      // book, out of order, or past the book's declared chapter total is
      // flagged, never inserted.
      const seat = seatChapters.find((s) => !s.done && content.includes(s.anchor));
      if (seat) {
        seat.done = true;
        const maxChapters = book >= 1 ? config.divisions.chaptersPerBook[book - 1] ?? Number.MAX_SAFE_INTEGER : 0;
        if (seat.book === book && seat.chapter === chapter + 1 && seat.chapter <= maxChapters) {
          lines.splice(line, 0, `${' '.repeat(bookHeadingLeading)}CHAPTER ${seat.chapter}`);
          changes.push({
            id: nextId(page, line, bookHeadingLeading),
            stage: 2,
            tier: 2,
            rule: 'heading-normalize',
            page,
            line,
            col: bookHeadingLeading,
            before: '',
            after: `CHAPTER ${seat.chapter}`,
            evidence: { kind: 'seat-chapter', book: seat.book, chapter: seat.chapter, anchor: seat.anchor },
          });
          chapter = seat.chapter;
          // The anchor line itself (now at line + 1) still gets a normal walk
          // visit on the next iteration.
          continue;
        }
        changes.push({
          id: nextId(page, line, undefined),
          stage: 2,
          tier: 2,
          rule: 'flag',
          page,
          line,
          before: seat.anchor,
          evidence: {
            kind: 'seat-chapter-conflict',
            book: seat.book,
            chapter: seat.chapter,
            walkBook: book,
            expectedChapter: chapter + 1,
          },
        });
      }

      if (/^BOOK\s+(\S{1,12})$/iu.test(trimmed)) {
        const match = /^(\s*)(BOOK)(\s+)(\S{1,12})(\s*)$/iu.exec(content);
        if (!match) continue;
        const [, leading, keyword, gap, token, suffix] = match;
        const prefix = `${leading}${keyword}${gap}`;
        const col = tokenCol(prefix);
        const upper = token.toUpperCase();
        const expectedBook = book + 1;

        // Config-declared single-letter book ordinal (Apostle "BOOK A/B").
        // Gated, sequence-forced, and terminal for this line.
        if (config.headingStyle?.bookOrdinal === 'greek-letter') {
          const letterVal = GREEK_LETTER_ORDINALS[token] ?? GREEK_LETTER_ORDINALS[upper];
          if (letterVal !== undefined) {
            const after = spelledOrdinal(letterVal);
            if (letterVal === expectedBook && after) {
              lines[line] = restoreCr(`${leading}${keyword} ${after}${suffix}`, hadCr(rawLine));
              bookHeadingLeading = leading.length;
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
                evidence: { kind: 'letter-book-ordinal', letter: token, value: letterVal, bookSequence: expectedBook },
              });
              book += 1;
              chapter = 0;
              if (config.headingStyle?.chapterNumeral === 'bare') {
                // The book opens with an unlabelled chapter 1; give the
                // converter its heading and start the count at 1 so the
                // printed "2" lands on sequence.
                chapterOneInserts.push({ page, afterLine: line, indent: leading.length });
                chapter = 1;
              }
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
                evidence: { kind: 'book-sequence-conflict', letter: token, value: letterVal, bookSequence: expectedBook },
              });
            }
            continue;
          }
        }

        const greek = GREEK_ORDINALS[upper];

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
        continue;
      }

      if (config.headingStyle?.chapterNumeral === 'bare') {
        // Bare-numeral editions print each chapter as a lone centred numeral
        // with no CHAPTER keyword. Rewrite to the keyword form the converter
        // accepts in a multi-book work. Guards against false positives:
        // (1) centred — left-margin gutter line-marks are excluded;
        // (2) sequence-forced against the running chapter count;
        // (3) bounded by the book's declared chapter total.
        const bare = /^(\s*)([0-9IlrOoSsZz|]{1,3})\s*$/u.exec(content);
        if (bare && bare[1].length >= 8) {
          const [, leading, token] = bare;
          const col = leading.length;
          const value = shapeNumeral(token).value;
          const expected = chapter + 1;
          // No chapters before the first book heading; otherwise the book's
          // declared chapter total bounds acceptance.
          const maxChapters = book >= 1 ? config.divisions.chaptersPerBook[book - 1] ?? Number.MAX_SAFE_INTEGER : 0;
          // Self-healing: accept any centred numeral that advances the count
          // within a small window and stays inside the book's chapter total.
          // A forward jump means the scan dropped the intervening chapter
          // numeral(s) — resync to the surviving one and log the gap, rather
          // than stalling and flagging every later chapter.
          const WINDOW = 3;
          if (value !== null && value > chapter && value <= maxChapters && value <= chapter + WINDOW) {
            // Re-indent to the book-heading's centred column so the rewritten
            // heading clears LEFT_MIN (the printed numeral sits too shallow).
            const headIndent = ' '.repeat(bookHeadingLeading);
            lines[line] = restoreCr(`${headIndent}CHAPTER ${value}`, hadCr(rawLine));
            changes.push({
              id: nextId(page, line, col),
              stage: 2,
              tier: value === expected ? 1 : 2,
              rule: 'heading-normalize',
              page,
              line,
              col,
              before: token,
              after: `CHAPTER ${value}`,
              evidence:
                value === expected
                  ? { kind: 'bare-chapter-numeral', book, expectedChapter: expected }
                  : { kind: 'bare-chapter-numeral', book, expectedChapter: expected, got: value, lostNumerals: value - expected },
            });
            chapter = value;
          } else if (value !== null && value >= 1 && value <= maxChapters) {
            changes.push({
              id: nextId(page, line, col),
              stage: 2,
              tier: 2,
              rule: 'flag',
              page,
              line,
              col,
              before: token,
              evidence: { kind: 'bare-chapter-unresolved', token, expected, degarbled: value },
            });
          }
        }
      }
    }
  }

  // A directive whose unique anchor line the walk never visited (it fell on a
  // page-head line the walk skips) would otherwise vanish silently — surface it.
  for (const seat of seatChapters) {
    if (seat.done) continue;
    changes.push({
      id: nextId(0, undefined, undefined),
      stage: 2,
      tier: 2,
      rule: 'flag',
      page: 0,
      before: seat.anchor,
      evidence: { kind: 'seat-chapter-unapplied', book: seat.book, chapter: seat.chapter },
    });
  }

  // Splice synthesized "CHAPTER 1" headings after their book heading, deepest
  // line first per page so earlier line indices stay valid during the splice.
  const insertsByPage = new Map<number, { afterLine: number; indent: number }[]>();
  for (const ins of chapterOneInserts) {
    const list = insertsByPage.get(ins.page) ?? [];
    list.push({ afterLine: ins.afterLine, indent: ins.indent });
    insertsByPage.set(ins.page, list);
  }
  for (const [page, list] of insertsByPage) {
    list.sort((a, b) => b.afterLine - a.afterLine);
    for (const ins of list) {
      const indent = ' '.repeat(Math.max(0, ins.indent));
      pages[page].lines.splice(ins.afterLine + 1, 0, `${indent}CHAPTER 1`);
      changes.push({
        id: nextId(page, ins.afterLine + 1, ins.indent),
        stage: 2,
        tier: 1,
        rule: 'heading-normalize',
        page,
        line: ins.afterLine + 1,
        col: ins.indent,
        before: '',
        after: 'CHAPTER 1',
        evidence: { kind: 'chapter-one-synthesized', reason: 'bare-numeral edition opens book unlabelled' },
      });
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
  // A single bare number is no cadence — never strip on one page's evidence
  // (cadenceConstant would accept a singleton).
  if (candidates.length < 2) return;
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

export function repairSkeleton(raw: string, config: CorpusConfig, decisions?: ReviewDecisions): SkeletonOutcome {
  const pages = raw.split('\f').map((segment) => ({ lines: segment.split('\n') }));
  const changes: ChangeRecord[] = [];
  const nextId = changeFactory();

  applyPageHeadStrayStrip(pages, changes, nextId, config.runningHeadPlaceholder);
  applyHeadInsert(pages, changes, nextId, config.runningHeadPlaceholder, config);
  applyHeadingNormalize(pages, changes, nextId, config, decisions);
  applyFolioRepair(pages, changes, nextId);
  applyBottomFolioStrip(pages, changes, nextId);

  return { text: pages.map((page) => page.lines.join('\n')).join('\f'), changes };
}
