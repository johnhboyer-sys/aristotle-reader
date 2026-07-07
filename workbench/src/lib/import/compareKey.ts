/**
 * Comparison keys for import alignment — the derived-features layer d3 §1 puts
 * on top of `norm()`. `norm()` itself is NOT forked or modified (d3 §5/§9.1):
 * it is re-exported here so this module is the single place the aligner reaches
 * for normalization.
 *
 * Per normalized line we derive, and cache:
 *   - a TOKEN SET (whitespace split of the normalized string) — plus, for
 *     movable-nu tolerance (§1 / ruling §9.1), each token's terminal-ν-stripped
 *     form (ν after a vowel) folded into the SAME set as a secondary key, so
 *     ἐστίν/ἐστί score as a match rather than a full token mismatch;
 *   - a CHAR TRIGRAM profile (count per 3-gram over the space-joined normalized
 *     string) — absorbs hand-typing typos and elision stems.
 *
 * Caching is keyed on the RAW input string (identity of the source line), so a
 * spine line compared against many import lines derives its features once.
 */

import { norm } from '../corpus/normalize';

export { norm };

/** Greek vowels (post-`norm()`: NFD-stripped, lowercased) for the movable-nu rule. */
const GREEK_VOWELS = new Set(['α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω']);

export interface LineFeatures {
  /** The normalized string (`norm()` output). */
  normalized: string;
  /** Token set incl. movable-nu-folded secondary forms. */
  tokens: Set<string>;
  /** char-3gram → count over the normalized string. */
  trigrams: Map<string, number>;
}

/**
 * Fold a token's movable-nu variant into the accumulator: a token ending in ν
 * whose penultimate char is a vowel also indexes its ν-stripped stem. Both
 * forms live in the set so ἐστίν and ἐστί share a member. Deterministic and
 * allocation-light (no regex per token).
 */
function addToken(set: Set<string>, token: string): void {
  if (token.length === 0) return;
  set.add(token);
  if (
    token.length >= 2 &&
    token[token.length - 1] === 'ν' &&
    GREEK_VOWELS.has(token[token.length - 2])
  ) {
    set.add(token.slice(0, -1));
  }
}

/** char-trigram multiset of `s` (padded so short lines still yield grams). */
function trigramProfile(s: string): Map<string, number> {
  const profile = new Map<string, number>();
  if (s.length === 0) return profile;
  // Pad with a boundary sentinel so 1–2 char lines still produce trigrams and
  // word-edge trigrams are weighted like the corpus anchoring did.
  const padded = `  ${s}  `;
  for (let i = 0; i + 3 <= padded.length; i++) {
    const g = padded.slice(i, i + 3);
    profile.set(g, (profile.get(g) ?? 0) + 1);
  }
  return profile;
}

function derive(raw: string): LineFeatures {
  const normalized = norm(raw);
  const tokens = new Set<string>();
  if (normalized.length > 0) {
    for (const tok of normalized.split(' ')) addToken(tokens, tok);
  }
  return { normalized, tokens, trigrams: trigramProfile(normalized) };
}

/**
 * Features of two lines' concatenation (`norm(a + ' ' + b)`), used by the
 * aligner's split/omitted disambiguation. Tokens union; trigram profiles are
 * derived from the joined normalized string so cross-boundary trigrams are
 * counted the way `features(joined)` would. Deterministic, no caching (called
 * O(gaps) times, not per DP cell).
 */
export function combineFeatures(a: LineFeatures, b: LineFeatures): LineFeatures {
  const normalized = a.normalized && b.normalized ? `${a.normalized} ${b.normalized}` : a.normalized || b.normalized;
  const tokens = new Set<string>();
  for (const t of a.tokens) tokens.add(t);
  for (const t of b.tokens) tokens.add(t);
  return { normalized, tokens, trigrams: trigramProfile(normalized) };
}

const cache = new Map<string, LineFeatures>();

/** Derived features for a source line, cached by the raw string. */
export function features(raw: string): LineFeatures {
  let f = cache.get(raw);
  if (!f) {
    f = derive(raw);
    cache.set(raw, f);
  }
  return f;
}

/** Drop the feature cache (tests that want a cold cache for timing). */
export function clearFeatureCache(): void {
  cache.clear();
}

/**
 * One token of a token stream (§3a Greek re-lineation): its SURFACE form (the
 * original substring, kept verbatim so the reassembled Greek line matches what
 * the user typed) and its NORMALIZED comparison key (`norm()` of the surface,
 * empty when the surface normalizes to nothing — e.g. bare punctuation). Callers
 * that need per-token row provenance carry it in a parallel array.
 */
export interface StreamToken {
  surface: string;
  key: string;
}

/**
 * Tokenize a Greek string into a stream of whitespace-delimited tokens with
 * surface + normalized key (§3a). Surface tokens are the raw whitespace splits
 * (so `·`, apostrophes, editorial `<…>` survive into reassembly); the key is
 * `norm()` of that surface token. Tokens whose surface is pure whitespace are
 * dropped; a token that normalizes to empty (punctuation-only) is KEPT with an
 * empty key so it still rides along a spine row during reassembly — it just
 * never contributes to a similarity comparison.
 *
 * norm() splits on internal punctuation too (it maps non-Greek/Latin to spaces),
 * so a surface token like `ζητεῖ·` yields key `ζητει`, and `<λευκόν>` yields key
 * `λευκον` — the editorial brackets vanish from the key but stay in the surface
 * for the flag/importGap logic in align.relineateGreek.
 */
export function tokenStream(greek: string): StreamToken[] {
  const out: StreamToken[] = [];
  for (const surface of greek.split(/\s+/)) {
    if (surface.length === 0) continue;
    out.push({ surface, key: norm(surface) });
  }
  return out;
}
