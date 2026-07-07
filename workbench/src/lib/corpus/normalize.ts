/**
 * Diacritic normalization shared by the corpus spine/chapter ports.
 *
 * Direct TS port of `_norm` in pipeline/aristotle_pipeline/stage1_chapters.py:
 * accent/diacritic-stripped, lowercased base-letter form for matching text
 * across editions (TLG vs First1KGreek differ only orthographically).
 *
 * Match the Python EXACTLY:
 *   s = unicodedata.normalize("NFD", s)
 *   s = "".join(c for c in s if not unicodedata.combining(c))
 *   s = s.lower().replace("’", "'").replace("ʼ", "'")
 *   s = re.sub(r"[^α-ωa-z ]", " ", s)
 *   return re.sub(r"\s+", " ", s).strip()
 *
 * JS strings are already UTF-16/Unicode, and `String.normalize("NFD")` plus a
 * combining-mark strip via the Unicode general-category regex property
 * (`\p{M}`) reproduces Python's `unicodedata.combining(c)` filter exactly for
 * every codepoint that appears in Greek TEI text.
 */

const COMBINING_MARKS = /\p{M}/gu;
const NON_GREEK_LATIN = /[^α-ωa-z ]/g;
const WHITESPACE_RUN = /\s+/g;

export function norm(s: string): string {
  let out = s.normalize('NFD');
  out = out.replace(COMBINING_MARKS, '');
  out = out.toLowerCase().replace(/’/g, "'").replace(/ʼ/g, "'");
  out = out.replace(NON_GREEK_LATIN, ' ');
  return out.replace(WHITESPACE_RUN, ' ').trim();
}
