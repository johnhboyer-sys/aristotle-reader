import { describe, expect, it } from 'vitest';
import {
  prepareLayoutImport,
  runConfiguredLayoutStages,
  type LayoutPipelineDependencies,
} from '../import-layout-stages';
import {
  getPublisherPreset,
  resolveLayoutImportConfig,
  type ImportEditionConfig,
  type ResolvedWorkStructure,
} from '../import-presets';
import { convertLayoutExtraction } from '../pdf-import';

const structure: ResolvedWorkStructure = {
  workId: 'Synthetic',
  workTitle: 'Synthetic Work',
  runningHeadPlaceholder: 'SYNTHETIC WORK',
  books: 2,
  bookLabels: ['I', 'II'],
  chaptersPerBook: [3, 2],
  chapterKeysByBook: { 1: [1, 2, 3], 2: [1, 2] },
  bekkerStart: '100a',
  bekkerEnd: '110b',
};

const configured = (edition: ImportEditionConfig = {}) => resolveLayoutImportConfig(
  {
    presetId: 'clarendon',
    runningHeadPlaceholder: 'work-title',
    side: 'verso',
    footnotePlacement: 'page-bottom',
    spacing: { enabled: true },
    footnotes: { enabled: true },
  },
  edition,
  structure,
);

describe('configured layout import stages', () => {
  it('keeps Other byte-identical, including page breaks and spacing', () => {
    const raw = [
      'FRONT HEAD\nNeutral front matter that a configured slice would remove.',
      'BOOK ONE\r\nCHAPTER I\r\nA term  1 stays here.\r\n12',
      'HEAD\nCHAPTER Z\nSecond   page.\n13',
      'COMMENTARY\nNeutral back matter.',
    ].join('\f');
    const config = resolveLayoutImportConfig(getPublisherPreset('other'), {}, structure);

    const outcome = runConfiguredLayoutStages(raw, config);
    const prepared = prepareLayoutImport(
      raw,
      getPublisherPreset('other'),
      {},
      structure,
      { pageLevelOnly: true },
    );

    expect(outcome.text).toBe(raw);
    expect(outcome.report.stagesRun).toEqual([]);
    expect(outcome.report.unconfirmedFootnoteMarkers).toBe(0);
    expect(prepared.staged.text).toBe(raw);
    expect(prepared.conversion).toEqual(convertLayoutExtraction(raw, { pageLevelOnly: true }));
  });

  it('keeps the measured Other probe byte-identical when only chapterTitles is answered', () => {
    const raw = [
      'FRONT HEAD\nNeutral front matter.',
      'BOOK ONE\nCHAPTER I\nOpening  words.\n12',
      'Synthetic Work\nCHAPTER Z\nSecond   chapter.\n13',
      'COMMENTARY\nNeutral back matter.',
    ].join('\f');
    const config = resolveLayoutImportConfig(
      getPublisherPreset('other'),
      { chapterTitles: true },
      structure,
    );

    const outcome = runConfiguredLayoutStages(raw, config);

    expect(outcome.text).toBe(raw);
    expect(outcome.report.stagesRun).toEqual([]);
  });

  it('does not build stage config when no stage-specific field is enabled', () => {
    const config = {
      ...resolveLayoutImportConfig(getPublisherPreset('other'), { chapterTitles: false }, structure),
      bekkerStart: 'not-a-ref',
    };

    expect(runConfiguredLayoutStages('raw bytes', config)).toEqual({
      text: 'raw bytes',
      report: expect.objectContaining({ stagesRun: [] }),
    });
  });

  it('gates slice, skeleton, spacing, and footnotes independently', () => {
    const calls: string[] = [];
    const transform = (name: string) => (text: string) => {
      calls.push(name);
      return { text: `${text}|${name}`, changes: [] };
    };
    const dependencies: LayoutPipelineDependencies = {
      slice: transform('slice'),
      skeleton: transform('skeleton'),
      spacing: transform('spacing'),
      footnotes: transform('footnotes'),
      convert: () => ({ ok: false, refused: true, reason: '', scanned: { pages: 0, nonEmptyPages: 0 } }),
    };
    const cases: [ImportEditionConfig, string[]][] = [
      [{ slice: { bodyStart: '^START$' } }, ['slice']],
      [{ runningHeadPlaceholder: 'HEAD' }, ['skeleton']],
      [{ spacing: true }, ['spacing']],
      [{ footnotes: true }, ['footnotes']],
      [{ chapterTitles: true }, []],
      [{ slice: false, spacing: false, footnotes: false }, []],
    ];

    for (const [edition, expected] of cases) {
      calls.length = 0;
      const config = resolveLayoutImportConfig(getPublisherPreset('other'), edition, structure);
      const raw = edition.slice ? 'START' : 'raw';
      runConfiguredLayoutStages(raw, config, dependencies);
      expect(calls).toEqual(expected);
    }
  });

  it('slices front and back matter with a Clarendon-style body start', () => {
    const raw = [
      'FRONT HEAD\nContents and neutral front matter.',
      'SYNTHETIC WORK\n\n      BOOK ONE\n\n   CHAPTER I\n100a     Opening body sentence.',
      'SYNTHETIC WORK\n100b     Later body sentence.',
      'COMMENTARY\nNeutral back matter.',
    ].join('\f');
    const config = resolveLayoutImportConfig(getPublisherPreset('clarendon'), {}, structure);

    const outcome = runConfiguredLayoutStages(raw, config);

    expect(outcome.text).toContain('Opening body sentence.');
    expect(outcome.text).toContain('Later body sentence.');
    expect(outcome.text).not.toContain('Contents and neutral front matter.');
    expect(outcome.text).not.toContain('Neutral back matter.');
    expect(outcome.report.stagesRun).toEqual(['slice', 'skeleton', 'spacing', 'footnotes']);
    expect(outcome.report.sliceChanges).toBe(2);
    expect(outcome.report.sliceBoundaries).toEqual([
      { field: 'slice.bodyStart', text: 'BOOK ONE' },
      { field: 'slice.backMatterStart', text: 'COMMENTARY' },
    ]);
  });

  it('inserts a head, repairs and strips folios, and normalizes a heading', () => {
    const raw = [
      'BOOK ONE\nCHAPTER I\nOpening words continue here.\n12',
      'SYNTHETIC WORK\nCHAPTER Z\nSecond chapter words continue here.\n13',
    ].join('\f');

    const outcome = runConfiguredLayoutStages(raw, configured());

    expect(outcome.text).toMatch(/^SYNTHETIC WORK\n\nBOOK ONE/u);
    expect(outcome.text).toContain('CHAPTER 2');
    expect(outcome.text).not.toMatch(/\n(?:12|13)(?:\f|$)/u);
    expect(outcome.report.headInsertions).toBe(1);
    expect(outcome.report.folioRepairs).toBe(2);
    expect(outcome.report.headingNormalizations).toBe(1);
  });

  it('normalizes spacing when a format config is present', () => {
    const raw = [
      'SYNTHETIC WORK',
      '100a       First    invented    sentence keeps moving.',
      '5          Second invented line keeps moving.',
    ].join('\n');

    const outcome = runConfiguredLayoutStages(raw, configured());

    expect(outcome.text).toContain('First invented sentence keeps moving.');
    expect(outcome.report.spacingNormalizations).toBe(1);
  });

  it('fails loud with the stage and missing slice field', () => {
    const config = configured({
      slice: {
        bodyStart: '^\\s{5,}BOOK\\s+[A-Z]+\\s*$',
        bodyStartNextLine: '^\\s{2,}CHAPTER\\s+\\S+\\s*$',
      },
    });

    expect(() => runConfiguredLayoutStages('HEAD\nNo division here.\f', config)).toThrow(
      /stage 1 \(slice\).*slice\.bodyStart \/ slice\.bodyStartNextLine.*Clarendon \/ OUP boundary pattern.*was not found/u,
    );
    expect(() => runConfiguredLayoutStages('HEAD\nNo division here.\f', config)).not.toThrow(/corpus/u);
  });

  it('prefixes config-shape failures with the guarded stage', () => {
    const config = { ...configured({ slice: false, footnotes: false }), bekkerStart: 'bad' };

    expect(() => runConfiguredLayoutStages('HEAD\nBody text.', config)).toThrow(
      /stage 2 \(skeleton\).*bekkerStart/u,
    );
  });

  it('does not blame footnotePlacement when stage 6 fails', () => {
    const config = resolveLayoutImportConfig(
      getPublisherPreset('other'),
      { footnotes: true },
      structure,
    );
    const dependencies: LayoutPipelineDependencies = {
      slice: text => ({ text, changes: [] }),
      skeleton: text => ({ text, changes: [] }),
      spacing: text => ({ text, changes: [] }),
      footnotes: () => { throw new Error('synthetic invariant'); },
      convert: () => ({ ok: false, refused: true, reason: '', scanned: { pages: 0, nonEmptyPages: 0 } }),
    };

    expect(() => runConfiguredLayoutStages('HEAD\nBody.', config, dependencies)).toThrow(
      'Layout import stage 6 (footnotes) failed: synthetic invariant',
    );
    expect(() => runConfiguredLayoutStages('HEAD\nBody.', config, dependencies)).not.toThrow(
      /footnotePlacement/u,
    );
  });

  it('runs the witness-free footnote subset and counts sites left unfixed', () => {
    const raw = [
      'SYNTHETIC WORK',
      'A neutral term 1 appears in body.',
      'CHAPTER 1',
      '2',
      '',
      '1 Reading a synthetic variant.',
      '2 Omitting a synthetic option.',
      '    78',
    ].join('\n');

    const outcome = runConfiguredLayoutStages(raw, configured());

    expect(outcome.text).toContain('term 1 appears');
    expect(outcome.text).not.toContain('term1 appears');
    expect(outcome.text).toContain('1. Reading a synthetic variant.');
    expect(outcome.report.footnoteHeadRepairs).toBeGreaterThanOrEqual(2);
    expect(outcome.report.detachedFootnoteMarkers).toBe(1);
    expect(outcome.report.unconfirmedFootnoteMarkers).toBe(1);
  });

  it('resolves Edition, runs stages in order, then gives their output to conversion', () => {
    const calls: string[] = [];
    const transform = (name: string) => (text: string) => {
      calls.push(name);
      return { text: `${text}|${name}`, changes: [] };
    };
    const dependencies: LayoutPipelineDependencies = {
      slice: transform('slice'),
      skeleton: transform('skeleton'),
      spacing: transform('spacing'),
      footnotes: (text, _config, witness) => {
        expect(witness).toBe('');
        return transform('footnotes')(text);
      },
      convert: text => {
        calls.push('convert');
        expect(text).toBe('raw|slice|skeleton|spacing|footnotes');
        return { ok: false, refused: true, reason: 'synthetic stop', scanned: { pages: 1, nonEmptyPages: 1 } };
      },
    };

    const prepared = prepareLayoutImport(
      'raw',
      getPublisherPreset('clarendon'),
      { slice: { bodyStart: '^START$' } },
      structure,
      {},
      dependencies,
    );

    expect(prepared.config.slice).toEqual({ bodyStart: '^START$' });
    expect(calls).toEqual(['slice', 'skeleton', 'spacing', 'footnotes', 'convert']);
  });
});
