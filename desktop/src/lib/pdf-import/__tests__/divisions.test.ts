import { describe, expect, it } from 'vitest';
import type { Page } from '../pages';
import { splitPages } from '../pages';
import { createDocContext, scanPage, type PageScan } from '../gutter';
import { classifyDivisions, createDivisionState, type DivisionState } from '../divisions';

// ---------------------------------------------------------------------------
// Helpers: manual PageScan construction for pure-grammar/sequence cases
// (classifyDivisions consumes a PageScan; building one directly isolates the
// division logic from side/furniture detection, which real-scanPage cases
// below still exercise end-to-end).
// ---------------------------------------------------------------------------

const c = (col: number, text: string): string => ' '.repeat(col) + text;

// Center `text` within a fixed measure (mirrors how a real page centers a
// numeral and its title independently — both computed the same way, so
// their midpoints land within a column or two of each other regardless of
// each string's own length, exactly like the real Categories geometry).
function centerIn(width: number, text: string): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

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

function primedState(overrides: Partial<DivisionState>): DivisionState {
  return { ...createDivisionState(), sawFirstDivision: true, ...overrides };
}

function classify(lines: string[], state: DivisionState) {
  return classifyDivisions(makePage(lines), makeScan(), state);
}

// ---------------------------------------------------------------------------
// §10b Clarendon (keyworded: BOOK FOUR / CHAPTER I..XII, no titles) —
// end-to-end through real scanPage (header stripping, side, bodyLeft).
// ---------------------------------------------------------------------------

describe('divisions: Clarendon keyworded grammar (spec §10b)', () => {
  const body = [
    'Of liberality let us speak next, for it seems to be the mean in matters',
    'of wealth, and the liberal man is praised in giving and getting alike.',
  ];
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  const p1: string[] = [c(24, 'ETHICA NICOMACHEA'), '', c(30, 'BOOK FOUR'), ''];
  for (const r of romans.slice(0, 6)) p1.push(c(30, `CHAPTER ${r}`), '', ...body, '');
  const p2: string[] = [c(24, 'ETHICA NICOMACHEA'), ''];
  for (const r of romans.slice(6)) p2.push(c(30, `CHAPTER ${r}`), '', ...body, '');
  p2.push(c(30, 'BOOK V'), '', c(30, 'CHAPTER I'), '', ...body);

  const pages = splitPages(p1.join('\n') + '\f' + p2.join('\n'));
  const ctx = createDocContext();
  const state = createDivisionState();
  const divisions = pages.flatMap((page) => classifyDivisions(page, scanPage(page, ctx), state));

  it('emits BOOK FOUR (spelled-out), CHAPTER I..XII (Roman), then BOOK V / CHAPTER I', () => {
    expect(divisions.map((d) => [d.kind, d.book, d.chapter])).toEqual([
      ['book', 4, null],
      ...romans.map((_, i) => ['chapter', 4, i + 1]),
      ['book', 5, null],
      ['chapter', 5, 1],
    ]);
  });

  it('captures no titles (following line is flush-left body prose)', () => {
    expect(divisions.every((d) => d.title === null && d.titleLineIdx === null)).toBe(true);
  });

  it('runs a clean sequence: no division flags, no preamble, one work', () => {
    expect(divisions.every((d) => d.flags.length === 0)).toBe(true);
    expect(state.flags).not.toContain('preamble-present');
    expect(state.workOrdinal).toBe(1);
    // Opening at BOOK FOUR is a from-nothing gap — flagged, never renumbered.
    expect(state.flags).toEqual(['book-sequence:gap:0->4']);
  });

  it('tolerates Arabic keyworded chapters ("Chapter 12")', () => {
    const st = primedState({ book: 4, bookHeadingGoverns: true, lastChapter: 11 });
    const divs = classify([c(30, 'Chapter 12')], st);
    expect(divs).toHaveLength(1);
    expect(divs[0]).toMatchObject({ kind: 'chapter', book: 4, chapter: 12, flags: [] });
  });
});

// ---------------------------------------------------------------------------
// §10c Glued endnote markers (all four rows)
// ---------------------------------------------------------------------------

