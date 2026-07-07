/**
 * Greek-space line similarity for import alignment (d3 §2). Distinct from the
 * desktop aligner's Latin-only TF-IDF (whose WORD regex matches zero Greek —
 * rejected in d3 §5):
 *
 *   sim(u, v) = 0.5 * tokenJaccard(u, v) + 0.5 * trigramCosine(u, v)  ∈ [0, 1]
 *
 * Token overlap is robust to word-order jitter and a single differing token
 * (crasis, movable-nu residue — the latter folded in compareKey.ts); trigram
 * cosine absorbs hand-typing typos and elision stems. Edit distance is
 * deliberately NOT a primary component (O(len²)/pair, over-penalizes legitimate
 * merge/split length changes) — permitted only as a tie-breaker if fixtures
 * demand it; they did not.
 *
 * Calibration expectation (d3 §2): clean ≈ 1.0, one-typo ≈ 0.8–0.9,
 * unrelated < 0.15. Verified empirically on the degraded Ζ.17 fixtures.
 */

import { features, type LineFeatures } from './compareKey';

/** |A ∩ B| / |A ∪ B| over two token sets; 1 for two empty sets. */
function tokenJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const t of small) if (large.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Cosine over two trigram count-profiles; 1 for two empty profiles. */
function trigramCosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [g, ca] of small) {
    const cb = large.get(g);
    if (cb !== undefined) dot += ca * cb;
  }
  let na = 0;
  for (const c of a.values()) na += c * c;
  let nb = 0;
  for (const c of b.values()) nb += c * c;
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Similarity between two already-derived feature sets. */
export function simFeatures(u: LineFeatures, v: LineFeatures): number {
  return 0.5 * tokenJaccard(u.tokens, v.tokens) + 0.5 * trigramCosine(u.trigrams, v.trigrams);
}

/** Similarity between two raw source lines (features derived + cached). */
export function sim(u: string, v: string): number {
  return simFeatures(features(u), features(v));
}
