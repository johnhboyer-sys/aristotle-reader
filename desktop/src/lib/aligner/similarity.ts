// Lexical (TF-IDF cosine) sentence similarity — TypeScript port of
// pipeline/aristotle_pipeline/align/similarity.py's zero-dependency backend.
// The sentence-transformers backends are deliberately NOT ported: the desktop
// app ships no ML dependency (per the v1 plan), and lexical is the pipeline's
// default engine already.
//
// Parity with the Python implementation is exact by construction (verified by
// scripts/parity): same tokenizer, same idf formula, same normalisation.

const WORD = /[A-Za-z]+/g;

function tokens(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

function tfidfVectors(docs: string[][]): Map<string, number>[] {
  const n = docs.length;
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, c] of df) idf.set(t, Math.log((n + 1) / (c + 1)) + 1.0);
  const vecs: Map<string, number>[] = [];
  for (const d of docs) {
    const v = new Map<string, number>();
    if (d.length) {
      const tf = new Map<string, number>();
      for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const [t, c] of tf) v.set(t, (c / d.length) * idf.get(t)!);
    }
    let norm = 0;
    for (const w of v.values()) norm += w * w;
    norm = Math.sqrt(norm) || 1.0;
    const nv = new Map<string, number>();
    for (const [t, w] of v) nv.set(t, w / norm);
    vecs.push(nv);
  }
  return vecs;
}

function cos(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size > b.size) [a, b] = [b, a];
  let s = 0;
  for (const [t, w] of a) s += w * (b.get(t) ?? 0);
  return s;
}

/** Cosine-similarity matrix, refs (rows) × tgts (cols). */
export function cosMatrix(refs: string[], tgts: string[]): number[][] {
  if (!refs.length || !tgts.length) return refs.map(() => Array(tgts.length).fill(0));
  const vecs = tfidfVectors([...refs, ...tgts].map(tokens));
  const rv = vecs.slice(0, refs.length);
  const tv = vecs.slice(refs.length);
  return rv.map(r => tv.map(t => cos(r, t)));
}
