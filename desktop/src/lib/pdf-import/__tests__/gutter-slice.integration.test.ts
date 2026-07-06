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
// PHASE-2 PIN UPDATE (deliberate, 2026-07-06): the forward-bind rule (spec
// §7b) now carries a tic that sits on a division-heading line past the
// heading block to the section's first body word instead of mis-binding the
// word "Book". The slice has exactly FOUR tic-on-heading cases, all book
// headings, so the histogram gains `anchor-forwarded-past-heading: 4`:
//
//   Book 5 (page 67):  1029a1 → "As"    (also demoted non-monotonic — the
//                      Phase-1 audit refuses its backward ADDRESS, but the
//                      tic is kept in the output and still binds; spec §7b
//                      names "As" as its verified forward target)
//   Book 6 (page 86):  bare 15 → "Since" (verso; cadence 15→20 Δ5 holds)
//   Book 8 (page 121): 1155a1 → "The"
//   Book 9 (page 139): bare 30 → "In"
//
// Nothing else changed: tic counts, addresses, and every other flag are
// byte-identical to the Phase-1 pins. Phase 2 also threads classifyDivisions
// across the slice; its invariants are pinned below from the same measured
// run (11 books, 117 chapters all titled, one clean MM seam, no audit flags).
//
// Any deviation from this pinned set — a new flag, a changed count, a
// collapsed page — means the scanner or the input changed, and THIS TEST
// SHOULD FAIL. Do not loosen the pins to make it pass; update them only for
// a deliberate, explained algorithm change.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { splitPages } from '../pages';
import { createDocContext, scanPage, type Tic } from '../gutter';
import { classifyDivisions, createDivisionState, type Division } from '../divisions';

const slicePath = process.env.ARISTOTLE_REEVE_SLICE;

if (!slicePath) {
  // eslint-disable-next-line no-console
  console.log(
    'gutter-slice.integration.test: ARISTOTLE_REEVE_SLICE not set — skipping real-slice integration test.'
  );
}

function scanSlice(path: string) {
  const raw = readFileSync(path, 'utf8');
  const pages = splitPages(raw);
  const ctx = createDocContext();
  const divisionState = createDivisionState();

  const allTics: Tic[] = [];
  const flagHistogram = new Map<string, number>();
  const collapsedPages: number[] = [];
  const droppedLineFlags: { page: number; flag: string }[] = [];
  const sidesSample: string[] = [];
  // Each division tagged with the workOrdinal in force after its page — the
  // seam page opens with MM's own Book 1, so ordinal 1 = NE, ordinal 2 = MM.
  const divisions: (Division & { workOrdinal: number })[] = [];

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

    for (const d of classifyDivisions(page, scan, divisionState)) {
      divisions.push({ ...d, workOrdinal: divisionState.workOrdinal });
    }
  }

  return { pages, allTics, flagHistogram, collapsedPages, droppedLineFlags, sidesSample, divisions, divisionState };
}

describe.skipIf(!slicePath)('gutter scan honesty invariants (real Reeve slice)', () => {
  // The describe body runs even when its tests are skipped, so the (large)
  // slice scan only happens when the env var points at the fixture.
  const run = slicePath ? scanSlice(slicePath) : null;
  const { pages, allTics, flagHistogram, collapsedPages, droppedLineFlags, sidesSample, divisions, divisionState } =
    run ?? (({} as unknown) as ReturnType<typeof scanSlice>);

  const bookDivisions = (divisions ?? []).filter((d) => d.kind === 'book');
  const chapterDivisions = (divisions ?? []).filter((d) => d.kind === 'chapter');
  const neChapters = chapterDivisions.filter((d) => d.workOrdinal === 1);
  const mmDivisions = (divisions ?? []).filter((d) => d.workOrdinal === 2);
  const titledCount = chapterDivisions.filter((d) => d.title !== null).length;

  it('reproduces exactly the hand-verified anomaly set — nothing more, nothing less', () => {
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
      // Phase-2 forward-bind (see header): the four tic-on-book-heading cases.
      'anchor-forwarded-past-heading': 4,
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

  it('forward-binds the four heading-line tics to their verified body anchors (spec §7b)', () => {
    const forwarded = allTics
      .filter((t) => t.flags.includes('anchor-forwarded-past-heading'))
      .map((t) => ({ raw: t.raw, anchorWord: t.anchorWord }));
    expect(forwarded).toEqual([
      { raw: '1029a1', anchorWord: 'As' }, // Book 5 heading (tic also demoted non-monotonic)
      { raw: '15', anchorWord: 'Since' }, // Book 6 heading (verso bare tic)
      { raw: '1155a1', anchorWord: 'The' }, // Book 8 heading
      { raw: '30', anchorWord: 'In' }, // Book 9 heading (recto bare tic)
    ]);
    // Every heading tic found a body line on its own page.
    expect(allTics.some((t) => t.flags.includes('anchor-forwarded-cross-page'))).toBe(false);
  });

  it('division invariants: 10 NE books + MM seam, 117 chapters all titled, clean audit', () => {
    const summary = [
      '--- divisions summary ---',
      `book divisions: ${bookDivisions.length} (${bookDivisions.map((d) => d.book).join(',')})`,
      `chapter divisions: ${chapterDivisions.length} (titled: ${titledCount})`,
      `NE chapters: ${neChapters.length}; MM divisions: ${mmDivisions
        .map((d) => `${d.kind}:${d.book}${d.chapter !== null ? '.' + d.chapter : ''}`)
        .join(',')}`,
      `doc flags: ${JSON.stringify(divisionState.flags)}; workOrdinal: ${divisionState.workOrdinal}`,
      '-------------------------',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(summary);

    // Measured & pinned (2026-07-06): NE Books 1..10 in order, then Magna
    // Moralia's Book 1 across the seam.
    expect(bookDivisions.map((d) => d.book)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1]);
    expect(chapterDivisions.length).toBe(117); // 116 NE + MM 1.1
    expect(titledCount).toBe(117); // every Reeve chapter carries a centered title

    // Every NE chapter division has a title.
    expect(neChapters.length).toBe(116);
    expect(neChapters.every((d) => d.title !== null)).toBe(true);

    // The MM seam: flagged restart, workOrdinal bumped, numbering verbatim.
    expect(divisionState.flags).toContain('book-sequence:restart:1');
    expect(divisionState.workOrdinal).toBe(2);
    expect(mmDivisions.map((d) => [d.kind, d.book, d.chapter, d.title])).toEqual([
      ['book', 1, null, null],
      ['chapter', 1, 1, 'Ethics, Virtue, and the Good'],
    ]);

    // Clean audit: no corroboration mismatches (restated b agrees with the
    // governing heading on all 117 chapters), and in fact no division-level
    // flags at all in this edition.
    expect(divisions.some((d) => d.flags.some((f) => f.startsWith('book-corroboration-mismatch')))).toBe(false);
    expect(divisions.filter((d) => d.flags.length > 0)).toEqual([]);

    // NE opens directly with Book 1 — no preamble.
    expect(divisionState.flags).not.toContain('preamble-present');
  });
});
