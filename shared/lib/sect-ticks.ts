// Project Loeb (ref) Stephanus section offsets onto an overlay translation
// (Jowett / alt) that has no exact section milestones. Pure: no DOM, no I/O.

export interface SectTick {
  o: number;
  c: string;
  real: boolean;
}

/**
 * Maximum distance, as a fraction of average section length, at which a
 * projected offset will snap to a sentence boundary. Beyond that, fall back
 * to the nearest word boundary.
 *
 * Average section length = altText.length / refTicks.length (the overlay
 * slice divided evenly among the sections we are placing). 0.25 keeps labels
 * near real sentence breaks when the two translations are roughly aligned,
 * without dragging a tick across a large stretch of prose to a distant period.
 */
const SNAP_FRAC = 0.25;

const SENT_END = /[.?!;]/;
// Closing quotes / brackets that often trail a terminator before the next sentence.
const CLOSER = /['"\u201d\u2019»)\]}]/;

/**
 * Project each ref offset proportionally onto altText, snap to a sentence
 * (or word) boundary, and emit strictly increasing unique offsets.
 *
 * Every returned tick has `real: false` — these are approximations; the
 * caller styles them differently from pipeline-exact Loeb ticks.
 *
 * Monotonicity: if two projections snap to the same boundary, the later tick
 * is pushed to the next later boundary (sentence or word). If no later
 * boundary exists, that tick is dropped.
 *
 * Degenerate inputs: empty refTicks → []; empty or whitespace-only altText
 * → []; refText.length === 0 → []; a single tick at o=0 → o=0.
 */
export function projectTicks(
  refText: string,
  refTicks: { o: number; c: string }[],
  altText: string,
): SectTick[] {
  if (refTicks.length === 0) return [];
  if (refText.length === 0) return [];
  if (altText.length === 0 || altText.trim().length === 0) return [];

  const refLen = refText.length;
  const altLen = altText.length;
  const maxSnapDist = SNAP_FRAC * (altLen / refTicks.length);

  const sentBounds = sentenceBoundaries(altText);
  const wordBounds = wordBoundaries(altText);
  // Union for dedup-push: denser set reduces drops when several ticks collide.
  const allBounds = mergeBounds(sentBounds, wordBounds);

  const out: SectTick[] = [];
  let prev = -1;

  for (const tick of refTicks) {
    // Special-case and proportional base: o=0 always maps to the start.
    let projected =
      tick.o <= 0 ? 0 : Math.round((tick.o / refLen) * altLen);
    if (projected < 0) projected = 0;
    if (projected > altLen) projected = altLen;

    const nearestSent = nearestBound(sentBounds, projected);
    const sentDist = Math.abs(nearestSent - projected);
    let snapped =
      sentDist <= maxSnapDist
        ? nearestSent
        : nearestBound(wordBounds, projected);

    if (snapped <= prev) {
      const next = nextBoundAfter(allBounds, prev);
      if (next === null) continue; // no room — drop (see doc comment above)
      snapped = next;
    }

    if (snapped < 0) snapped = 0;
    if (snapped > altLen) snapped = altLen;
    // Re-check after clamp (e.g. prev already at altLen).
    if (snapped <= prev) continue;

    out.push({ o: snapped, c: tick.c, real: false });
    prev = snapped;
  }

  return out;
}

/** Positions just after `.`/`?`/`!`/`;` + optional closers + following whitespace. */
function sentenceBoundaries(text: string): number[] {
  const set = new Set<number>([0, text.length]);
  for (let i = 0; i < text.length; i++) {
    if (!SENT_END.test(text[i]!)) continue;
    let j = i + 1;
    while (j < text.length && CLOSER.test(text[j]!)) j++;
    while (j < text.length && isWs(text[j]!)) j++;
    set.add(j);
  }
  return sorted(set);
}

/** Starts of words (after whitespace), plus 0 and text.length. */
function wordBoundaries(text: string): number[] {
  const set = new Set<number>([0, text.length]);
  for (let i = 1; i < text.length; i++) {
    if (isWs(text[i - 1]!) && !isWs(text[i]!)) set.add(i);
  }
  return sorted(set);
}

function nearestBound(bounds: number[], target: number): number {
  let best = bounds[0]!;
  let bestDist = Math.abs(best - target);
  for (let i = 1; i < bounds.length; i++) {
    const b = bounds[i]!;
    const d = Math.abs(b - target);
    // Prefer the earlier bound on a tie so order stays stable under push.
    if (d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

function nextBoundAfter(bounds: number[], minExclusive: number): number | null {
  for (const b of bounds) {
    if (b > minExclusive) return b;
  }
  return null;
}

function mergeBounds(a: number[], b: number[]): number[] {
  return sorted(new Set([...a, ...b]));
}

function sorted(set: Set<number>): number[] {
  return [...set].sort((x, y) => x - y);
}

function isWs(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
}
