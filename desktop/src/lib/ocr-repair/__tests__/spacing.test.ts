import { describe, expect, it } from 'vitest';
import type { CorpusConfig } from '../corpus-config';
import { normalizeSpacing } from '../spacing';
import { convertLayoutExtraction, type ConvertReport } from '../../pdf-import';

function config(overrides: Partial<CorpusConfig> = {}): CorpusConfig {
  return {
    id: 'synthetic',
    workTitle: 'Synthetic Work',
    runningHeadPlaceholder: 'HEAD',
    bekkerStart: { page: 639, col: 'a' },
    bekkerEnd: { page: 650, col: 'b' },
    divisions: { books: 1, chaptersPerBook: [1] },
    backbonePath: 'backbone.txt',
    witnessPath: 'witness.txt',
    outDir: 'out',
    ...overrides,
  };
}

function page(body: string[], head = 'RUNNING HEAD', folio = '101'): string {
  return [head, '', ...body, '', folio].join('\n');
}

function doc(...pages: string[]): string {
  return `${pages.join('\f')}\f`;
}

function reportFor(raw: string): ConvertReport {
  const result = convertLayoutExtraction(raw, { pageLevelOnly: true });
  if (!result.ok) throw new Error(`converter did not produce a report: ${JSON.stringify(result)}`);
  return result.report;
}

function flagKinds(changes: { rule: string; evidence?: Record<string, unknown> }[]): string[] {
  return changes
    .filter((change) => change.rule === 'flag')
    .map((change) => String(change.evidence?.kind));
}

function rectoAt(body: string, tic: string, col = 60): string {
  return body.padEnd(col, ' ') + tic;
}

