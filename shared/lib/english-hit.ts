// Where an English hit stands on the page: the snippet to show, the Bekker
// line to jump to, and the chapter it belongs to — for any of a work's
// translations, not only the primary.
//
// The index says which words matched (word positions counted by englishWords()
// through the translation's text for the segment); this turns them back into
// a place. The primary translation is one chunk per segment; every other one is
// a run of chapter slices, so a hit is placed in its own slice and the snippet
// never runs across into the next chapter's text.
import type { OverlayPiece, Segment } from './data';
import { englishTermMatcher, englishWords, type EnglishWord } from './search';
import { esc } from './text';
import type { TranslationRef } from './works';

type Tick = { n: number; offset: number; real: boolean };

interface Piece {
  text: string;
  bekker?: Tick[];
  chapter: string | null;   // null: the primary, whose chapters are offsets
  cont: boolean;
}

/** A non-primary translation's slices in a segment, by the field its slot
 * names. `ross` is the pre-rename name of `secondary`, still emitted. */
export function overlayPieces(seg: Segment, t: Pick<TranslationRef, 'id' | 'slot'> | null | undefined): OverlayPiece[] {
  if (!t) return [];
  if (t.slot === 'secondary') return seg.secondary ?? seg.ross ?? [];
  if (t.slot === 'third') return seg.third ?? [];
  if (t.slot === 'overlay') return seg.overlays?.[t.id] ?? [];
  return [];
}

function piecesOf(seg: Segment, t: Pick<TranslationRef, 'id' | 'slot'>): Piece[] {
  if (t.slot === 'english') {
    return seg.english
      ? [{ text: seg.english.text, bekker: seg.english.bekker, chapter: null, cont: false }]
      : [];
  }
  return overlayPieces(seg, t).map(p => ({ text: p.text, bekker: p.bekker, chapter: p.chapter, cont: p.cont }));
}

export interface EnglishPlace {
  html: string;              // KWIC snippet, matched words in <mark>
  line: number;              // Bekker line to jump to: a line the column has
  sub?: string;
  // The chapter the hit is in, when the text says so: an overlay slice names
  // its chapter, the primary marks chapter starts by offset. Null where the
  // primary's hit precedes every chapter start in the column, so it is in
  // whichever chapter the column opened in.
  chapter: string | null;
}

// Characters of context either side of the hit, as before.
const WINDOW = 140;

// The reader shows a footnote marker as a numbered control and floats a
// sidenote or figure out of the prose, so a snippet shows neither.
const FOOTNOTE = /\[\^[0-9A-Za-z_.*†]+\]/g;
const SIDENOTE = /\s*\[\[(?:s|fig)[0-9]+\]\]\s*/g;
const plain = (s: string) => s.replace(SIDENOTE, ' ').replace(FOOTNOTE, '');

/** Place one translation's hit in a segment. `positions` are the index's word
 * positions; when they are missing (an index built before positions) or do
 * not land on a matching word (an index from a different build than the
 * books), the first matching words are found in the text instead, by the same
 * rule the index used — with `forms`, any form of each term, as an "any form"
 * search found it. Null when the translation has no text here. */
export function englishPlace(
  seg: Segment,
  t: Pick<TranslationRef, 'id' | 'slot'>,
  positions: number[],
  terms: string[],
  phrase: boolean,
  forms = false,
): EnglishPlace | null {
  const pieces = piecesOf(seg, t);
  if (!pieces.some(p => p.text)) return null;
  const words: (EnglishWord & { piece: number })[] = [];
  pieces.forEach((p, i) => { for (const w of englishWords(p.text)) words.push({ ...w, piece: i }); });

  const marked = matchedWords(words, positions, terms, phrase, forms);
  const center = marked.length ? marked[0] : -1;
  const pieceIdx = center >= 0 ? words[center].piece : pieces.findIndex(p => p.text);
  const piece = pieces[pieceIdx];
  const offset = center >= 0 ? words[center].start : 0;

  return {
    html: center >= 0 ? snippet(piece.text, words, pieceIdx, center, new Set(marked)) : head(piece.text),
    ...lineFor(seg, piece, offset),
    chapter: piece.chapter ?? primaryChapter(seg, offset),
  };
}

/** A translation's matched word positions in a segment, split by the chapter
 * each word stands in, in text order, so each chapter is credited with its
 * own hits. Positions that do not fit the text (an index from another build)
 * stay together, for englishPlace to place as it can. */
export function positionsByChapter(
  seg: Segment,
  t: Pick<TranslationRef, 'id' | 'slot'>,
  positions: number[],
): number[][] {
  const pieces = piecesOf(seg, t);
  const words: { piece: number; start: number }[] = [];
  pieces.forEach((p, i) => { for (const w of englishWords(p.text)) words.push({ piece: i, start: w.start }); });
  if (!positions.length || !positions.every(p => p < words.length)) return [positions];
  const by = new Map<string, number[]>();
  for (const p of [...positions].sort((a, b) => a - b)) {
    const { piece, start } = words[p];
    // '' is the chapter the column opened in, as englishPlace's null is.
    const chapter = pieces[piece].chapter ?? primaryChapter(seg, start) ?? '';
    (by.get(chapter) ?? by.set(chapter, []).get(chapter)!).push(p);
  }
  return [...by.values()];
}

