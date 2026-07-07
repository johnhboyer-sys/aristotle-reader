// Real-geometry integration test on the Reeve Categories slice, gated on
// ARISTOTLE_REEVE_CAT_SLICE exactly like gutter-slice.integration.test.ts /
// convert-slice.integration.test.ts (its NE siblings). Off by default (skips
// cleanly with a message) because the fixture is a real copyrighted
// extraction that must never be checked into the repo:
//
//   ARISTOTLE_REEVE_CAT_SLICE=/path/to/cat-slice.txt npm test
//
// Phase 5 §2: this is the real seed for the BARE-NUMERAL chapter grammar
// (§1) — Categories has no Book heading and no dotted "b.c" anywhere;
// chapters are standalone centered 1-2 digit Arabic numerals ("1", "4",
// "15") followed by a centered title. The whole 27-content-page slice
// (28 splitPages pages — the trailing \f contributes an empty page, same
// convention as the NE slice) is REMARKABLY clean: the gutter-flag
// histogram is EMPTY (zero anomalies of any kind — no dropped lines, no
// non-monotonic tics, no side-ambiguity), all 15 chapters are titled, and
// there is not one division-level or footnote-level audit flag beyond the
// two structurally-expected ones (`single-book-work`, `footnote-star-
// worklevel`). Every number below was MEASURED by running the converter
// against the real slice and then hand-verified against the raw page text
// before being pinned (2026-07-06):
//
//   - 15 chapters, {1.1}..{1.15}, all titled, doc flag `single-book-work`
//     fires exactly once (first acceptance); zero Book divisions anywhere.
//   - 1-digit Bekker columns round-trip end to end: the work opens
//     `{1.1} {1a} Things…` — 1a1 is line 1 of column 1a, so (per the
//     Phase-4A TAG grammar) it emits the suffix-less `{1a}`, not `{1a1}`.
//   - Chapter 4 (`The Ten Categories`) contains a genuine BODY TABLE (the
//     ten-categories list) spanning a page break, with a real gutter tic
//     on one of its rows (`Where … 2a1`). This is the gold display-block
//     case Phase 4's detector was built for.
//
// GENUINE BUG FOUND AND FIXED while building this test (logged in
// implementation-notes.md): the shared "climb upward past a blank gap,
// bridging through a display-shaped line" logic in gutter.ts's
// findBottomFurnitureStart / footnotes.ts's computeNoteBlockStart (added in
// Phase 3 to keep a footnote's own interior diagram, e.g. note 77's, from
// truncating the furniture walk) ALSO over-absorbed the first three rows of
// this exact table ("Substance / Quantity / Quality") into the footnote
// block — they sit directly above the real footnote block with only ONE
// blank-line gap, and each row's wide internal spacing makes it
// display-shaped, so the climb mistook the body table for a footnote's
// interior content and silently dropped it from the emitted text entirely.
// Fixed by anchoring the block's start on the TOPMOST note-starter line
// actually reached (nothing legitimate ever precedes a footnote block's own
// first note), rather than on however far the bridge-and-climb happened to
// wander — this resolves the false absorption without touching the real
// diagram case, and the full NE-slice pinned suite (gutter-slice.
// integration.test.ts, convert-slice.integration.test.ts) is BYTE-IDENTICAL
// before and after the fix (verified: re-ran both env-gated NE tests).
//
// Any deviation from this pinned set means the scanner or the input
// changed, and THIS TEST SHOULD FAIL. Do not loosen the pins to make it
// pass; update them only for a deliberate, explained algorithm change.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { splitPages } from '../pages';
import { createDocContext, scanPage, type Tic } from '../gutter';
import { classifyDivisions, createDivisionState, type Division } from '../divisions';
import { extractFootnotes, createFootnoteState, type FootnoteState } from '../footnotes';
import { convertLayoutExtraction, type ConvertSuccess } from '../index';
import { parseTranslationFile, splitChapters } from '../../translation-file';

const slicePath = process.env.ARISTOTLE_REEVE_CAT_SLICE;

