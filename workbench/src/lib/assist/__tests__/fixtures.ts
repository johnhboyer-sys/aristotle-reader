import type { AssistContext } from '../provider';

/**
 * Fixed golden-string fixture shared by prompt.ts / clipboardPayload.ts
 * tests. Includes an interleaved-untranslated row (before[0]) and an
 * empty-target-row variant (`EMPTY_TARGET_CONTEXT`) per D4 §6's acceptance
 * gates.
 */
export const GOLDEN_CONTEXT: AssistContext = {
  work: {
    title: 'Metaphysics',
    author: 'Aristotle',
    originalLanguage: 'greek',
    scheme: 'bekker-metaphysics',
  },
  book: { index: 7, label: 'Ζ' },
  chapter: 17,
  target: { address: '1041a6', greek: 'τὸ γὰρ τί ἦν εἶναι τοῦτό ἐστιν.' },
  before: [
    { address: '1041a4', greek: 'πάλιν ἐπανέλθωμεν.', english: null },
    { address: '1041a5', greek: 'διὰ τί ὕλη τὶς τόδε τὶ ἐστιν;', english: 'why is this matter this thing?' },
  ],
  after: [
    { address: '1041a7', greek: 'πρῶτον οὖν εἴπωμεν.', english: null },
    { address: '1041a8', greek: 'ἔστω δὴ σαφὲς τοῦτο.', english: 'let this then be clear.' },
  ],
};

/** No before/after context at all — the smallest possible prompt. */
export const NO_CONTEXT: AssistContext = {
  ...GOLDEN_CONTEXT,
  before: [],
  after: [],
};
