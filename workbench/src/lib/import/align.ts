/**
 * Banded monotonic Needleman–Wunsch aligner for import → spine (d3 §3.2, §5).
 *
 * Aligns N import lines against M spine-window rows with three moves:
 *   - match     (i→j): import line i rides spine row j; cost −sim(i,j)
 *   - spineGap  (j advances, i stays): a spine row with no import line — the
 *     user omitted a line, or it's the continuation of a MERGE (one import line
 *     covering several spine rows);
 *   - importGap (i advances, j stays): an import line consuming no spine row —
 *     the continuation of a SPLIT (several import lines under one spine row), or
 *     an ALIEN line matching nothing.
 * The DP is BANDED: cell (i,j) is scored only when |j − diag(i)| ≤ BAND, where
 * diag interpolates the seed skeleton (§3.1) — linear where there are no seeds.
 * Deterministic: equal-cost moves break toward the lowest spine index (a match
 * or spineGap that advances j is preferred over importGap; see move order).
 *
 * The path is then read into ONE assignment per spine row (§5): matched /
 * low-confidence / split / merged / no-source, plus a list of orphan import
 * lines. `plan.ts` decorates these with addresses and the auto-accept gate.
 *
 * Tuned constants (calibrated on the degraded Ζ.17 fixtures — see
 * __tests__/calibration.test.ts): BAND = 6, GAP = 0.35.
 */

import { combineFeatures, tokenStream, type LineFeatures, type StreamToken } from './compareKey';
import { simFeatures } from './similarity';
import { seedSkeleton, type Seed } from './seed';
import { MARKER_SENTINEL_RE } from './scrivenerMd';

/** How much a gapped spine row must RAISE the matched import line's coverage
 * similarity to count as a SPLIT tail rather than an omitted (no-source) line.
 * Below this, the import line doesn't actually cover the gapped row → omitted. */
export const SPLIT_COVERAGE_GAIN = 0.05;

/** Off-diagonal band half-width (d3 §3.2). */
export const BAND = 6;
/** Gap penalty for a spineGap or importGap move (d3 §3.2, tuned on fixtures). */
export const GAP = 0.35;
/**
 * A match move is DISALLOWED below this similarity (d3 §5: "sim < 0.30 → not a
 * match; becomes gap/orphan"). Without this floor the DP absorbs an alien line
 * as a cheap sub-floor match (any match costs ≤ 0, cheaper than a gap) and
 * shifts the whole alignment instead of orphaning the line. Enforcing it makes
 * "nothing silently guessed" a property of the DP, not a post-hoc filter.
 */
export const MATCH_FLOOR = 0.3;

/** How an import line was consumed against the spine. */
export type ImportRole =
  | { kind: 'match'; spineIndex: number; sim: number } // 1:1 or first line of a merge
  | { kind: 'merge-cont'; spineIndex: number; sim: number } // 2nd+ import line onto same spine row
  | { kind: 'split-cont' } // import line consumed no spine row, but sits inside a matched span
  | { kind: 'orphan' }; // import line matched nothing (alien)

/** Per-import-line outcome, in import order. */
export interface ImportAssignment {
  importIndex: number;
  role: ImportRole;
}

/** Structural classification of a spine row after the path is read. */
export type SpineRowKind = 'match' | 'split-head' | 'split-tail' | 'merge' | 'no-source';

/** Per-spine-row outcome (structure only; addresses/badges added by plan.ts). */
export interface SpineRowAssignment {
  spineIndex: number;
  kind: SpineRowKind;
  /** Import lines whose English lands on this row, in import order (empty for no-source/split-tail). */
  importIndices: number[];
  /** Best match similarity feeding this row (0 for no-source/split-tail). */
  sim: number;
  /**
   * Margin of the matched import line's similarity to THIS row over its
   * similarity to the best neighbouring spine row (the runner-up) — the
   * "healthy margin" auto-accept input (d3 §5). 0 for non-match rows.
   */
  margin: number;
  /** True when a gap move touches this row (adjacent-gap signal for auto-accept). */
  adjacentGap: boolean;
}