if (!slicePath) {
  // eslint-disable-next-line no-console
  console.log(
    'cat-slice.integration.test: ARISTOTLE_REEVE_CAT_SLICE not set — skipping real-slice integration test.'
  );
}

function scanSlice(path: string) {
  const raw = readFileSync(path, 'utf8');
  const pages = splitPages(raw);
  const ctx = createDocContext();
  const divisionState = createDivisionState();
  const footnoteState = createFootnoteState();

  const allTics: Tic[] = [];
  const flagHistogram = new Map<string, number>();
  const collapsedPages: number[] = [];
  const divisions: Division[] = [];
  const allNotes: import('../footnotes').FootnoteNote[] = [];
  const allMarkers: import('../footnotes').BodyMarker[] = [];
  let pairCount = 0;
  const unmatchedNoteLabels: string[] = [];
  const unmatchedMarkerLabels: string[] = [];
  const footnoteFlagHistogram = new Map<string, number>();

  for (const page of pages) {
    const scan = scanPage(page, ctx);
    allTics.push(...scan.tics);
    for (const flag of scan.flags) flagHistogram.set(flag, (flagHistogram.get(flag) ?? 0) + 1);
    for (const tic of scan.tics) for (const flag of tic.flags) flagHistogram.set(flag, (flagHistogram.get(flag) ?? 0) + 1);
    if (scan.collapsed) collapsedPages.push(page.index);

    const pageDivisions = classifyDivisions(page, scan, divisionState);
    divisions.push(...pageDivisions);

    const pf = extractFootnotes(page, scan, pageDivisions, footnoteState);
    allNotes.push(...pf.notes);
    allMarkers.push(...pf.markers);
    pairCount += pf.pairs.length;
    for (const n of pf.unmatchedNotes) unmatchedNoteLabels.push(n.label);
    for (const m of pf.unmatchedMarkers) unmatchedMarkerLabels.push(m.label);
    for (const flag of pf.flags) footnoteFlagHistogram.set(flag, (footnoteFlagHistogram.get(flag) ?? 0) + 1);
  }

  return {
    pages,
    allTics,
    flagHistogram,
    collapsedPages,
    divisions,
    divisionState,
    allNotes,
    allMarkers,
    pairCount,
    unmatchedNoteLabels,
    unmatchedMarkerLabels,
    footnoteFlagHistogram,
    footnoteState,
  };
}

