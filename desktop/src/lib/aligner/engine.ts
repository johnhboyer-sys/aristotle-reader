// Chapter-scoped translation aligner — TypeScript port of
// pipeline/aristotle_pipeline/align/aligner.py (the lexical/default path).
//
// Per chapter: fingerprint each real Bekker anchor of the reference
// translation, run a monotonic DP over the TF-IDF cosine matrix to place each
// fingerprint at a sentence of the unmarked target prose, then interpolate
// single lines by cumulative Greek word-count. Confidence is the cosine margin
// (best − second-best). The target text is never mutated — output is a
// standoff map of {citation, offset, tier, confidence} records, and
// interpolated entries are ALWAYS labelled as such (estimates stay estimates,
// per the project's honesty rule).
//
// Ported line-for-line where possible; scripts/parity verifies the port
// produces identical anchors to the Python implementation on real corpus data.

import { cosMatrix } from './similarity';

export const MARGIN_OK = 0.05; // cosine margin below this → review queue
export const RATIO_SD = 1.5;   // length-ratio outlier threshold (SDs)
const PROPER = /(?<!^)(?<![.!?]\s)\b[A-Z][a-z]{2,}\b/g;

export interface Anchor {
  citation: string;
  offset: number;
  tier: string;                // chapter | column | half_column | five_line | line
  confidence: string;          // certain | reliable | uncertain | interpolated | confirmed
  score: number;
  flags: string[];
}

export interface RefAnchor {
  citation: string;            // "1094a1", "1094a20"
  off: number;                 // char offset into the assembled reference text
  tier: string;                // "chapter" | "column" | "half_column"
}

export interface GreekLine {
  citation: string;            // "1094a5"
  cumWords: number;            // cumulative Greek words BEFORE this line, within chapter
}

/** One chapter's alignment inputs (reference side + target side). */
export interface ChapterInput {
  book: number;
  chapter: string;
  citation: string;            // chapter-start Bekker citation, e.g. "1094a18"
  targetText: string;          // clean target prose for this chapter (Python: ross_text)
  refText: string;             // assembled reference text for this chapter
  refAnchors: RefAnchor[];     // ordered; refAnchors[k] spans to refAnchors[k+1]
  greekLines: GreekLine[];
  refIncipits?: string[];      // pre-supplied fingerprints (gloss mode); else derived
}

