// English matching and snippets shared by search and the reader. Turn-aligned
// translations follow their book's turnFlow; column translations follow each
// segment's pieces. Bekker line and chapter placement lives in english-place.
import type { BookData, Segment } from './data';
import { englishTermMatcher, englishWords, type EnglishWord } from './search';
import { esc } from './text';
import type { TranslationRef } from './works';

type Ref = Pick<TranslationRef, 'id' | 'slot'>;

/** One turn-aligned translation's texts in a book, by segment id, in turn
 * order. A turn goes under the section its Greek starts in (g.c); an
 * English-only residual (g null) under the section before it, or the book's
 * first. Mirror of stage6 turn_translations(). */
export function turnTranslationTexts(book: Pick<BookData, 'segments' | 'turnFlow'>, id: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const turns = book.turnFlow?.turns;
  if (!turns?.length || !book.segments.length) return out;
  const ids = new Map(book.segments.map(s => [s.column, s.id]));
  let current = book.segments[0].id;
  for (const turn of turns) {
    const at = turn.g ? ids.get(turn.g.c) : undefined;
    if (at) current = at;
    const text = turn.alt?.[id]?.e;
    if (text) (out.get(current) ?? out.set(current, []).get(current)!).push(text);
  }
  return out;
}

/** A translation's texts in one segment, in the order the index counted
 * them. `turns` is the book's turnTranslationTexts for this translation, which
 * is where a turn-aligned overlay lives; a section-cut overlay (the sister
 * repo's shape) is read off the segment. */
export function translationTexts(seg: Segment, t: Ref, turns?: Map<string, string[]>): string[] {
  if (t.slot === 'english') return seg.english?.text ? [seg.english.text] : [];
  if (t.slot === 'secondary') return (seg.secondary ?? seg.ross ?? []).map(p => p.text);
  if (t.slot === 'third') return (seg.third ?? []).map(p => p.text);
  const pieces = seg.overlays?.[t.id];
  if (pieces?.length) return pieces.map(p => p.text);
  return turns?.get(seg.id) ?? [];
}

// Characters of context either side of the hit, unless the caller asks for
// another (the results page's Context control).
export const WINDOW = 140;

// The reader shows a footnote marker as a numbered control and floats a
// sidenote or figure out of the prose, so a snippet shows neither.
const FOOTNOTE = /\[\^[0-9A-Za-z_.*†]+\]/g;
const SIDENOTE = /\s*\[\[(?:s|fig)[0-9]+\]\]\s*/g;
const plain = (s: string) => s.replace(SIDENOTE, ' ').replace(FOOTNOTE, '');
export { plain as plainEnglish };

/** The KWIC snippets for one translation's hit in a segment, matched words
 * in <mark>: one passage for each place the words fall, so every match the
 * results count is shown — a second match in another speech, or past the
 * first one's window, gets a passage of its own. `positions` are the index's
 * word positions; when they are missing or any does not land on a match (an
 * index from a different build than the books), the matches are found in the
 * text instead, by the rule the index used: `units` are the query's words as
 * englishQueryUnits() groups them, a unit's words standing together (a
 * hyphenated word), and the whole query one run under `phrase` — with
 * `forms`, any form of each word, as an "any form" search found it. Empty
 * when the translation has no text here. With `centers` (word positions from
 * englishMarked), only the passages around those words are built; every match
 * in them is still marked. `reach` is the characters of context either side. */
export function englishSnippets(
  texts: string[],
  positions: number[],
  units: string[][],
  phrase: boolean,
  forms = false,
  centers?: number[],
  reach = WINDOW,
): string[] {
  if (!texts.some(Boolean)) return [];
  const words: (EnglishWord & { piece: number })[] = [];
  texts.forEach((text, i) => { for (const w of englishWords(text)) words.push({ ...w, piece: i }); });

  const { marked, runEnd } = matchedWords(words, positions, phrase ? [units.flat()] : units, forms);
  if (!marked.length) return [head(texts.find(Boolean)!)];
  const set = new Set(marked);
  const only = centers && new Set(centers);
  const out: string[] = [];
  let shown = -1;   // the last word a passage so far has printed
  for (const center of marked) {
    if (only && !only.has(center)) continue;
    if (center <= shown) continue;
    const piece = words[center].piece;
    const { html, last } = snippet(texts[piece], words, piece, center, set, shown, runEnd, reach);
    out.push(html);
    shown = last;
  }
  return out;
}

/** The word positions englishSnippets marks, in order: the index's where they
 * can be trusted, else every match found in the text. Counted through `texts`
 * as the index counts them. */
