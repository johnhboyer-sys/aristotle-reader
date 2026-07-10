import { describe, expect, it } from 'vitest';
import type { CorpusConfig } from '../corpus-config';
import { degarbleNumeral, repairSkeleton } from '../skeleton';
import { buildReviewModel, parseDecisions } from '../review';

function config(): CorpusConfig {
  return {
    id: 'synthetic-corpus',
    workTitle: 'Synthetic Work',
    runningHeadPlaceholder: '[running head]',
    bekkerStart: { page: 1, col: 'a' },
    bekkerEnd: { page: 2, col: 'b' },
    divisions: { books: 2, chaptersPerBook: [20, 20] },
    backbonePath: 'backbone.txt',
    witnessPath: 'witness.txt',
    outDir: 'out',
  };
}

function pages(parts: string[]): string {
  return parts.join('\f');
}

describe('degarbleNumeral', () => {
  it('maps the OCR confusion set and rejects other characters', () => {
    expect(degarbleNumeral('I O')).toBe(10);
    expect(degarbleNumeral('rs')).toBe(15);
    expect(degarbleNumeral('')).toBeNull();
    expect(degarbleNumeral('1A')).toBeNull();
  });
});

describe('repairSkeleton head insertion', () => {
  it('inserts a running-head placeholder above a book opening followed by chapter 1', () => {
    const outcome = repairSkeleton('BOOK TWO\nCHAPTER I\nOpening words', config());

    expect(outcome.text).toBe('[running head]\n\nBOOK TWO\nCHAPTER I\nOpening words');
    expect(outcome.changes[0]).toMatchObject({
      stage: 2,
      tier: 1,
      rule: 'head-insert',
      page: 0,
      line: 0,
      before: '',
      after: '[running head]',
      evidence: {
        reason: 'book-opening page, running head absent',
        firstLine: 'BOOK TWO',
        nextHeading: 'CHAPTER I',
      },
    });
  });

  it('does not insert when a book running head is followed by a later chapter', () => {
    const raw = 'BOOK TWO\nCHAPTER 3\nBody text';
    const outcome = repairSkeleton(raw, config());

    expect(outcome.text).toBe(raw);
    expect(outcome.changes.find((change) => change.rule === 'head-insert')).toBeUndefined();
  });

  it('does not insert when the first line is a work-title head', () => {
    const raw = 'SYNTHETIC WORK\nBOOK TWO\nCHAPTER I\nBody text';
    const outcome = repairSkeleton(raw, config());

    expect(outcome.text).toBe(raw);
    expect(outcome.changes).toEqual([]);
  });
});

describe('repairSkeleton heading spacing', () => {
  it('collapses a wide keyword-numeral gap so the numeral cannot read as a trailing tic', () => {
    const outcome = repairSkeleton('[head]\n\n   CHAPTER      1\nBody text', config());

    expect(outcome.text).toBe('[head]\n\n   CHAPTER 1\nBody text');
    expect(outcome.changes).toHaveLength(1);
    expect(outcome.changes[0]).toMatchObject({
      rule: 'heading-normalize',
      tier: 1,
      before: 'CHAPTER      1',
      after: 'CHAPTER 1',
      evidence: { kind: 'heading-spacing', gapWidth: 6 },
    });
  });

  it('collapses the gap while repairing a garbled numeral in one rewrite', () => {
    const garbled = repairSkeleton(
      '[head]\n\n   CHAPTER 9\ntext\n   CHAPTER      IO\ntext',
      config()
    );
    expect(garbled.text).toContain('   CHAPTER 10\n');
    const repair = garbled.changes.find((c) => c.before === 'IO');
    expect(repair).toMatchObject({
      rule: 'heading-normalize',
      after: '10',
      evidence: { spacingCollapsed: true },
    });
  });
});

