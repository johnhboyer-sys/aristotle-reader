import { describe, expect, it } from 'vitest';
import { phonePlateHeight } from '../lib/poster-fit';

describe('phone plate height', () => {
  it('keeps the natural plate when the title and button leave room', () => {
    expect(phonePlateHeight(844, 297, 80, 309)).toBe(309);
  });
  it('gives space to a long title and the main button', () => {
    expect(phonePlateHeight(844, 460, 80, 309)).toBe(304);
  });
  it('keeps a 120px plate minimum when the button must fall below the fold', () => {
    expect(phonePlateHeight(600, 530, 80, 309)).toBe(120);
  });
  it('does not enlarge a small natural plate to reach the minimum', () => {
    expect(phonePlateHeight(600, 530, 80, 90)).toBe(90);
  });
  it('allows a caller to set the minimum and handles its exact boundary', () => {
    expect(phonePlateHeight(500, 300, 80, 309)).toBe(120);
    expect(phonePlateHeight(500, 400, 80, 309, 100)).toBe(100);
  });
});