export interface AlignResult {
  rows: SpineRowAssignment[];
  /** Import lines that matched nothing — the orphan / unplaced list (§5). */
  orphans: number[];
  imports: ImportAssignment[];
}

type MoveKind = 'match' | 'spineGap' | 'importGap';

/**
 * Seed-interpolated diagonal: the spine index an import line is expected near.
 * Between/around seeds it's a straight line; with no seeds it's the plain i↔j
 * diagonal offset by `expectedOffset` (where import line 0 is expected to sit in
 * the spine array — nonzero when the spine window is dilated ahead of the
 * chapter's canonical start, §4). Seeds override the offset where they exist.
 */
function buildDiagonal(n: number, seeds: Seed[], expectedOffset: number): number[] {
  const diag = new Array<number>(n);
  if (n === 0) return diag;
  // Virtual start anchor sits one step before (import 0 → expectedOffset).
  const startAnchor: [number, number] = [-1, expectedOffset - 1];
  // Virtual end anchor keeps the same slope-1 diagonal past the last seed.
  const endAnchor: [number, number] = [n, expectedOffset + n];
  const pts: Array<[number, number]> = [
    startAnchor,
    ...seeds.map((s) => [s.importIndex, s.spineIndex] as [number, number]),
    endAnchor,
  ];
  let p = 0;
  for (let i = 0; i < n; i++) {
    while (p + 1 < pts.length && pts[p + 1][0] <= i) p++;
    const [ai, aj] = pts[p];
    const [bi, bj] = pts[Math.min(p + 1, pts.length - 1)];
    const span = bi - ai;
    const j = span === 0 ? aj : aj + ((bj - aj) * (i - ai)) / span;
    diag[i] = j;
  }
  return diag;
}

/**
 * Run the banded DP. Returns backpointers as a per-import-line move sequence.
 * Cost is minimized (match cost is negative similarity, gaps positive).
 */