describe('repairSkeleton heading normalization', () => {
  it('rewrites Greek book ordinals while preserving indentation', () => {
    const outcome = repairSkeleton('[head]\n     BOOK ALPHA\nCHAPTER I\nText', config());

    expect(outcome.text).toBe('[head]\n     BOOK ONE\nCHAPTER I\nText');
    expect(outcome.changes).toHaveLength(1);
    expect(outcome.changes[0]).toMatchObject({
      stage: 2,
      tier: 1,
      rule: 'heading-normalize',
      page: 0,
      line: 1,
      col: 10,
      before: 'ALPHA',
      after: 'ONE',
      evidence: { greekOrdinal: 'ALPHA', value: 1, bookSequence: 1 },
    });
  });

  it('repairs garbled chapter numerals only when the sequence forces the value', () => {
    const raw = pages([
      '[head]\nBOOK ONE\nCHAPTER I\nText',
      '[head]\nCHAPTER II\nText',
      '[head]\nCHAPTER III\nText',
      '[head]\nCHAPTER IV\nText',
      '[head]\nCHAPTER V\nText',
      '[head]\nCHAPTER VI\nText',
      '[head]\nCHAPTER VII\nText',
      '[head]\nCHAPTER VIII\nText',
      '[head]\nCHAPTER IX\nText',
      '[head]\nCHAPTER IO\nText',
      '[head]\nCHAPTER I I\nText',
      '[head]\nCHAPTER XII\nText',
      '[head]\nCHAPTER XIII\nText',
      '[head]\nCHAPTER XIV\nText',
      '[head]\nCHAPTER IS\nText',
    ]);
    const outcome = repairSkeleton(raw, config());

    expect(outcome.text.split('\f')[9]).toContain('CHAPTER 10');
    expect(outcome.text.split('\f')[10]).toContain('CHAPTER 11');
    expect(outcome.text.split('\f')[14]).toContain('CHAPTER 15');
    expect(outcome.changes.filter((change) => change.rule === 'heading-normalize')).toMatchObject([
      { before: 'IO', after: '10', evidence: { expectedChapter: 10, prevChapter: 9 } },
      { before: 'I I', after: '11', evidence: { expectedChapter: 11, prevChapter: 10 } },
      { before: 'IS', after: '15', evidence: { expectedChapter: 15, prevChapter: 14 } },
    ]);
  });

  it('flags garbled chapter numerals when the shape does not match the expected chapter', () => {
    const raw = pages([
      '[head]\nBOOK ONE\nCHAPTER I\nText',
      '[head]\nCHAPTER II\nText',
      '[head]\nCHAPTER III\nText',
      '[head]\nCHAPTER IV\nText',
      '[head]\nCHAPTER V\nText',
      '[head]\nCHAPTER VI\nText',
      '[head]\nCHAPTER IO\nText',
    ]);
    const outcome = repairSkeleton(raw, config());

    expect(outcome.text.split('\f')[6]).toContain('CHAPTER IO');
    expect(outcome.changes).toHaveLength(1);
    expect(outcome.changes[0]).toMatchObject({
      stage: 2,
      tier: 2,
      rule: 'flag',
      page: 6,
      line: 1,
      before: 'IO',
      evidence: {
        kind: 'chapter-numeral-unresolved',
        token: 'IO',
        expected: 7,
        degarbled: 10,
      },
    });
  });

  it('accepts clean Roman chapters and advances sequence without records', () => {
    const raw = '[head]\nBOOK ONE\nCHAPTER I\nText\f[head]\nCHAPTER II\nText';
    const outcome = repairSkeleton(raw, config());

    expect(outcome.text).toBe(raw);
    expect(outcome.changes).toEqual([]);
  });

  it('records the column where a repaired chapter token starts', () => {
    const raw = '[head]\nBOOK ONE\nCHAPTER I\nText\f[head]\n   CHAPTER Z\nText';
    const outcome = repairSkeleton(raw, config());

    expect(outcome.text.split('\f')[1]).toContain('   CHAPTER 2');
    expect(outcome.changes[0]).toMatchObject({
      rule: 'heading-normalize',
      page: 1,
      line: 1,
      col: 11,
      before: 'Z',
      after: '2',
    });
  });

  it('lets a head-inserted opening page participate in book normalization', () => {
    const outcome = repairSkeleton('BOOK ALPHA\nCHAPTER I\nOpening words', config());

    expect(outcome.text).toBe('[running head]\n\nBOOK ONE\nCHAPTER I\nOpening words');
    expect(outcome.changes.map((change) => change.rule)).toEqual([
      'head-insert',
      'heading-normalize',
    ]);
    expect(outcome.changes[1]).toMatchObject({
      rule: 'heading-normalize',
      page: 0,
      line: 2,
      before: 'ALPHA',
      after: 'ONE',
    });
  });
});

