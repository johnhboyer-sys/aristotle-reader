/**
 * Language-agnostic sentence segmentation of one paragraph's text, returning
 * INTERNAL split offsets (never 0, never text.length) suitable for seeding a
 * paragraph row's D6 `splitOffsets` at import time (workbench-design/d8-view-
 * modes.md §3, §6). Offsets are code-unit offsets into `text`, ascending, and
 * are guaranteed to satisfy the same word-boundary rule as
 * `isValidSplitOffset` in `../chapterfile` (the character immediately before
 * the offset is never a letter or combining mark) — see the compatibility
 * test in `__tests__/sentenceSegment.test.ts`.
 *
 * The algorithm is deliberately CONSERVATIVE: sentence splitting only ever
 * seeds an initial guess that a human fixes up with the existing split/merge
 * gestures (d8 §3), so a missed split costs a click and a wrong split costs
 * a click — but a wrong split into the MIDDLE of an abbreviation or a decimal
 * number is worse (it's less obviously a segmentation artifact), so we bias
 * toward under-splitting.
 */

/** Pluggable per-language/per-document sentence rules. */
export interface SentenceRules {
  /** Characters that can end a sentence. */
  terminators: string[];
  /** Abbreviations (without trailing period) that suppress a split after "." — matched case-insensitively. */
  abbreviations: string[];
}

/**
 * Default rules: standard European sentence terminators plus the two Greek
 * marks that serve the same role — the Greek question mark U+037E (`;`,
 * visually identical to the semicolon) and the ano teleia, which appears in
 * source text as either the canonical U+0387 or its visually-identical
 * lookalike U+00B7 (middle dot) — both are accepted as terminators here so
 * segmentation doesn't depend on which codepoint an OCR/import pipeline
 * happened to emit.
 */
export const DEFAULT_RULES: SentenceRules = {
  terminators: ['.', '!', '?', ';', ';', '·', '·'],
  abbreviations: [
    'cf.',
    'e.g.',
    'i.e.',
    'etc.',
    'viz.',
    'vs.',
    'mr.',
    'mrs.',
    'dr.',
    'st.',
    'ch.',
    'p.',
    'pp.',
    'fr.',
    'no.',
  ],
};

/** Unicode "word character": a letter or a combining mark (matches isValidSplitOffset's rule). */
const WORD_CHAR = /[\p{L}\p{M}]/u;
const DIGIT = /[0-9]/;

/** Trailing closing quotes/brackets that a terminator can hide behind before the actual sentence gap. */
const CLOSING_MARK = new Set([
  '”',
  '"',
  "'",
  '’',
  '»',
  ')',
  ']',
  '』',
  '⟩',
]);

/** Strip a trailing "." from an abbreviation list entry's own terminator for lookup, lowercased. */
function normalizeAbbrev(a: string): string {
  return a.toLowerCase();
}

/**
 * Does `text` ending at index `periodIndex` (inclusive, the "." itself) end
 * with one of the rule's abbreviations, e.g. "...cf." or "...Mrs."? Matched
 * on a word-ish tail so "cf." doesn't false-match inside a longer token.
 */
function endsWithAbbreviation(text: string, periodIndex: number, abbreviations: string[]): boolean {
  const upto = text.slice(0, periodIndex + 1);
  const lower = upto.toLowerCase();
  for (const abbrev of abbreviations) {
    const needle = normalizeAbbrev(abbrev);
    if (!lower.endsWith(needle)) continue;
    const startInText = upto.length - needle.length;
    // The character before the abbreviation (if any) must not be a word
    // character — otherwise this is a false match inside a longer word.
    if (startInText > 0 && WORD_CHAR.test(text[startInText - 1])) continue;
    return true;
  }
  return false;
}

/** Is the "." at `periodIndex` preceded by exactly one letter that is itself preceded by a non-word char (an initial, e.g. "A.")? */
function isSingleLetterInitial(text: string, periodIndex: number): boolean {
  const prev = text[periodIndex - 1];
  if (prev === undefined || !WORD_CHAR.test(prev)) return false;
  const before = text[periodIndex - 2];
  return before === undefined || !WORD_CHAR.test(before);
}

/** Is the "." at `periodIndex` a decimal point between two digits? */
function isDecimalPoint(text: string, periodIndex: number): boolean {
  const prev = text[periodIndex - 1];
  const next = text[periodIndex + 1];
  return prev !== undefined && next !== undefined && DIGIT.test(prev) && DIGIT.test(next);
}

/**
 * Segment `text` into sentences, returning ascending internal split offsets
 * (start-of-sentence positions; never 0 or text.length; empty array when no
 * internal boundary is found).
 *
 * Algorithm: scan for each rule terminator. For "." specifically, suppress
 * the split when it's a decimal point between digits, a single-letter
 * initial (e.g. "A."), or immediately follows a listed abbreviation
 * (case-insensitive). For any accepted terminator, consume a run of trailing
 * closing quotes/brackets, then whitespace; the offset of the next Unicode
 * word character is emitted as a split point PROVIDED the word-boundary rule
 * holds (guaranteed by construction: we always land just past whitespace/
 * punctuation). When unsure, no split is emitted.
 */
export function segmentSentences(text: string, rules: SentenceRules = DEFAULT_RULES): number[] {
  const offsets: number[] = [];
  const terminators = new Set(rules.terminators);
  const n = text.length;

  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (!terminators.has(ch)) {
      i++;
      continue;
    }

    if (ch === '.') {
      if (isDecimalPoint(text, i) || isSingleLetterInitial(text, i) || endsWithAbbreviation(text, i, rules.abbreviations)) {
        i++;
        continue;
      }
    }

    // Consume the terminator itself, then any run of further terminators
    // (e.g. "?!" or "..." collapsing to one boundary).
    let j = i + 1;
    while (j < n && terminators.has(text[j])) j++;

    // Consume trailing closing quotes/brackets.
    while (j < n && CLOSING_MARK.has(text[j])) j++;

    // Consume whitespace.
    const afterPunct = j;
    while (j < n && /\s/.test(text[j])) j++;

    if (j >= n) {
      // Nothing follows — no internal boundary here.
      i = afterPunct;
      continue;
    }

    if (WORD_CHAR.test(text[j])) {
      offsets.push(j);
      i = j;
      continue;
    }

    // Next char isn't a word char (more punctuation, a digit, etc.) — too
    // uncertain; conservatively don't split, resume scanning just past what
    // we consumed so we don't re-examine the same terminator forever.
    i = afterPunct;
  }

  return offsets;
}
