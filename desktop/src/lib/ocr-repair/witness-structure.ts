import { GREEK_LETTER_ORDINALS } from './skeleton';

export interface WitnessChapter {
  text: string;
  startLine: number;
}

export interface WitnessStructureDiagnostic {
  tier: 2;
  line: number;
  kind:
    | 'translation-section-missing'
    | 'book-sequence-conflict'
    | 'chapter-sequence-conflict'
    | 'chapter-heading-marker'
    | 'witness-seat-failed';
  expected?: number;
  got?: number;
  token?: string;
  reason?: string;
}

/** A witness translation chapter whose heading the witness OCR lost entirely,
 * re-seated from a decided-file directive (`SEAT-witness-chapter`). */
export interface WitnessChapterSeat {
  book: number;
  chapter: number;
  anchor: string;
}

export interface WitnessSectionSpan {
  startLine: number;
  endLine: number;
  text: string;
}

export interface WitnessStructure {
  chapters: Map<`${number}:${number}`, WitnessChapter>;
  diagnostics: WitnessStructureDiagnostic[];
  commentary: WitnessSectionSpan | null;
}

interface Heading {
  level: number;
  text: string;
}

const WINDOW = 3;

function heading(line: string): Heading | null {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line.trim());
  return match ? { level: match[1].length, text: match[2].trim() } : null;
}

const SUP_DIGITS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

