import { describe, expect, it } from 'vitest';
import { parseTranslationFile } from '../translation-file';
import { auditDivisionCoverage, divisionAuditLine, divisionGapLabel } from '../division-audit';
import type { ResolvedWorkStructure } from '../import-presets';

const structure: ResolvedWorkStructure = {
  workId: 'Synthetic',
  workTitle: 'Synthetic Work',
  runningHeadPlaceholder: 'Synthetic Work',
  books: 2,
  bookLabels: ['I', 'II'],
  chaptersPerBook: [3, 2],
  chapterKeysByBook: { 1: [1, 2, 3], 2: [1, 2] },
  bekkerStart: '100a',
  bekkerEnd: '105b',
};

const tags = (raw: string) => parseTranslationFile(raw).tags;

describe('R6 division coverage audit', () => {
  it('reports ordered keys and zero mismatch for full coverage', () => {
    const result = auditDivisionCoverage(tags(
      '{1.1} One.\n{1.2} Two.\n{1.3} Three.\n{2.1} Four.\n{2.2} Five.',
    ), structure, [1, 2]);

    expect(result).toEqual({
      booksCovered: [1, 2],
      bookLabels: ['I', 'II'],
      booksFound: 2,
      booksExpected: 2,
      chaptersFound: 5,
      chaptersExpected: 5,
      chapterKeysFound: { 1: [1, 2, 3], 2: [1, 2] },
      gaps: [],
    });
    expect(divisionAuditLine(result)).toContain('0 missing chapters');
  });

  it('finds a missing chapter inside the declaration', () => {
    const result = auditDivisionCoverage(
      tags('{1.1} One.\n{1.3} Three.\n{2.1} Four.\n{2.2} Five.'),
      structure,
      [1, 2],
    );
    expect(result.gaps).toEqual([{ book: 1, chapter: 2 }]);
  });

  it('ignores both gaps and present tags outside a partial declaration', () => {
    const result = auditDivisionCoverage(
      tags('{1.1} One.\n{1.2} Two.\n{1.3} Three.\n{2.2} Outside.'),
      structure,
      [1],
    );
    expect(result).toMatchObject({
      booksCovered: [1],
      booksFound: 1,
      booksExpected: 1,
      chaptersFound: 3,
      chaptersExpected: 3,
      gaps: [],
    });
  });

  it('keeps tag notation and appends a non-contiguous printed book label', () => {
    const audit = {
      booksCovered: [4],
      bookLabels: ['I', 'II', 'III', 'VII', 'VIII'],
      booksFound: 1,
      booksExpected: 1,
      chaptersFound: 1,
      chaptersExpected: 2,
      chapterKeysFound: { 4: [2] },
      gaps: [{ book: 4, chapter: 1 }],
    };
    expect(divisionGapLabel(audit.gaps[0], audit)).toBe('{4.1} — book 4 (printed VII)');
  });
});