describe('repairSkeleton folio repair', () => {
  it('repairs cadence-matching garbled folios and flags conflicting garbles', () => {
    const raw = pages([
      'HEAD\nBody\n12',
      'HEAD\nBody\n13',
      'HEAD\nBody\nr4',
      'HEAD\nBody\nr4',
    ]);
    const outcome = repairSkeleton(raw, config());
    const resultPages = outcome.text.split('\f');

    // §F: cadence-consistent bottom folios (12, 13, and the repaired 14) are
    // STRIPPED outright; the off-cadence garble on page 3 stays flagged.
    expect(resultPages[0]).toBe('HEAD\nBody');
    expect(resultPages[1]).toBe('HEAD\nBody');
    expect(resultPages[2]).toBe('HEAD\nBody');
    expect(resultPages[3]).toBe('HEAD\nBody\nr4');
    expect(outcome.changes[0]).toMatchObject({
      stage: 2,
      tier: 1,
      rule: 'folio-repair',
      page: 2,
      line: 2,
      before: 'r4',
      after: '14',
      evidence: { cadenceExpected: 14, prevFolio: 13, prevFolioPage: 1 },
    });
    expect(outcome.changes[1]).toMatchObject({
      stage: 2,
      tier: 2,
      rule: 'flag',
      page: 3,
      line: 2,
      before: 'r4',
      evidence: {
        kind: 'folio-conflict',
        token: 'r4',
        cadenceExpected: 15,
        shapeMaps: 14,
        action: 'left-in-place',
      },
    });
    const strips = outcome.changes.filter((change) => change.evidence?.kind === 'bottom-folio-strip');
    expect(strips.map((change) => change.before)).toEqual(['12', '13', '14']);
    expect(strips.every((change) => change.tier === 1 && change.rule === 'folio-repair')).toBe(true);
  });

  it('strips cadence folios but never footnote-prose last lines', () => {
    const raw = pages(['HEAD\nBody\n12', 'HEAD\nBody\n13', 'HEAD\nBody\nnote text']);
    const outcome = repairSkeleton(raw, config());

    expect(outcome.text).toBe(pages(['HEAD\nBody', 'HEAD\nBody', 'HEAD\nBody\nnote text']));
    expect(outcome.changes.map((change) => change.evidence?.kind)).toEqual([
      'bottom-folio-strip',
      'bottom-folio-strip',
    ]);
  });
});

describe('repairSkeleton integration', () => {
  it('normalizes a two-book document with sequence-forced garbled chapters', () => {
    const raw = pages([
      'BOOK ALPHA\nCHAPTER I\nAlpha one',
      '[head]\nCHAPTER Z\nAlpha two',
      'BOOK BETA\nCHAPTER I\nBeta one',
      '[head]\nCHAPTER Z\nBeta two',
    ]);
    const outcome = repairSkeleton(raw, config());

    expect(outcome.text).toBe(
      pages([
        '[running head]\n\nBOOK ONE\nCHAPTER I\nAlpha one',
        '[head]\nCHAPTER 2\nAlpha two',
        '[running head]\n\nBOOK TWO\nCHAPTER I\nBeta one',
        '[head]\nCHAPTER 2\nBeta two',
      ])
    );
    expect(outcome.changes.map((change) => [change.rule, change.before, change.after])).toEqual([
      ['head-insert', '', '[running head]'],
      ['head-insert', '', '[running head]'],
      ['heading-normalize', 'ALPHA', 'ONE'],
      ['heading-normalize', 'Z', '2'],
      ['heading-normalize', 'BETA', 'TWO'],
      ['heading-normalize', 'Z', '2'],
    ]);
  });
});

describe('repairSkeleton page-head stray strip', () => {
  it('blanks a running head that a bare page-number stray strands above it', () => {
    // Doubled page-top furniture: a stray "3" then "665 [running head]". The
    // frozen converter strips only the first line, so the running head would
    // leak into the reflowed body — blank it, leaving the stray as the head.
    const raw = pages([
      '[running head]\nBody of page one goes here.',
      '   3\n   665 [running head]\nbody continues here after the head',
    ]);
    const outcome = repairSkeleton(raw, config());
    const p2 = outcome.text.split('\f')[1];
    expect(p2).not.toMatch(/665 \[running head\]/);
    expect(p2).toContain('body continues here after the head');
    expect(outcome.changes.some((c) => c.evidence?.kind === 'page-head-running-strip')).toBe(true);
  });

  it('leaves a bare BOOK division heading (no folio) untouched', () => {
    const raw = pages(['[running head]\nx', '5\nBOOK THREE\nCHAPTER I\nOpening words']);
    const outcome = repairSkeleton(raw, config());
    expect(outcome.text).toContain('BOOK THREE');
    expect(outcome.changes.some((c) => c.evidence?.kind === 'page-head-running-strip')).toBe(false);
  });
});

