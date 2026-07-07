/**
 * Seeding for import alignment (d3 §3.1): rare-token anchor seeds + the longest
 * strictly-monotonic seed skeleton the banded DP then fills between.
 *
 * Build an inverted index token → spine-window rows over the window. For each
 * import line take its RAREST window token of length ≥ 4; if that token has a
 * unique posting (appears in exactly one window row) and the full-line
 * `sim ≥ SEED_SIM` there, it's a hard seed (import i ↔ spine row s). Keep the
 * longest strictly-increasing (by spine row) subsequence of seeds — when two
 * seeds conflict, the higher-sim one wins (§3.1 "drop violators, keeping
 * higher-sim").
 *
 * The skeleton is advisory: it recenters the DP diagonal and breaks
 * repeated-phrase ties. Zero seeds is fine (short/degraded chapters) — the DP
 * then runs banded around the plain diagonal.
 */

import type { LineFeatures } from './compareKey';
import { simFeatures } from './similarity';

/** A hard seed: import line `importIndex` anchors to window row `spineIndex`. */
export interface Seed {
  importIndex: number;
  spineIndex: number;
  sim: number;
}

/** Minimum rare-token length to be seed-worthy (§3.1). */
const MIN_TOKEN_LEN = 4;
/** Minimum full-line similarity for a unique-posting token to become a seed (§3.1). */
export const SEED_SIM = 0.6;

/**
 * Inverted index token → spine-window row indices, restricted to tokens long
 * enough to be discriminating. Built once per window.
 */
function buildIndex(spine: LineFeatures[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (let s = 0; s < spine.length; s++) {
    for (const tok of spine[s].tokens) {
      if (tok.length < MIN_TOKEN_LEN) continue;
      let postings = index.get(tok);
      if (!postings) {
        postings = [];
        index.set(tok, postings);
      }
      // Postings are appended in ascending row order and each row visits a
      // token at most once (Set), so no dedup needed.
      postings.push(s);
    }
  }
  return index;
}

/** Global window token frequency, for picking the rarest token of an import line. */
function tokenFrequency(index: Map<string, number[]>): Map<string, number> {
  const freq = new Map<string, number>();
  for (const [tok, postings] of index) freq.set(tok, postings.length);
  return freq;
}

/**
 * Candidate seeds (before monotonicity resolution), one per import line that
 * has a unique-posting rare token clearing SEED_SIM. Deterministic: ties on
 * rarity break toward the lexicographically smallest token.
 */
function candidateSeeds(imports: LineFeatures[], spine: LineFeatures[]): Seed[] {
  const index = buildIndex(spine);
  const freq = tokenFrequency(index);
  const seeds: Seed[] = [];

  for (let i = 0; i < imports.length; i++) {
    let bestTok: string | null = null;
    let bestFreq = Infinity;
    for (const tok of imports[i].tokens) {
      if (tok.length < MIN_TOKEN_LEN) continue;
      const f = freq.get(tok);
      if (f === undefined) continue; // token not in the window at all
      if (f < bestFreq || (f === bestFreq && (bestTok === null || tok < bestTok))) {
        bestFreq = f;
        bestTok = tok;
      }
    }
    if (bestTok === null || bestFreq !== 1) continue; // no unique-posting rare token
    const spineIndex = index.get(bestTok)![0];
    const s = simFeatures(imports[i], spine[spineIndex]);
    if (s >= SEED_SIM) seeds.push({ importIndex: i, spineIndex, sim: s });
  }
  return seeds;
}

/**
 * Longest strictly-monotonic (both importIndex and spineIndex strictly
 * increasing) subsequence of the candidate seeds. Candidates already have
 * strictly increasing importIndex (one per import line, in order), so this
 * reduces to a longest strictly-increasing subsequence on spineIndex; on equal
 * LIS length or a tie, the higher-sim seed is preferred (§3.1). O(n²) — n is the
 * seed count (≤ import-line count), tiny.
 */
function longestMonotonic(seeds: Seed[]): Seed[] {
  const n = seeds.length;
  if (n === 0) return [];
  // dp[k] = best chain length ending at k; also track summed sim for tie-break.
  const len = new Array<number>(n).fill(1);
  const simSum = seeds.map((s) => s.sim);
  const prev = new Array<number>(n).fill(-1);

  for (let k = 0; k < n; k++) {
    for (let j = 0; j < k; j++) {
      if (seeds[j].spineIndex < seeds[k].spineIndex) {
        const cand = len[j] + 1;
        const candSim = simSum[j] + seeds[k].sim;
        if (cand > len[k] || (cand === len[k] && candSim > simSum[k])) {
          len[k] = cand;
          simSum[k] = candSim;
          prev[k] = j;
        }
      }
    }
  }

  let best = 0;
  for (let k = 1; k < n; k++) {
    if (len[k] > len[best] || (len[k] === len[best] && simSum[k] > simSum[best])) best = k;
  }

  const chain: Seed[] = [];
  for (let k = best; k >= 0; k = prev[k]) chain.push(seeds[k]);
  chain.reverse();
  return chain;
}

/** The strictly-monotonic seed skeleton for (imports, spine window). */
export function seedSkeleton(imports: LineFeatures[], spine: LineFeatures[]): Seed[] {
  return longestMonotonic(candidateSeeds(imports, spine));
}

/**
 * Cheap coarse score of a window offset for the whole-work sweep (§3.3): sum of
 * the seed skeleton's similarities when the import block is laid against the
 * spine slice starting at `spineOffset`. Only the skeleton is scored (O(M)),
 * never a full DP. Returns 0 when the slice is too short to host the imports.
 */
export function seedScoreAtOffset(
  imports: LineFeatures[],
  spine: LineFeatures[],
  spineOffset: number,
): number {
  if (spineOffset < 0 || spineOffset + imports.length > spine.length) return 0;
  const slice = spine.slice(spineOffset, spineOffset + imports.length);
  const skeleton = seedSkeleton(imports, slice);
  let total = 0;
  for (const s of skeleton) total += s.sim;
  return total;
}
