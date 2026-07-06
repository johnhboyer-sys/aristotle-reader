// Real-geometry integration test, gated on ARISTOTLE_REEVE_SLICE. Off by
// default (skips cleanly with a message) because the fixture is a real
// copyrighted extraction that must never be checked into the repo — it's
// pointed at from outside via an env var, e.g.:
//
//   ARISTOTLE_REEVE_SLICE=/path/to/ne-slice.txt npm test
//
// This is an HONESTY test pinned to the slice's verified anomaly set. The
// real extraction contains exactly three genuine defects/quirks, each
// hand-verified against the raw text (2026-07-06):
//
//   1. dropped-line:1119b20 (page 50) — the printed b20 mark is genuinely
//      absent where the "Book 4 / Generosity" heading block sits. Flagged,
//      never interpolated: the designed behavior on real corrupted input.
//   2. non-monotonic:1029a1 (+6 unmarked-roll fallout tics) — the extraction
//      prints "1029a1" on the Book 5 heading line where NE Book 5's 1129a1
//      belongs. The scanner refuses the backward value, flags the six bare
//      tics it can no longer place, and re-syncs at the next valid full-form
//      (1129b1) two pages later.
//   3. non-monotonic:1181a25 (page 175) — the Magna Moralia seam: MM opens
//      at 1181a25, which precedes NE's own closing column in Bekker order.
//      Caller contract: one DocContext per WORK; a multi-work concatenation
//      flags every seam. (This is why complete-works files are sliced per
//      work before import.)
//
// Any deviation from this pinned set — a new flag, a changed count, a
// collapsed page — means the scanner or the input changed, and THIS TEST
// SHOULD FAIL. Do not loosen the pins to make it pass; update them only for
// a deliberate, explained algorithm change.

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
  it('reproduces exactly the hand-verified anomaly set — nothing more, nothing less', () => {
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

    // Pinned anomaly set — see module header. Do not loosen; update only for
    // a deliberate, explained algorithm change.
    expect(droppedLineFlags).toEqual([{ page: 50, flag: 'dropped-line:1119b20' }]);
    expect(collapsedPages).toEqual([]);
    expect(unresolvedColumn.length).toBe(6); // 1029a1 fallout, re-synced at 1129b1
    expect(Object.fromEntries(flagHistogram)).toEqual({
      'dropped-line:1119b20': 1,
      'non-monotonic:1029a1': 1,
      'non-monotonic:1181a25': 1, // Magna Moralia seam — per-work context is the caller contract
      'unmarked-roll:5': 1,
      'unmarked-roll:10': 1,
      'unmarked-roll:15': 1,
      'unmarked-roll:20': 1,
      'unmarked-roll:25': 1,
      'unmarked-roll:30': 1,
      'position-unresolved:unmarked-roll': 6,
      'side-ambiguous': 2,
      'side-inferred': 1,
    });
    // NE 1094a–1181b ≈ 87.5 Bekker pages × 2 columns × ~7.5 marks: 1333 observed.
    expect(allTics.length).toBe(1333);
    expect(fullForms).toBe(179);
  });
});