describe('repairSkeleton config-declared heading style (Apostle format)', () => {
  const IND = ' '.repeat(35); // centred book/chapter heading indent
  const CH = ' '.repeat(12); // printed bare chapter numeral indent (shallow)
  function apostleConfig(): CorpusConfig {
    return {
      ...config(),
      id: 'apostle-like',
      divisions: { books: 2, chaptersPerBook: [5, 5] },
      headingStyle: { bookOrdinal: 'greek-letter', chapterNumeral: 'bare' },
    };
  }

  it('normalizes single-letter books, synthesizes chapter 1, and re-seats bare chapters', () => {
    const raw = pages([
      // Book A opens mid-page (running head above it, as at a body start).
      `[running head]\n${IND}BOOK A\n${CH}2\n     alpha ch2 body\n${CH}3\n     alpha ch3 body`,
      // Book B opens a fresh page — first line is the heading, no head, no
      // labelled chapter; the "4" is a self-heal over a dropped "3".
      `${IND}BOOK B\n${CH}2\n     beta ch2 body\n${CH}4\n     beta ch4 body`,
    ]);
    const outcome = repairSkeleton(raw, apostleConfig());

    // Books resolve to spelled English; both survive as headings.
    expect(outcome.text).toContain('BOOK ONE');
    expect(outcome.text).toContain('BOOK TWO');
    expect(outcome.text).not.toMatch(/BOOK [AB]\b/);

    // Book B got a running-head placeholder inserted above its heading.
    const bookBPage = outcome.text.split('\f')[1];
    expect(bookBPage.startsWith('[running head]')).toBe(true);
    expect(
      outcome.changes.some(
        (c) => c.rule === 'head-insert' && /letter-ordinal book-opening/.test(String(c.evidence?.reason))
      )
    ).toBe(true);

    // Each book's unlabelled opening chapter is synthesized as CHAPTER 1, and
    // printed bare numerals become keyworded chapters at the heading indent
    // (so they clear the converter's LEFT_MIN gate — not their shallow print col).
    expect(outcome.text).toContain(`${IND}CHAPTER 1`);
    expect(outcome.text).toContain(`${IND}CHAPTER 2`);
    expect(outcome.text).toContain(`${IND}CHAPTER 3`);
    expect(outcome.text).not.toMatch(new RegExp(`^${CH}\\d`, 'm'));

    // The dropped "3" in book B is skipped by a logged self-heal, not stalled.
    const heal = outcome.changes.find((c) => c.evidence?.kind === 'bare-chapter-numeral' && c.evidence?.got === 4);
    expect(heal).toBeDefined();
    expect(heal?.evidence?.lostNumerals).toBe(1);
    expect(outcome.text).toContain(`${IND}CHAPTER 4`);
  });

  it('records the real stage-2 line for a chapter below a synthesized CHAPTER 1', () => {
    // Book A: running head, heading, then bare chapters 2 and 3. The walk
    // synthesizes CHAPTER 1 after the heading, so CHAPTER 2 sits one line lower
    // in the output than in the raw page. Its change record must carry the
    // POST-splice line index or the stage-5 review would render the wrong
    // prev/line/next context (it reads text by page/line).
    const raw = pages([
      `[running head]\n${IND}BOOK A\n${CH}2\n     alpha ch2 body\n${CH}3\n     alpha ch3 body`,
    ]);
    const outcome = repairSkeleton(raw, apostleConfig());

    const ch2 = outcome.changes.find((c) => c.page === 0 && c.after === 'CHAPTER 2');
    expect(ch2).toBeDefined();

    const model = buildReviewModel('apostle-like', outcome.changes, outcome.text);
    const instance = model.groups.flatMap((g) => g.instances).find((i) => i.id === ch2!.id);
    expect(instance).toBeDefined();
    expect(instance!.lineText).toContain('CHAPTER 2');
    expect(instance!.prevLine).toContain('CHAPTER 1');
    expect(instance!.nextLine).toContain('alpha ch2 body');
    // And the id's encoded line agrees with the resolved line (no post-hoc drift).
    expect(ch2!.id).toContain(`-L${ch2!.line}-`);
  });

  it('is a no-op without headingStyle — single-letter books and bare numerals stay body text', () => {
    const raw = pages([
      `[running head]\n${IND}BOOK A\n${CH}2\n     alpha body`,
      `${IND}BOOK B\n${CH}2\n     beta body`,
    ]);
    const outcome = repairSkeleton(raw, config());
    expect(outcome.text).toContain('BOOK A');
    expect(outcome.text).toContain('BOOK B');
    expect(outcome.text).not.toContain('BOOK ONE');
    expect(outcome.text).not.toContain('CHAPTER 1');
    expect(outcome.changes.some((c) => c.rule === 'heading-normalize')).toBe(false);
  });
});