export function englishMarked(
  texts: string[],
  positions: number[],
  units: string[][],
  phrase: boolean,
  forms = false,
): number[] {
  const words = texts.flatMap(text => englishWords(text));
  return matchedWords(words, positions, phrase ? [units.flat()] : units, forms).marked;
}

// The words the query matched, and for each the last word of the longest-
// reaching run it stands in, so a passage can show that run whole.
function matchedWords(
  words: { word: string }[],
  positions: number[],
  runs: string[][],
  forms: boolean,
): { marked: number[]; runEnd: Map<number, number> } {
  // Every run of the query in the text, overlapping runs included, as
  // phraseStarts() finds them: the index counts a section's words straight
  // through its speeches, so a run may cross from one into the next. The bare
  // * matches no word in particular, so marks none.
  const spans: [number, number][] = [];
  for (const run of runs) {
    if (run.length === 1 && run[0] === '*') continue;
    const tests = run.map(t => englishTermMatcher([t], forms));
    for (let i = 0; i + run.length <= words.length; i++) {
      if (tests.every((test, j) => test(words[i + j].word))) spans.push([i, i + run.length - 1]);
    }
  }
  const found = new Set(spans.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, j) => a + j)));
  // The index's positions, when every one falls in such a run: one that does
  // not means the index counted a different text, and the rest are no safer.
  const trusted = positions.length > 0 && positions.every(p => found.has(p));
  const marked = trusted ? new Set(positions) : found;
  const runEnd = new Map<number, number>();
  for (const [a, b] of spans) {
    let whole = true;
    for (let k = a; k <= b; k++) whole &&= marked.has(k);
    if (!whole) continue;
    for (let k = a; k <= b; k++) runEnd.set(k, Math.max(runEnd.get(k) ?? k, b));
  }
  return { marked: [...marked].sort((a, b) => a - b), runEnd };
}

function snippet(
  text: string,
  words: { start: number; end: number; piece: number }[],
  piece: number,
  center: number,
  marked: Set<number>,
  shown: number,
  runEnd: Map<number, number>,
  reach: number,
): { html: string; last: number } {
  // Back no further than the passage before it reached, so no word prints twice.
  let first = center;
  while (first - 1 > shown && words[first - 1].piece === piece
    && words[center].start - words[first - 1].start <= reach) first--;
  // A run is shown whole, however long; past it, the window decides, and a
  // run the window reaches is not cut off at its edge, nor is a run that
  // shares a word with it. Neither goes on into a run that only stands beside
  // it, nor into the next speech.
  const through = (from: number) => {
    let at = from;
    let end = runEnd.get(from) ?? from;
    while (at < end && words[at + 1].piece === piece) {
      at++;
      end = Math.max(end, runEnd.get(at) ?? at);
    }
    return at;
  };
  let last = through(center);
  while (last + 1 < words.length && words[last + 1].piece === piece
    && words[last + 1].end - words[center].start <= reach) last++;
  last = through(last);

  let html = '';
  for (let i = first; i <= last; i++) {
    if (i > first) html += esc(plain(text.slice(words[i - 1].end, words[i].start)));
    const w = esc(plain(text.slice(words[i].start, words[i].end)));
    html += marked.has(i) ? `<mark>${w}</mark>` : w;
  }
  const more = (i: number) => i >= 0 && i < words.length && words[i].piece === piece;
  if (more(first - 1)) html = '… ' + html;
  if (more(last + 1)) html += ' …';
  return { html, last };
}

function head(text: string): string {
  const t = plain(text);
  return esc(t.slice(0, 300)) + (t.length > 300 ? ' …' : '');
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

/** A text as HTML with the words at `marked` in <mark>: word positions as
 * englishWords counts them through this text. The words a search's own hits
 * hold, where markEnglishHtml would mark every word the query matches.
 * Footnote and sidenote markers are left out, as a snippet leaves them. */
export function markWordsHtml(text: string, marked: ReadonlySet<number>): string {
  let html = '';
  let at = 0;
  englishWords(text).forEach((w, i) => {
    const word = esc(plain(text.slice(w.start, w.end)));
    html += esc(plain(text.slice(at, w.start))) + (marked.has(i) ? `<mark>${word}</mark>` : word);
    at = w.end;
  });
  return html + esc(plain(text.slice(at)));
}

export { englishPlace, positionsByChapter, positionsBySection } from './english-place';
export type { EnglishPlace } from './english-place';

export { overlayPieces } from './english-place';
