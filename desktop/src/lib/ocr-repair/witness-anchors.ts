export interface WitnessAnchor {
  ref: string;
  page: number;
  col: 'a' | 'b';
  line?: number;
  raw: string;
  ordinal: number;
  offset: number;
  before: string[];
  after: string[];
}

interface RawAnchor {
  page: number;
  col: 'a' | 'b';
  line?: number;
  raw: string;
  offset: number;
  end: number;
}

const FULL_ANCHOR_RE =
  /([0-9IlrOoSsZz|]{1,4})(?:\s*(?:\^\s*([ab])|\$\^\{?([ab])\}?\$|<sup>\s*([ab])\s*<\/sup>|([abAB])|([ᵃᵇ])))([0-9IlrOoSsZz|]{1,2})?/giu;
const CONTINUATION_RE =
  /(?:\^\s*([ab])|\$\^\{?([ab])\}?\$|<sup>\s*([ab])\s*<\/sup>|([ᵃᵇ]))/giu;
const WORD_RE = /[\p{L}\p{N}]+/gu;

function normalizeCol(raw: string): 'a' | 'b' {
  return raw === 'ᵃ' || raw.toLowerCase() === 'a' ? 'a' : 'b';
}

function normalizeDigits(raw: string): number {
  const map: Record<string, string> = { I: '1', l: '1', '|': '1', r: '1', O: '0', o: '0', S: '5', s: '5', Z: '2', z: '2' };
  return Number([...raw].map((ch) => map[ch] ?? ch).join(''));
}

function separatorLine(line: string): boolean {
  return /^---(?:\s.*)?$/u.test(line.trim());
}

function contextWords(text: string, start: number, end: number): { before: string[]; after: string[] } {
  const before = [...text.slice(0, start).matchAll(WORD_RE)].map((m) => m[0]).slice(-5);
  const after = [...text.slice(end).matchAll(WORD_RE)].map((m) => m[0]).slice(0, 5);
  return { before, after };
}

function overlaps(anchor: RawAnchor, claimed: RawAnchor[]): boolean {
  return claimed.some((other) => anchor.offset < other.end && anchor.end > other.offset);
}

function extractPageAnchors(text: string): WitnessAnchor[] {
  const events: ({ kind: 'full' } & RawAnchor | { kind: 'continuation'; col: 'a' | 'b'; raw: string; offset: number; end: number })[] = [];

  for (const match of text.matchAll(FULL_ANCHOR_RE)) {
    const colRaw = match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6];
    if (!colRaw || match.index === undefined) continue;
    if (!/[0-9]/u.test(match[1])) continue;
    const page = normalizeDigits(match[1]);
    const col = normalizeCol(colRaw);
    const line = match[7] === undefined ? undefined : normalizeDigits(match[7]);
    const raw = match[0];
    events.push({ kind: 'full', page, col, line, raw, offset: match.index, end: match.index + raw.length });
  }

  for (const match of text.matchAll(CONTINUATION_RE)) {
    if (match.index === undefined) continue;
    const colRaw = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (!colRaw) continue;
    const raw = match[0];
    events.push({ kind: 'continuation', col: normalizeCol(colRaw), raw, offset: match.index, end: match.index + raw.length });
  }

  events.sort((a, b) => a.offset - b.offset);
  const rawAnchors: RawAnchor[] = [];
  let lastPage: number | null = null;
  for (const event of events) {
    if (event.kind === 'full') {
      rawAnchors.push(event);
      lastPage = event.page;
      continue;
    }
    if (lastPage === null || overlaps({ ...event, page: lastPage }, rawAnchors)) continue;
    rawAnchors.push({ page: lastPage, col: event.col, raw: event.raw, offset: event.offset, end: event.end });
  }

  rawAnchors.sort((a, b) => a.offset - b.offset);
  return rawAnchors.map((anchor, ordinal) => {
    const { before, after } = contextWords(text, anchor.offset, anchor.end);
    return {
      ref: `${anchor.page}${anchor.col}${anchor.line ?? ''}`,
      page: anchor.page,
      col: anchor.col,
      line: anchor.line,
      raw: anchor.raw,
      ordinal,
      offset: anchor.offset,
      before,
      after,
    };
  });
}

export function extractWitnessAnchors(witnessText: string): WitnessAnchor[][] {
  const pages: string[] = [];
  let current: string[] = [];

  for (const line of witnessText.split(/\n/u)) {
    if (!separatorLine(line)) {
      current.push(line);
      continue;
    }
    pages.push(current.join('\n'));
    current = [];
    if (/\[blank\]/iu.test(line)) pages.push('');
  }
  pages.push(current.join('\n'));

  if (pages.length > 1 && pages[0] === '') pages.shift();
  return pages.map((page) => extractPageAnchors(page));
}
