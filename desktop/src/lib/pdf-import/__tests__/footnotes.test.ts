// Phase-3 spec §C1 (real minimal-quotation cases) + §C2 (synthetic rows).
//
// §C1 cases reproduce the GEOMETRY of specific pages in the real 176-page
// Reeve NE/MM extraction (ne-slice.txt, not checked into this public repo)
// with minimal verbatim quotation — a handful of words at the exact glued
// marker/note-starter positions that matter to the assertions — and neutral
// synthetic filler everywhere else, following the convention already
// established in fixtures/reeve-geometry.ts.
//
// One deliberate DEPARTURE from the base spec's §C1 table, logged here and
// in implementation-notes.md: the table's "Notes 29, 42-44 | real notes with
// no body marker | footnote-note-unmatched flags" row does not hold against
// the real slice — measured directly (gutter-slice.integration.test.ts),
// every one of notes 29, 42, 43, 44 has a same-page glued marker ("chart.29",
// "noble.42", "earlier43", "waves,\"44") and pairs cleanly. The real slice's
// only unmatched item is a single marker (a "9-11" Bekker line-RANGE
// artifact's second half, not a real footnote marker at all) — see the
// integration test. This file instead proves the footnote-note-unmatched
// mechanism against a genuinely unmatched synthetic note (§C1 row 8').

import { describe, expect, it } from 'vitest';
import type { Page } from '../pages';
import { createDocContext, scanPage, type PageScan } from '../gutter';
import type { Division } from '../divisions';
import { extractFootnotes, createFootnoteState, type FootnoteState } from '../footnotes';

function makePage(lines: string[], index = 0): Page {
  return { index, lines };
}

function makeScan(overrides: Partial<PageScan> = {}): PageScan {
  return {
    tics: [],
    collapsed: false,
    side: 'recto',
    headerLineIdx: null,
    bottomFurnitureStartIdx: null,
    bodyLeft: 0,
    flags: [],
    ...overrides,
  };
}

function division(kind: 'book' | 'chapter', book: number, chapter: number | null, lineIdx: number): Division {
  return { kind, book, chapter, title: null, page: 0, lineIdx, titleLineIdx: null, flags: [] };
}

// ---------------------------------------------------------------------------
// §C1: Reeve real cases (minimal quotation)
// ---------------------------------------------------------------------------