describe.skipIf(!slicePath)('gutter/division/footnote honesty invariants (real Reeve Categories slice)', () => {
  const run = slicePath ? scanSlice(slicePath) : null;
  const {
    pages, allTics, flagHistogram, collapsedPages, divisions, divisionState,
    allNotes, allMarkers, pairCount, unmatchedNoteLabels, unmatchedMarkerLabels, footnoteFlagHistogram,
    footnoteState,
  } = run ?? (({} as unknown) as ReturnType<typeof scanSlice>);

  const bookDivisions = (divisions ?? []).filter((d) => d.kind === 'book');
  const chapterDivisions = (divisions ?? []).filter((d) => d.kind === 'chapter');
  const titledCount = chapterDivisions.filter((d) => d.title !== null).length;

  it('reproduces exactly the hand-verified anomaly set — a remarkably clean slice, nothing to flag', () => {
    const summary = [
      '--- cat-slice gutter summary ---',
      `pages: ${pages.length}`,
      `tics: ${allTics.length}`,
      `flags: ${JSON.stringify(Object.fromEntries(flagHistogram))}`,
      `collapsed pages: ${collapsedPages.length ? collapsedPages.join(',') : 'none'}`,
      '---------------------------------',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(summary);

    expect(collapsedPages).toEqual([]);
    // Zero anomalies of any kind: no dropped lines, no non-monotonic tics,
    // no side-ambiguity, no unmarked rolls — the cleanest slice in this
    // corpus so far.
    expect(Object.fromEntries(flagHistogram)).toEqual({});
    expect(allTics.length).toBe(236);
  });

  it('division invariants: 15 bare-numeral chapters (book=1 implicit), all titled, single-book-work, zero Book headings', () => {
    const summary = [
      '--- cat-slice divisions summary ---',
      `book divisions: ${bookDivisions.length}`,
      `chapter divisions: ${chapterDivisions.length} (titled: ${titledCount})`,
      `doc flags: ${JSON.stringify(divisionState.flags)}; singleBookWork: ${divisionState.singleBookWork}`,
      '------------------------------------',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(summary);

    // Phase 5 §1: no Book heading and no dotted "b.c" anywhere in this
    // edition — every chapter is a bare centered numeral, book=1 implicit.
    expect(bookDivisions).toEqual([]);
    expect(chapterDivisions.map((d) => [d.book, d.chapter, d.title])).toEqual([
      [1, 1, 'Homonymy, Synonymy, and Paronymy'],
      [1, 2, 'Said-of-a-Subject versus in-a-Subject'],
      [1, 3, 'Said-of-a-Subject'],
      [1, 4, 'The Ten Categories'],
      [1, 5, 'Substance'],
      [1, 6, 'Quantity'],
      [1, 7, 'Relatives'],
      [1, 8, 'Quality'],
      [1, 9, 'Doing, Being Affected, and the Rest of the Categories'],
      [1, 10, 'Opposites'],
      [1, 11, 'Contraries'],
      [1, 12, 'Priority'],
      [1, 13, 'Simultaneity'],
      [1, 14, 'Forms of Movement'],
      [1, 15, 'Having'],
    ]);
    expect(titledCount).toBe(15);
    expect(divisionState.singleBookWork).toBe(true);
    expect(divisionState.book).toBe(1);
    expect(divisionState.workOrdinal).toBe(1); // no seam — a single work
    // The flag fires exactly once, on the very first bare-numeral acceptance.
    expect(divisionState.flags).toEqual(['single-book-work']);
    // Clean audit: no division carries any flag at all.
    expect(divisions.filter((d) => d.flags.length > 0)).toEqual([]);
  });

  it('footnote invariants: 43 numbered + 1 work-level star note, all paired, scope genuinely underdetermined', () => {
    const numberedNotes = allNotes.filter((n) => n.kind === 'numbered');
    const starNotes = allNotes.filter((n) => n.kind === 'star');

    const summary = [
      '--- cat-slice footnotes summary ---',
      `numbered notes: ${numberedNotes.length}; star notes: ${starNotes.length}`,
      `markers: ${allMarkers.length}; pairs: ${pairCount}`,
      `unmatched notes: ${JSON.stringify(unmatchedNoteLabels)}; unmatched markers: ${JSON.stringify(unmatchedMarkerLabels)}`,
      `flags: ${JSON.stringify(Object.fromEntries(footnoteFlagHistogram))}`,
      `scope: ${footnoteState.verdict} (discObs=${footnoteState.discriminatingObs}, scopesAlive=${JSON.stringify(footnoteState.scopesAlive)})`,
      '------------------------------------',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(summary);

    expect(numberedNotes.length).toBe(43);
    expect(starNotes.length).toBe(1); // the translator-credit note, glued to the running-head title
    expect(pairCount).toBe(44); // 43 numbered + 1 star (work-level, running-head-glued)
    expect(unmatchedNoteLabels).toEqual([]);
    expect(unmatchedMarkerLabels).toEqual([]);
    expect(Object.fromEntries(footnoteFlagHistogram)).toEqual({ 'footnote-star-worklevel': 1 });

    // Scope verdict: GENUINELY underdetermined, not a gap in the algorithm.
    // A single-book work never crosses a BOOK boundary (book is pinned at 1
    // throughout), so 'continuous' and 'per-book' predict IDENTICAL
    // transitions for every observation — no number of observations can
    // ever discriminate between them. 'per-chapter' dies normally (real
    // notes don't reset per chapter). Verdict stays null; emission's own
    // fallback (`footnoteState.verdict ?? 'continuous'`) is what actually
    // labels the output — see the emission report below.
    expect(footnoteState.verdict).toBeNull();
    expect(footnoteState.discriminatingObs).toBeGreaterThanOrEqual(3);
    expect(footnoteState.scopesAlive).toEqual({ continuous: true, perBook: true, perChapter: false });
  });
});

describe.skipIf(!slicePath)('convertLayoutExtraction on the real Reeve Categories slice (Phase 5 §2)', () => {
  const result = slicePath ? convertLayoutExtraction(readFileSync(slicePath, 'utf8')) : null;
  const ok = (result?.ok ? result : null) as ConvertSuccess | null;
  const parsed = ok ? parseTranslationFile(ok.tagged) : null;

  it('converts ok and reports exactly the measured emission facts', () => {
    expect(result!.ok).toBe(true);
    const report = ok!.report;

    const summary = [
      '--- cat-slice convert summary ---',
      `pages: ${report.pages}; ticsEmitted: ${report.ticsEmitted}`,
      `divisions: ${JSON.stringify(report.divisions)}; footnotes: ${JSON.stringify(report.footnotes)}`,
      `displayBlocks: ${JSON.stringify(report.displayBlocks)}`,
      `flags: ${JSON.stringify(report.flags)}`,
      '-----------------------------------',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(summary);

    expect(report).toEqual({
      pages: 28, // splitPages counts the trailing \f's empty page (27 content pages)
      ticsEmitted: 236,
      ticsSuppressed: [],
      droppedLines: [],
      collapsedPages: [],
      divisions: { books: 0, chapters: 15, titled: 15 },
      // The verdict stays null in FootnoteState (genuinely underdetermined —
      // see the invariants test above); emission's safe fallback labels it
      // 'continuous', the reading that can never mis-merge two notes.
      footnotes: { scope: 'continuous', notes: 44, markers: 43, unmatched: [] },
      // The ten-categories table (ch. 4), split across the page break: its
      // first three rows on the verso half, the remaining rows + the "Where
      // … 2a1" tic'd row on the recto continuation.
      displayBlocks: [
        { page: 1, lines: [37, 39] },
        { page: 2, lines: [2, 8] },
      ],
      dehyphenation: { joined: 28, kept: 0 },
      seams: [],
      flags: {
        'footnote-star-worklevel': 1,
        'display-block-anchor': 1,
        'single-book-work': 1,
      },
    });
  });

  it("captures all 15 titles verbatim, keyed 'b.c' (book=1 implicit — the app's single-book spine convention)", () => {
    expect(ok!.titles).toEqual({
      '1.1': 'Homonymy, Synonymy, and Paronymy',
      '1.2': 'Said-of-a-Subject versus in-a-Subject',
      '1.3': 'Said-of-a-Subject',
      '1.4': 'The Ten Categories',
      '1.5': 'Substance',
      '1.6': 'Quantity',
      '1.7': 'Relatives',
      '1.8': 'Quality',
      '1.9': 'Doing, Being Affected, and the Rest of the Categories',
      '1.10': 'Opposites',
      '1.11': 'Contraries',
      '1.12': 'Priority',
      '1.13': 'Simultaneity',
      '1.14': 'Forms of Movement',
      '1.15': 'Having',
    });
  });

  it('round-trips through parseTranslationFile: density, warnings, chapter count — measured and pinned', () => {
    const p = parsed!;
    expect(p.density).toBe('five-line-or-column');
    expect(p.warnings).toEqual([]); // clean corpus — no scanTags warnings anywhere
    expect(p.tags).toHaveLength(251); // 236 tics + 15 chapter tags
    expect(p.footnoteMarkers).toHaveLength(43);
    expect(Object.keys(p.footnotes)).toHaveLength(44); // 43 numbered + 1 star, no seam to shadow them
    expect(p.footnoteScope).toBe('continuous');

    const { chapters } = splitChapters(p);
    expect(chapters).toHaveLength(15);
    expect(chapters[0]).toMatchObject({ book: 1, chapter: 1 });
  });

  it('1-digit Bekker columns round-trip end to end: {1.1} {1a} Things… (1a1 line 1 -> suffix-less {1a})', () => {
    const p = parsed!;
    expect(p.tags[0]).toMatchObject({ kind: 'chapter', book: 1, chapter: 1, offset: 0 });
    expect(p.tags[1]).toMatchObject({ kind: 'column', citation: '1a1', column: '1a', line: 1, offset: 0 });
    expect(ok!.tagged).toContain('{1.1} {1a} Things');
    expect(p.text.slice(0, 6)).toBe('Things');
  });

  it('gold anchors, hand-verified against the raw slice before pinning', () => {
    const p = parsed!;

    // {1a} -> "Things" (ch1 opening — same assertion as the adjacency test
    // above, restated as a citation lookup for parity with the other two).
    const tag1a = p.tags.find((t) => t.citation === '1a1')!;
    expect(p.text.slice(tag1a.offset, tag1a.offset + 6)).toBe('Things');

    // The ch4 opening tag: MEASURED as the BARE line tag {25} (kind
    // 'line'), not a composite {1b25} — the source PRINTS just "25" (a
    // leading bare tic on this VERSO page); there is no printed page/column
    // digit to carry a composite form. Its citation still resolves to
    // "1b25" via the running column context (an earlier full-form "1b1" tic
    // on the same page), so the RESOLVED address is column 1b, line 25 —
    // this settles the spec's own "{1b25}?" tentative guess: the emitted
    // TAG TEXT is `{25}`, and only the parsed `citation` field carries the
    // composite "1b25" identity. Hand-verified against the raw page
    // (2026-07-06): "Each of the things said without any combination…" is
    // indeed the continuation of column 1b at line 25.
    const tag1b25 = p.tags.find((t) => t.citation === '1b25')!;
    expect(tag1b25).toMatchObject({ kind: 'line', raw: '25', column: '1b', line: 25 });
    expect(ok!.tagged).toContain('{1.4} {25} Each of the things');
    expect(p.text.slice(tag1b25.offset, tag1b25.offset + 4)).toBe('Each');

    // The table-row tic {2a}/{2a1} -> anchor "Where" (the ten-categories
    // table's tic'd row, on the recto continuation page).
    const tag2a1 = p.tags.find((t) => t.citation === '2a1')!;
    expect(tag2a1).toMatchObject({ kind: 'column', column: '2a', line: 1 });
    expect(p.text.slice(tag2a1.offset, tag2a1.offset + 5)).toBe('Where');
  });

  it('ch.4 display block: the ten-categories table survives the page break, furniture stripped, rows in order', () => {
    const p = parsed!;
    const { chapters } = splitChapters(p);
    const ch4 = chapters.find((c) => c.chapter === 4)!;

    // All ten category rows present, in printed order, nothing from the
    // intervening footnotes/folio/header leaking in between them.
    const rows = [
      'Substance human, horse',
      'Quantity two cubits, three cubits',
      'Quality white, grammatical',
      'Relative double, half, larger',
      'Where in the Lyceum, in the marketplace',
      'When yesterday, last year',
      'Being arranged lying, sitting',
      'Having on wearing shoes, having armor on',
      'Doing cutting, burning',
      'Being affected being cut, being burned',
    ];
    let cursor = -1;
    for (const row of rows) {
      const idx = ch4.text.indexOf(row);
      expect(idx, row).toBeGreaterThan(cursor);
      cursor = idx;
    }
    // The intro paragraph precedes the table; the closing paragraph
    // follows it — furniture (footnote numbers, the folio, the running
    // head) never appears inside the chapter's clean text at all.
    expect(ch4.text).toContain('here are some examples:');
    expect(ch4.text).toContain('is either true or false.');
    expect(ch4.text).not.toMatch(/Categories \(Cat\.\)/);
    expect(ch4.text).not.toMatch(/^\s*\d{1,3}\.\s/m); // no bare footnote-number lines leaked in
  });
});
