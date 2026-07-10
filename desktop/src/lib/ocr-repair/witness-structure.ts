import { GREEK_LETTER_ORDINALS } from './skeleton';

export interface WitnessChapter {
  text: string;
  startLine: number;
}

export interface WitnessStructureDiagnostic {
  tier: 2;
  line: number;
  kind: 'translation-section-missing' | 'book-sequence-conflict' | 'chapter-sequence-conflict';
  expected?: number;
  got?: number;
  token?: string;
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

export function parseWitnessStructure(witnessText: string, workTitle?: string): WitnessStructure {
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
    if (/^BOOK\s+\S+$/iu.test(text) || /^\d+$/u.test(text)) continue;
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
    if (!/^\d+$/u.test(text) || book === 0) continue;
    const value = Number(text);
    const expected = chapter + 1;
    if (value <= chapter || value > chapter + WINDOW) {
      diagnostics.push({ tier: 2, line: i, kind: 'chapter-sequence-conflict', expected, got: value, token: text });
      continue;
    }
    closeChapter(i);
    if (value !== expected) diagnostics.push({ tier: 2, line: i, kind: 'chapter-sequence-conflict', expected, got: value, token: text });
    chapter = value;
    currentKey = `${book}:${chapter}`;
    contentStart = i + 1;
  }
  closeChapter(bodyEnd);

  return { chapters, diagnostics, commentary: commentarySpan(lines, bodyEnd) };
}
