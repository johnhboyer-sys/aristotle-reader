import { describe, expect, it } from 'vitest';
import type { CorpusConfig } from '../corpus-config';
import { reseatGutter } from '../gutter-reseat';
import { extractWitnessAnchors } from '../witness-anchors';
import { convertLayoutExtraction, type ConvertReport } from '../../pdf-import';

function config(
  start = { page: 639, col: 'a' as const },
  end = { page: 650, col: 'b' as const },
  side?: CorpusConfig['side']
): CorpusConfig {
  return {
    id: 'synthetic',
    workTitle: 'Synthetic Work',
    runningHeadPlaceholder: 'HEAD',
    bekkerStart: start,
    bekkerEnd: end,
    divisions: { books: 1, chaptersPerBook: [1] },
    side,
    backbonePath: 'backbone.txt',
    witnessPath: 'witness.txt',
    outDir: 'out',
  };
}

function reportFor(raw: string): ConvertReport {
  const result = convertLayoutExtraction(raw.includes('\f') ? raw : `${raw}\f`, { pageLevelOnly: true });
  if (!result.ok) throw new Error(`converter did not produce a report: ${JSON.stringify(result)}`);
  return result.report;
}

function flagKinds(changes: { rule: string; evidence?: Record<string, unknown> }[]): string[] {
  return changes
    .filter((change) => change.rule === 'flag')
    .map((change) => String(change.evidence?.kind));
}

function rectoLine(width: number, tic: string): string {
  return `${'r'.repeat(width)} ${tic}`;
}

