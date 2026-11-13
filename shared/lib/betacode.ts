// -- Beta Code → Unicode (polytonic) Greek --------------------------------
//
// Morphology lemmas (analyses.json) are stored in TLG Beta Code, e.g.
// "*eu)rw/phs" → "Εὐρώπης". The reader normally shows the pre-converted
// Unicode LSJ headword instead, but when a parse has no matching LSJ entry it
// must fall back to the raw lemma — which has to be converted here so it never
// surfaces as Beta Code.
//
// Conventions handled (Morpheus/TLG output):
//   *       capital marker — diacritics for a capital come BETWEEN * and the
//           letter (e.g. "*)a" = Ἀ); for lowercase they follow it ("a)" = ἀ).
//   )       smooth breathing      (       rough breathing
//   /       acute       \  grave       =  circumflex
//   |       iota subscript        +      diaeresis
//   s       sigma, rendered as final ς at word end, else σ
//   trailing 1-9  LSJ homograph/sense markers (e.g. "le/gw1") — dropped

const LETTER: Record<string, string> = {
  a:'α', b:'β', g:'γ', d:'δ', e:'ε', z:'ζ', h:'η', q:'θ', i:'ι', k:'κ',
  l:'λ', m:'μ', n:'ν', c:'ξ', o:'ο', p:'π', r:'ρ', s:'σ', t:'τ', u:'υ',
  f:'φ', x:'χ', y:'ψ', w:'ω', v:'ϝ',
};

// Beta diacritic → combining mark. Diaeresis and breathing share the same
// slot (a vowel never carries both); accent follows; iota subscript last —
// this order matches the NFD of precomposed forms so NFC recomposes cleanly.
const BREATH: Record<string, string> = { ')':'̓', '(':'̔', '+':'̈' };
const ACCENT: Record<string, string> = { '/':'́', '\\':'̀', '=':'͂' };
const SUBSCRIPT = 'ͅ';

const DIAC = ')(+/\\=|';

function isLetterEnd(s: string, i: number): boolean {
  // True if the char at i does not continue the current word (so a sigma here
  // is word-final). Diacritics keep the word going; letters do too.
  if (i >= s.length) return true;
  const c = s[i];
  return !(c.toLowerCase() in LETTER) && !DIAC.includes(c);
}

export function betaToGreek(input: string): string {
  // Nothing to do for strings without Beta Code markers.
  if (!/[a-zA-Z*]/.test(input)) return input;

  const out: string[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === '*') {
      // Capital: optional leading diacritics, then the base letter.
      i++;
      let breath = '', accent = '', sub = '';
      while (i < input.length && DIAC.includes(input[i])) {
        const d = input[i];
        if (d in BREATH) breath = BREATH[d];
        else if (d in ACCENT) accent = ACCENT[d];
        else if (d === '|') sub = SUBSCRIPT;
        i++;
      }
      const base = LETTER[(input[i] ?? '').toLowerCase()];
      if (base) {
        i++;
        // Capital sigma is always Σ, so no final-form handling needed.
        // Uppercase the BASE letter, then compose. Uppercasing the composed
        // string instead put "*(/|a" (ᾍ) through String#toUpperCase, whose full
        // case mapping expands an iota subscript into a separate capital iota:
        // "ἍΙδης" for ᾍδης, a capital Ι in the middle of the word.
        out.push((base.toUpperCase() + breath + accent + sub).normalize('NFC'));
      }
      continue;
    }

    const base = LETTER[ch.toLowerCase()];
    if (base) {
      i++;
      let breath = '', accent = '', sub = '';
      while (i < input.length && DIAC.includes(input[i])) {
        const d = input[i];
        if (d in BREATH) breath = BREATH[d];
        else if (d in ACCENT) accent = ACCENT[d];
        else if (d === '|') sub = SUBSCRIPT;
        i++;
      }
      // Sigma takes its final form ς at word end (a trailing homograph digit
      // counts as the end), medial σ otherwise.
      const letter = base === 'σ' && isLetterEnd(input, i) ? 'ς' : base;
      out.push((letter + breath + accent + sub).normalize('NFC'));
      continue;
    }

    // Drop standalone homograph/sense digits ("le/gw1"); pass through the rest
    // (spaces, punctuation, etc.) unchanged.
    if (!/[1-9]/.test(ch)) out.push(ch);
    i++;
  }
  return out.join('');
}

// -- Live Beta Code in a text box ------------------------------------------
//
// Ported from Grammata's /words box (~/Developer/grammar-site,
// src/lib/betacode.ts `liveGreek`, 2026-10-23). The box holds already-converted
// Greek mixed with newly typed ASCII, and every pass re-normalizes the whole
// string, so the conversion must be idempotent. TypeGreek conventions: Shift
// makes a capital ('*' still works), marks attach to the letter before them in
// any order, final sigma is automatic ('j' types a medial sigma). Unfinished
// business, a trailing '*' (the search's wildcard) or a mark with no letter
// yet, stays visible as typed. The apostrophe is not rewritten to ’; it stays
// as typed. The search fold treats ' and ’ as the same key.