// Python's round(): banker's rounding (half to even) — used by interpolate.
function pyRound(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

// ---- offset-preserving sentence split --------------------------------------
const SENT = /[^.!?]*[.!?]+(?:["')\]]+)?\s*/g;

export function splitSentences(text: string, start = 0): [number, string][] {
  const out: [number, string][] = [];
  for (const m of text.matchAll(SENT)) {
    const s = m[0].trim();
    if (s) out.push([start + m.index!, s]);
  }
  return out.length ? out : [[start, text]];
}

// ---- reference fingerprints (port of ChapterRef.ref_incipits) --------------
export function refIncipits(ch: ChapterInput, maxChars = 240): string[] {
  if (ch.refIncipits) return ch.refIncipits.map(g => g.slice(0, maxChars));
  let spans: [number, number][] = [];
  for (const m of ch.refText.matchAll(SENT)) {
    if (m[0].trim()) spans.push([m.index!, m.index! + m[0].length]);
  }
  if (!spans.length) spans = [[0, ch.refText.length]];
  const out: string[] = [];
  for (const a of ch.refAnchors) {
    let i = spans.findIndex(([s, e]) => s <= a.off && a.off < e);
    if (i === -1) i = spans.length - 1;
    let fp = ch.refText.slice(spans[i][0], spans[i][1]);
    while (fp.trim().length < 80 && i + 1 < spans.length) {
      i += 1;
      fp += ch.refText.slice(spans[i][0], spans[i][1]);
    }
    out.push(fp.trim().slice(0, maxChars));
  }
  return out;
}

// ---- monotonic DP: each ref segment → a sentence, non-decreasing -----------
export function monotonicAlign(S: number[][]): [number, number, number, number][] {
  const G = S.length, E = S[0].length;
  const NEG = -1e9;
  const dp: number[][] = Array.from({ length: G }, () => Array(E).fill(NEG));
  const bk: number[][] = Array.from({ length: G }, () => Array(E).fill(-1));
  dp[0] = S[0].slice();
  for (let i = 1; i < G; i++) {
    let best = NEG, arg = 0;
    for (let j = 0; j < E; j++) {
      if (dp[i - 1][j] > best) { best = dp[i - 1][j]; arg = j; }
      dp[i][j] = S[i][j] + best;
      bk[i][j] = arg;
    }
  }
  let j = 0;
  for (let k = 1; k < E; k++) if (dp[G - 1][k] > dp[G - 1][j]) j = k;
  const path: [number, number, number, number][] = [];
  for (let i = G - 1; i >= 0; i--) {
    const row = S[i].slice().sort((a, b) => b - a);
    const margin = row[0] - (row.length > 1 ? row[1] : 0);
    path.push([i, j, S[i][j], margin]);
    j = i > 0 ? bk[i][j] : j;
  }
  return path.reverse();
}

// ---- single-line interpolation by Greek word-count --------------------------
export function interpolate(ch: ChapterInput, anchors: Anchor[]): Anchor[] {
  const cum = new Map(ch.greekLines.map(g => [g.citation, g.cumWords]));
  const order = ch.greekLines.map(g => g.citation);
  const pos = new Map(order.map((c, i) => [c, i]));
  const placed = new Set(anchors.map(a => a.citation));
  const out: Anchor[] = [];
  const anchored = anchors
    .filter(a => cum.has(a.citation))
    .sort((x, y) => x.offset - y.offset);
  for (let k = 0; k + 1 < anchored.length; k++) {
    const a = anchored[k], b = anchored[k + 1];
    const ca = cum.get(a.citation)!, cb = cum.get(b.citation)!;
    const spanW = cb - ca, spanO = b.offset - a.offset;
    if (spanW <= 0 || spanO <= 0) continue;
    for (const c of order.slice(pos.get(a.citation)! + 1, pos.get(b.citation)!)) {
      if (placed.has(c)) continue;
      let off = a.offset + pyRound((cum.get(c)! - ca) / spanW * spanO);
      off = snapWord(ch.targetText, off);
      out.push({ citation: c, offset: off, tier: 'line', confidence: 'interpolated', score: 0, flags: [] });
    }
  }
  return out;
}

export function snapWord(text: string, off: number): number {
  off = Math.max(0, Math.min(off, text.length));
  if (off > 0 && off < text.length && text[off] !== ' ') {
    const left = text.lastIndexOf(' ', off - 1);
    const right = text.indexOf(' ', off);
    const cands = [left, right].filter(c => c !== -1).map(c => c + 1);
    if (cands.length) {
      return cands.reduce((best, c) => (Math.abs(c - off) < Math.abs(best - off) ? c : best));
    }
  }
  return off;
}

// ---- per-chapter alignment ---------------------------------------------------
export function alignChapter(
  ch: ChapterInput,
  overrides: Record<string, number> | null = null,
): Anchor[] {
  const refs = refIncipits(ch);
  const sents = splitSentences(ch.targetText);
  const S = cosMatrix(refs, sents.map(([, s]) => s));
  const anchors: Anchor[] = [];
  for (const [i, j, score, margin] of monotonicAlign(S)) {
    const ra = ch.refAnchors[i];
    const off = ra.tier === 'chapter' ? 0 : sents[j][0];
    const conf = ra.tier === 'chapter' ? 'certain' : margin > MARGIN_OK ? 'reliable' : 'uncertain';
    const a: Anchor = {
      citation: ra.citation, offset: off, tier: ra.tier, confidence: conf,
      score: Math.round(score * 1e4) / 1e4, flags: [],
    };
    if (ra.tier !== 'chapter' && margin <= MARGIN_OK) {
      a.flags.push(`low_margin:${margin.toFixed(3)}`);
    }
    anchors.push(a);
  }
  flagRatioOutliers(ch, anchors);
  flagProperNames(ch, anchors, refs);
  if (overrides) {
    for (const a of anchors) {
      if (a.citation in overrides) {
        a.offset = Math.max(0, Math.min(overrides[a.citation], ch.targetText.length));
        a.confidence = 'confirmed';
        a.flags = a.flags.filter(f => !f.startsWith('low_margin'));
        a.flags.push('verified');
      }
    }
  }
  let result = dedupMonotonic(anchors);
  result = result.concat(interpolate(ch, result));
  return result.sort((x, y) =>
    x.offset - y.offset || (x.citation < y.citation ? -1 : x.citation > y.citation ? 1 : 0));
}

export function dedupMonotonic(anchors: Anchor[]): Anchor[] {
  const out: Anchor[] = [];
  let last = -1;
  for (const a of anchors) {
    if (a.offset < last) {
      a.offset = last;
      a.flags.push('nonmonotonic_clamped');
    }
    out.push(a);
    last = a.offset;
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
function pstdev(xs: number[]): number {
  const mu = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - mu) * (x - mu), 0) / xs.length);
}

function flagRatioOutliers(ch: ChapterInput, anchors: Anchor[]): void {
  if (anchors.length < 4) return;
  const rbounds = ch.refAnchors.map(a => a.off).concat([ch.refText.length]);
  const ratios: number[] = [];
  for (let k = 0; k + 1 < anchors.length; k++) {
    const rlen = (rbounds[k + 1] - rbounds[k]) || 1;
    const olen = (anchors[k + 1].offset - anchors[k].offset) || 1;
    ratios.push(olen / rlen);
  }
  if (ratios.length < 3) return;
  const mu = mean(ratios), sd = pstdev(ratios) || 1.0;
  ratios.forEach((r, k) => {
    if (Math.abs(r - mu) > RATIO_SD * sd) anchors[k].flags.push(`ratio_outlier:${r.toFixed(2)}`);
  });
}

function flagProperNames(ch: ChapterInput, anchors: Anchor[], refs: string[]): void {
  anchors.forEach((a, k) => {
    if (a.tier === 'chapter' || k >= refs.length) return;
    const names = new Set(refs[k].match(PROPER) ?? []);
    if (!names.size) return;
    const window = ch.targetText.slice(a.offset, a.offset + Math.max(refs[k].length * 2, 200));
    const missing = [...names].filter(n => !window.includes(n)).sort();
    if (missing.length) a.flags.push('name?:' + missing.slice(0, 3).join(','));
  });
}

// ---- guard -------------------------------------------------------------------
export function checkRoundtrip(ch: ChapterInput, anchors: Anchor[]): void {
  const pts = anchors.map(a => a.offset)
    .filter(p => p >= 0 && p <= ch.targetText.length)
    .sort((x, y) => x - y);
  const bounds = [0, ...pts, ch.targetText.length];
  let joined = '';
  for (let i = 0; i + 1 < bounds.length; i++) joined += ch.targetText.slice(bounds[i], bounds[i + 1]);
  if (joined !== ch.targetText) {
    throw new Error(`round-trip failed in ${ch.book}:${ch.chapter}`);
  }
}
