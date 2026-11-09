import { expect, test } from 'vitest';
import { greekColumnWidth } from '@shared/lib/greek-track';

test.each([
  ['whole lines', 400, 20, 2, 64, 1000, 400],
  ['give Greek the remaining space', 800, 20, 2, 64, 1100, 516],
  ['share below the floors', 800, 20, 2, 64, 800, 320],
  ['three compare columns', 400, 18, 3, 64, 1600, 400],
])('R-R5 %s', (_, w, u, n, gap, width, expected) => {
  console.log('R-R5 width formula examined=1');
  expect(greekColumnWidth(w, u, n, gap, width)).toBe(expected);
});