const LIVE_MARKS: Record<string, string> = {
  ')': '̓', '(': '̔', '/': '́', '\\': '̀',
  '=': '͂', '+': '̈', '|': 'ͅ',
};
const LIVE_LETTER: Record<string, string> = Object.fromEntries(
  Object.entries(LETTER).filter(([k]) => k !== 'v'),
);
const LIVE_BASE = new Set(Object.values(LIVE_LETTER));
const LIVE_COMBINING = new Set(Object.values(LIVE_MARKS));
const LIVE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(LIVE_MARKS).map(([ascii, mark]) => [mark, ascii]),
);
// NFC never reorders marks of one combining class, so they are sorted into
// the order precomposed letters decompose to: breathing or diaeresis, accent,
// iota subscript. That is what makes "marks in any order" true.
export const LIVE_RANK: Record<string, number> = {
  '̓': 0, '̔': 0, '̈': 0,
  '́': 1, '̀': 1, '͂': 1,
  'ͅ': 2,
};

interface LiveToken { letter: string; capital: boolean; sigma: boolean; marks: string[] }

// `digamma` also reads v as ϝ, which a text box leaves alone (see
// betaQueryToGreek).
export function liveGreek(text: string, digamma = false): string {
  const out: (LiveToken | string)[] = [];
  let current: LiveToken | null = null;
  const pending: { ascii: string; mark: string }[] = [];
  let capitalizeNext = false;

  const pushLetter = (letter: string, capital: boolean, sigma: boolean) => {
    const token: LiveToken = { letter, capital: capital || capitalizeNext, sigma, marks: pending.splice(0).map((p) => p.mark) };
    capitalizeNext = false;
    out.push(token);
    current = token;
  };
  const flushPending = () => {
    if (capitalizeNext) {
      out.push('*');
      capitalizeNext = false;
    }
    for (const p of pending.splice(0)) out.push(p.ascii);
  };

  // Whether the last character was a wildcard (. ? ] or a wildcard *): a *
  // after one has no letter to capitalise, so it is a wildcard too (.*ikos$).
  let afterWildcard = false;
  for (const ch of text.normalize('NFD')) {
    const wild = afterWildcard;
    afterWildcard = ch === '.' || ch === '?' || ch === ']';
    const lower = ch.toLowerCase();
    if (LIVE_BASE.has(lower) || lower === 'ς' || (digamma && lower === 'ϝ')) {
      const isSigma = lower === 'σ' || lower === 'ς';
      pushLetter(isSigma ? 'σ' : lower, ch !== lower, isSigma);
    } else if (LIVE_COMBINING.has(ch)) {
      if (current) (current as LiveToken).marks.push(ch);
      else pending.push({ ascii: LIVE_REVERSE[ch] ?? ch, mark: ch });
    } else if (LIVE_LETTER[lower] || lower === 'j' || (digamma && lower === 'v')) {
      const isSigma = lower === 's' || lower === 'j';
      pushLetter(isSigma ? 'σ' : lower === 'v' ? 'ϝ' : LIVE_LETTER[lower], ch !== lower && lower !== 'j', isSigma);
    } else if (ch === '*' && (current || wild)) {
      // After a letter, '*' is the search's wildcard (log*os), not a capital.
      out.push('*');
      current = null;
      afterWildcard = true;
    } else if (ch === '*') {
      // Pending marks wait for the capital that follows (*(h → Ἡ).
      capitalizeNext = true;
    } else if (LIVE_MARKS[ch]) {
      if (current) (current as LiveToken).marks.push(LIVE_MARKS[ch]);
      else pending.push({ ascii: ch, mark: LIVE_MARKS[ch] });
    } else {
      flushPending();
      out.push(ch);
      current = null;
    }
  }
  flushPending();

  return out
    .map((token, index) => {
      if (typeof token === 'string') return token;
      let base = token.letter;
      if (token.sigma) base = typeof out[index + 1] === 'object' ? 'σ' : 'ς';
      if (token.capital) base = base === 'ς' ? 'Σ' : base.toUpperCase();
      const marks = [...token.marks].sort((a, b) => (LIVE_RANK[a] ?? 9) - (LIVE_RANK[b] ?? 9));
      return (base + marks.join('')).normalize('NFC');
    })
    .join('')
    .normalize('NFC');
}

// One search term typed in Beta Code → Greek, keeping the search wildcards,
// for the "Match accents exactly" filter: it compares against Greek tokens,
// and "lo/gos" as typed equals none of them. liveGreek already reads `*` after
// a letter as the wildcard and every leading `*` as the capital marker, as the
// main search does (compilePattern). Digits go first, as greekFold drops them:
// no Greek token holds one. And v is read as ϝ, a letter like any other (so a
// * after it is still the wildcard): the index folds the two to one key.
export function betaQueryToGreek(term: string): string {
  if (!/[a-zA-Z]/.test(term)) return term;
  return liveGreek(term.replace(/[0-9]/g, ''), true);
}
