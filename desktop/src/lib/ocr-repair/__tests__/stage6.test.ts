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

  it('batch-2 A/B: rejoins witness-corroborated wrap dashes and compounds, leaves soft wraps', () => {
    const backbone = [
      'RUNNING HEAD',
      'crossing from another kind-',
      'e.g. something geometrical by arithmetic here.',
      'the multi-split-',
      recto('footed creature walks on land.', '10'),
      'a wrapped hu-',
      'man being appears here currently.',
    ].join('\n');
    const witness =
      '639a crossing from another kind—e.g. something geometrical by arithmetic here.\n' +
      'the multi-split-footed creature walks on land. a wrapped human being appears here currently.';
    const outcome = vote(backbone, witness, config());
    const lines = outcome.text.split('\n');

    expect(lines[1]).toBe('crossing from another kind—e.g.');
    expect(lines[2]).toBe('something geometrical by arithmetic here.');
    expect(lines[3]).toBe('the multi-split-footed');
    // removal re-pads the trailing recto tic back to its ORIGINAL column
    expect(lines[4]).toBe(recto('creature walks on land.', '10'));
    // soft wrap: witness has solid "human" — left for the converter's §3.4 glue
    expect(lines[5]).toBe('a wrapped hu-');
    expect(lines[6]).toBe('man being appears here currently.');

    const joins = outcome.changes.filter((change) => change.rule === 'wrap-join' && change.tier === 1);
    expect(joins.map((change) => [change.evidence?.kind, change.after])).toEqual([
      ['emdash-joint', 'kind—e.g.'],
      ['lexical-compound', 'split-footed'],
    ]);
  });

  it('batch-2 C/D: snaps page-top raw jitter using the previous page\'s last TEXT line, skipping footnotes', () => {
    const backbone = [
      ['RUNNING HEAD', 'The argument continues without ending the', '', '12. Reading variant note.'].join('\n'),
      ['RUNNING HEAD', '  Second page begins here quietly and', 'continues at the margin as before.', 'third line at margin for modal.'].join('\n'),
    ].join('\f');
    const witness = '639a Filler opening words here.\nThe argument continues without ending the second page begins here quietly.';
    const outcome = vote(backbone, witness, config());
    const snap = outcome.changes.find(
      (change) => change.rule === 'paragraph-indent' && change.evidence?.support === 'jitter' && change.page === 1
    );
    // Old behavior latched onto the sentence-final NOTE line and refused the
    // snap; footnote-aware §D reads the mid-sentence body line above it.
    expect(snap).toMatchObject({ evidence: { action: 'snap', offset: 2 } });
  });

  it('batch-2 E: never paragraph-inserts on the first body line after a division heading', () => {
    const backbone = [
      'RUNNING HEAD',
      '   CHAPTER 2',
      '',
      'Opening chapter words here again.',
      'margin line one for modal fit.',
      'margin line two here also now.',
    ].join('\n');
    const witness = '639a Filler opening sentence.\nmargin words\n\nOpening chapter words here again.';
    const outcome = vote(backbone, witness, config());
    const inserts = outcome.changes.filter(
      (change) => change.rule === 'paragraph-indent' && change.evidence?.action === 'insert'
    );
    expect(inserts).toEqual([]);
  });

  it('C. gates page-top inserts on the previous page\'s last body line', () => {
    const pageTwo = ['RUNNING HEAD', 'Second unit begins here.'].join('\n');
    // Filler opening keeps page 1's own top line out of the witness paragraph
    // starts, so the only candidate under test is page 2's top line.
    const witness = '639a Filler opening words here.\nPrior text runs on unbroken\n\nSecond unit begins here.';
    const paragraphSupports = (backbone: string) =>
      vote(backbone, witness, config())
        .review.groups.filter((group) => group.patternKey.startsWith('paragraph-indent|'))
        .map((group) => ({ patternKey: group.patternKey, checked: group.checked }));

    // Previous page ends mid-sentence: a paragraph cannot start at the page
    // top, however the reflowed witness breaks — candidate killed outright.
    const midSentence = [
      ['RUNNING HEAD', 'Prior text runs on with plenty of width and'].join('\n'),
      pageTwo,
    ].join('\f');
    expect(paragraphSupports(midSentence)).toEqual([]);

    // Previous page ends a sentence on a short line: the print's own break
    // evidence — dual support, rendered checked.
    const shortClose = [
      ['RUNNING HEAD', 'Prior text runs on with plenty of width and then', 'stops.'].join('\n'),
      pageTwo,
    ].join('\f');
    expect(paragraphSupports(shortClose)).toEqual([{ patternKey: 'paragraph-indent|page-top-dual', checked: true }]);

    // Previous page ends a sentence at full width: genuinely ambiguous —
    // per-instance review, unchecked.
    const fullWidth = [
      ['RUNNING HEAD', 'Prior text runs to the full measure and stops here.'].join('\n'),
      pageTwo,
    ].join('\f');
    expect(paragraphSupports(fullWidth)).toEqual([{ patternKey: 'paragraph-indent|page-top', checked: false }]);
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

  it('D. keeps signatureless note text and bottom continuations in the note block', () => {
    const raw = [
      'RUNNING HEAD',
      'Body line before notes.',
      '1 Reading synthetic variant.',
      '2',
      'For the reading see notes.',
      '3 Omitting synthetic option.',
      'continued without a signature at the block bottom.',
      '    81',
    ].join('\n');
    const outcome = normalizeFootnotes(raw, config());

    expect(outcome.text).toContain('1. Reading synthetic variant.');
    expect(outcome.text).toContain('2. For the reading see notes.');
    expect(outcome.text).toContain('3. Omitting synthetic option.');
    expect(outcome.text).toContain('continued without a signature at the block bottom.');
  });

  it('D. treats a folio-shaped final line as an own note number when local sequence says so', () => {
    const raw = [
      'RUNNING HEAD',
      'Body line before notes.',
      '1 Reading synthetic variant.',
      'Final note text without signature.',
      '    2',
    ].join('\n');
    const outcome = normalizeFootnotes(raw, config());

    expect(outcome.text).toContain('1. Reading synthetic variant.');
    expect(outcome.text).toContain('2. Final note text without signature.');
    expect(outcome.text).not.toContain('\n    2');
  });

  it('D. degarbles Roman II from the local block sequence after a book seam', () => {
    const raw = [
      ['RUNNING HEAD', 'Body line before old-book notes.', '21 Reading old-book variant.', '    82'].join('\n'),
      ['RUNNING HEAD', 'Body line before new-book notes.', 'II Reading new-book second note.', '3 Omitting new-book third note.', '    83'].join('\n'),
    ].join('\f');
    const outcome = normalizeFootnotes(raw, config());

    expect(outcome.text).toContain('21. Reading old-book variant.');
    expect(outcome.text).toContain('2. Reading new-book second note.');
    expect(outcome.text).toContain('3. Omitting new-book third note.');

    const eleven = normalizeFootnotes(['RUNNING HEAD', 'Body line before notes.', '10 Reading tenth note.', 'II Omitting eleventh note.', '12 Adding twelfth note.', '    86'].join('\n'), config());
    expect(eleven.text).toContain('11. Omitting eleventh note.');
  });

  it('D. keeps num-below blank geometry inside the same note block', () => {
    const raw = [
      'RUNNING HEAD',
      'Body line before notes.',
      'Reading synthetic variant.',
      '1',
      '',
      '2 Omitting synthetic option.',
      '    84',
    ].join('\n');
    const outcome = normalizeFootnotes(raw, config());

    expect(outcome.text).toContain('1. Reading synthetic variant.');
    expect(outcome.text).toContain('2. Omitting synthetic option.');
  });

  it('D. does not let a signatureless NUM steal an already-joined previous line', () => {
    const raw = [
      'RUNNING HEAD',
      'Body line before notes.',
      '1',
      'Reading synthetic variant.',
      '2',
      'For the reading see notes.',
      '    85',
    ].join('\n');
    const outcome = normalizeFootnotes(raw, config());

    expect(outcome.text).toContain('1. Reading synthetic variant.');
    expect(outcome.text).toContain('2. For the reading see notes.');
    expect(outcome.text).not.toContain('2. 1. Reading synthetic variant.');
  });
});
