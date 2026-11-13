// The one step of a running-text search that can run away: a user's regular
// expression over a work's whole text. Kept free of imports so the search
// worker (running-text.worker.ts) carries only this.

/** Every match of `re` (a global RegExp) in `text`, as [start, end) pairs,
 * flattened. A match of nothing is stepped past, never listed. With `cuts`
 * (ascending places in `text`), each stretch between two cuts is matched on
 * its own, so no match runs across a cut: a work's books (John, 2026-11-11). */
export function findMatches(text: string, re: RegExp, cuts: ArrayLike<number> = []): Int32Array {
  const spans: number[] = [];
  const edges = [0, ...Array.from(cuts).filter(c => c > 0 && c < text.length), text.length];
  for (let k = 0; k + 1 < edges.length; k++) {
    const from = edges[k];
    const part = text.slice(from, edges[k + 1]);
    re.lastIndex = 0;
    for (let m = re.exec(part); m; m = re.exec(part)) {
      if (!m[0].length) { re.lastIndex++; continue; }
      spans.push(from + m.index, from + m.index + m[0].length);
    }
  }
  return Int32Array.from(spans);
}