function runDP(
  imports: LineFeatures[],
  spine: LineFeatures[],
  diag: number[],
  expectedOffset: number,
): { moves: MoveKind[]; matchSim: Map<number, number>; endJ: number } {
  const n = imports.length;
  const m = spine.length;

  // dp[i][j] = min cost to have consumed the first i import lines and first j
  // spine rows. We store only the reachable band per row to keep it O(n·B), but
  // an (n+1)×(m+1) sparse map keyed "i,j" is simplest and still linear in band
  // area for our sizes. Use dense arrays gated by the band test.
  const INF = Infinity;
  const width = m + 1;
  const cost = new Float64Array((n + 1) * width).fill(INF);
  const back = new Int8Array((n + 1) * width).fill(-1); // 0=match,1=spineGap,2=importGap
  const at = (i: number, j: number) => i * width + j;

  const inBand = (i: number, j: number): boolean => {
    // Band is defined off the diagonal of ALREADY-consumed lines. For the
    // prefix state (i lines, j rows) use the diagonal at line i-1 (last
    // consumed) or the expected offset for the empty prefix; widen by BAND both
    // sides (+1 slack so match/gap predecessors stay reachable at the edge).
    const center = i === 0 ? expectedOffset : diag[Math.min(i - 1, n - 1)];
    return Math.abs(j - center) <= BAND + 1;
  };

  cost[at(0, 0)] = 0;
  // First column: only importGap can advance i with j=0 (all import lines alien
  // before any spine row) — allowed but penalized.
  for (let i = 1; i <= n; i++) {
    if (!inBand(i, 0)) continue;
    const c = cost[at(i - 1, 0)];
    if (c !== INF) {
      cost[at(i, 0)] = c + GAP;
      back[at(i, 0)] = 2; // importGap
    }
  }
  // First row: spineGap advances j with i=0 (leading spine rows with no import).
  for (let j = 1; j <= m; j++) {
    if (!inBand(0, j)) continue;
    const c = cost[at(0, j - 1)];
    if (c !== INF) {
      cost[at(0, j)] = c + GAP;
      back[at(0, j)] = 1; // spineGap
    }
  }

  const matchSim = new Map<number, number>(); // key i*width+j → sim, for reuse in readback
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (!inBand(i, j)) continue;
      let bestCost = INF;
      let bestMove = -1;

      // Move order encodes the tie-break: match first (lowest spine advance
      // that consumes both), then spineGap (advance spine → lower final j is
      // preferred implicitly by earlier consumption), then importGap. Strict
      // `<` keeps the FIRST-listed move on ties → deterministic.
      const cMatchPrev = cost[at(i - 1, j - 1)];
      if (cMatchPrev !== INF) {
        const s = simFeatures(imports[i - 1], spine[j - 1]);
        // A sub-floor match is not a match (§5) — disallow the move so the line
        // orphans / the row goes no-source instead of shifting the alignment.
        if (s >= MATCH_FLOOR) {
          matchSim.set(at(i, j), s);
          const c = cMatchPrev - s;
          if (c < bestCost) {
            bestCost = c;
            bestMove = 0;
          }
        }
      }
      const cSpineGap = cost[at(i, j - 1)];
      if (cSpineGap !== INF) {
        const c = cSpineGap + GAP;
        if (c < bestCost) {
          bestCost = c;
          bestMove = 1;
        }
      }
      const cImportGap = cost[at(i - 1, j)];
      if (cImportGap !== INF) {
        const c = cImportGap + GAP;
        if (c < bestCost) {
          bestCost = c;
          bestMove = 2;
        }
      }

      if (bestMove >= 0) {
        cost[at(i, j)] = bestCost;
        back[at(i, j)] = bestMove as -1 | 0 | 1 | 2;
      }
    }
  }

  // Endpoint: the full import block must be consumed (i = n). Choose the j with
  // the least cost among reachable (n, j); ties → lowest j (fewest trailing
  // no-source rows invented).
  let endJ = -1;
  let endCost = INF;
  for (let j = 0; j <= m; j++) {
    const c = cost[at(n, j)];
    if (c < endCost) {
      endCost = c;
      endJ = j;
    }
  }
  // Degenerate fallback (band too tight / empty): consume everything as gaps.
  if (endJ < 0) endJ = m;

  // Backtrace from (n, endJ) to (0,0), recording the move that ENTERED each cell.
  const moves: MoveKind[] = [];
  let i = n;
  let j = endJ;
  const outMatchSim = new Map<number, number>();
  while (i > 0 || j > 0) {
    const b = back[at(i, j)];
    if (b === 0) {
      moves.push('match');
      const s = matchSim.get(at(i, j));
      if (s !== undefined) outMatchSim.set(i - 1, s); // key by import line index
      i--;
      j--;
    } else if (b === 1) {
      moves.push('spineGap');
      j--;
    } else if (b === 2) {
      moves.push('importGap');
      i--;
    } else {
      // No backpointer (unreachable start padding) — walk the cheapest forced
      // edge to avoid an infinite loop; prefer consuming a spine row.
      if (j > 0) {
        moves.push('spineGap');
        j--;
      } else {
        moves.push('importGap');
        i--;
      }
    }
  }
  moves.reverse();
  return { moves, matchSim: outMatchSim, endJ };
}

/**
 * Read the move sequence into per-spine-row and per-import-line assignments
 * with the d3 §5 structural semantics. The move list is a forward walk over the
 * DP path from (0,0); we replay it tracking the current spine row and whether
 * the last event on it was a match (to distinguish a merge-continuation from an
 * alien importGap, and a split-continuation spineGap from an omitted line).
 */