describe('footnotes §C1: Reeve real cases (minimal quotation)', () => {
  it('pairs a glued numeric marker to its same-page note ("...sciences,1" / "1. Reading...")', () => {
    const lines = [
      'A Certain Synthetic Work*',
      '',
      'And since it uses the other practical sciences,1 and further legislates',
      'about what must be done and what avoided, encompassing the human good.',
      '',
      '',
      '1. Reading πρακτικαῖς.',
      '',
    ];
    const page = makePage(lines);
    const scan = makeScan({ headerLineIdx: 0 });
    const state = createFootnoteState();
    const pf = extractFootnotes(page, scan, [], state);

    expect(pf.notes).toHaveLength(1);
    expect(pf.notes[0]).toMatchObject({ label: '1', printed: 1, kind: 'numbered', text: 'Reading πρακτικαῖς.' });

    expect(pf.markers).toHaveLength(1);
    const marker = pf.markers[0];
    expect(marker.label).toBe('1');
    expect(marker.kind).toBe('numbered');
    // Glued directly after "sciences," — no space before it.
    expect(lines[2].slice(0, marker.col)).toBe('And since it uses the other practical sciences,');
    expect(lines[2][marker.col - 1]).toBe(',');

    expect(pf.pairs).toHaveLength(1);
    expect(pf.pairs[0].note.text).toBe('Reading πρακτικαῖς.');
    expect(pf.unmatchedMarkers).toEqual([]);
    expect(pf.unmatchedNotes).toEqual([]);
  });

  it('binds the running-head-glued star marker to the star note as a work-level attachment ("...Ethics*" / "* Translated...")', () => {
    const lines = [
      'A Certain Synthetic Ethics*',
      '',
      'Every methodical inquiry seems to aim at some good worth pursuing here,',
      'which is why the good has rightly been called that at which all things aim.',
      '',
      '',
      '* Translated by C. D. C. Reeve.',
      '',
    ];
    const page = makePage(lines);
    const scan = makeScan({ headerLineIdx: 0 });
    const state = createFootnoteState();
    const pf = extractFootnotes(page, scan, [], state);

    expect(pf.notes).toHaveLength(1);
    expect(pf.notes[0]).toMatchObject({ label: '*', printed: null, kind: 'star', text: 'Translated by C. D. C. Reeve.' });
    // No body-glued star marker exists on this page — only the header one.
    expect(pf.markers).toHaveLength(0);
    expect(pf.pairs).toHaveLength(1);
    expect(pf.pairs[0].marker.lineIdx).toBe(0);
    expect(pf.flags).toContain('footnote-star-worklevel');
    expect(pf.workLevelNotes).toHaveLength(1);
    expect(pf.workLevelNotes[0].label).toBe('*');
  });

  it('assembles a two-line note as prose, space-joined (note 64 shape: "...aid against the Thebans.")', () => {
    const lines = [
      'Header',
      '',
      'to the Athenians, but only the ones they received.64 It is also typical',
      'of such a person to ask for little and to offer help eagerly instead.',
      '',
      '',
      '64. Aristotle apparently refers to a Spartan embassy sent to Athens',
      'to ask for aid against the Thebans.',
      '',
    ];
    const page = makePage(lines);
    const scan = makeScan({ headerLineIdx: 0 });
    const state = createFootnoteState();
    const pf = extractFootnotes(page, scan, [], state);

    expect(pf.notes).toHaveLength(1);
    const note = pf.notes[0];
    expect(note.label).toBe('64');
    expect(note.rawLines).toHaveLength(2);
    expect(note.text).toBe(
      'Aristotle apparently refers to a Spartan embassy sent to Athens to ask for aid against the Thebans.'
    );
    expect(pf.pairs).toHaveLength(1);
  });

  it('preserves a diagram (display lines) with line breaks and internal spacing intact, AM1 (note 77 shape)', () => {
    const lines = [
      'Header',
      '',
      'A preliminary remark opens this section before the point at issue here.',
      'The account proceeds through several ordinary steps first, as follows.',
      'Only after these preliminaries does the geometrical illustration begin.',
      'One further sentence of ordinary prose closes out this opening portion.',
      'A fifth filler sentence pads this section out a little further still.',
      'the mean exceeds the smaller share by one unit of that same amount.77',
      'Consider now the further point that follows directly from this account.',
      '',
      '',
      '',
      '',
      '77. Let segments AA, BB, CC, DD be equal to one another in length here.',
      'Two units are moved from AA and added to CC in the manner described.',
      '                                A                E       D       C                B',
      '                                        4            2       2           4',
      '',
      'Here ED is imagined subtracted from AD and added to DB in this account.',
      '',
      '',
      '999',
      '',
    ];
    const page = makePage(lines);
    const scan = makeScan({ headerLineIdx: 0 });
    const state = createFootnoteState();
    const pf = extractFootnotes(page, scan, [], state);

    expect(pf.notes).toHaveLength(1);
    const note = pf.notes[0];
    expect(note.label).toBe('77');
    expect(note.rawLines).toHaveLength(5);
    expect(note.text).toBe(
      'Let segments AA, BB, CC, DD be equal to one another in length here. ' +
        'Two units are moved from AA and added to CC in the manner described.\n' +
        'A                E       D       C                B\n' +
        '4            2       2           4\n\n' +
        'Here ED is imagined subtracted from AD and added to DB in this account.'
    );
    expect(pf.pairs).toHaveLength(1); // the ".77" body marker pairs with it
  });

  it('MM-shaped page: rejects flush-left body section-numbers, parses the real *+1+2 block, keeps 985b29 verbatim, the leading dagger stays inert', () => {
    const lines = [
      '†A Certain Great Ethics*',
      '',
      'Book 1',
      '',
      '1.1',
      'Ethics and the Good',
      '',
      '1. Since we are choosing to speak about characters we must first look',
      'into what a character actually is a part of, speaking concisely here.',
      'And to have virtue is a number that is an equal times an equal.1 2. Therefore,',
      'if one is to be excellent, one must be excellent also in character.',
      'For justice is not a number of that kind: he made the virtues sciences;2',
      'but it is impossible for numbers alone to fully explain the virtues.',
      '',
      '',
      '* Translated by a synthetic hand for this fixture, briefly noted here.',
      '1. See Met. 985b29 for the relevant remark on square numbers here.',
      '2. Compare NE 1144b28-30 for the parallel claim made there as well.',
      '',
      '407',
      '',
    ];
    const page = makePage(lines);
    const scan = makeScan({ headerLineIdx: 0 });
    const divisions: Division[] = [division('book', 1, null, 2), { ...division('chapter', 1, 1, 4), titleLineIdx: 5 }];
    const state = createFootnoteState();
    const pf = extractFootnotes(page, scan, divisions, state);

    // Exactly the three real notes — the flush-left "1."/"2." body section
    // numbers (lines 7 and part of line 9) are confined out by the
    // bottom-furniture boundary and never reach the note parser.
    expect(pf.notes.map((n) => [n.kind, n.label])).toEqual([
      ['star', '*'],
      ['numbered', '1'],
      ['numbered', '2'],
    ]);
    const noteOne = pf.notes.find((n) => n.label === '1' && n.kind === 'numbered')!;
    expect(noteOne.text).toContain('985b29'); // verbatim, never read as a column tag

    // Same-page glued markers found in the body (not the section numbers).
    expect(pf.markers.filter((m) => m.kind === 'numbered').map((m) => m.label)).toEqual(['1', '2']);
    expect(pf.pairs).toHaveLength(3); // 1<->1, 2<->2, header-* <-> star note
    expect(pf.flags).toContain('footnote-star-worklevel');
    expect(pf.unmatchedMarkers).toEqual([]);
    expect(pf.unmatchedNotes).toEqual([]);
    // AM3: the leading dagger glued to the title has no matching "† ..." note
    // anywhere — inert title decoration, never a marker, never flagged.
    expect(pf.flags.some((f) => f.includes('†'))).toBe(false);
    expect(pf.workLevelNotes).toHaveLength(1);
  });

  it("footnote-note-unmatched fires for a genuinely unmatched note (this fixture's substitute for the spec's 29/42-44 row — see module header)", () => {
    const lines = [
      'Header',
      '',
      'The argument proceeds here exactly as it was outlined a moment before.',
      'Nothing in the received text requires any further comment at this point.',
      '',
      '',
      '12. An editorial note on a textual variant, with no citation in the body.',
      '',
    ];
    const page = makePage(lines);
    const scan = makeScan({ headerLineIdx: 0 });
    const state = createFootnoteState();
    const pf = extractFootnotes(page, scan, [], state);

    expect(pf.notes).toHaveLength(1);
    expect(pf.markers).toHaveLength(0);
    expect(pf.pairs).toHaveLength(0);
    expect(pf.unmatchedNotes).toHaveLength(1);
    expect(pf.unmatchedNotes[0].label).toBe('12');
    expect(pf.flags).toContain('footnote-note-unmatched:12');
  });
});

