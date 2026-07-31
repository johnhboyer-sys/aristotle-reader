import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  levelName,
  navRoleOf,
  levelDepth,
  reclampDepths,
  sanitizeProfile,
  sanitizeLevels,
  MAX_LEVELS,
} from '../profile';

describe('profile helpers', () => {
  const p = {
    levels: [
      { name: 'Part', navRole: 'book' as const, depth: 0 },
      { name: 'Question', navRole: 'chapter' as const, depth: 1 },
    ],
  };

  it('levelName / navRoleOf / levelDepth read a 1-based rank', () => {
    expect(levelName(p, 1)).toBe('Part');
    expect(navRoleOf(p, 2)).toBe('chapter');
    expect(levelDepth(p, 2)).toBe(1);
  });

  it('degrade past the profile end', () => {
    expect(levelName(DEFAULT_PROFILE, 9)).toBe('Level 9');
    expect(navRoleOf(DEFAULT_PROFILE, 9)).toBe('heading');
    expect(levelDepth(DEFAULT_PROFILE, 9)).toBe(8); // synthetic index-based fallback
  });
});

describe('sanitizeLevels', () => {
  it('keeps well-formed levels, trims names, and migrates missing depths to "one deeper"', () => {
    expect(sanitizeLevels([{ name: '  Part ', navRole: 'book' }, { name: 'Q', navRole: 'chapter' }])).toEqual([
      { name: 'Part', navRole: 'book', depth: 0 },
      { name: 'Q', navRole: 'chapter', depth: 1 },
    ]);
  });

  it('keeps the subtitle nav-role', () => {
    expect(sanitizeLevels([{ name: 'Title', navRole: 'subtitle', depth: 0 }])).toEqual([
      { name: 'Title', navRole: 'subtitle', depth: 0 },
    ]);
  });

  it('preserves explicit depths and honours equal-level siblings', () => {
    expect(
      sanitizeLevels([
        { name: 'Article', navRole: 'heading', depth: 0 },
        { name: 'Obj', navRole: 'heading', depth: 1 },
        { name: 'Sed contra', navRole: 'heading', depth: 1 },
        { name: 'Respondeo', navRole: 'heading', depth: 1 },
      ]),
    ).toEqual([
      { name: 'Article', navRole: 'heading', depth: 0 },
      { name: 'Obj', navRole: 'heading', depth: 1 },
      { name: 'Sed contra', navRole: 'heading', depth: 1 },
      { name: 'Respondeo', navRole: 'heading', depth: 1 },
    ]);
  });

  it('clamps depth to the no-gap invariant (first=0, at most one deeper than the tier above)', () => {
    // first forced to 0; the 99 is clamped to prevDepth+1 = 1; outdent to 0 is kept.
    expect(
      sanitizeLevels([
        { name: 'A', navRole: 'heading', depth: 5 },
        { name: 'B', navRole: 'heading', depth: 99 },
        { name: 'C', navRole: 'heading', depth: 0 },
      ]),
    ).toEqual([
      { name: 'A', navRole: 'heading', depth: 0 },
      { name: 'B', navRole: 'heading', depth: 1 },
      { name: 'C', navRole: 'heading', depth: 0 },
    ]);
  });

  it('drops empty-named / malformed entries and coerces an unknown navRole to heading', () => {
    expect(
      sanitizeLevels([{ name: '', navRole: 'book' }, 'junk', { name: 'A', navRole: 'nonsense' }, { name: 'B' }]),
    ).toEqual([
      { name: 'A', navRole: 'heading', depth: 0 },
      { name: 'B', navRole: 'heading', depth: 1 },
    ]);
  });

  it('caps the tier count and returns undefined when nothing survives', () => {
    const many = Array.from({ length: MAX_LEVELS + 5 }, (_, i) => ({ name: `L${i}`, navRole: 'heading' }));
    expect(sanitizeLevels(many)).toHaveLength(MAX_LEVELS);
    expect(sanitizeLevels('nope')).toBeUndefined();
    expect(sanitizeLevels([{ name: '' }])).toBeUndefined();
  });
});

describe('reclampDepths', () => {
  it('fills missing depths (legacy migration) and enforces the no-gap invariant', () => {
    expect(reclampDepths([{ depth: undefined }, { depth: undefined }, { depth: undefined }])).toEqual([
      { depth: 0 },
      { depth: 1 },
      { depth: 2 },
    ]);
  });

  it('keeps siblings and clamps a jump to one-deeper', () => {
    expect(reclampDepths([{ depth: 0 }, { depth: 1 }, { depth: 1 }, { depth: 7 }])).toEqual([
      { depth: 0 },
      { depth: 1 },
      { depth: 1 },
      { depth: 2 }, // 7 clamped to prevDepth(1)+1
    ]);
  });
});

describe('sanitizeProfile', () => {
  it('falls back to DEFAULT_PROFILE when nothing usable survives', () => {
    expect(sanitizeProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(sanitizeProfile({ levels: [] })).toEqual(DEFAULT_PROFILE);
  });

  it('accepts either a bare levels array or a { levels } wrapper, adding depths', () => {
    expect(sanitizeProfile([{ name: 'Part', navRole: 'book' }])).toEqual({
      levels: [{ name: 'Part', navRole: 'book', depth: 0 }],
    });
    expect(sanitizeProfile({ levels: [{ name: 'Part', navRole: 'book' }] })).toEqual({
      levels: [{ name: 'Part', navRole: 'book', depth: 0 }],
    });
  });
});
