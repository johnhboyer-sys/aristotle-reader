import { describe, expect, it } from 'vitest';
import type { CorpusConfig } from '../corpus-config';
import { normalizeFootnotes } from '../footnote-repair';
import { decodeBareLetters, reseatGutter } from '../gutter-reseat';
import { parseDecisions, renderReview } from '../review';
import { setLeadingIndent, vote } from '../vote';

function config(overrides: Partial<CorpusConfig> = {}): CorpusConfig {
  return {
    id: 'synthetic',
    workTitle: 'Synthetic Work',
    runningHeadPlaceholder: 'HEAD',
    bekkerStart: { page: 639, col: 'a' },
    bekkerEnd: { page: 642, col: 'b' },
    divisions: { books: 1, chaptersPerBook: [1] },
    side: 'recto',
    backbonePath: 'backbone.txt',
    witnessPath: 'witness.txt',
    outDir: 'out',
    ...overrides,
  };
}

function recto(body: string, tic = '5', col = 60): string {
  return body.padEnd(col, ' ') + tic;
}

describe('stage 6 fix batch fixtures', () => {
  it('A. recovers bracketed bare letters with the verso margin gate', () => {
    const raw = [
      'RUNNING HEAD',
      '639a  Column body opens here.',
      '5     Column body continues here.',
      'IO Recovered body starts here.',
      '      Is margin word stays prose.',
      '15    Column body keeps moving.',
      '',
      '100',
    ].join('\n');
    const outcome = reseatGutter(raw, config({ side: 'verso' }));

    expect(decodeBareLetters('IO')).toMatchObject({ value: 10, confusions: ['I->1', 'O->0'] });
    expect(outcome.text.split('\n')[3]).toMatch(/^10\s+Recovered/u);
    expect(outcome.text).toContain('Is margin word stays prose.');
    expect(outcome.changes.find((change) => change.evidence?.kind === 'bracketed-bare-recovery')).toMatchObject({
      before: 'IO',
      after: '10',
      evidence: { bracket: { prev: 5, next: 15 } },
    });
  });

  it('B. applies approved Bekker opener decisions at stage 3 and advances cadence', () => {
    const raw = [
      'RUNNING HEAD',
      recto('First accepted column.', '660a'),
      recto('Approved opener column.', '66Ia'),
      recto('Bare after opener.', '5'),
    ].join('\n');
    const decisions = { checkedPatterns: new Set(['bekker-opener|66Ia|661a']) };
    const outcome = reseatGutter(raw, config({ bekkerStart: { page: 660, col: 'a' }, bekkerEnd: { page: 662, col: 'b' }, side: 'recto' }), undefined, decisions);

    expect(outcome.text).toContain('661a');
    expect(outcome.changes.find((change) => change.before === '66Ia')).toMatchObject({ tier: 1, after: '661a' });
    expect(outcome.changes.some((change) => change.before === '5' && change.rule === 'bekker-digit')).toBe(false);
    expect(outcome.text).toContain('Bare after opener.');
  });

  it('C. inserts checked dual-blank paragraph breaks and renders them checked by default', () => {
    const backbone = ['RUNNING HEAD', recto('Opening words continue.', '639a'), '', 'Next unit begins here.'].join('\n');
    const witness = '639a Opening words continue.\n\nNext unit begins here.';
    const initial = vote(backbone, witness, config());
    const review = renderReview(initial.review);

    expect(review).toContain('## Paragraph breaks');
    expect(review).toContain('- [x] dual-blank -> insert');

    const applied = vote(backbone, witness, config(), parseDecisions(review));
    expect(applied.text.split('\n')[3]).toBe('    Next unit begins here.');
  });

  it('C. records page-top insert, jitter snap, and sentence-boundary flag decisions', () => {
    const pageTop = vote(['RUNNING HEAD', 'Page top phrase starts here.'].join('\n'), '639a Page top phrase starts here.', config());
    expect(pageTop.review.groups.find((group) => group.patternKey === 'paragraph-indent|page-top')).toMatchObject({ checked: false });

    const jitterBackbone = ['RUNNING HEAD', 'Prior clause continues', '  Jitter phrase starts here.'].join('\n');
    const jitter = vote(jitterBackbone, '639a Prior clause continues Jitter phrase starts here.', config());
    expect(jitter.changes.find((change) => change.rule === 'paragraph-indent' && change.evidence?.support === 'jitter')).toMatchObject({
      evidence: { action: 'snap' },
    });

    const flagBackbone = ['RUNNING HEAD', 'Prior sentence ends.', '  Flagged phrase starts here.'].join('\n');
    const flagged = vote(flagBackbone, '639a Prior sentence ends. Flagged phrase starts here.', config());
    expect(flagged.changes.find((change) => change.rule === 'paragraph-indent' && change.evidence?.action === 'flag')).toBeTruthy();
  });

  it('C. refuses recto paragraph re-pad when the tic gap would fall below four', () => {
    expect(setLeadingIndent('  abc    639a', 4, 'recto')).toBeNull();
  });

  it('D. joins two-line footnote heads above and below, inserts periods, and adds a blank separator', () => {
    const raw = [
      'RUNNING HEAD',
      'Body line before notes.',
      '1 Reading synthetic variant.',
      '2',
      'Omitting synthetic option.',
      '3 Adding synthetic detail.',
      '    77',
    ].join('\n');
    const outcome = normalizeFootnotes(raw, config());
    const lines = outcome.text.split('\n');

    expect(lines).toContain('1. Reading synthetic variant.');
    expect(lines).toContain('2. Omitting synthetic option.');
    expect(lines).toContain('3. Adding synthetic detail.');
    expect(lines[2]).toBe('');
    expect(outcome.changes.filter((change) => change.rule === 'footnote-head' && change.tier === 1).length).toBeGreaterThanOrEqual(3);
  });

  it('D. glues confirmed in-body markers, skips CHAPTER headings, and records detached markers', () => {
    const raw = [
      'RUNNING HEAD',
      'A term 1 appears in body.',
      'CHAPTER 1',
      '2',
      '',
      '1 Reading synthetic variant.',
      '2 Omitting synthetic option.',
      '    78',
    ].join('\n');
    const outcome = normalizeFootnotes(raw, config(), 'A term<sup>1</sup> appears in body.');

    expect(outcome.text).toContain('term1 appears');
    expect(outcome.text).toContain('CHAPTER 1');
    expect(outcome.changes.find((change) => change.rule === 'footnote-marker' && change.evidence?.kind === 'footnote-marker-glue')).toMatchObject({
      evidence: { joinedTokens: 1 },
    });
    expect(outcome.changes.find((change) => change.evidence?.kind === 'footnote-marker-detached')).toBeTruthy();
  });

  it('D. degarbles Roman heads by sequence and leaves PA-shaped pages as no-ops', () => {
    const roman = normalizeFootnotes(['RUNNING HEAD', 'Body line.', 'I Reading synthetic variant.', '    79'].join('\n'), config());
    expect(roman.text).toContain('1. Reading synthetic variant.');

    const pa = ['RUNNING HEAD', '639a Body line only.', '5 More body line.', '    80'].join('\n');
    const noop = normalizeFootnotes(pa, config());
    expect(noop.text).toBe(pa);
    expect(noop.changes).toEqual([]);
  });
});