export function align(
  imports: LineFeatures[],
  spine: LineFeatures[],
  expectedOffset = 0,
): AlignResult {
  const m = spine.length;
  const seeds = seedSkeleton(imports, spine);
  const diag = buildDiagonal(imports.length, seeds, expectedOffset);
  const { moves, matchSim } = runDP(imports, spine, diag, expectedOffset);

  // Per-spine-row accumulation.
  const rows: SpineRowAssignment[] = [];
  for (let s = 0; s < m; s++) {
    rows.push({ spineIndex: s, kind: 'no-source', importIndices: [], sim: 0, margin: 0, adjacentGap: false });
  }

  /** Similarity of import line i to the best spine row OTHER than `exclude`,
   * scanned within the band around `exclude` (a monotonic aligner's only real
   * competitors) — the runner-up for the auto-accept margin (§5). */
  const runnerUpSim = (i: number, exclude: number): number => {
    let best = 0;
    const lo = Math.max(0, exclude - BAND);
    const hi = Math.min(m - 1, exclude + BAND);
    for (let s = lo; s <= hi; s++) {
      if (s === exclude) continue;
      const v = simFeatures(imports[i], spine[s]);
      if (v > best) best = v;
    }
    return best;
  };
  const importAssign: ImportAssignment[] = [];
  const orphans: number[] = [];

  let ii = 0; // next import line
  let jj = 0; // next spine row
  let lastMatchedRow = -1; // spine row that most recently took a match (for merge context)
  // Split-span tracking: the head row of the current split, the import line it
  // matched, and that import line's coverage similarity accumulated over the
  // spine rows folded into the span so far. Reset when a match lands.
  let splitHead = -1;
  let splitImport = -1;
  let splitCoverFeat: LineFeatures | null = null;
  let splitCoverSim = -1;
  // Accumulated import-side text merged into the current target row (so a
  // 3-way merge's coverage test folds all prior continuation lines, not just
  // the head). Reset when a match lands.
  let mergeCoverFeat: LineFeatures | null = null;

  let prevMove: MoveKind | null = null;

  for (const move of moves) {
    if (move === 'match') {
      const s = matchSim.get(ii) ?? simFeatures(imports[ii], spine[jj]);

      // BACKWARD split detection: if the immediately-preceding move gapped
      // row jj-1 (currently no-source) and THIS import line's Greek actually
      // covers the combined (jj-1, jj) text better than jj alone, the import
      // line is a merge whose span STARTS at jj-1 — the DP matched it at the
      // higher-scoring of the two rows, but §5 puts the English on the FIRST
      // row of the span. Relocate: jj-1 becomes the split-head (takes the
      // English), jj becomes a split-tail. (The forward case — a spineGap
      // AFTER the match — is handled in the spineGap branch below.)
      let splitStart = jj;
      if (
        prevMove === 'spineGap' &&
        jj - 1 >= 0 &&
        rows[jj - 1].kind === 'no-source' &&
        rows[jj - 1].importIndices.length === 0
      ) {
        const combined = combineFeatures(spine[jj - 1], spine[jj]);
        const combinedSim = simFeatures(imports[ii], combined);
        if (combinedSim >= s + SPLIT_COVERAGE_GAIN) {
          splitStart = jj - 1;
          rows[jj - 1].kind = 'split-head';
          rows[jj - 1].importIndices.push(ii);
          rows[jj - 1].sim = combinedSim;
          rows[jj - 1].margin = combinedSim - runnerUpSim(ii, jj - 1);
          rows[jj - 1].adjacentGap = true;
          rows[jj].kind = 'split-tail';
          rows[jj].adjacentGap = true;
          importAssign.push({ importIndex: ii, role: { kind: 'match', spineIndex: jj - 1, sim: combinedSim } });
        }
      }

      if (splitStart === jj) {
        rows[jj].importIndices.push(ii);
        rows[jj].sim = Math.max(rows[jj].sim, s);
        rows[jj].margin = s - runnerUpSim(ii, jj);
        rows[jj].kind = 'match';
        importAssign.push({ importIndex: ii, role: { kind: 'match', spineIndex: jj, sim: s } });
      }
      lastMatchedRow = jj;
      // Seed a potential FORWARD split span at this match's covered start.
      splitHead = splitStart;
      splitImport = ii;
      splitCoverFeat = splitStart === jj ? spine[jj] : combineFeatures(spine[jj - 1], spine[jj]);
      splitCoverSim = rows[splitStart].sim;
      // The current import line's text is the merge accumulator's starting
      // point (further importGap continuations fold onto it).
      mergeCoverFeat = imports[ii];
      ii++;
      jj++;
    } else if (move === 'spineGap') {
      // A spine row with no import line of its own. Two readings (d3 §5):
      //   SPLIT tail — the immediately-preceding matched import line's Greek
      //     actually covers this row too (its coverage similarity RISES when we
      //     fold this row in); its English stays on the split head, this row is
      //     left empty.
      //   no-source — the import line for this row was simply omitted; folding
      //     it in does NOT raise coverage.
      // The coverage test is what distinguishes fixture 2 (merge→split) from
      // fixture 4 (missing line) — structurally identical paths, different text.
      let handled = false;
      if (splitHead >= 0 && splitImport >= 0 && splitCoverFeat) {
        const extended = combineFeatures(splitCoverFeat, spine[jj]);
        const extSim = simFeatures(imports[splitImport], extended);
        if (extSim >= splitCoverSim + SPLIT_COVERAGE_GAIN) {
          rows[splitHead].kind = 'split-head';
          rows[jj].kind = 'split-tail';
          rows[jj].adjacentGap = true;
          rows[splitHead].adjacentGap = true;
          splitCoverFeat = extended;
          splitCoverSim = extSim;
          handled = true;
        }
      }
      if (!handled) {
        rows[jj].kind = 'no-source';
        rows[jj].adjacentGap = true;
        if (jj > 0) rows[jj - 1].adjacentGap = true;
        // An omitted line ends any split span (its coverage didn't reach here).
        splitHead = -1;
        splitImport = -1;
        splitCoverFeat = null;
        splitCoverSim = -1;
      }
      jj++;
    } else {
      // importGap: an import line consumed no spine row. It's a MERGE
      // continuation ONLY when it lands right after a matched row AND its Greek
      // actually BELONGS to that row — i.e. folding it into the target raises
      // the target's coverage of the combined text. An alien line ("note to
      // self") raises nothing → it has NO home and becomes an orphan (§5,
      // "nothing silently guessed"). Without this coverage guard an alien line
      // right after a match is silently absorbed as a bogus merge.
      const target = jj - 1;
      let mergedHere = false;
      if (lastMatchedRow === target && target >= 0 && rows[target].kind !== 'no-source') {
        const prevFeat = mergeCoverFeat ?? spine[target];
        const extended = combineFeatures(prevFeat, imports[ii]);
        const targetSim = rows[target].sim;
        const extSim = simFeatures(extended, spine[target]);
        if (extSim >= targetSim - SPLIT_COVERAGE_GAIN) {
          // Belongs: concatenation still explains the spine row about as well
          // (a real second line of the same Bekker row). Fold it in.
          rows[target].kind = rows[target].kind === 'split-head' ? 'split-head' : 'merge';
          rows[target].importIndices.push(ii);
          rows[target].adjacentGap = true;
          rows[target].sim = Math.max(rows[target].sim, extSim);
          mergeCoverFeat = extended;
          importAssign.push({ importIndex: ii, role: { kind: 'merge-cont', spineIndex: target, sim: extSim } });
          mergedHere = true;
        }
      }
      if (!mergedHere) {
        orphans.push(ii);
        importAssign.push({ importIndex: ii, role: { kind: 'orphan' } });
      }
      ii++;
    }
    prevMove = move;
  }

  return { rows, orphans, imports: importAssign };
}

