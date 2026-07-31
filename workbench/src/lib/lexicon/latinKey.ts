/**
 * latinKey.ts — Latin lookup-key derivation for the click-to-parse drawer.
 * The Latin counterpart of greekToBeta.ts, and a faithful port of the
 * classical-philosophy-reader pipeline's `reader_pipeline/latin.py` (Wave 2
 * Batch 0), which is where these rules were established and measured. Keep the
 * two in step: this module is the same algorithm, in TypeScript, so the
 * workbench resolves a clicked Latin word exactly as that corpus build does.
 *
 * How Latin differs from Greek here:
 *   - No transliteration. Latin source text is already plain Latin, so the
 *     lookup key IS the lowercased surface form (NFC-normalized) — not a
 *     re-encoding into another alphabet, and no i/j or u/v rewrite of the key.
 *   - Deriving a key never fails. Any non-empty input yields a key; it may
 *     simply match nothing in the morphology table, which is a normal miss.
 *   - Enclitics offer EXTRA candidates, never a destructive edit: -que/-ne/-ve
 *     are stripped as a fallback tried only after the whole form, so a real
 *     lemma ending in those letters ("quisque") still resolves first.
 *   - Proper names are capitalized in Diogenes' table ("Cicero", "Athenis")
 *     while the key is always lowercased, so a capitalized SURFACE token also
 *     tries the capitalized candidates — last, so an ordinary word that merely
 *     opens a sentence still resolves through its lowercase key.
 */

/**
 * Enclitic suffixes offered as additional lookup candidates. Morpheus (via
 * Diogenes' analyses table) resolves most enclitics itself; the split covers
 * the rest.
 */
const ENCLITICS = ['que', 'ne', 've'] as const;

/** A split host shorter than this is not offered — it could never be a real candidate. */
const MIN_HOST_LEN = 2;

/**
 * Common words that merely END in an enclitic's letters and whose stripped
 * "host" is not their stem — splitting would offer a real-but-WRONG word
 * ("atque" is not "at" + "-que"). Words like "quisque" need no entry: the
 * whole form is always tried first, so they resolve on their own. Ported
 * verbatim from latin.py's _FALSE_ENCLITIC_STOPLIST.
 */
const FALSE_ENCLITIC_STOPLIST = new Set([
  'atque', 'neque', 'itaque', 'absque', 'denique', 'undique',
  'utique', 'quoque', 'namque', 'plerumque', 'ubique',
]);

/**
 * The base lookup key for a Latin surface token: NFC-normalized, lowercased.
 * No transliteration and no u/v or i/j rewrite — the key IS the lowercased
 * surface. Never throws.
 */
export function toLatinKey(surface: string): string {
  return surface.normalize('NFC').toLowerCase();
}

/** Extra candidate hosts with a possible enclitic stripped. Never mutates `key`. */
export function encliticVariants(key: string): string[] {
  if (FALSE_ENCLITIC_STOPLIST.has(key)) return [];
  const out: string[] = [];
  for (const suffix of ENCLITICS) {
    if (key.endsWith(suffix) && key.length - suffix.length >= MIN_HOST_LEN) {
      out.push(key.slice(0, -suffix.length));
    }
  }
  return out;
}

/**
 * The analyses table's capitalization convention for proper names: first letter
 * only ("Cicero", "Panaetio") — unlike Greek's '*'-prefixed capital keys.
 */
function capitalizedKey(key: string): string {
  return key.length > 0 ? key[0].toUpperCase() + key.slice(1) : key;
}

/**
 * Candidate analyses-table keys to try, in order: the whole form first, then
 * enclitic-split hosts, then — only when the SURFACE token was itself
 * capitalized — the capitalized form of each of those.
 */
export function latinLookupVariants(key: string, capitalized = false): string[] {
  const variants = [key];
  for (const v of encliticVariants(key)) {
    if (!variants.includes(v)) variants.push(v);
  }
  if (capitalized) {
    for (const v of [...variants]) {
      const cap = capitalizedKey(v);
      if (!variants.includes(cap)) variants.push(cap);
    }
  }
  return variants;
}

/** True when the surface token starts with an uppercase letter. */
export function isCapitalizedSurface(surface: string): boolean {
  const first = surface.normalize('NFC').trim()[0];
  return first !== undefined && first !== first.toLowerCase();
}

// ── search fold (matching only — never the displayed or stored key) ─────────

const FOLD_STRIP = /[^a-z']/g;

/**
 * Ligatures some editions use in place of the two-letter spelling. Expanded
 * BEFORE decomposition because neither has a Unicode canonical decomposition —
 * NFD leaves "æ"/"œ" as single codepoints.
 */
const LIGATURES: Record<string, string> = { æ: 'ae', œ: 'oe' };

/**
 * Search-fold form: lowercase, u/v unified to 'u' and i/j to 'i', so "uita"
 * folds like "vita" and "coniunx" like "conjunx". A matching affordance only —
 * toLatinKey is untouched by it.
 *
 * NFD-decomposes before stripping non-base letters, so a macron- or
 * breve-carrying vowel folds to its BASE letter ("mālus" → "malus") instead of
 * being deleted outright (which would have produced "mlus").
 */
export function foldLatin(key: string): string {
  let folded = key.toLowerCase();
  for (const [ligature, expansion] of Object.entries(LIGATURES)) {
    folded = folded.replaceAll(ligature, expansion);
  }
  folded = folded.normalize('NFD');
  folded = folded.replaceAll('v', 'u').replaceAll('j', 'i');
  return folded.replace(FOLD_STRIP, '');
}
