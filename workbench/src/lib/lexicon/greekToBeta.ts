// -- Unicode polytonic Greek → Beta Code --------------------------------
//
// The inverse of workbench/src/lib/betacode.ts's betaToGreek(). Needed to
// turn a clicked surface form (Unicode Greek, as it appears in the editor's
// Greek column) into the Beta Code key the pipeline's analyses.json is
// keyed by (see app/src/lib/data.ts lookupWord / fetchAnalyses).
//
// Convention (matches the decoder byte-for-byte — this is verified by the
// round-trip test in __tests__/greekToBeta.test.ts against real analysis
// keys): NFD-decompose, then for each base letter collect any combining
// marks that follow it and re-emit them in Beta's canonical order —
// breathing/diaeresis, then accent, then iota subscript. Final-form sigma
// (ς) and medial sigma (σ) both encode to plain "s" (the decoder derives
// which glyph to render from word-position, not from the source key).
// Capitals encode as "*" followed by diacritics-then-letter, matching the
// decoder's capital convention (contrast lowercase: letter-then-diacritics).

const LETTER_TO_BETA: Record<string, string> = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'h', θ: 'q', ι: 'i', κ: 'k',
  λ: 'l', μ: 'm', ν: 'n', ξ: 'c', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't',
  υ: 'u', φ: 'f', χ: 'x', ψ: 'y', ω: 'w', ϝ: 'v',
};

// Combining mark (NFD) → Beta diacritic. Breathing and diaeresis share a
// "slot" (a vowel never carries both) and are emitted first; accent next;
// iota subscript last. This mirrors betaToGreek's BREATH/ACCENT/SUBSCRIPT
// tables exactly (same codepoints, inverse direction).
const SMOOTH = '̓'; // combining comma above
const ROUGH = '̔'; // combining reversed comma above
const DIAERESIS = '̈'; // combining diaeresis
const ACUTE = '́'; // combining acute accent
const GRAVE = '̀'; // combining grave accent
const PERISPOMENI = '͂'; // combining greek perispomeni (circumflex)
const YPOGEGRAMMENI = 'ͅ'; // combining greek ypogegrammeni (iota subscript)

const BREATH_SLOT: Record<string, string> = { [SMOOTH]: ')', [ROUGH]: '(', [DIAERESIS]: '+' };
const ACCENT_SLOT: Record<string, string> = { [ACUTE]: '/', [GRAVE]: '\\', [PERISPOMENI]: '=' };

/** True if `ch` is a Greek letter (base form, precomposed or not) this encoder handles. */
function isGreekLetter(ch: string): boolean {
  return ch.toLowerCase() in LETTER_TO_BETA;
}

/**
 * Encode Unicode polytonic Greek into Beta Code. Non-Greek characters
 * (spaces, punctuation, the elision apostrophe, Latin text) pass through
 * unchanged. Trailing combining marks with no preceding base letter are
 * dropped (malformed input only — never produced by NFD of well-formed text).
 */
export function greekToBeta(input: string): string {
  const nfd = input.normalize('NFD');
  const out: string[] = [];
  let i = 0;
  while (i < nfd.length) {
    const ch = nfd[i];
    if (!isGreekLetter(ch)) {
      out.push(ch);
      i++;
      continue;
    }
    const isCapital = ch !== ch.toLowerCase();
    const base = LETTER_TO_BETA[ch.toLowerCase()];
    i++;

    let breath = '';
    let accent = '';
    let sub = '';
    while (i < nfd.length) {
      const mark = nfd[i];
      if (mark in BREATH_SLOT) {
        breath = BREATH_SLOT[mark];
        i++;
      } else if (mark in ACCENT_SLOT) {
        accent = ACCENT_SLOT[mark];
        i++;
      } else if (mark === YPOGEGRAMMENI) {
        sub = '|';
        i++;
      } else {
        break;
      }
    }

    if (isCapital) {
      out.push('*' + breath + accent + sub + base);
    } else {
      out.push(base + breath + accent + sub);
    }
  }
  return out.join('');
}
