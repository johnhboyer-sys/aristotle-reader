// The word popup's class line and "Less likely" readings (John, 2026-11-10:
// options P2 and U2, with the dialect rule plus an approved list). The
// pipeline marks each reading with `pos` and `unlikely`; these helpers decide
// how a card shows them.

const ORDER = ['noun', 'verb', 'adj', 'article', 'pronoun', 'adverb', 'prep', 'conj', 'particle', 'exclam', 'numeral', 'letter'];
const NAMES: Record<string, string> = { adj: 'adjective', prep: 'preposition', conj: 'conjunction', exclam: 'interjection' };

/** A card's classes in a reader's words: "conjunction", "adjective and
 * pronoun" (a word that is both, as ἄλλος is). '' when none is known. */
export function classLine(pos: string[]): string {
  const rank = (c: string) => { const i = ORDER.indexOf(c); return i < 0 ? ORDER.length : i; };
  return [...new Set(pos)].sort((a, b) => rank(a) - rank(b)).map(c => NAMES[c] ?? c).join(' and ');
}

/** A parse row without Morpheus's "indeclform (…)", which the class line
 * replaces; what else the row says (enclitic, poetic, contr) stays. Attic,
 * Plato's own dialect, is never printed. */
export function withoutIndeclform(text: string): string {
  // "indeclform" and the class after it go, wherever Morpheus put them:
  // "indeclform (conj)", "attic (indeclform conj)", "doric aeolic (proclitic
  // indeclform prep)". The parentheses go with them; the other words stay.
  if (!/\bindeclform\b/.test(text)) return text.trim();
  return text
    .replace(/\bindeclform\b\s*(\([^)]*\)|[^\s()]+)?/g, ' ')
    .replace(/[()]/g, ' ')
    .split(/\s+/).filter(w => w && w !== 'attic').join(' ');
}

/** The likely cards first, then the less likely, with the index the less
 * likely start at; -1 when nothing is dimmed: no card is unlikely, or every
 * one is (a word in a line of Homer has no likelier reading to stand behind). */
export function lessLikelyFrom<C extends { unlikely: boolean }>(cards: C[]): { cards: C[]; from: number } {
  const likely = cards.filter(c => !c.unlikely);
  const less = cards.filter(c => c.unlikely);
  if (!likely.length || !less.length) return { cards, from: -1 };
  return { cards: [...likely, ...less], from: likely.length };
}