describe('repairSkeleton PAD directive', () => {
  it('inserts the placeholder above a body line stranded at page head', () => {
    const raw = pages(['[running head]\nx', 'the arithmetician posits the expression\nmore body']);
    const outcome = repairSkeleton(raw, config(), {
      checkedPatterns: new Set<string>(),
      padLines: ['arithmetician posits the expression'],
    });
    const p2 = outcome.text.split('\f')[1].split('\n');
    expect(p2[0]).toBe('[running head]');
    expect(p2[2]).toContain('arithmetician posits');
    expect(outcome.changes.some((c) => c.evidence?.kind === 'pad-line')).toBe(true);
  });

  it('refuses when the anchored line is not its page head', () => {
    const raw = pages(['[running head]\nthe arithmetician posits the expression']);
    const outcome = repairSkeleton(raw, config(), {
      checkedPatterns: new Set<string>(),
      padLines: ['arithmetician posits the expression'],
    });
    expect(outcome.text).not.toContain('[running head]\n\nthe arithmetician');
    const flag = outcome.changes.find((c) => c.evidence?.kind === 'pad-refused');
    expect(flag?.evidence?.reason).toBe('not-page-head');
  });
});

describe('repairSkeleton interior running-head strip', () => {
  it('blanks interior token+title lines when configured, leaves page heads alone', () => {
    const raw = pages([
      '[running head]\nbody one\n   67                    Posterior Analytics\nbody two',
    ]);
    const cfg: CorpusConfig = { ...config(), runningHeadPlaceholder: 'POSTERIOR ANALYTICS', interiorRunningHeads: 'strip' };
    const outcome = repairSkeleton(raw, cfg);
    expect(outcome.text).not.toMatch(/67\s+Posterior Analytics/);
    expect(outcome.text).toContain('body two');
    expect(outcome.changes.some((c) => c.evidence?.kind === 'interior-running-head')).toBe(true);
    // Line count preserved (blanked, not deleted).
    expect(outcome.text.split('\n')).toHaveLength(raw.split('\n').length);
  });

  it('is a no-op without the config flag', () => {
    const raw = pages([
      '[running head]\nbody one\n   67                    Posterior Analytics\nbody two',
    ]);
    const outcome = repairSkeleton(raw, { ...config(), runningHeadPlaceholder: 'POSTERIOR ANALYTICS' });
    expect(outcome.text).toContain('Posterior Analytics');
    expect(outcome.changes.some((c) => c.evidence?.kind === 'interior-running-head')).toBe(false);
  });
});