function matchedWords(
  words: { word: string; piece: number }[],
  positions: number[],
  terms: string[],
  phrase: boolean,
  forms: boolean,
): number[] {
  const any = englishTermMatcher(terms, forms);
  if (positions.length && positions.every(p => p < words.length) && any(words[positions[0]].word)) {
    return [...positions].sort((a, b) => a - b);
  }
  if (phrase && terms.length > 1) {
    const each = terms.map(t => englishTermMatcher([t], forms));
    for (let i = 0; i + terms.length <= words.length; i++) {
      const run = terms.map((_, j) => i + j);
      if (run.every((k, j) => words[k].piece === words[i].piece && each[j](words[k].word))) return run;
    }
    return [];
  }
  return words.flatMap((w, i) => (any(w.word) ? [i] : []));
}

function snippet(
  text: string,
  words: { start: number; end: number; piece: number }[],
  piece: number,
  center: number,
  marked: Set<number>,
): string {
  let first = center;
  while (first > 0 && words[first - 1].piece === piece
    && words[center].start - words[first - 1].start <= WINDOW) first--;
  // A phrase is shown whole, however long; past it, the window decides.
  let last = center;
  while (last + 1 < words.length && words[last + 1].piece === piece && marked.has(last + 1)) last++;
  while (last + 1 < words.length && words[last + 1].piece === piece
    && words[last + 1].end - words[center].start <= WINDOW) last++;

  let html = '';
  for (let i = first; i <= last; i++) {
    if (i > first) html += esc(plain(text.slice(words[i - 1].end, words[i].start)));
    const w = esc(plain(text.slice(words[i].start, words[i].end)));
    html += marked.has(i) ? `<mark>${w}</mark>` : w;
  }
  const more = (i: number) => i >= 0 && i < words.length && words[i].piece === piece;
  if (more(first - 1)) html = '… ' + html;
  if (more(last + 1)) html += ' …';
  return html;
}

function head(text: string): string {
  const t = plain(text);
  return esc(t.slice(0, 300)) + (t.length > 300 ? ' …' : '');
}

// The ticks interpolate Bekker lines down the text (exact at a real
// milestone, an estimate otherwise); between two ticks the line is read off
// proportionally. The answer is snapped to a line the column actually has,
// so the jump lands on an anchor.
function lineFor(seg: Segment, piece: Piece, offset: number): { line: number; sub?: string } {
  const lines = seg.greek;
  if (!lines.length) return { line: 1 };
  let estimate: number | null = null;
  const ticks = piece.bekker ?? [];
  if (ticks.length) {
    let i = 0;
    while (i + 1 < ticks.length && ticks[i + 1].offset <= offset) i++;
    const a = ticks[i];
    const b = ticks[i + 1];
    estimate = b && b.offset > a.offset && offset >= a.offset
      ? a.n + Math.floor(((offset - a.offset) * (b.n - a.n)) / (b.offset - a.offset))
      : a.n;
  } else if (piece.chapter === null) {
    estimate = lines[Math.min(lines.length - 1,
      Math.floor((offset / Math.max(1, piece.text.length)) * lines.length))].n;
  } else if (!piece.cont) {
    estimate = seg.chapterStarts?.find(c => c.chapter === piece.chapter)?.beforeLine ?? null;
  }
  if (estimate === null) return { line: lines[0].n, sub: lines[0].sub };
  let best = lines[0];
  for (const l of lines) if (Math.abs(l.n - estimate) < Math.abs(best.n - estimate)) best = l;
  return { line: best.n, sub: best.sub };
}

function primaryChapter(seg: Segment, offset: number): string | null {
  let chapter: string | null = null;
  let at = -1;
  for (const c of seg.chapterStarts ?? []) {
    if (c.engOffset <= offset && c.engOffset >= at) { chapter = c.chapter; at = c.engOffset; }
  }
  return chapter;
}

/** A stretch of English as HTML with the query's words marked, by the rule
 * the search used: whole words, a wildcard as the index reads it, a unit's
 * words only where they stand in a row, and in an exact phrase only the run.
 * The reader used to mark every word that merely began with a term, so "end"
 * lit up "endure" and the phrase "the good" every "they" and "there".
 * With `forms`, any form of a word, as an "any form" search found it.
 * Footnote and sidenote markers pass through as text, escaped. */
export function markEnglishHtml(text: string, units: string[][], phrase: boolean, forms = false): string {
  const runs = (phrase ? [units.flat()] : units)
    .filter(run => run.length && !(run.length === 1 && run[0] === '*'));
  if (!runs.length) return esc(text);
  const words = englishWords(text);
  const hit = new Set<number>();
  for (const run of runs) {
    const each = run.map(t => englishTermMatcher([t], forms));
    for (let i = 0; i + run.length <= words.length; i++) {
      if (run.every((_, j) => each[j](words[i + j].word))) {
        for (let j = 0; j < run.length; j++) hit.add(i + j);
      }
    }
  }
  let html = '';
  let at = 0;
  words.forEach((w, i) => {
    if (!hit.has(i)) return;
    html += `${esc(text.slice(at, w.start))}<mark>${esc(text.slice(w.start, w.end))}</mark>`;
    at = w.end;
  });
  return html + esc(text.slice(at));
}
