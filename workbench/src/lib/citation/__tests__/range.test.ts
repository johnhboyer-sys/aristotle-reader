import { describe, expect, it } from 'vitest';
import { formatBekkerRange } from '../range';

describe('formatBekkerRange', () => {
  it('formats a point reference (start === end)', () => {
    expect(formatBekkerRange('1041a6', '1041a6')).toBe('1041a6');
  });

  it('collapses same page, same column', () => {
    expect(formatBekkerRange('1041a5', '1041a20')).toBe('1041a5–20');
  });

  it('collapses same page, column a→b', () => {
    expect(formatBekkerRange('1041a31', '1041b5')).toBe('1041a31–b5');
  });

  it('gives full ref on both ends for different pages', () => {
    expect(formatBekkerRange('1041b25', '1042a5')).toBe('1041b25–1042a5');
  });

  it('uses the real en dash character U+2013', () => {
    expect(formatBekkerRange('1041a5', '1041a20')).toContain('–');
    expect(formatBekkerRange('1041a5', '1041a20')).not.toContain('-');
  });
});