describe('divisions: glued endnote markers (spec §10c)', () => {
  it('Book 7300 (last book 6) → book 7 + heading-glued-marker:300', () => {
    const st = primedState({ book: 6, bookHeadingGoverns: true, lastChapter: 2 });
    const divs = classify([c(36, 'Book 7300')], st);
    expect(divs[0]).toMatchObject({ kind: 'book', book: 7, flags: ['heading-glued-marker:300'] });
    expect(st.book).toBe(7);
  });

  it('Book 12 (last book 11) → book 12, no flag (2-digit numbers read whole)', () => {
    const st = primedState({ book: 11, bookHeadingGoverns: true, lastChapter: 9 });
    const divs = classify([c(36, 'Book 12')], st);
    expect(divs[0]).toMatchObject({ kind: 'book', book: 12, flags: [] });
    expect(st.flags).toEqual([]);
  });

  it('Book 12 (last book 1) → book 12 + book-sequence:gap:1->12 (whole read, never split)', () => {
    const st = primedState({ book: 1, bookHeadingGoverns: true, lastChapter: 13 });
    const divs = classify([c(36, 'Book 12')], st);
    expect(divs[0]).toMatchObject({ kind: 'book', book: 12, flags: [] });
    expect(st.flags).toEqual(['book-sequence:gap:1->12']);
  });

  it('Chapter 1512 (lastChapter 14) → chapter 15 + heading-glued-marker:12', () => {
    const st = primedState({ book: 3, bookHeadingGoverns: true, lastChapter: 14 });
    const divs = classify([c(36, 'Chapter 1512')], st);
    expect(divs[0]).toMatchObject({
      kind: 'chapter',
      book: 3,
      chapter: 15,
      flags: ['heading-glued-marker:12'],
    });
  });
});

// ---------------------------------------------------------------------------
// §10d Corroboration disagreement (all three rows)
// ---------------------------------------------------------------------------

