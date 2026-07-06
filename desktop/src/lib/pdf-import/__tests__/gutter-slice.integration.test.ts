// Real-geometry integration test, gated on ARISTOTLE_REEVE_SLICE. Off by
// default (skips cleanly with a message) because the fixture is a real
// copyrighted extraction that must never be checked into the repo — it's
// pointed at from outside via an env var, e.g.:
//
//   ARISTOTLE_REEVE_SLICE=/path/to/ne-slice.txt npm test
//
// This is an HONESTY test, not a gold-value test: it doesn't assert exact
// tics (there's no hand-verified answer key for 176 pages), it asserts the
// scanner never lies — no silently-dropped lines, no silently-collapsed
// pages, no tic reported as bound without a resolvable column. If any of
// these invariants fails against the real slice, THIS TEST SHOULD FAIL —
// do not weaken the assertions to make it pass; that would hide exactly the
// failure mode this module exists to catch.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { splitPages } from '../pages';
import { createDocContext, scanPage, type Tic } from '../gutter';

const slicePath = process.env.ARISTOTLE_REEVE_SLICE;

if (!slicePath) {
  // eslint-disable-next-line no-console
  console.log(
    'gutter-slice.integration.test: ARISTOTLE_REEVE_SLICE not set — skipping real-slice integration test.'
  );
}

describe.skipIf(!slicePath)('gutter scan honesty invariants (real Reeve slice)', () => {
  it('scans the whole slice with zero dropped lines, zero collapsed pages, and >2500 tics', () => {
    const raw = readFileSync(slicePath as string, 'utf8');
    const pages = splitPages(raw);
    const ctx = createDocContext();

    const allTics: Tic[] = [];
    const flagHistogram = new Map<string, number>();
    const collapsedPages: number[] = [];
    const droppedLineFlags: { page: number; flag: string }[] = [];
    const sidesSample: string[] = [];

    for (const page of pages) {
      const scan = scanPage(page, ctx);
      allTics.push(...scan.tics);
      sidesSample.push(scan.side ?? '-');

      for (const flag of scan.flags) {
        flagHistogram.set(flag, (flagHistogram.get(flag) ?? 0) + 1);
        if (flag.startsWith('dropped-line')) droppedLineFlags.push({ page: page.index, flag });
      }
      for (const tic of scan.tics) {
        for (const flag of tic.flags) {
          flagHistogram.set(flag, (flagHistogram.get(flag) ?? 0) + 1);
        }
      }
      if (scan.collapsed) collapsedPages.push(page.index);
    }

    const fullForms = allTics.filter((t) => /[ab]/.test(t.raw)).length;
    const unresolvedColumn = allTics.filter((t) => t.column === null);

    const summary = [
      '--- gutter-slice integration summary ---',
      `pages: ${pages.length}`,
      `tics: ${allTics.length}`,
      `full-forms: ${fullForms}`,
      `flags: ${JSON.stringify(Object.fromEntries(flagHistogram))}`,
      `sides sample (first 20): ${sidesSample.slice(0, 20).join(',')}`,
      `collapsed pages: ${collapsedPages.length ? collapsedPages.join(',') : 'none'}`,
      `tics with unresolved column: ${unresolvedColumn.length}`,
      '-----------------------------------------',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(summary);

    // Honesty invariants — see module header. Do not weaken these.
    expect(droppedLineFlags).toEqual([]);
    expect(collapsedPages).toEqual([]);
    expect(unresolvedColumn).toEqual([]);
    expect(allTics.length).toBeGreaterThan(2500);
  });
});
