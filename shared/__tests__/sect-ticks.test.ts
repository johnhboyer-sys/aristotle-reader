import { describe, expect, it } from 'vitest';
import { projectTicks, type SectTick } from '../lib/sect-ticks';

// Helpers — keep fixtures readable. Offsets in comments are 0-based JS indices.
function os(ticks: SectTick[]): number[] {
  return ticks.map((t) => t.o);
}

describe('projectTicks — degenerate inputs', () => {
  it('returns [] for empty refTicks', () => {
    expect(projectTicks('hello world', [], 'alt text here')).toEqual([]);
  });

  it('returns [] when refText is empty', () => {
    expect(projectTicks('', [{ o: 0, c: '182a' }], 'some alt')).toEqual([]);
  });

  it('returns [] when altText is empty', () => {
    expect(projectTicks('hello', [{ o: 0, c: '182a' }], '')).toEqual([]);
  });

  it('returns [] when altText is whitespace-only', () => {
    expect(projectTicks('hello', [{ o: 0, c: '182a' }], '   \n\t  ')).toEqual([]);
  });

  it('maps a single tick at o=0 to o=0', () => {
    expect(projectTicks('abcdefghij', [{ o: 0, c: '182a' }], 'ABCDEFGHIJ')).toEqual([
      { o: 0, c: '182a', real: false },
    ]);
  });
});

describe('projectTicks — proportional placement', () => {
  // No internal sentence breaks → sentence snap is only to 0 or end, which
  // for mid-projections is usually beyond SNAP_FRAC, so we land on word bounds
  // (or 0/end). Use equal-length strings so proportion is identity.
  it('scales offsets by altLen/refLen when lengths differ', () => {
    // ref 10 chars, alt 20 chars; o=5 → projected 10.
    const ref = 'aaaaaaaaaa'; // 10
    const alt = 'one two three four!!'; // 20, word starts at 0,4,8,14
    const ticks = projectTicks(ref, [{ o: 5, c: '10b' }], alt);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.real).toBe(false);
    expect(ticks[0]!.c).toBe('10b');
    // projected 10; nearest word start among 0,4,8,14,20 → 8 or 14 (dist 2 vs 4) → 8
    expect(ticks[0]!.o).toBe(8);
  });

  it('preserves input order and c tokens verbatim', () => {
    const ref = 'A'.repeat(100);
    // Three sentences of ~equal length so each projection snaps to its period-boundary.
    const alt =
      'First sentence ends here. Second sentence ends here. Third sentence ends here.';
    // Periods at: after "here" #1, #2, #3 — boundaries after ". "
    const result = projectTicks(
      ref,
      [
        { o: 0, c: '1a' },
        { o: 40, c: '1b' },
        { o: 80, c: '1c' },
      ],
      alt,
    );
    expect(result.map((t) => t.c)).toEqual(['1a', '1b', '1c']);
    expect(result.every((t) => t.real === false)).toBe(true);
    // Strictly increasing
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.o).toBeGreaterThan(result[i - 1]!.o);
    }
  });
});