describe('repairSkeleton SEAT-chapter directive', () => {
  const IND = ' '.repeat(35); // centred book/chapter heading indent
  const CH = ' '.repeat(12); // printed bare chapter numeral indent (shallow)
  function apostleConfig(): CorpusConfig {
    return {
      ...config(),
      id: 'apostle-like',
      divisions: { books: 2, chaptersPerBook: [5, 5] },
      headingStyle: { bookOrdinal: 'greek-letter', chapterNumeral: 'bare' },
    };
  }
  function seats(md: string) {
    return parseDecisions(md);
  }

  it('parses SEAT-chapter lines without disturbing tick SEATs', () => {
    const md = [
      'SEAT 80b1 => some tick anchor',
      'SEAT-chapter 2.17 => the demonstration begins',
      'SEAT-chapter 1.5 => not all knowledge',
    ].join('\n');
    const decisions = parseDecisions(md);
    expect(decisions.seatChapters).toEqual([
      { book: 2, chapter: 17, anchor: 'the demonstration begins' },
      { book: 1, chapter: 5, anchor: 'not all knowledge' },
    ]);
    expect(decisions.seatTicks).toEqual([{ ref: '80b1', anchor: 'some tick anchor' }]);
  });

  it('seats a lost chapter above its anchor line, and the next printed numeral lands on sequence', () => {
    // Chapter 3's printed numeral is scan-lost; its body opens directly. The
    // printed "4" would self-heal with a logged gap — the seat removes the gap.
    const raw = pages([
      `[running head]\n${IND}BOOK A\n${CH}2\n     alpha ch2 body\n     the lost chapter opens here\n${CH}4\n     alpha ch4 body`,
    ]);
    const outcome = repairSkeleton(raw, apostleConfig(), seats('SEAT-chapter 1.3 => lost chapter opens here'));

    const lines = outcome.text.split('\n');
    const anchorAt = lines.findIndex((l) => l.includes('the lost chapter opens here'));
    expect(lines[anchorAt - 1]).toBe(`${IND}CHAPTER 3`);
    const seat = outcome.changes.find((c) => c.evidence?.kind === 'seat-chapter');
    expect(seat?.after).toBe('CHAPTER 3');
    expect(seat?.evidence?.book).toBe(1);
    // The printed "4" now arrives on sequence — no self-heal gap logged.
    const four = outcome.changes.find((c) => c.evidence?.kind === 'bare-chapter-numeral' && c.after === 'CHAPTER 4');
    expect(four).toBeDefined();
    expect(four?.evidence?.lostNumerals).toBeUndefined();
  });

  it('seats consecutive lost chapters in order', () => {
    const raw = pages([
      `[running head]\n${IND}BOOK A\n${CH}2\n     alpha ch2 body\n     third chapter opening words\n     fourth chapter opening words\n${CH}5\n     alpha ch5 body`,
    ]);
    const outcome = repairSkeleton(
      raw,
      apostleConfig(),
      seats('SEAT-chapter 1.3 => third chapter opening words\nSEAT-chapter 1.4 => fourth chapter opening words')
    );
    expect(outcome.text).toContain(`${IND}CHAPTER 3`);
    expect(outcome.text).toContain(`${IND}CHAPTER 4`);
    const five = outcome.changes.find((c) => c.evidence?.kind === 'bare-chapter-numeral' && c.after === 'CHAPTER 5');
    expect(five?.evidence?.lostNumerals).toBeUndefined();
  });

  it('flags and refuses an ambiguous or absent anchor', () => {
    const raw = pages([
      `[running head]\n${IND}BOOK A\n${CH}2\n     repeated phrase here\n     repeated phrase here`,
    ]);
    const outcome = repairSkeleton(
      raw,
      apostleConfig(),
      seats('SEAT-chapter 1.3 => repeated phrase here\nSEAT-chapter 1.4 => phrase that never occurs')
    );
    expect(outcome.text).not.toContain('CHAPTER 3');
    expect(outcome.text).not.toContain('CHAPTER 4');
    const flags = outcome.changes.filter((c) => c.evidence?.kind === 'seat-chapter-anchor-ambiguous');
    expect(flags.map((f) => f.evidence?.matches)).toEqual([2, 0]);
  });

  it('flags and refuses a directive that lands out of sequence or in the wrong book', () => {
    const raw = pages([
      `[running head]\n${IND}BOOK A\n${CH}2\n     alpha ch2 body\n     unique anchor in book one`,
    ]);
    // Directive claims book 2 (walk is in book 1) — and a second claims a
    // non-consecutive chapter.
    const outcome = repairSkeleton(
      raw,
      apostleConfig(),
      seats('SEAT-chapter 2.3 => unique anchor in book one')
    );
    expect(outcome.text).not.toMatch(/CHAPTER 3/);
    const flag = outcome.changes.find((c) => c.evidence?.kind === 'seat-chapter-conflict');
    expect(flag?.evidence?.walkBook).toBe(1);
    expect(flag?.evidence?.expectedChapter).toBe(3);
  });

  it('flags and refuses two directives whose anchors resolve to the same line', () => {
    // Each anchor is corpus-unique on its own, but both name the same body
    // line — the second would stack a heading that even passes the sequence
    // gate, so both are refused up front.
    const raw = pages([
      `[running head]\n${IND}BOOK A\n${CH}2\n     alpha ch2 body\n     the demonstration begins in earnest`,
    ]);
    const outcome = repairSkeleton(
      raw,
      apostleConfig(),
      seats('SEAT-chapter 1.3 => demonstration begins\nSEAT-chapter 1.4 => begins in earnest')
    );
    expect(outcome.text).not.toContain('CHAPTER 3');
    expect(outcome.text).not.toContain('CHAPTER 4');
    const flags = outcome.changes.filter((c) => c.evidence?.kind === 'seat-chapter-anchor-collision');
    expect(flags).toHaveLength(2);
    expect(flags[0].evidence?.collidesWith).toEqual(['1.4']);
    expect(flags[1].evidence?.collidesWith).toEqual(['1.3']);
  });

  it('refuses a chapter jump even inside the right book', () => {
    const raw = pages([
      `[running head]\n${IND}BOOK A\n${CH}2\n     alpha ch2 body\n     another unique anchor line`,
    ]);
    const outcome = repairSkeleton(raw, apostleConfig(), seats('SEAT-chapter 1.5 => another unique anchor line'));
    expect(outcome.text).not.toContain('CHAPTER 5');
    expect(outcome.changes.some((c) => c.evidence?.kind === 'seat-chapter-conflict')).toBe(true);
  });

  it('refuses an anchor that resolves to a structural heading line', () => {
    // "SEAT-chapter 1.2 => BOOK B" passes the sequence gate (walk is at book
    // 1, chapter 1) but would stack CHAPTER 2 against the BOOK B heading and
    // steal book B's opening — refuse, and the heading still normalizes.
    const raw = pages([
      `[running head]\n${IND}BOOK A\n     body A\n${IND}BOOK B\n     body B`,
    ]);
    const outcome = repairSkeleton(raw, apostleConfig(), seats('SEAT-chapter 1.2 => BOOK B'));
    expect(outcome.text).not.toContain('CHAPTER 2');
    expect(outcome.text).toContain('BOOK TWO');
    const flag = outcome.changes.find((c) => c.evidence?.kind === 'seat-chapter-anchor-is-heading');
    expect(flag).toBeDefined();
  });

  it('refuses an anchor that resolves to a bare chapter numeral line', () => {
    const raw = pages([
      `[running head]\n${IND}BOOK A\n${CH}2\n     alpha ch2 body`,
    ]);
    // The bare "2" line is the only line containing "2" at that shape; anchor
    // it directly — must refuse (it IS the chapter heading, not a body line).
    // Built as an object: parseDecisions strips leading whitespace, so a
    // spaces+numeral anchor can only arise programmatically.
    const outcome = repairSkeleton(raw, apostleConfig(), {
      checkedPatterns: new Set<string>(),
      seatChapters: [{ book: 1, chapter: 2, anchor: `${CH}2` }],
    });
    const seatsApplied = outcome.changes.filter((c) => c.evidence?.kind === 'seat-chapter');
    expect(seatsApplied).toHaveLength(0);
    expect(outcome.changes.some((c) => c.evidence?.kind === 'seat-chapter-anchor-is-heading')).toBe(true);
    // The printed numeral still becomes the real CHAPTER 2 heading.
    expect(outcome.text).toContain(`${IND}CHAPTER 2`);
  });

  it('locates refusal flags in the post-walk text', () => {
    // The ambiguous anchor's occurrences sit below the synthesized CHAPTER 1
    // splice, so their pre-walk line indices are one too low — the flag must
    // carry the post-walk position (where a reader of the record will look).
    const raw = pages([
      `[running head]\n${IND}BOOK A\n     alpha repeated phrase\n     beta repeated phrase`,
    ]);
    const outcome = repairSkeleton(raw, apostleConfig(), seats('SEAT-chapter 1.2 => repeated phrase'));
    const flag = outcome.changes.find((c) => c.evidence?.kind === 'seat-chapter-anchor-ambiguous');
    expect(flag).toBeDefined();
    const outLines = outcome.text.split('\f')[0].split('\n');
    expect(outLines[flag!.line!]).toContain('alpha repeated phrase');
  });

  it('is byte-identical with no directives (gating)', () => {
    const raw = pages([
      `[running head]\n${IND}BOOK A\n${CH}2\n     alpha ch2 body\n     some body line`,
    ]);
    const without = repairSkeleton(raw, apostleConfig());
    const withEmpty = repairSkeleton(raw, apostleConfig(), seats('FIX a => b'));
    expect(withEmpty.text).toBe(without.text);
    expect(withEmpty.changes).toEqual(without.changes);
  });
});
