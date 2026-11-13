import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(`${process.cwd()}/styles/b.css`, 'utf8');
const measurements = [
  [1, 1, 0, -.8], [.75, .8, -1.2, -2], [.75, 1, -.8, -1.6],
  [.75, 1.4, -1.2, -2], [1, .8, -.1, -.9], [1, 1.4, -.8, -1.6],
  [1.4, .8, -1, -1.8], [1.4, 1, -.7, -1.5], [1.4, 1.4, -1, -1.8],
];

describe('phone number baseline calibration', () => {
  it('uses the measured size correction for both number types', () => {
    const rules = css.split('\n').filter(line => line.includes('--b-number-correction: calc('));
    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      expect(rule).toContain('--b-number-correction: calc(.9px - .8 * (var(--b-number-size) - 11px))');
    }
    expect(rules[0]).toContain('.b-ln');
    expect(rules[1]).toContain('.bk-num');
  });
  it.each(measurements)('bounds the predicted error at text %s / spacing %s', (_text, _spacing, single, both) => {
    for (const [size, measured] of [[11, single], [12, both]]) {
      const correction = .9 - .8 * (size - 11);
      const predicted = measured + 1.5 - correction;
      expect(Math.abs(predicted)).toBeLessThanOrEqual(.600000001);
    }
  });
});