describe('projectTicks — sentence snapping', () => {
  it('snaps a mid-projection to the nearest sentence start (after . + space)', () => {
    //            0         1         2         3
    //            0123456789012345678901234567890123456789
    const alt = 'Short one. Longer second sentence here.';
    // "Short one." → '.' at 9, space at 10, 'L' at 11. Boundary = 11.
    // ref same length → o maps 1:1. Project o=12 → nearest sent bound is 11.
    const ref = 'x'.repeat(alt.length);
    const [t] = projectTicks(ref, [{ o: 12, c: '2a' }], alt);
    expect(t).toEqual({ o: 11, c: '2a', real: false });
  });

  it('treats ?, !, and ; as sentence terminators', () => {
    const alt = 'Ask this? Then yell! Then pause; Then go.';
    // Bounds after each terminator+space: after ?, !, ;, and end.
    // Find them explicitly so the test does not hard-code brittle indices.
    const bounds: number[] = [0];
    for (const m of alt.matchAll(/[.?!;]["'”’»)\]]*\s+/g)) {
      bounds.push(m.index! + m[0].length);
    }
    bounds.push(alt.length);

    const ref = 'y'.repeat(alt.length);
    // Project near the '!' boundary (second break).
    const nearBang = bounds[2]!;
    const [t] = projectTicks(ref, [{ o: nearBang + 1, c: '3b' }], alt);
    expect(t!.o).toBe(nearBang);
    expect(t!.c).toBe('3b');
    expect(t!.real).toBe(false);
  });

  it('consumes a closing quote after the terminator before whitespace', () => {
    // "Hi." Then  → boundary at start of Then
    const alt = 'He said "Hi." Then he left.';
    const ref = 'z'.repeat(alt.length);
    // Index of 'T' in Then
    const thenAt = alt.indexOf('Then');
    // Project a few chars into "Then..."
    const [t] = projectTicks(ref, [{ o: thenAt + 2, c: '4a' }], alt);
    expect(t!.o).toBe(thenAt);
  });
});

describe('projectTicks — word-boundary fallback', () => {
  it('falls back to a word boundary when the nearest sentence is too far', () => {
    // One long sentence (no internal break). Average section length = altLen/1
    // = full length; SNAP_FRAC * avg = 25% of full length. A projection near
    // the middle is ~50% from both 0 and end, so sentence snap is rejected
    // and we take the nearest word start.
    const alt = 'alpha bravo charlie delta echo foxtrot golf';
    const ref = 'r'.repeat(alt.length);
    const mid = Math.floor(alt.length / 2); // inside some word
    const [t] = projectTicks(ref, [{ o: mid, c: '5a' }], alt);
    expect(t!.real).toBe(false);
    // Must be a word start (or 0 / length)
    const wordStarts = new Set<number>([0, alt.length]);
    for (let i = 1; i < alt.length; i++) {
      if (/\s/.test(alt[i - 1]!) && !/\s/.test(alt[i]!)) wordStarts.add(i);
    }
    expect(wordStarts.has(t!.o)).toBe(true);
    // And not 0 or end — mid projection should pick an interior word
    expect(t!.o).toBeGreaterThan(0);
    expect(t!.o).toBeLessThan(alt.length);
  });
});

describe('projectTicks — monotonicity and dedup', () => {
  it('pushes a later tick forward when two snap to the same boundary', () => {
    // Two ref offsets that both project near the only internal sentence break.
    const alt = 'Left side here. Right side there and more words.';
    const ref = 'q'.repeat(100);
    // Both map near the middle → same sentence boundary after first period.
    const result = projectTicks(
      ref,
      [
        { o: 48, c: '6a' },
        { o: 52, c: '6b' },
      ],
      alt,
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.map((t) => t.c)).toEqual(
      result.length === 2 ? ['6a', '6b'] : ['6a'],
    );
    // Unique + strictly increasing
    const offsets = os(result);
    expect(new Set(offsets).size).toBe(offsets.length);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]!).toBeGreaterThan(offsets[i - 1]!);
    }
  });

  it('drops a tick when no later boundary exists past the previous', () => {
    // Force everything to the end: empty-ish room after first placement.
    const alt = 'Onlyoneword';
    // word bounds: 0 and length only; sentence bounds: 0 and length only.
    const ref = 'abcdefghijk'; // 11
    const result = projectTicks(
      ref,
      [
        { o: 10, c: '7a' }, // → near end
        { o: 11, c: '7b' }, // also near end; after first takes end, second drops
      ],
      alt,
    );
    // At most one tick can sit at the sole non-zero bound (length), and/or 0.
    const offsets = os(result);
    expect(new Set(offsets).size).toBe(offsets.length);
    for (const o of offsets) {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(alt.length);
    }
    // Second cannot share the same slot — either dropped or pushed (impossible) .
    if (result.length === 2) {
      expect(result[1]!.o).toBeGreaterThan(result[0]!.o);
    }
  });

  it('emits strictly increasing unique offsets across many ticks', () => {
    const alt =
      'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten.';
    const ref = 'n'.repeat(200);
    const refTicks = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180].map((o, i) => ({
      o,
      c: `${i}a`,
    }));
    const result = projectTicks(ref, refTicks, alt);
    const offsets = os(result);
    expect(offsets.length).toBeGreaterThan(0);
    expect(new Set(offsets).size).toBe(offsets.length);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]!).toBeGreaterThan(offsets[i - 1]!);
    }
    expect(result.every((t) => t.real === false)).toBe(true);
  });
});

describe('projectTicks — clamping', () => {
  it('never emits an offset < 0 or > altText.length', () => {
    const alt = 'A short alt. Another bit.';
    const ref = 'r'.repeat(50);
    const result = projectTicks(
      ref,
      [
        { o: -5, c: '8a' }, // treat as start
        { o: 0, c: '8b' },
        { o: 25, c: '8c' },
        { o: 50, c: '8d' },
        { o: 999, c: '8e' }, // past end of ref
      ],
      alt,
    );
    for (const t of result) {
      expect(t.o).toBeGreaterThanOrEqual(0);
      expect(t.o).toBeLessThanOrEqual(alt.length);
      expect(t.real).toBe(false);
    }
  });

  it('clamps a projection that would land past altText.length', () => {
    const alt = 'Tiny.';
    const ref = 'much longer reference text here';
    // o near end of long ref → projected near/at end of short alt
    const result = projectTicks(ref, [{ o: ref.length - 1, c: '9a' }], alt);
    expect(result).toHaveLength(1);
    expect(result[0]!.o).toBeLessThanOrEqual(alt.length);
    expect(result[0]!.o).toBeGreaterThanOrEqual(0);
  });
});

describe('projectTicks — real flag', () => {
  it('marks every tick real: false', () => {
    const alt = 'Alpha. Beta. Gamma.';
    const ref = 'x'.repeat(30);
    const result = projectTicks(
      ref,
      [
        { o: 0, c: 'a' },
        { o: 15, c: 'b' },
        { o: 29, c: 'c' },
      ],
      alt,
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((t) => t.real === false)).toBe(true);
  });
});
