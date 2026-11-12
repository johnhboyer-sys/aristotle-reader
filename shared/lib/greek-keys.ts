// The search page's on-screen Greek keyboard: what its keys are, and the edit
// each makes to the Greek box. A key types at the caret; a mark joins the
// letter before the caret, composed as the Beta Code box composes it
// (liveGreek); backspace takes a whole letter with its marks.

import { liveGreek, LIVE_RANK } from './betacode';

export const GREEK_KEYS = [...'αβγδεζηθικλμνξοπρστυφχψως'];

// `face` is what the key shows: the mark on a vowel, as one precomposed
// letter. A bare combining mark draws on a dotted circle, or not at all, in
// many phone fonts.
export const GREEK_MARKS: { mark: string; name: string; face: string }[] = [
  { mark: '\u0313', name: 'smooth breathing', face: 'ἀ' },
  { mark: '\u0314', name: 'rough breathing', face: 'ἁ' },
  { mark: '\u0301', name: 'acute', face: 'ά' },
  { mark: '\u0300', name: 'grave', face: 'ὰ' },
  { mark: '\u0342', name: 'circumflex', face: 'ᾶ' },
  { mark: '\u0308', name: 'diaeresis', face: 'ϊ' },
  { mark: '\u0345', name: 'iota subscript', face: 'ᾳ' },
];

export interface KeyEdit { value: string; caret: number }

export function insertText(value: string, start: number, end: number, text: string): KeyEdit {
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
}

// The letters each mark may stand on: accents on vowels (the circumflex on
// those that can be long), breathings on vowels and ρ (ρ only rough),
// diaeresis on ι and υ, the subscript under α, η and ω.
const MARK_BASES: Record<string, string> = {
  '\u0301': 'αεηιουω', '\u0300': 'αεηιουω', '\u0342': 'αηιυω',
  '\u0313': 'αεηιουω', '\u0314': 'αεηιουωρ',
  '\u0308': 'ιυ', '\u0345': 'αηω',
};

const isMark = (ch: string) => /\p{M}/u.test(ch);
// Where the letter before `caret` begins, its marks included.
function letterStart(value: string, caret: number): number {
  let i = caret;
  while (i > 0 && isMark(value[i - 1])) i--;
  return i > 0 ? i - 1 : 0;
}

/** The mark joined to the Greek letter before the caret; one of the same kind
 * (breathing or diaeresis, accent, subscript) is replaced, not stacked. Null
 * when no letter that can take the mark stands there. */
export function addMark(value: string, caret: number, mark: string): KeyEdit | null {
  if (caret <= 0) return null;
  const start = letterStart(value, caret);
  const [base, ...marks] = value.slice(start, caret).normalize('NFD');
  if (!base || !MARK_BASES[mark]?.includes(base.toLowerCase())) return null;
  const kept = marks.filter((m) => LIVE_RANK[m] !== LIVE_RANK[mark]);
  const letter = liveGreek(base + [...kept, mark].join(''));
  return { value: value.slice(0, start) + letter + value.slice(caret), caret: start + letter.length };
}

/** Backspace: the selection, or the letter before the caret with its marks. */
export function deleteBack(value: string, start: number, end: number): KeyEdit {
  if (end > start) return { value: value.slice(0, start) + value.slice(end), caret: start };
  if (start <= 0) return { value, caret: 0 };
  const from = letterStart(value, start);
  return { value: value.slice(0, from) + value.slice(start), caret: from };
}
