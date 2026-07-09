import { describe, expect, it } from 'vitest';
import type { CorpusConfig } from '../corpus-config';
import { degarbleNumeral, repairSkeleton } from '../skeleton';

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