describe('normalizeSpacing stage-4 fixtures', () => {
  it('1. collapses verso prose runs, keeps paragraph indent, and removes converter display noise', () => {
    const raw = doc(page([
      '639a       First    invented    sentence keeps moving.',
      '               Paragraph    opening keeps its margin.',
      '5          Second invented line keeps cadence.',
    ]));
    const outcome = normalizeSpacing(raw, config({ side: 'verso' }));
    const lines = outcome.text.split('\f')[0].split('\n');

    expect(lines[2]).toBe('639a       First invented sentence keeps moving.');
    expect(lines[3]).toBe('               Paragraph opening keeps its margin.');
    expect(lines[3].indexOf('Paragraph')).toBe(15);
    expect(outcome.changes.filter((change) => change.rule === 'spacing-collapse')).toHaveLength(2);
    expect(reportFor(outcome.text).displayBlocks).toEqual([]);
  });

  it('2. collapses recto body spacing while preserving tic columns and converter tics', () => {
    const raw = doc(page([
      rectoAt('First body     word for a sample sentence', '639a'),
      rectoAt('Second body word for a matching sample sentence', '5'),
    ]));
    const outcome = normalizeSpacing(raw, config({ side: 'recto' }));
    const lines = outcome.text.split('\f')[0].split('\n');
    const starts = [lines[2].indexOf('639a'), lines[3].indexOf('5')];

    expect(lines[2]).toContain('First body word for a sample sentence');
    expect(starts).toEqual([60, 60]);
    expect(lines[2].slice('First body word for a sample sentence'.length, starts[0]).length).toBeGreaterThanOrEqual(4);
    expect(outcome.changes[0]).toMatchObject({
      rule: 'spacing-collapse',
      evidence: { runsCollapsed: 1, side: 'recto', ticColPreserved: true },
    });
    expect(reportFor(outcome.text).ticsEmitted).toBeGreaterThanOrEqual(2);
  });

  it('3. collapses a verso residual without moving the tic head or residual start', () => {
    const raw = doc(page([
      '5    residual    text has invented words',
    ]));
    const outcome = normalizeSpacing(raw, config({ side: 'verso' }));
    const line = outcome.text.split('\f')[0].split('\n')[2];

    expect(line).toBe('5    residual text has invented words');
    expect(line.indexOf('residual')).toBe(5);
    expect(outcome.changes[0]).toMatchObject({
      rule: 'spacing-collapse',
      evidence: { runsCollapsed: 1, side: 'verso' },
    });
  });

  it('4. preserves a low-alpha two-row table and leaves converter display blocks', () => {
    const raw = doc(page([
      '639a       hot    cold    dry',
      '           wet    warm    moist',
      '5          Plain invented sentence resumes cadence.',
    ]));
    const outcome = normalizeSpacing(raw, config({ side: 'verso' }));
    const lines = outcome.text.split('\f')[0].split('\n');

    expect(lines[2]).toBe('639a       hot    cold    dry');
    expect(lines[3]).toBe('           wet    warm    moist');
    expect(flagKinds(outcome.changes)).toEqual(['preserved-display', 'preserved-display']);
    expect(reportFor(outcome.text).displayBlocks.length).toBeGreaterThanOrEqual(1);
  });

  it('5. leaves footnote-block spacing byte-identical below the blank gap', () => {
    const raw = doc(page([
      '639a       Body sentence has invented wording.',
      '5          More invented body wording follows.',
      '',
      '1. note    spacing remains below the body.',
    ]));
    const outcome = normalizeSpacing(raw, config({ side: 'verso' }));

    expect(outcome.text).toBe(raw);
    expect(outcome.changes).toEqual([]);
  });

  it('6. collapses one wide run in high-alpha prose', () => {
    const raw = doc(page([
      '639a       This invented sentence    contains enough letters for prose.',
    ]));
    const outcome = normalizeSpacing(raw, config({ side: 'verso' }));

    expect(outcome.text).toContain('This invented sentence contains enough letters for prose.');
    expect(outcome.changes[0]).toMatchObject({
      rule: 'spacing-collapse',
      evidence: { runsCollapsed: 1 },
    });
  });

  it('7. collapses two wide runs in high-alpha prose instead of preserving tabular shape', () => {
    const raw = doc(page([
      '639a       This invented sentence    contains enough letters    for ordinary prose.',
    ]));
    const outcome = normalizeSpacing(raw, config({ side: 'verso' }));

    expect(outcome.text).toContain('This invented sentence contains enough letters for ordinary prose.');
    expect(outcome.changes[0]).toMatchObject({
      rule: 'spacing-collapse',
      evidence: { runsCollapsed: 2 },
    });
    expect(reportFor(outcome.text).displayBlocks).toEqual([]);
  });

  it('8. preserves a centered bare numeral as display in a two-book corpus', () => {
    const raw = doc(page([
      '                  18',
      '639a       Body sentence resumes after the numeral.',
    ]));
    const outcome = normalizeSpacing(raw, config({
      divisions: { books: 2, chaptersPerBook: [20, 20] },
    }));
    const lines = outcome.text.split('\f')[0].split('\n');

    expect(lines[2]).toBe('                  18');
    expect(outcome.changes[0]).toMatchObject({
      rule: 'flag',
      evidence: { kind: 'preserved-display', alpha: 0 },
    });
  });

  it('9. flags wide-run headings and preserves low-alpha heading-like leftovers', () => {
    const raw = doc(page([
      '                  BOOK    FOUR',
      '                  BOOK  FOUR    685',
      '639a       Body sentence resumes after headings.',
    ]));
    const outcome = normalizeSpacing(raw, config({ divisions: { books: 4, chaptersPerBook: [1, 1, 1, 1] } }));
    const lines = outcome.text.split('\f')[0].split('\n');

    expect(lines[2]).toBe('                  BOOK    FOUR');
    expect(lines[3]).toBe('                  BOOK  FOUR    685');
    expect(flagKinds(outcome.changes)).toEqual(['heading-residual-wide-run', 'preserved-display']);
  });

  it('10. leaves running heads, hyphenated ends, and blank lines unchanged', () => {
    const raw = doc(page([
      '639a       Hyphenated invented differ-',
      '',
      '5          Continuation invented wording follows.',
    ], 'RUNNING    HEAD'));
    const outcome = normalizeSpacing(raw, config({ side: 'verso' }));
    const lines = outcome.text.split('\f')[0].split('\n');

    expect(lines[0]).toBe('RUNNING    HEAD');
    expect(lines[2]).toBe('639a       Hyphenated invented differ-');
    expect(lines[3]).toBe('');
    expect(outcome.text).toBe(raw);
    expect(outcome.changes).toEqual([]);
  });

  it('11. batch-2 E: re-seats a chapter-opening indent to the body margin unless chapterTitles', () => {
    const body = [
      '                 CHAPTER 4',
      '',
      '    One might be puzzled why people have not named',
      'one kind that includes both invented sample words.',
      'another margin line keeps the modal honest here.',
    ];
    const raw = doc(page(body));
    const outcome = normalizeSpacing(raw, config());
    const lines = outcome.text.split('\f')[0].split('\n');

    expect(lines[4]).toBe('One might be puzzled why people have not named');
    expect(outcome.changes).toMatchObject([
      {
        rule: 'heading-normalize',
        tier: 1,
        evidence: { kind: 'chapter-first-line-deindent', fromCol: 4, toCol: 0 },
      },
    ]);

    // Title-bearing editions (Reeve-style) keep the indent for §5 capture.
    const titled = normalizeSpacing(raw, config({ chapterTitles: true }));
    expect(titled.text).toBe(raw);
    expect(titled.changes).toEqual([]);
  });
});