describe('divisions: book corroboration (spec §10d)', () => {
  it('5.1 under governing Book 4 → {4,1} + corroboration mismatch (heading wins)', () => {
    const st = primedState({ book: 4, bookHeadingGoverns: true, lastChapter: 0 });
    const divs = classify([c(40, '5.1')], st);
    expect(divs[0]).toMatchObject({
      kind: 'chapter',
      book: 4,
      chapter: 1,
      flags: ['book-corroboration-mismatch:book-heading=4,restated=5'],
    });
    expect(st.book).toBe(4);
  });

  it('5.1, no governing heading, running book 4 → {5,1} + book-heading-missing:5', () => {
    const st = primedState({ book: 4, bookHeadingGoverns: false, lastChapter: 7 });
    const divs = classify([c(40, '5.1')], st);
    expect(divs[0]).toMatchObject({
      kind: 'chapter',
      book: 5,
      chapter: 1,
      flags: ['book-heading-missing:5'],
    });
    expect(st.book).toBe(5);
    expect(st.lastChapter).toBe(1);
  });

  it('5.3, no governing heading, running book 4 → {4,3} + book-restated-jump:4->5', () => {
    const st = primedState({ book: 4, bookHeadingGoverns: false, lastChapter: 2 });
    const divs = classify([c(40, '5.3')], st);
    expect(divs[0]).toMatchObject({
      kind: 'chapter',
      book: 4,
      chapter: 3,
      flags: ['book-restated-jump:4->5'],
    });
    expect(st.book).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// §5 Title capture
// ---------------------------------------------------------------------------

describe('divisions: title capture (spec §5)', () => {
  it('captures a LONG title that centers to leftGap ~3 (center test, not a leading-space floor)', () => {
    // "Natural Virtue, ..." is 64 chars wide starting at col 3: its midpoint
    // (35) aligns with the 6.13 heading's midpoint (36) within tolerance,
    // while its left indent is far below the heading floor.
    const long = 'Natural Virtue, Virtue in the Strict Sense, and Practical Wisdom';
    const st = primedState({ book: 6, bookHeadingGoverns: true, lastChapter: 12 });
    const divs = classify(
      [c(34, '6.13'), c(3, long), '', 'so understood, the account of the virtues is now complete in outline,'],
      st
    );
    expect(divs).toHaveLength(1);
    expect(divs[0]).toMatchObject({ kind: 'chapter', book: 6, chapter: 13, title: long, titleLineIdx: 1 });
    expect(divs[0].flags).toEqual([]);
  });

  it('flags (but single-line-captures) a suspected multi-line title', () => {
    const st = primedState({ book: 8, bookHeadingGoverns: true, lastChapter: 0 });
    const divs = classify(
      [c(40, '8.1'), c(31, 'Views about Friendship'), c(33, 'and Enmity Besides'), '', 'body prose resumes here,'],
      st
    );
    expect(divs[0]).toMatchObject({
      kind: 'chapter',
      book: 8,
      chapter: 1,
      title: 'Views about Friendship',
      titleLineIdx: 1,
    });
    expect(divs[0].flags).toContain('title-multiline-suspect');
  });
});

// ---------------------------------------------------------------------------
// §6 Preamble + §4.1 book-sequence restart (work seam)
// ---------------------------------------------------------------------------

describe('divisions: preamble and seam', () => {
  it('flags preamble-present once for body content before the first division', () => {
    const st = createDivisionState();
    const divs = classify(
      [
        'Some prefatory remarks by the translator occupy this opening line,',
        'continuing for another line of ordinary prose before any division.',
        '',
        c(36, 'Book 1'),
        '',
        c(41, '1.1'),
        c(36, 'Opening'),
        '',
        'body of the first chapter begins here at the ordinary margin,',
      ],
      st
    );
    expect(st.flags.filter((f) => f === 'preamble-present')).toEqual(['preamble-present']);
    expect(divs.map((d) => [d.kind, d.book, d.chapter, d.title])).toEqual([
      ['book', 1, null, null],
      ['chapter', 1, 1, 'Opening'],
    ]);
  });

  it('book-sequence restart (MM-style seam): flagged workOrdinal bump, no crash, no renumbering', () => {
    const st = primedState({ book: 10, bookHeadingGoverns: true, lastChapter: 9 });
    const divs = classify(
      [c(37, 'Book 1'), '', c(41, '1.1'), c(30, 'Ethics, Virtue, and the Good'), '', 'body follows the heading,'],
      st
    );
    expect(divs.map((d) => [d.kind, d.book, d.chapter, d.title])).toEqual([
      ['book', 1, null, null],
      ['chapter', 1, 1, 'Ethics, Virtue, and the Good'],
    ]);
    expect(st.workOrdinal).toBe(2);
    expect(st.flags).toContain('book-sequence:restart:1');
    expect(st.book).toBe(1);
    expect(st.lastChapter).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 5 §1: bare-numeral chapters (single-book works — Categories, De Int)
// ---------------------------------------------------------------------------

describe('divisions: bare-numeral chapters (Phase 5 spec §1)', () => {
  const W = 80; // a nominal print measure; heading + title both centered in it

  it('accepts a clean 1..3 sequence, keys book=1 implicitly, sets single-book-work once', () => {
    const st = createDivisionState();
    const divs = classify(
      [
        centerIn(W, '1'),
        centerIn(W, 'Homonymy, Synonymy, and Paronymy'),
        '',
        'Things are said to be homonymous when they have only the name in common.',
        '',
        centerIn(W, '2'),
        centerIn(W, 'Said-of-a-Subject versus in-a-Subject'),
        '',
        'Among things that are said, some are said in combination, some without.',
        '',
        centerIn(W, '3'),
        centerIn(W, 'Said-of-a-Subject'),
        '',
        'Whenever one thing is predicated of another as of a subject.',
      ],
      st
    );
    expect(divs.map((d) => [d.kind, d.book, d.chapter, d.title])).toEqual([
      ['chapter', 1, 1, 'Homonymy, Synonymy, and Paronymy'],
      ['chapter', 1, 2, 'Said-of-a-Subject versus in-a-Subject'],
      ['chapter', 1, 3, 'Said-of-a-Subject'],
    ]);
    expect(divs.every((d) => d.flags.length === 0)).toBe(true);
    // The flag fires exactly once, on the FIRST acceptance only.
    expect(st.flags).toEqual(['single-book-work']);
    expect(st.singleBookWork).toBe(true);
    expect(st.book).toBe(1); // implicit — never printed, never a Book heading
    expect(st.bookHeadingGoverns).toBe(false);
  });

  it('title capture is the identical center-alignment rule as b.c chapters (captured within tolerance, rejected beyond it)', () => {
    const st = primedState({ book: 1, bookHeadingGoverns: false, lastChapter: 3, singleBookWork: true });
    const divs = classify(
      [centerIn(W, '4'), centerIn(W, 'The Ten Categories'), '', 'Each of the things said without any combination...'],
      st
    );
    expect(divs).toHaveLength(1);
    expect(divs[0]).toMatchObject({ kind: 'chapter', book: 1, chapter: 4, title: 'The Ten Categories' });

    // A title shoved 6 columns off its heading's midpoint (beyond
    // TITLE_CENTER_TOL=4) is correctly NOT captured — flush-left body prose
    // is never mistaken for a title, exactly as for b.c chapters.
    const st2 = primedState({ book: 1, bookHeadingGoverns: false, lastChapter: 4, singleBookWork: true });
    const divs2 = classify(
      [centerIn(W, '5'), c(3, 'Substance'), '', 'Substance in the strictest sense...'],
      st2
    );
    expect(divs2).toHaveLength(1);
    expect(divs2[0]).toMatchObject({ kind: 'chapter', book: 1, chapter: 5, title: null, titleLineIdx: null });
  });

  it('a false-positive stray numeral before the true "1" is rejected outright (stays body, no flag)', () => {
    const st = createDivisionState();
    const divs = classify(
      [
        centerIn(W, '5'), // not 1: sequence-inconsistent, no mode active yet — a stray centered number
        '',
        centerIn(W, '1'),
        centerIn(W, 'Homonymy, Synonymy, and Paronymy'),
        '',
        'Things are said to be homonymous when they have only the name in common.',
      ],
      st
    );
    expect(divs).toHaveLength(1);
    expect(divs[0]).toMatchObject({ kind: 'chapter', book: 1, chapter: 1, title: 'Homonymy, Synonymy, and Paronymy' });
    expect(st.flags).toEqual(['single-book-work']); // the stray "5" left no trace
    expect(st.singleBookWork).toBe(true);
  });

  it('a stray numeral that happens to equal lastChapter+1 while b.c mode governs is ignored — no division, no flag ("b.c mode wins")', () => {
    // A real book-heading/dotted-b.c division has already run in this state
    // (state.book set, singleBookWork false): the bare "5" that would
    // otherwise be sequence-consistent (lastChapter 4 -> 5) must NOT become
    // a chapter division.
    const st = primedState({ book: 2, bookHeadingGoverns: true, lastChapter: 4, singleBookWork: false });
    const divs = classify([centerIn(W, '5'), centerIn(W, 'Some Centered Line')], st);
    expect(divs).toEqual([]);
    expect(st.flags).toEqual([]);
    expect(st.singleBookWork).toBe(false);
    expect(st.lastChapter).toBe(4); // untouched
  });

  it('single-book-work mode tolerates exactly a one-chapter forward gap, flagged (spec\'s own "value==last+2" example)', () => {
    const st = primedState({ book: 1, bookHeadingGoverns: false, lastChapter: 5, singleBookWork: true });
    const divs = classify([centerIn(W, '7'), centerIn(W, 'A Skipped Chapter')], st);
    expect(divs).toHaveLength(1);
    expect(divs[0]).toMatchObject({
      kind: 'chapter',
      book: 1,
      chapter: 7,
      title: 'A Skipped Chapter',
      flags: ['chapter-sequence:gap-or-repeat:5->7'],
    });
    expect(st.lastChapter).toBe(7);
  });

  it('single-book-work mode rejects a wild jump beyond the one-chapter gap tolerance (stays body, no division)', () => {
    const st = primedState({ book: 1, bookHeadingGoverns: false, lastChapter: 5, singleBookWork: true });
    const divs = classify([centerIn(W, '47'), 'unrelated body prose continuing on the next line'], st);
    expect(divs).toEqual([]);
    expect(st.lastChapter).toBe(5); // untouched — never accepted
  });

  it('single-book-work mode rejects a backward/repeat value (stays body, no division)', () => {
    const st = primedState({ book: 1, bookHeadingGoverns: false, lastChapter: 5, singleBookWork: true });
    const divs = classify([centerIn(W, '3'), 'body prose resumes normally right here'], st);
    expect(divs).toEqual([]);
    expect(st.lastChapter).toBe(5);
  });

  it('a free-floating title-shaped line after a REJECTED bare numeral stays ignored, not captured', () => {
    const st = primedState({ book: 1, bookHeadingGoverns: false, lastChapter: 5, singleBookWork: true });
    const divs = classify(
      [centerIn(W, '99'), centerIn(W, 'Not Really A Title'), '', 'ordinary prose follows'],
      st
    );
    expect(divs).toEqual([]);
  });
});
