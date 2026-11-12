import { describe, expect, it } from 'vitest';
import { greekNumeral } from '../lib/numerals';

describe('greekNumeral', () => {
  it('numbers the Pol and the Met', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(greekNumeral).join(' '))
      .toBe('Α Β Γ Δ Ε Ϛ Ζ Η Θ Ι');
    expect(greekNumeral(11)).toBe('ΙΑ');
    expect(greekNumeral(12)).toBe('ΙΒ');
    expect(greekNumeral(13)).toBe('ΙΓ');
  });

  it('carries tens and units, with koppa for ninety', () => {
    expect(greekNumeral(20)).toBe('Κ');
    expect(greekNumeral(36)).toBe('ΛϚ');
    expect(greekNumeral(99)).toBe('ϞΘ');
  });

  it('refuses numbers it cannot write', () => {
    expect(() => greekNumeral(0)).toThrow(RangeError);
    expect(() => greekNumeral(100)).toThrow(RangeError);
    expect(() => greekNumeral(2.5)).toThrow(RangeError);
  });
});
