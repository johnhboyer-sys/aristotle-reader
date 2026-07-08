import { describe, expect, it } from 'vitest';
import type { CorpusConfig } from '../corpus-config';
import { pairWitnessPages } from '../witness-pairing';
import { vote, classifyDroppedLines } from '../vote';
import { renderReview, parseDecisions, patternKeyFor } from '../review';
import type { ChangeRecord } from '../changelist';
import { alignTokens } from '../align';
import { decodeWitnessHeadRef } from '../witness-anchors';

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

function alphabeticToken(index: number): string {
  let n = index;
  let suffix = '';
  do {
    suffix = String.fromCharCode(97 + (n % 26)) + suffix;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `word${suffix}`;
}

function tokenCount(line: string): number {
  return line.trim() === '' ? 0 : line.trim().split(/\s+/u).length;
}

describe('stage 5 witness pairing, alignment, vote, and review fixtures', () => {
  it('1. restores a closed em dash within one token and preserves recto tic column', () => {
    const line = recto('Invented thingswhenever keeps moving.');
    const backbone = ['RUNNING HEAD', '639a Column opens here.', line].join('\n');
    const witness = ['639a Column opens here.', 'Invented things—whenever keeps moving.'].join('\n');
    const outcome = vote(backbone, witness, config());
    const edited = outcome.text.split('\n')[2];

    expect(outcome.changes.find((change) => change.rule === 'emdash-restore')).toMatchObject({
      before: 'thingswhenever',
      after: 'things—whenever',
      tier: 1,
    });
    expect(edited).toContain('things—whenever');
    expect(edited.indexOf('5')).toBe(line.indexOf('5'));
  });

  it('2. keeps a spaced dash byte-identical and emits a diagnostic', () => {
    const backbone = ['RUNNING HEAD', '639a The casee remains steady.'].join('\n');
    const witness = '639a The case — e remains steady.';
    const outcome = vote(backbone, witness, config());

    expect(outcome.text).toBe(backbone);
    expect(outcome.changes.some((change) => change.evidence?.kind === 'spaced-dash-diagnostic')).toBe(true);
    expect(outcome.changes.some((change) => change.rule === 'emdash-restore')).toBe(false);
  });

  it('3. records a macron difference as Tier 2 without applying it', () => {
    const backbone = ['RUNNING HEAD', '639a The mekon sample remains.'].join('\n');
    const witness = '639a The mēkōn sample remains.';
    const outcome = vote(backbone, witness, config());
    const record = outcome.changes.find((change) => change.rule === 'word-identity');

    expect(outcome.text).toBe(backbone);
    expect(record).toMatchObject({ tier: 2, before: 'mekon', after: 'mēkōn' });
  });

  it('4. pairs a Greek witness gap with a backbone gibberish token as Tier 2', () => {
    const backbone = ['RUNNING HEAD', '639a The xxx sample remains.'].join('\n');
    const witness = '639a The λόγος sample remains.';
    const outcome = vote(backbone, witness, config());
    const record = outcome.changes.find((change) => change.rule === 'word-identity');

    expect(record).toMatchObject({ before: 'xxx', after: 'λόγος' });
    expect(record?.evidence?.witnessGreek).toBe(true);
  });

  it('5. ignores punctuation-only and case-only differences as records', () => {
    const backbone = ['RUNNING HEAD', '639a Signal, Word.'].join('\n');
    const witness = '639a signal word';
    const outcome = vote(backbone, witness, config());

    expect(outcome.counters.punctCaseDiffs).toBe(2);
    expect(outcome.changes.some((change) => change.rule === 'word-identity')).toBe(false);
  });

  it('6. pairs by body head refs with commentary stop, density gate, blank dropout, 1:2 span, and interpolation', () => {
    const backbone = [
      ['RUNNING HEAD', '639a First invented column.', recto('Second invented column.', '639b')].join('\n'),
      ['RUNNING HEAD', 'No visible tic on this invented page.'].join('\n'),
      ['RUNNING HEAD', '640a Third invented column.', recto('Fourth invented column.', '640b')].join('\n'),
    ].join('\f');
    const witness = [
      'TITLE PAGE\n81ª',
      '---',
      '639a\nFirst invented witness page.',
      '---',
      '639b\nSecond invented witness page.',
      '---',
      '640a\nThird invented witness page.',
      '--- [blank] ---',
      '640b\nFourth invented witness page.',
      '---',
      'COMMENTARY\n639a commentary must stop.',
    ].join('\n');
    const outcome = pairWitnessPages(backbone, witness, config());

    expect(outcome.report.window.bodyLo).toBe(1);
    expect(outcome.report.window.commentaryIdx).toBe(6);
    expect(outcome.report.rows[0].pairKind).toBe('1:2');
    expect(outcome.report.rows[1].pairKind).toBe('interpolated');
    expect(outcome.backboneSpans[1].interpolated).toBe(true);
  });

  it('7. refuses a token merge such as t plus he into one witness token', () => {
    const backbone = ['RUNNING HEAD', '639a The t he sample remains.'].join('\n');
    const witness = '639a The the sample remains.';
    const outcome = vote(backbone, witness, config());

    expect(outcome.text).toBe(backbone);
    expect(outcome.changes.some((change) => change.rule === 'emdash-restore' || change.rule === 'ligature')).toBe(false);
    expect(outcome.changes.some((change) => change.evidence?.kind === 'alignment-gap')).toBe(true);
  });

  it('8. applies checked macron and stage-3 Bekker opener groups with geometry intact', () => {
    const backbone = ['RUNNING HEAD', recto('639a The mekon sample remains.'), 'Column 66Ia marker remains.'].join('\n');
    const witness = '639a The mēkōn sample remains.';
    const stage3: ChangeRecord = {
      id: 'p0-L2-c7-1',
      stage: 3,
      tier: 2,
      rule: 'bekker-digit',
      page: 0,
      line: 2,
      col: 7,
      before: '66Ia',
      evidence: { kind: 'bekker-ambiguous', witnessAnchor: { ref: '661a' } },
    };
    const initial = vote(backbone, witness, config(), undefined, { stage3Records: [stage3] });
    const checked = renderReview(initial.review).replace('- [ ] mekon -> mēkōn', '- [x] mekon -> mēkōn').replace('- [ ] 66Ia -> 661a', '- [x] 66Ia -> 661a');
    const applied = vote(backbone, witness, config(), parseDecisions(checked), { stage3Records: [stage3] });
    const line = applied.text.split('\n')[1];

    expect(applied.text).toContain('mēkōn');
    expect(applied.text).toContain('661a');
    expect(line.indexOf('5')).toBe(backbone.split('\n')[1].indexOf('5'));
  });

  it('9. renders review groups and parses checked decisions by stable pattern key', () => {
    const record: ChangeRecord = {
      id: 'p0-L1-c10-1',
      stage: 5,
      tier: 2,
      rule: 'word-identity',
      page: 0,
      line: 1,
      col: 10,
      before: 'mekon',
      after: 'mēkōn',
      evidence: { kind: 'diacritic' },
    };
    const key = patternKeyFor(record);
    const md = renderReview({
      corpus: 'synthetic',
      groups: [{ category: 'Diacritic', patternKey: key, before: 'mekon', after: 'mēkōn', checked: true, instances: [{ id: record.id, page: 0 }] }],
    });

    expect(parseDecisions(md).checkedPatterns.has(key)).toBe(true);
  });

  it('10. classifies dropped lines as markerLost only when the witness has that column', () => {
    const dropped = classifyDroppedLines(['639a5', '700b10'], '639a\nInvented witness text.');

    expect(dropped).toEqual([
      { ref: '639a5', column: '639a', class: 'markerLost' },
      { ref: '700b10', column: '700b', class: 'genuineGap' },
    ]);
  });

  it('11. aligns a large opener segment without allocating an O(n*m) matrix', () => {
    const size = 6000;
    const backboneWords = Array.from({ length: size }, (_, i) => alphabeticToken(i));
    const witnessWords = backboneWords.map((word, i) => (i % 100 === 0 ? `variant${word}` : word));
    const backbone = ['RUNNING HEAD', `639a ${backboneWords.join(' ')} 639b`].join('\n');
    const witness = `639a ${witnessWords.join(' ')} 639b`;

    const start = performance.now();
    const ops = alignTokens(backbone, witness);
    const durationMs = performance.now() - start;
    const matched = ops.filter((op) => op.t === 'match').length;

    expect(durationMs).toBeLessThan(3000);
    expect(matched / size).toBeGreaterThan(0.95);
  });

  it('12. rebuilds closed em dash edits from the backbone token without Genie markdown', () => {
    const backbone = ['RUNNING HEAD', '639a C-therefore follows.'].join('\n');
    const witness = '639a *C*—therefore follows.';
    const outcome = vote(backbone, witness, config());
    const record = outcome.changes.find((change) => change.rule === 'emdash-restore');

    expect(record).toMatchObject({ before: 'C-therefore', after: 'C—therefore' });
    expect(outcome.text).toContain('C—therefore');
    expect(outcome.text).not.toContain('*C*');
    expect(outcome.text).not.toContain('*');
  });

  it('13. decodes brace-wrapped LaTeX superscript witness heads', () => {
    expect(decodeWitnessHeadRef('$639^{\\mathrm{b}}$')?.ref).toBe('639b');
    expect(decodeWitnessHeadRef('$641^{\\text{a}}$')?.ref).toBe('641a');
    expect(decodeWitnessHeadRef('642^{a}')?.ref).toBe('642a');
  });

  it('14. hard-syncs marked-up witness Bekker openers against bare backbone openers', () => {
    const ops = alignTokens('640b Alpha beta gamma.', '$640^{\\mathrm{b}}$ Alpha beta gamma.');

    expect(ops).toContainEqual(expect.objectContaining({ t: 'match', aRaw: '640b', bRaw: '640^{\\mathrm{b}}' }));
  });

  it('15. strips witness running heads, marginal line numbers, and markup-only tokens before alignment', () => {
    const ops = alignTokens('The prose aligns exactly.', ['HISTORY OF ANIMALS', '15', '**', 'The prose aligns exactly.', '**'].join('\n'));

    expect(ops.every((op) => op.t === 'match')).toBe(true);
    expect(ops.filter((op) => op.t === 'match')).toHaveLength(4);
    expect(ops.some((op) => op.t === 'bOnly')).toBe(false);
  });

  it('16. excludes synopsis and markdown commentary tail pages from the witness body window', () => {
    const backbone = ['RUNNING HEAD', '639a First body page.', recto('Second body page.', '639b')].join('\n');
    const witness = ['639a\nFirst witness page.', '---', '639b\nSecond witness page.', '---', 'SYNOPSIS\n640a tail.', '---', '# COMMENTARY\n641a tail.'].join('\n');
    const outcome = pairWitnessPages(backbone, witness, config());

    expect(outcome.report.window.bodyLo).toBe(0);
    expect(outcome.report.window.bodyHi).toBe(2);
    expect(outcome.report.window.commentaryIdx).toBe(2);
    expect(outcome.witnessBodyPages.map((page) => page.page)).toEqual([0, 1]);
  });

  it('17. pairs multi-token Greek gap runs by count instead of adjacent local order', () => {
    const backbone = ['RUNNING HEAD', '639a We continue after ra apwa, with Schone.'].join('\n');
    const witness = '639a We continue after τὰ ἄμεσα, with Schöne.';
    const outcome = vote(backbone, witness, config());
    const records = outcome.changes.filter((change) => change.rule === 'word-identity' && change.evidence?.kind === 'greek');

    expect(records).toHaveLength(2);
    expect(records.map((record) => [record.before, record.after])).toEqual([
      ['ra', 'τὰ'],
      ['apwa,', 'ἄμεσα,'],
    ]);
    expect(records.every((record) => record.evidence?.runBefore === 'ra apwa,')).toBe(true);
    expect(records.every((record) => record.evidence?.runAfter === 'τὰ ἄμεσα,')).toBe(true);
    expect(records.some((record) => record.before === 'apwa,' && record.after === 'τὰ')).toBe(false);
  });

  it('18. emits one diagnostic for count-mismatched Greek regions without word proposals', () => {
    const backbone = ['RUNNING HEAD', '639a We continue after ra apwa sample.'].join('\n');
    const witness = '639a We continue after λόγος sample.';
    const outcome = vote(backbone, witness, config());
    const unpaired = outcome.changes.filter((change) => change.evidence?.kind === 'greek-run-unpaired');

    expect(unpaired).toHaveLength(1);
    expect(unpaired[0].evidence).toMatchObject({ backbone: 'ra apwa', witness: 'λόγος' });
    expect(outcome.changes.some((change) => change.rule === 'word-identity')).toBe(false);
  });

  it('19. never turns a LaTeX witness command token into replacement text', () => {
    const backbone = ['RUNNING HEAD', '639a We continue after dx sample.'].join('\n');
    const witness = '639a We continue after $\\delta$ sample.';
    const outcome = vote(backbone, witness, config());

    expect(outcome.changes.some((change) => change.rule === 'word-identity')).toBe(false);
    expect(outcome.changes.some((change) => change.after === '\\delta')).toBe(false);
  });

  it('20. applies a checked Greek run group to every token in place', () => {
    const backbone = ['RUNNING HEAD', '639a We continue after ra apwa, with Schone.'].join('\n');
    const witness = '639a We continue after τὰ ἄμεσα, with Schöne.';
    const initial = vote(backbone, witness, config());
    const runGroup = initial.review.groups.find((group) => group.patternKey.startsWith('greek-run|'));
    expect(runGroup).toMatchObject({ before: 'ra apwa,', after: 'τὰ ἄμεσα,' });

    const checked = renderReview(initial.review).replace(`- [ ] ${runGroup?.before} -> ${runGroup?.after}`, `- [x] ${runGroup?.before} -> ${runGroup?.after}`);
    const applied = vote(backbone, witness, config(), parseDecisions(checked));
    const line = applied.text.split('\n')[1];

    expect(line).toBe('639a We continue after τὰ ἄμεσα, with Schone.');
    expect(line.trim().split(/\s+/u)).toHaveLength(backbone.split('\n')[1].trim().split(/\s+/u).length);
  });

  it('21. keeps bare digit and Roman marker furniture out of Greek proposal before values', () => {
    const backbone = ['RUNNING HEAD', '639a We continue after I 3 ra sample.'].join('\n');
    const witness = '639a We continue after τὰ sample.';
    const outcome = vote(backbone, witness, config());

    expect(outcome.changes.some((change) => change.before === 'I' || change.before === '3')).toBe(false);
    expect(outcome.changes.find((change) => change.rule === 'word-identity')).toMatchObject({ before: 'ra', after: 'τὰ' });
  });

  it('22. folds an orphan opening bracket into a bracket-bearing Greek witness edge', () => {
    const backbone = ['RUNNING HEAD', '639a Omitting the addition of ( J.wKbv).'].join('\n');
    const witness = '639a Omitting the addition of 〈λευκόν〉.';
    const initial = vote(backbone, witness, config());
    const records = initial.changes.filter((change) => change.rule === 'word-identity' && change.evidence?.kind === 'greek');

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      before: '( J.wKbv).',
      after: '〈λευκόν〉.',
      col: backbone.split('\n')[1].indexOf('('),
      evidence: { joinedTokens: 1, joinedPunct: '(', runBefore: '( J.wKbv).' },
    });

    const checked = renderReview(initial.review).replace('- [ ] ( J.wKbv). -> 〈λευκόν〉.', '- [x] ( J.wKbv). -> 〈λευκόν〉.');
    const applied = vote(backbone, witness, config(), parseDecisions(checked));
    const line = applied.text.split('\n')[1];

    expect(line).toBe('639a Omitting the addition of 〈λευκόν〉.');
    expect(tokenCount(backbone.split('\n')[1]) - tokenCount(line)).toBe(1);
  });

  it('23. applies a normal Greek pair on a joined-token line with zero extra token delta', () => {
    const backbone = ['RUNNING HEAD', '639a Omitting the addition of ( J.wKbv). and ra remains.'].join('\n');
    const witness = '639a Omitting the addition of 〈λευκόν〉. and τὰ remains.';
    const initial = vote(backbone, witness, config());
    const folded = initial.changes.find((change) => change.before === '( J.wKbv).');
    const normal = initial.changes.find((change) => change.before === 'ra');

    expect(folded).toMatchObject({ after: '〈λευκόν〉.', evidence: { joinedTokens: 1 } });
    expect(normal).toMatchObject({ after: 'τὰ' });
    expect(normal?.evidence?.joinedTokens).toBeUndefined();

    const checked = renderReview(initial.review)
      .replace('- [ ] ( J.wKbv). -> 〈λευκόν〉.', '- [x] ( J.wKbv). -> 〈λευκόν〉.')
      .replace('- [ ] ra -> τὰ', '- [x] ra -> τὰ');
    const applied = vote(backbone, witness, config(), parseDecisions(checked));
    const line = applied.text.split('\n')[1];

    expect(line).toBe('639a Omitting the addition of 〈λευκόν〉. and τὰ remains.');
    expect(tokenCount(backbone.split('\n')[1]) - tokenCount(line)).toBe(1);
  });

  it('24. leaves an orphan opening parenthesis alone when the witness edge has no bracket', () => {
    const backbone = ['RUNNING HEAD', '639a Omitting the addition of ( J.wKbv).'].join('\n');
    const witness = '639a Omitting the addition of λευκόν.';
    const initial = vote(backbone, witness, config());
    const record = initial.changes.find((change) => change.rule === 'word-identity' && change.evidence?.kind === 'greek');

    expect(record).toMatchObject({ before: 'J.wKbv).', after: 'λευκόν.' });
    expect(record?.evidence?.joinedTokens).toBeUndefined();

    const checked = renderReview(initial.review).replace('- [ ] J.wKbv). -> λευκόν.', '- [x] J.wKbv). -> λευκόν.');
    const applied = vote(backbone, witness, config(), parseDecisions(checked));

    expect(applied.text.split('\n')[1]).toBe('639a Omitting the addition of ( λευκόν.');
  });
});