// ── §3a: token-level Greek re-lineation ──────────────────────────────────────

/** Band half-width for the TOKEN DP (§3a). Token counts are larger than line
 * counts, but the walk is near-diagonal (user Greek ≈ spine), so a modest band
 * keeps it O(T·B). Divergences that would need a wider band surface as
 * low-confidence rows instead of shifting the whole alignment. */
export const TOKEN_BAND = 12;
/** Gap penalty for a token spineGap/importGap. Small: a single dropped/extra
 * token is cheap (near-exact walk), a run of them is what we want to penalize. */
export const TOKEN_GAP = 0.6;

/** Editorial insertion pattern — `<…>` the user's text carries but the standard
 * text doesn't (§3, e.g. Meta `<τί>`, APo `<λευκόν>`). Kept, flagged, never
 * dropped. Detected on the SURFACE token. */
const EDITORIAL_RE = /<[^<>]*>/;

/** One re-lineated Greek line (§3): the surface text assembled from the import
 * tokens that landed on this spine row, plus per-row provenance for the diff. */
export interface RelineatedRow {
  /** Spine row index (into the spine window array). */
  spineIndex: number;
  /** The user's Greek for this row (surface tokens joined), '' when none landed. */
  userGreek: string;
  /** True when this row's token match diverged (low similarity / structural). */
  lowConfidence: boolean;
  /** True when an editorial `<…>` insertion landed on this row (kept + flagged). */
  editorial: boolean;
}

