/**
 * Word-boundary extraction: given a line of Greek text and a character
 * offset into it (as resolved by document.caretRangeFromPoint at a click
 * point — see LexiconDrawer.svelte's delegation handler), return the Greek
 * word under that offset.
 *
 * A "word" is a maximal run of Greek letters (with their combining
 * diacritics) plus the elision apostrophe ( ' or the typographic ' / ʼ),
 * which analyses.json keys keep as a trailing character (see betacode.ts /
 * greekToBeta.ts header). Punctuation, spaces, and digits are boundaries.
 */

// Greek letters incl. polytonic precomposed forms, extended range, and the
// combining diacritics NFD can split them into.
const WORD_CHAR = /[Ͱ-Ͽἀ-῿̀-ͯ]/;
// Elision apostrophe variants seen in the corpus: ASCII ', typographic ’ / ʼ.
const ELISION = /['’ʼ]/;

function isWordChar(ch: string): boolean {
  return WORD_CHAR.test(ch);
}

export interface WordSpan {
  text: string;
  start: number;
  end: number; // exclusive
}

/**
 * Find the Greek word span containing `offset` in `text`. Returns null when
 * the offset falls outside any word (whitespace/punctuation) or out of
 * range. `offset` may equal text.length (caret at line end) — treated as
 * "just past the last character."
 */
export function wordAt(text: string, offset: number): WordSpan | null {
  if (text.length === 0) return null;
  const clamped = Math.max(0, Math.min(offset, text.length - 1));
  if (!isWordChar(text[clamped])) return null;

  let start = clamped;
  while (start > 0 && isWordChar(text[start - 1])) start--;

  let end = clamped + 1;
  while (end < text.length && isWordChar(text[end])) end++;
  // A trailing elision apostrophe is part of the word (matches the Beta
  // Code key convention: "d'" not "d").
  if (end < text.length && ELISION.test(text[end])) end++;

  return { text: text.slice(start, end), start, end };
}