// A chapter numeral, tolerating an endnote marker the print seats ON the
// numeral itself when the note anchors to the chapter's opening words —
// "18¹", "18$^{1}$", "18<sup>1</sup>". Must run on the RAW heading text:
// plainHeading's tag-strip would fuse "18<sup>1</sup>" into "181". Losing
// the heading over the marker costs the whole chapter its witness
// arbitration (Apostle APo II.18).
function chapterNumeral(raw: string): { value: number; marker: string | null } | null {
  const cleaned = raw.replace(/[*_~`]/gu, '').trim();
  const match = /^(\d+)(?:([⁰¹²³⁴⁵⁶⁷⁸⁹]+)|\$\^\{(\d+)\}\$|\$\^(\d+)\$|<sup>\s*(\d+)\s*<\/sup>)?$/u.exec(cleaned);
  if (!match) return null;
  const marker = match[2] ? [...match[2]].map((c) => SUP_DIGITS[c]).join('') : match[3] ?? match[4] ?? match[5] ?? null;
  return { value: Number(match[1]), marker };
}

function plainHeading(raw: string): string {
  return raw
    .replace(/<[^>]+>/gu, '')
    .replace(/[*_~`]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function titleFromDocument(lines: string[]): string | null {
  for (const line of lines) {
    const parsed = heading(line);
    if (parsed?.level === 1) return plainHeading(parsed.text);
  }
  return null;
}

function commentarySpan(lines: string[], from: number): WitnessSectionSpan | null {
  for (let i = from; i < lines.length; i += 1) {
    const parsed = heading(lines[i]);
    if (parsed?.level !== 2 || !/^COMMENTAR(?:Y|IES)\b/iu.test(plainHeading(parsed.text))) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (heading(lines[j])?.level === 2) {
        end = j;
        break;
      }
    }
    return { startLine: i, endLine: end, text: lines.slice(i, end).join('\n') };
  }
  return null;
}

export function parseWitnessStructure(
  witnessText: string,
  workTitle?: string,
  seats?: WitnessChapterSeat[]
): WitnessStructure {
  const lines = witnessText.split(/\n/u);
  const chapters = new Map<`${number}:${number}`, WitnessChapter>();
  const diagnostics: WitnessStructureDiagnostic[] = [];
  const title = workTitle?.trim() || titleFromDocument(lines);
  let bodyStart = -1;

  if (title) {
    const normalizedTitle = plainHeading(title).toLocaleLowerCase();
    bodyStart = lines.findIndex((line) => {
      const parsed = heading(line);
      return parsed?.level === 2 && plainHeading(parsed.text).toLocaleLowerCase() === normalizedTitle;
    });
  }

  if (bodyStart < 0) {
    diagnostics.push({ tier: 2, line: 0, kind: 'translation-section-missing' });
    return { chapters, diagnostics, commentary: commentarySpan(lines, 0) };
  }

  let bodyEnd = lines.length;
  for (let i = bodyStart + 1; i < lines.length; i += 1) {
    const parsed = heading(lines[i]);
    if (!parsed || parsed.level !== 2) continue;
    const text = plainHeading(parsed.text);
    // Numeral H2s are chapter-heading level jitter, never section ends —
    // post-translation sections in this format open with NAMED H2s
    // (COMMENTARIES, Glossary). Deliberately sequence-blind, same as the
    // walk below: an out-of-sequence numeral is the walk's conflict to
    // flag, not a section boundary.
    if (/^BOOK\s+\S+$/iu.test(text) || chapterNumeral(parsed.text)) continue;
    bodyEnd = i;
    break;
  }

  let book = 0;
  let chapter = 0;
  let currentKey: `${number}:${number}` | null = null;
  let contentStart = -1;
  const closeChapter = (end: number) => {
    if (currentKey === null) return;
    chapters.set(currentKey, { text: lines.slice(contentStart, end).join('\n'), startLine: contentStart });
  };

  for (let i = bodyStart + 1; i < bodyEnd; i += 1) {
    const parsed = heading(lines[i]);
    if (!parsed) continue;
    const text = plainHeading(parsed.text);
    const bookMatch = /^BOOK\s+(\S+)$/iu.exec(text);
    if (bookMatch) {
      const token = bookMatch[1].toUpperCase();
      const value = GREEK_LETTER_ORDINALS[token];
      const expected = book + 1;
      if (value !== expected) {
        diagnostics.push({ tier: 2, line: i, kind: 'book-sequence-conflict', expected, got: value, token: bookMatch[1] });
        continue;
      }
      closeChapter(i);
      currentKey = null;
      book = value;
      chapter = 0;
      continue;
    }
    const numeral = chapterNumeral(parsed.text);
    if (!numeral || book === 0) continue;
    const value = numeral.value;
    const expected = chapter + 1;
    if (value <= chapter || value > chapter + WINDOW) {
      diagnostics.push({ tier: 2, line: i, kind: 'chapter-sequence-conflict', expected, got: value, token: text });
      continue;
    }
    closeChapter(i);
    if (value !== expected) diagnostics.push({ tier: 2, line: i, kind: 'chapter-sequence-conflict', expected, got: value, token: text });
    // The marker belongs to the chapter's opening words, not the numeral —
    // surface it for the endnote wiring rather than silently dropping it.
    if (numeral.marker) diagnostics.push({ tier: 2, line: i, kind: 'chapter-heading-marker', got: value, token: numeral.marker });
    chapter = value;
    currentKey = `${book}:${chapter}`;
    contentStart = i + 1;
  }
  closeChapter(bodyEnd);

  // SEAT-witness-chapter: split the host chapter's span at the anchored line.
  // Line-granular — the anchor line must BEGIN the lost chapter (genie
  // paragraphs are single lines, and Apostle chapters open on a paragraph).
  for (const seat of seats ?? []) {
    const key: `${number}:${number}` = `${seat.book}:${seat.chapter}`;
    const fail = (reason: string, line = 0) =>
      diagnostics.push({ tier: 2, line, kind: 'witness-seat-failed', token: seat.anchor, reason });
    if (chapters.has(key)) {
      fail(`chapter-${key}-already-present`);
      continue;
    }
    const hits: number[] = [];
    for (let i = bodyStart + 1; i < bodyEnd; i += 1) {
      if (lines[i].includes(seat.anchor)) hits.push(i);
    }
    if (hits.length !== 1) {
      fail(hits.length === 0 ? 'anchor-unmatched' : 'anchor-ambiguous', hits[1] ?? 0);
      continue;
    }
    const at = hits[0];
    let host: { key: `${number}:${number}`; chapter: WitnessChapter; end: number } | null = null;
    for (const [hostKey, hostChapter] of chapters) {
      const end = hostChapter.startLine + hostChapter.text.split('\n').length;
      if (at >= hostChapter.startLine && at < end) {
        host = { key: hostKey, chapter: hostChapter, end };
        break;
      }
    }
    if (!host) {
      fail('anchor-outside-chapters', at);
      continue;
    }
    const [hostBook, hostNum] = host.key.split(':').map(Number);
    if (hostBook !== seat.book || hostNum >= seat.chapter) {
      fail(`anchor-inside-${host.key}`, at);
      continue;
    }
    // Chapters are physically ordered, so the host must be the chapter that
    // immediately precedes the seat target among those mapped for the book —
    // seating 4 into chapter 1 while chapter 3 is mapped would put chapter
    // 4's text before chapter 3's. Two consecutive lost chapters seat in
    // ascending order: the first seat becomes the second's host.
    let precedingNum = 0;
    for (const mappedKey of chapters.keys()) {
      const [mappedBook, mappedNum] = mappedKey.split(':').map(Number);
      if (mappedBook === seat.book && mappedNum < seat.chapter && mappedNum > precedingNum) precedingNum = mappedNum;
    }
    if (hostNum !== precedingNum) {
      fail(`anchor-inside-${host.key}-but-${seat.book}:${precedingNum}-precedes-target`, at);
      continue;
    }
    // Splitting at the host's own first line would leave the host empty.
    if (at === host.chapter.startLine) {
      fail(`anchor-at-start-of-${host.key}`, at);
      continue;
    }
    chapters.set(host.key, {
      text: lines.slice(host.chapter.startLine, at).join('\n'),
      startLine: host.chapter.startLine,
    });
    chapters.set(key, { text: lines.slice(at, host.end).join('\n'), startLine: at });
  }

  return { chapters, diagnostics, commentary: commentarySpan(lines, bodyEnd) };
}
