/**
 * Core DP semantics on SYNTHETIC fake-Greek lines (no TLG text) so the aligner
 * is covered on CI too, independent of `.dev-corpus`. Each "line" is a bag of
 * distinct tokens; identical bags → sim 1, disjoint bags → sim 0.
 */

import { describe, expect, it } from 'vitest';
import { features } from '../compareKey';
import { align } from '../align';
import { sim } from '../similarity';

// Distinct Greek-letter tokens (norm keeps α–ω); each line is unique so seeds
// and matches are unambiguous. Length ≥4 so tokens are seed-worthy.
const W = [
  'αββαα', 'γδδγγ', 'εζζεε', 'ηθθηη', 'ικκιι', 'λμμλλ', 'νξξνν', 'οππoο',
  'ρσσρρ', 'τυυττ', 'φχχφφ', 'ψωωψψ', 'βαβαβ', 'δγδγδ', 'ζεζεζ',
];
const line = (...idx: number[]) => idx.map((i) => W[i]).join(' ');
const feats = (lines: string[]) => lines.map((l) => features(l));

describe('similarity sanity (synthetic)', () => {
  it('identical ≈ 1, disjoint ≈ 0', () => {
    expect(sim(line(0, 1, 2), line(0, 1, 2))).toBeCloseTo(1, 5);
    expect(sim(line(0, 1, 2), line(3, 4, 5))).toBeLessThan(0.1);
  });
});

describe('align — structural semantics (synthetic)', () => {
  const spineLines = [line(0, 1), line(2, 3), line(4, 5), line(6, 7), line(8, 9)];
  const spine = feats(spineLines);

  it('1:1 clean → every row matched, no gaps, no orphans', () => {
    const r = align(feats([...spineLines]), spine);
    expect(r.orphans).toEqual([]);
    expect(r.rows.map((x) => x.kind)).toEqual(['match', 'match', 'match', 'match', 'match']);
    expect(r.rows.every((x) => !x.adjacentGap)).toBe(true);
  });

  it('merged import line → split (head + tail), row count preserved', () => {
    // One import line carries spine rows 1 & 2's tokens.
    const imports = feats([line(0, 1), line(2, 3, 4, 5), line(6, 7), line(8, 9)]);
    const r = align(imports, spine);
    expect(r.rows.map((x) => x.kind)).toEqual(['match', 'split-head', 'split-tail', 'match', 'match']);
    expect(r.rows[1].importIndices).toEqual([1]);
    expect(r.rows[2].importIndices).toEqual([]);
    expect(r.orphans).toEqual([]);
  });

  it('split import line → merge, no row invented', () => {
    // A 3-token spine row split so the FIRST half carries more of the row (the
    // realistic case — a line break rarely bisects exactly; the head keeps the
    // stronger match, the tail folds in as a merge continuation).
    const spine3 = [line(0, 1), line(2, 3), line(4, 5, 10), line(6, 7), line(8, 9)];
    const imports = feats([line(0, 1), line(2, 3), line(4, 5), line(10), line(6, 7), line(8, 9)]);
    const r = align(imports, feats(spine3));
    expect(r.rows).toHaveLength(5); // no row invented
    expect(r.rows[2].kind).toBe('merge');
    expect(r.rows[2].importIndices).toEqual([2, 3]);
    expect(r.orphans).toEqual([]);
  });

  it('omitted import line → no-source row, monotonic around it', () => {
    const imports = feats([line(0, 1), line(2, 3), line(6, 7), line(8, 9)]); // row 2 dropped
    const r = align(imports, spine);
    expect(r.rows[2].kind).toBe('no-source');
    expect(r.rows[2].importIndices).toEqual([]);
    expect(r.rows[3].kind).toBe('match');
    expect(r.orphans).toEqual([]);
  });

  it('alien import line → orphan, no bogus merge', () => {
    const imports = feats([line(0, 1), line(2, 3), line(10, 11, 12), line(4, 5), line(6, 7), line(8, 9)]);
    const r = align(imports, spine);
    expect(r.orphans).toEqual([2]); // the alien line
    expect(r.rows.map((x) => x.kind)).toEqual(['match', 'match', 'match', 'match', 'match']);
  });

  it('deterministic: identical inputs → identical result', () => {
    const imports = feats([line(0, 1), line(2, 3, 4, 5), line(6, 7), line(8, 9)]);
    expect(align(imports, spine)).toEqual(align(feats([line(0, 1), line(2, 3, 4, 5), line(6, 7), line(8, 9)]), spine));
  });
});
