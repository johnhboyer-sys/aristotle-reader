import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  levelName,
  navRoleOf,
  sanitizeProfile,
  sanitizeLevels,
  MAX_LEVELS,
} from '../profile';

describe('profile helpers', () => {
  it('levelName / navRoleOf read a 1-based rank', () => {
    const p = { levels: [{ name: 'Part', navRole: 'book' as const }, { name: 'Question', navRole: 'chapter' as const }] };
    expect(levelName(p, 1)).toBe('Part');
    expect(navRoleOf(p, 2)).toBe('chapter');
  });

  it('levelName / navRoleOf degrade past the profile end', () => {
    expect(levelName(DEFAULT_PROFILE, 9)).toBe('Level 9');
    expect(navRoleOf(DEFAULT_PROFILE, 9)).toBe('heading');
  });
});

describe('sanitizeLevels', () => {
  it('keeps well-formed levels and trims names', () => {
    expect(sanitizeLevels([{ name: '  Part ', navRole: 'book' }, { name: 'Q', navRole: 'chapter' }])).toEqual([
      { name: 'Part', navRole: 'book' },
      { name: 'Q', navRole: 'chapter' },
    ]);
  });

  it('drops empty-named / malformed entries and coerces an unknown navRole to heading', () => {
    expect(
      sanitizeLevels([{ name: '', navRole: 'book' }, 'junk', { name: 'A', navRole: 'nonsense' }, { name: 'B' }]),
    ).toEqual([
      { name: 'A', navRole: 'heading' },
      { name: 'B', navRole: 'heading' },
    ]);
  });

  it('caps the tier count and returns undefined when nothing survives', () => {
    const many = Array.from({ length: MAX_LEVELS + 5 }, (_, i) => ({ name: `L${i}`, navRole: 'heading' }));
    expect(sanitizeLevels(many)).toHaveLength(MAX_LEVELS);
    expect(sanitizeLevels('nope')).toBeUndefined();
    expect(sanitizeLevels([{ name: '' }])).toBeUndefined();
  });
});

describe('sanitizeProfile', () => {
  it('falls back to DEFAULT_PROFILE when nothing usable survives', () => {
    expect(sanitizeProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(sanitizeProfile({ levels: [] })).toEqual(DEFAULT_PROFILE);
  });

  it('accepts either a bare levels array or a { levels } wrapper', () => {
    const levels = [{ name: 'Part', navRole: 'book' as const }];
    expect(sanitizeProfile(levels)).toEqual({ levels });
    expect(sanitizeProfile({ levels })).toEqual({ levels });
  });
});