export interface RelineateResult {
  /** Exactly one entry per spine window row (row-count invariant at the token layer). */
  rows: RelineatedRow[];
  /** Whether any row diverged (→ the plan's per-row ⚠). */
  anyLowConfidence: boolean;
  /** Coverage: fraction of spine tokens that took an exact/near import match. */
  coverage: number;
}

/**
 * Re-lineate a joined Greek flow onto the spine window's line boundaries (§3):
 * a token-level banded DP producing CUT POINTS. The spine owns structure — we
 * emit exactly one import line per spine row, breaking the flow where the spine
 * breaks. Markers survive in `greekFlow` as `{{MK:idx}}` sentinels; they are
 * DEMOTED (their tokens never seed a match, they just ride the nearest row).
 *
 * `spineRowTexts` are the window's per-row Greek strings (document order). The
 * user's Greek ≈ spine text, so this is near an exact-match walk; divergences
 * become low-confidence rows and editorial `<…>` becomes an importGap + flag.
 *
 * Row-count invariant: `result.rows.length === spineRowTexts.length` (asserted).
 */
export function relineateGreek(greekFlow: string, spineRowTexts: string[]): RelineateResult {
  const M = spineRowTexts.length;

  // Spine token stream, remembering each token's row index.
  const spineToks: StreamToken[] = [];
  const spineRowOf: number[] = [];
  for (let r = 0; r < M; r++) {
    for (const tok of tokenStream(spineRowTexts[r])) {
      if (tok.key.length === 0) continue; // punctuation-only: not a match anchor
      spineToks.push(tok);
      spineRowOf.push(r);
    }
  }

  // Import token stream. Marker sentinels become non-matching "rider" tokens
  // (empty key) so they never anchor a match but still travel to a row.
  const flowSurface = greekFlow.replace(MARKER_SENTINEL_RE, ' ');
  const importToks = tokenStream(flowSurface).filter((t) => t.surface.length > 0);

  const N = importToks.length;
  if (M === 0) {
    return { rows: [], anyLowConfidence: false, coverage: 0 };
  }
  if (N === 0 || spineToks.length === 0) {
    // Nothing to place — every row empty (a no-source-ish degenerate).
    return {
      rows: spineRowTexts.map((_, r) => ({ spineIndex: r, userGreek: '', lowConfidence: true, editorial: false })),
      anyLowConfidence: true,
      coverage: 0,
    };
  }

  const S = spineToks.length;
  // Fold a movable-nu (terminal ν after a vowel): εστιν ≡ εστι, so the token
  // walk treats them as exact rather than flagging every such line (§1 movable-nu
  // is orthographic, not a typo).
  const VOWELS = new Set(['α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω']);
  const foldNu = (k: string): string =>
    k.length >= 2 && k[k.length - 1] === 'ν' && VOWELS.has(k[k.length - 2]) ? k.slice(0, -1) : k;
  // Token similarity: exact key match = 1 (movable-nu-folded); else a light
  // char-overlap so a typo'd token still prefers its true partner over a gap
  // (keeps the walk on-diagonal) and marks the row low-confidence.
  const tokSim = (a: StreamToken, b: StreamToken): number => {
    if (a.key.length === 0 || b.key.length === 0) return 0;
    if (a.key === b.key || foldNu(a.key) === foldNu(b.key)) return 1;
    // Cheap prefix/containment score — enough to hold the diagonal through a
    // single hand-typing slip without a full metric per cell.
    const short = a.key.length <= b.key.length ? a.key : b.key;
    const long = a.key.length <= b.key.length ? b.key : a.key;
    if (long.startsWith(short) || long.includes(short)) return 0.7;
    let common = 0;
    const lim = Math.min(short.length, long.length);
    for (let k = 0; k < lim; k++) if (short[k] === long[k]) common++;
    return common / long.length >= 0.6 ? 0.5 : 0;
  };

  // Banded token DP (import i × spine j). Match consumes both; spineGap advances
  // j (spine token with no import token — user omitted); importGap advances i
  // (extra import token — editorial insertion / stray). Cost minimized.
  const INF = Infinity;
  const width = S + 1;
  const cost = new Float64Array((N + 1) * width).fill(INF);
  const back = new Int8Array((N + 1) * width).fill(-1);
  const at = (i: number, j: number) => i * width + j;
  const center = (i: number) => (N === 0 ? 0 : (i * S) / N);
  const inBand = (i: number, j: number) => Math.abs(j - center(i)) <= TOKEN_BAND + 1;

  cost[at(0, 0)] = 0;
  for (let i = 1; i <= N; i++) {
    if (!inBand(i, 0)) continue;
    const c = cost[at(i - 1, 0)];
    if (c !== INF) {
      cost[at(i, 0)] = c + TOKEN_GAP;
      back[at(i, 0)] = 2; // importGap
    }
  }
  for (let j = 1; j <= S; j++) {
    if (!inBand(0, j)) continue;
    const c = cost[at(0, j - 1)];
    if (c !== INF) {
      cost[at(0, j)] = c + TOKEN_GAP;
      back[at(0, j)] = 1; // spineGap
    }
  }
  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= S; j++) {
      if (!inBand(i, j)) continue;
      let best = INF;
      let mv = -1;
      const cM = cost[at(i - 1, j - 1)];
      if (cM !== INF) {
        const s = tokSim(importToks[i - 1], spineToks[j - 1]);
        if (s > 0) {
          const c = cM - s;
          if (c < best) {
            best = c;
            mv = 0;
          }
        }
      }
      const cS = cost[at(i, j - 1)];
      if (cS !== INF && cS + TOKEN_GAP < best) {
        best = cS + TOKEN_GAP;
        mv = 1;
      }
      const cI = cost[at(i - 1, j)];
      if (cI !== INF && cI + TOKEN_GAP < best) {
        best = cI + TOKEN_GAP;
        mv = 2;
      }
      if (mv >= 0) {
        cost[at(i, j)] = best;
        back[at(i, j)] = mv as -1 | 0 | 1 | 2;
      }
    }
  }

  // Endpoint: all import tokens consumed (i = N), least-cost j; ties → highest j
  // (consume as much spine as possible, so trailing spine rows aren't starved).
  let endJ = -1;
  let endCost = INF;
  for (let j = S; j >= 0; j--) {
    const c = cost[at(N, j)];
    if (c < endCost) {
      endCost = c;
      endJ = j;
    }
  }
  if (endJ < 0) endJ = S;

  // Backtrace, assigning each import token to a spine ROW. A match assigns the
  // import token to the matched spine token's row. An importGap (extra token)
  // rides the CURRENT spine row (the one we're sitting before). A spineGap
  // advances the spine with no import token (that spine token is uncovered).
  const rowSurfaces: string[][] = spineRowTexts.map(() => []);
  const rowMatched = new Array<number>(M).fill(0); // exact/near matches per row
  const rowSpineTokens = new Array<number>(M).fill(0);
  for (let r = 0; r < S; r++) rowSpineTokens[spineRowOf[r]]++;
  const rowEditorial = new Array<boolean>(M).fill(false);
  const rowImportSim = spineRowTexts.map(() => [] as number[]);

  let i = N;
  let j = S;
  // Walk backward but collect forward-consistent assignments.
  const assigns: Array<{ tokenIdx: number; row: number; sim: number; editorial: boolean }> = [];
  while (i > 0 || j > 0) {
    const b = back[at(i, j)];
    if (b === 0) {
      const row = spineRowOf[j - 1];
      const s = tokSim(importToks[i - 1], spineToks[j - 1]);
      const ed = EDITORIAL_RE.test(importToks[i - 1].surface);
      assigns.push({ tokenIdx: i - 1, row, sim: s, editorial: ed });
      i--;
      j--;
    } else if (b === 1) {
      // spineGap: spine token j-1 uncovered — nothing to assign, but the row
      // loses a matched token (coverage handled by rowMatched below).
      j--;
    } else if (b === 2) {
      // importGap: extra import token i-1 rides the row of the NEXT spine token
      // we'll match (i.e. current j, clamped). Editorial insertions land here.
      const row = j < S ? spineRowOf[Math.min(j, S - 1)] : M - 1;
      const ed = EDITORIAL_RE.test(importToks[i - 1].surface);
      assigns.push({ tokenIdx: i - 1, row, sim: 0, editorial: ed });
      i--;
    } else {
      if (j > 0) j--;
      else i--;
    }
  }

  // Apply assignments in import (token) order so surfaces reassemble correctly.
  assigns.sort((a, b2) => a.tokenIdx - b2.tokenIdx);
  for (const a of assigns) {
    rowSurfaces[a.row].push(importToks[a.tokenIdx].surface);
    if (a.sim >= 1) rowMatched[a.row]++;
    if (a.sim > 0) rowImportSim[a.row].push(a.sim);
    if (a.editorial) rowEditorial[a.row] = true;
  }

  let anyLow = false;
  let matchedTokens = 0;
  const rows: RelineatedRow[] = [];
  for (let r = 0; r < M; r++) {
    const userGreek = rowSurfaces[r].join(' ').replace(/\s+/g, ' ').trim();
    matchedTokens += rowMatched[r];
    // A row is low-confidence when its token walk diverged from the spine (§3):
    //   - an editorial <…> insertion landed here (kept, but the break is worth a
    //     look); OR
    //   - it has spine tokens but nothing exact/near landed (structural gap); OR
    //   - it has an inexact match (a hand-typing slip) — any import token that
    //     matched below an exact key on this row.
    const spineCount = rowSpineTokens[r];
    const exact = rowMatched[r];
    // The re-lineation is a near-exact walk (user Greek ≈ spine), so a clean row
    // matches ALL its spine tokens exactly. Any spine token this row did NOT
    // match exactly (a typo, a divergent word, an editorial insertion) is a
    // divergence → the row is low-confidence and shown side-by-side (§3).
    const low = rowEditorial[r] || (spineCount > 0 && exact < spineCount);
    if (low) anyLow = true;
    rows.push({ spineIndex: r, userGreek, lowConfidence: low, editorial: rowEditorial[r] });
  }

  // Row-count invariant (§3) — a structural assertion, not a vibe.
  if (rows.length !== M) {
    throw new Error(`relineateGreek: produced ${rows.length} rows for ${M} spine rows`);
  }

  return {
    rows,
    anyLowConfidence: anyLow,
    coverage: spineToks.length === 0 ? 0 : matchedTokens / spineToks.length,
  };
}