// ---------------------------------------------------------------------------
// §C2: synthetic rows
// ---------------------------------------------------------------------------

function rectoTic(prefix: string, tic: string, col = 96): string {
  return prefix.padEnd(col, ' ') + tic;
}

describe('footnotes §C2: synthetic rows', () => {
  it('recto trailing marker vs tic: an off-cadence glued marker survives as a footnote; the real in-band tic is blanked, never a marker', () => {
    const raw = [
      'Header Title',
      '',
      rectoTic('Some opening line of body text that continues along nicely here', '1200a1'),
      'Second line of body prose continues onward without much incident.',
      rectoTic('Third line of body prose reaches the five-line mark right here', '5'),
      'Fourth line ends oddly with a benefit that is worth mentioning here.20',
      '',
      '',
      '901',
      '',
    ].join('\n');
    const page: Page = { index: 0, lines: raw.split('\n') };
    const ctx = createDocContext();
    const scan = scanPage(page, ctx);
    expect(scan.side).toBe('recto');
    // Sanity: the real tic promoted at line 4 with value 5.
    expect(scan.tics.some((t) => t.lineIdx === 4 && t.line === 5)).toBe(true);

    const state = createFootnoteState();
    const pf = extractFootnotes(page, scan, [], state);

    // The off-cadence ".20" (delta 15 from the last tic) survives as a marker.
    expect(pf.markers.some((m) => m.label === '20' && m.lineIdx === 5)).toBe(true);
    // The real promoted tic never shows up as a marker.
    expect(pf.markers.some((m) => m.lineIdx === 4)).toBe(false);
    expect(pf.markers.some((m) => m.lineIdx === 2)).toBe(false);
    expect(pf.flags.some((f) => f.startsWith('footnote-tic-ambiguous'))).toBe(false);
  });

  it('abutting dropped-space: a glued marker that is ALSO band+cadence-plausible is withheld, flagged footnote-tic-ambiguous', () => {
    const raw = [
      'Header Title',
      '',
      rectoTic('An opening line of body prose that runs along for quite some ways', '1200a1'),
      rectoTic('Another full line of steady prose reaching the five-line mark now', '5'),
      'A concluding line whose final word ends abruptly at a given point.10',
      '',
      '',
      '902',
      '',
    ].join('\n');
    const page: Page = { index: 0, lines: raw.split('\n') };
    const ctx = createDocContext();
    const scan = scanPage(page, ctx);
    expect(scan.tics.some((t) => t.lineIdx === 3 && t.line === 5)).toBe(true);

    const state = createFootnoteState();
    const pf = extractFootnotes(page, scan, [], state);

    expect(pf.flags).toContain('footnote-tic-ambiguous:10');
    expect(pf.markers.some((m) => m.label === '10')).toBe(false); // withheld, never guessed
  });

  it('per-chapter reset: ch1 1,2 / ch2 1,2,3 / ch3 1,2 / ch4 1,2 -> verdict per-chapter', () => {
    // SCOPE_DECIDE_N (§A4) requires 3 DISCRIMINATING (chapter-boundary-
    // crossing) observations to agree before a verdict fires — each
    // restart-at-a-chapter-boundary transition below contributes exactly
    // one, so a 3rd chapter (restart to ch3) is not yet enough; a 4th
    // restart is what actually reaches the threshold.
    const state: FootnoteState = createFootnoteState();

    const noteBlock = (labels: number[]) => ['', '', ...labels.map((n) => `${n}. Note text ${n} here in full.`), ''];
    const bodyWith = (markers: number[]) =>
      markers.map((n, i) => `Body prose sentence number ${i + 1} ends with a marker.${n}`);

    const chapterPage = (chapter: number, labels: number[], index: number) =>
      extractFootnotes(
        makePage(['Header', '', ...bodyWith(labels), '', ...noteBlock(labels), ''], index),
        makeScan({ headerLineIdx: 0 }),
        [division('chapter', 1, chapter, 1)],
        state
      );

    chapterPage(1, [1, 2], 0);
    chapterPage(2, [1, 2, 3], 1);
    chapterPage(3, [1, 2], 2);
    chapterPage(4, [1, 2], 3);

    expect(state.verdict).toBe('per-chapter');
    expect(state.flags).toContain('footnote-scope:per-chapter');
    expect(state.discriminatingObs).toBeGreaterThanOrEqual(3);
  });

  it('empty-chapter hold: ch1 1,2 / ch2 (no notes) / ch3 3,4 continuous -> the empty chapter does not falsely kill continuous or falsely reset', () => {
    const state: FootnoteState = createFootnoteState();
    const noteBlock = (labels: number[]) => ['', '', ...labels.map((n) => `${n}. Note text ${n} here in full.`), ''];
    const bodyWith = (markers: number[]) =>
      markers.map((n, i) => `Body prose sentence number ${i + 1} ends with a marker.${n}`);

    const p1 = makePage(['Header', '', ...bodyWith([1, 2]), '', ...noteBlock([1, 2]), ''], 0);
    extractFootnotes(p1, makeScan({ headerLineIdx: 0 }), [division('chapter', 1, 1, 1)], state);

    // Chapter 2 is entirely empty of footnotes (no notes, no markers) — just
    // the division boundary, contributing no scoring transition at all.
    const p2 = makePage(['Header', '', 'Body prose with no markers or notes on this page at all.', ''], 1);
    extractFootnotes(p2, makeScan({ headerLineIdx: 0 }), [division('chapter', 1, 2, 1)], state);

    const p3 = makePage(['Header', '', ...bodyWith([3, 4]), '', ...noteBlock([3, 4]), ''], 2);
    extractFootnotes(p3, makeScan({ headerLineIdx: 0 }), [division('chapter', 1, 3, 1)], state);

    // continuous survives (3 == 2+1, matching continuous's prediction even
    // though a chapter boundary — indeed two — was crossed); per-chapter
    // correctly dies (it predicted reset on that crossing; actual was continue).
    expect(state.scopesAlive.continuous).toBe(true);
    expect(state.scopesAlive.perChapter).toBe(false);
    expect(state.flags).not.toContain('footnote-number-gap:2->3');
  });

  it('scope conflict: an early reset-on-boundary observation followed by a continue-across-boundary observation kills every hypothesis -> conflict, fallback continuous', () => {
    const state: FootnoteState = createFootnoteState();
    const noteBlock = (labels: number[]) => ['', '', ...labels.map((n) => `${n}. Note text ${n} here in full.`), ''];
    const bodyWith = (markers: number[]) =>
      markers.map((n, i) => `Body prose sentence number ${i + 1} ends with a marker.${n}`);

    // Book 1 / chapter 1: notes 1, 2, 3 (all within one chapter — non-discriminating).
    const p1 = makePage(['Header', '', ...bodyWith([1, 2, 3]), '', ...noteBlock([1, 2, 3]), ''], 0);
    extractFootnotes(p1, makeScan({ headerLineIdx: 0 }), [division('chapter', 1, 1, 1)], state);

    // Book 2 / chapter 1: numbering RESETS to 1 across a book+chapter boundary
    // (kills continuous; per-book/per-chapter correctly predicted reset here).
    const p2 = makePage(['Header', '', ...bodyWith([1, 2]), '', ...noteBlock([1, 2]), ''], 1);
    extractFootnotes(p2, makeScan({ headerLineIdx: 0 }), [division('book', 2, null, 0), division('chapter', 2, 1, 1)], state);

    expect(state.scopesAlive.continuous).toBe(false);
    expect(state.scopesAlive.perBook).toBe(true);
    expect(state.scopesAlive.perChapter).toBe(true);

    // Book 3 / chapter 1: numbering CONTINUES (3) despite crossing another
    // book+chapter boundary — contradicts both remaining hypotheses.
    const p3 = makePage(['Header', '', ...bodyWith([3]), '', ...noteBlock([3]), ''], 2);
    extractFootnotes(p3, makeScan({ headerLineIdx: 0 }), [division('book', 3, null, 0), division('chapter', 3, 1, 1)], state);

    expect(state.scopesAlive).toEqual({ continuous: false, perBook: false, perChapter: false });
    expect(state.flags).toContain('footnote-scope-conflict');
    expect(state.verdict).toBe('continuous'); // the safe fallback — never mis-merges
  });

  it('duplicate on page: two "1." notes are both kept, flagged footnote-duplicate-number:1, paired first-to-first', () => {
    const lines = [
      'Header',
      '',
      'Body prose sentence one ends with a marker right here.1',
      '',
      '',
      '1. First note text, the one an in-body marker actually points to.',
      '1. Second note text, a duplicate label with no marker of its own.',
      '',
    ];
    const page = makePage(lines);
    const scan = makeScan({ headerLineIdx: 0 });
    const state = createFootnoteState();
    const pf = extractFootnotes(page, scan, [], state);

    expect(pf.notes.map((n) => n.text)).toEqual([
      'First note text, the one an in-body marker actually points to.',
      'Second note text, a duplicate label with no marker of its own.',
    ]);
    expect(pf.flags).toContain('footnote-duplicate-number:1');
    expect(pf.pairs).toHaveLength(1);
    expect(pf.pairs[0].note.text).toBe('First note text, the one an in-body marker actually points to.');
    expect(pf.unmatchedNotes).toHaveLength(1);
    expect(pf.unmatchedNotes[0].text).toBe('Second note text, a duplicate label with no marker of its own.');
  });
});