describe('reseatGutter stage-3 fixtures', () => {
  it('1. verso re-margin moves body col 6 to 11 and emits converter-visible tics', () => {
    const raw = [
      'RUNNING HEAD',
      '639a  Body text opens here.',
      '5     More body text follows.',
      '      Plain body text continues.',
      '          Paragraph body text continues.',
      '',
      '101',
    ].join('\n');
    const outcome = reseatGutter(raw, config(undefined, undefined, 'verso'));
    const lines = outcome.text.split('\n');

    expect(lines[0]).toBe('RUNNING HEAD');
    expect(lines[1].startsWith('639a')).toBe(true);
    expect(lines[1].indexOf('Body')).toBe(11);
    expect(lines[2].startsWith('5')).toBe(true);
    expect(lines[3].indexOf('Plain')).toBe(11);
    expect(lines[4].indexOf('Paragraph')).toBe(15);
    expect(lines[6]).toBe('101');
    expect(outcome.changes.filter((change) => change.rule === 'tic-reseat')).toHaveLength(1);

    const report = reportFor(outcome.text);
    expect(report.ticsEmitted).toBeGreaterThanOrEqual(2);
    expect(report.collapsedPages).toEqual([]);
    expect(report.flags['side-ambiguous'] ?? 0).toBe(0);
  });

  it('2. recto re-pad aligns all repaired tics at one column with a gap of at least four', () => {
    const raw = [
      'RUNNING HEAD',
      rectoLine(30, '639a'),
      'ordinary body text between recto marks.',
      rectoLine(45, '639a5'),
      'ordinary body text between recto marks again.',
      rectoLine(66, '639a10'),
      '',
      '102',
    ].join('\n');
    const outcome = reseatGutter(raw, config(undefined, undefined, 'recto'));
    const lines = outcome.text.split('\n');
    const starts = [lines[1].indexOf('639a'), lines[3].indexOf('639a5'), lines[5].indexOf('639a10')];

    expect(new Set(starts).size).toBe(1);
    expect(starts[0]).toBe(70);
    expect(lines[1].slice(30, starts[0])).toMatch(/^ {40}$/u);
    expect(lines[5].slice(66, starts[0])).toBe('    ');

    const report = reportFor(outcome.text);
    expect(report.ticsEmitted).toBeGreaterThanOrEqual(3);
    expect(report.collapsedPages).toEqual([]);
  });

  it('3. glued repair rewrites 6456 to 645b with glued and 6-to-b evidence', () => {
    const raw = [
      'RUNNING HEAD',
      rectoLine(35, '645a'),
      rectoLine(35, '6456'),
      '',
      '103',
    ].join('\n');
    const outcome = reseatGutter(raw, config({ page: 645, col: 'a' }, { page: 646, col: 'b' }, 'recto'));
    const record = outcome.changes.find((change) => change.rule === 'bekker-digit' && change.tier === 1);

    expect(outcome.text).toContain('645b');
    expect(record).toMatchObject({ before: '6456', after: '645b' });
    expect(record?.evidence?.confusions).toEqual(expect.arrayContaining(['glued', '6->b']));
  });

  it('4. spaced repairs rewrite 639 6 to 639b and opener 71 3 to 71a', () => {
    const first = reseatGutter(
      ['RUNNING HEAD', rectoLine(35, '639a'), rectoLine(35, '639 6')].join('\n'),
      config(undefined, undefined, 'recto')
    );
    const second = reseatGutter(
      ['RUNNING HEAD', rectoLine(35, '71 3')].join('\n'),
      config({ page: 71, col: 'a' }, { page: 72, col: 'b' }, 'recto')
    );

    expect(first.text).toContain('639b');
    expect(first.changes.find((change) => change.before === '639 6')).toMatchObject({ after: '639b' });
    expect(second.text).toContain('71a');
    expect(second.changes.find((change) => change.before === '71 3')).toMatchObject({ after: '71a' });
  });

  it('5. ambiguous garble is unchanged and records Tier-2 witness evidence', () => {
    const witness = extractWitnessAnchors('Witness words near 36^a and more words.');
    const raw = ['RUNNING HEAD', rectoLine(35, '363')].join('\n');
    const outcome = reseatGutter(raw, config({ page: 1, col: 'a' }, { page: 100, col: 'b' }, 'recto'), witness);
    const record = outcome.changes.find((change) => change.rule === 'bekker-digit' && change.tier === 2);

    expect(outcome.text).toContain('363');
    expect(record?.evidence).toMatchObject({ kind: 'bekker-ambiguous' });
    expect(record?.evidence?.witnessAnchor).toMatchObject({ ref: '36a' });
  });

  it("6. all-verso three-page run honors config.side without alternation flips", () => {
    const pages = [639, 640, 641].map((page) =>
      [
        `RUNNING HEAD ${page}`,
        `${page}a  Body text for first mark.`,
        '5     Body text for second mark.',
        '',
        String(page),
      ].join('\n')
    );
    const outcome = reseatGutter(pages.join('\f'), config(undefined, { page: 642, col: 'b' }, 'verso'));
    const ticRecords = outcome.changes.filter((change) => change.rule === 'tic-reseat');

    expect(ticRecords).toHaveLength(3);
    expect(ticRecords.every((record) => record.evidence?.side === 'verso')).toBe(true);

    const report = reportFor(outcome.text);
    expect(report.ticsEmitted).toBeGreaterThanOrEqual(6);
    expect(report.collapsedPages).toEqual([]);
  });

  it('7. display-shaped table rows shift as whole lines, preserve internal spacing, and are not claimed', () => {
    const raw = [
      'RUNNING HEAD',
      '639a  Body text opens here.',
      '5     Alpha    Beta    Gamma',
      '      Delta    Epsi    Zeta',
      '5     Body text after table.',
      '',
      '104',
    ].join('\n');
    const outcome = reseatGutter(raw, config(undefined, undefined, 'verso'));
    const lines = outcome.text.split('\n');

    expect(flagKinds(outcome.changes)).toContain('tic-candidate-on-display-line');
    expect(lines[2]).toContain('5     Alpha    Beta    Gamma');
    expect(lines[3]).toContain('Delta    Epsi    Zeta');

    const report = reportFor(outcome.text);
    expect(report.displayBlocks.length).toBeGreaterThanOrEqual(1);
    expect(report.collapsedPages).toEqual([]);
  });

  it('8. guards reject out-of-range full forms, alpha-only decoys, folios, footnotes, and dash ranges', () => {
    const raw = [
      'RUNNING HEAD',
      '639a  Body text opens here.',
      '5     Body text keeps cadence.',
      '10    Body text keeps cadence.',
      '15    Body text keeps cadence.',
      '20    Body text keeps cadence.',
      '25    all invented words continue.',
      '700a  Out of range words stay body.',
      'So    Alpha-only decoy stays body.',
      'Is    Alpha-only decoy stays body.',
      '9–11  Range decoy stays body.',
      '',
      '1. 25 Footnote numeral stays furniture.',
      '25',
    ].join('\n');
    const outcome = reseatGutter(raw, config(undefined, { page: 640, col: 'b' }, 'verso'));
    const tic = outcome.changes.find((change) => change.rule === 'tic-reseat');
    const ticLines = tic?.evidence?.ticLines as { raw: string }[];

    expect(ticLines.map((line) => line.raw)).toContain('25');
    expect(ticLines.filter((line) => line.raw === '25')).toHaveLength(1);
    expect(outcome.changes.some((change) => change.before === '700a')).toBe(false);
    expect(outcome.changes.some((change) => change.before === 'So')).toBe(false);
    expect(outcome.changes.some((change) => change.before === 'Is')).toBe(false);
  });

  it('9. column jump accepts 645a to 648a without fabricating missing columns', () => {
    const raw = ['RUNNING HEAD', rectoLine(35, '645a'), rectoLine(35, '648a')].join('\n');
    const outcome = reseatGutter(raw, config({ page: 645, col: 'a' }, { page: 650, col: 'b' }, 'recto'));

    expect(outcome.text).toContain('648a');
    expect(flagKinds(outcome.changes)).toContain('column-jump');
    expect(outcome.text).not.toContain('646a');
  });

  it('10. clean off-cadence canonical tic is not rewritten', () => {
    const raw = ['RUNNING HEAD', rectoLine(35, '7')].join('\n');
    const outcome = reseatGutter(raw, config(undefined, undefined, 'recto'));

    expect(outcome.text).toBe(raw);
    expect(flagKinds(outcome.changes)).toContain('clean-off-cadence');
    expect(outcome.changes.some((change) => change.rule === 'bekker-digit')).toBe(false);
  });

  it("11. page-opening bares inherit the previous page's column", () => {
    const raw = [
      ['RUNNING HEAD 1', '639a  Body text opens here.', '5     Body text continues.'].join('\n'),
      ['RUNNING HEAD 2', '10    Body text opens next page.', '15    Body text continues next page.'].join('\n'),
    ].join('\f');
    const outcome = reseatGutter(raw, config(undefined, undefined, 'verso'));
    const secondRecord = outcome.changes.filter((change) => change.rule === 'tic-reseat')[1];
    const ticLines = secondRecord.evidence?.ticLines as { raw: string }[];

    expect(ticLines.map((line) => line.raw)).toEqual(['10', '15']);
  });

  it('12. running heads and folios are byte-identical, and hyphenated line ends stay unchanged', () => {
    const raw = [
      '  RUNNING  HEAD  ',
      '639a  Hyphen-',
      '5     Body text continues.',
      '',
      '107',
    ].join('\n');
    const outcome = reseatGutter(raw, config(undefined, undefined, 'verso'));
    const lines = outcome.text.split('\n');

    expect(lines[0]).toBe('  RUNNING  HEAD  ');
    expect(lines[1]).toContain('Hyphen-');
    expect(lines[4]).toBe('107');
  });

  it('13. witness extractor decodes all specified encodings and blank pages', () => {
    const witness = [
      'Start 73^a then $^b$ and 76$^{b}$ plus 77<sup>b</sup>.',
      'Later **639ᵃ** then ^b closes.',
      '--- [blank] ---',
      'Next 640a appears.',
    ].join('\n');
    const pages = extractWitnessAnchors(witness);

    expect(pages).toHaveLength(3);
    expect(pages[0].map((anchor) => anchor.ref)).toEqual(['73a', '73b', '76b', '77b', '639a', '639b']);
    expect(pages[1]).toEqual([]);
    expect(pages[2].map((anchor) => anchor.ref)).toEqual(['640a']);
    expect(pages[0][0]).toMatchObject({ raw: '73^a', ordinal: 0 });
  });

  it('14. garble whose only decode is NOT the expected value stays raw with a Tier-2 record', () => {
    const raw = [
      'RUNNING HEAD',
      '641 6  Body text opens on an unexpected column.',
      '5      More body text follows on this page.',
      '10     Even more body text follows here.',
      '',
      '103',
    ].join('\n');
    const outcome = reseatGutter(raw, config(undefined, undefined, 'verso'));

    expect(outcome.text).toContain('641 6');
    expect(outcome.text).not.toContain('641b');
    const ambiguous = outcome.changes.find(
      (change) => change.rule === 'bekker-digit' && change.tier === 2
    );
    expect(ambiguous).toMatchObject({ before: '641 6' });
    expect(
      outcome.changes.some((change) => change.rule === 'bekker-digit' && change.tier === 1)
    ).toBe(false);
  });

  it('15. spaced verso opener garble is extracted and repaired when cadence-unique', () => {
    const raw = [
      'RUNNING HEAD',
      '639a   Body text opens the first column here.',
      '5      More body text continues along nicely.',
      '\f',
      'RUNNING HEAD',
      '639 6  Body text opens the second column here.',
      '5      More body text continues along nicely.',
      '',
      '104',
    ].join('\n');
    const outcome = reseatGutter(raw, config(undefined, undefined, 'verso'));
    const secondPage = outcome.text.split('\f')[1].split('\n');

    expect(secondPage.some((line) => line.startsWith('639b'))).toBe(true);
    const repair = outcome.changes.find(
      (change) => change.rule === 'bekker-digit' && change.tier === 1 && change.before === '639 6'
    );
    expect(repair).toMatchObject({ after: '639b', page: 1 });

    const bodyLine = secondPage.find((line) => line.includes('opens the second'));
    expect(bodyLine?.indexOf('Body')).toBe(11);
  });

  it('17. glued verso opener splits into tic + word when cadence-unique', () => {
    const raw = [
      'RUNNING HEAD',
      '639a   Body text opens the first column here.',
      '5      More body text continues along nicely.',
      '\f',
      'RUNNING HEAD',
      '639bthe acquisition of nourishment proceeds apace.',
      '5      More body text continues along nicely.',
      '',
      '104',
    ].join('\n');
    const outcome = reseatGutter(raw, config(undefined, undefined, 'verso'));
    const secondPage = outcome.text.split('\f')[1];

    expect(secondPage).toContain('\n639b');
    expect(secondPage).toMatch(/639b\s+the acquisition/u);
    const split = outcome.changes.find(
      (c) => c.rule === 'bekker-digit' && c.tier === 1 && c.before === '639bthe'
    );
    expect(split).toMatchObject({ after: '639b' });
  });

  it('16. prose beginning with a small number and l-words is not decoded as a full-form', () => {
    const raw = [
      'RUNNING HEAD',
      '639a   Body text opens the column properly.',
      '5 all  the animals share this arrangement.',
      '10     More body text continues along nicely.',
      '',
      '105',
    ].join('\n');
    const outcome = reseatGutter(raw, config(undefined, undefined, 'verso'));

    expect(outcome.text).toContain('all  the animals');
    expect(
      outcome.changes.some(
        (change) => change.rule === 'bekker-digit' && String(change.before ?? '').includes('all')
      )
    ).toBe(false);
  });
});
