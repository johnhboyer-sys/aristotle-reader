import { describe, expect, it } from 'vitest';
import type { CorpusConfig } from '../corpus-config';
import { vote } from '../vote';
import { parseWitnessStructure } from '../witness-structure';

function document(body: string): string {
  return ['# Posterior Analytics', '## Table of Contents', 'front matter', '## *Posterior Analytics*', body, '## COMMENTARIES ON THE *POSTERIOR ANALYTICS*', 'commentary text', '## Glossary'].join('\n');
}

function config(structured: boolean): CorpusConfig {
  return {
    id: 'synthetic',
    workTitle: 'Posterior Analytics',
    runningHeadPlaceholder: 'HEAD',
    bekkerStart: { page: 71, col: 'a' },
    bekkerEnd: { page: 71, col: 'b' },
    divisions: { books: 1, chaptersPerBook: [2] },
    backbonePath: 'backbone.txt',
    witnessPath: 'witness.txt',
    outDir: 'out',
    ...(structured ? { witnessStructure: { format: 'genie-markdown' as const } } : {}),
  };
}

describe('structured Genie witness parsing', () => {
  it('parses books and chapters and returns the commentary span', () => {
    const parsed = parseWitnessStructure(document('### BOOK A\n### 1\nFirst chapter.\n### 2\nSecond chapter.'));

    expect([...parsed.chapters]).toEqual([
      ['1:1', { text: 'First chapter.', startLine: 6 }],
      ['1:2', { text: 'Second chapter.', startLine: 8 }],
    ]);
    expect(parsed.commentary).toMatchObject({ startLine: 9, endLine: 11 });
  });

  it('tolerates H2/H3 heading-level jitter', () => {
    const parsed = parseWitnessStructure(document('### BOOK A\n## 1\nFirst.\n## BOOK B\n### 1\nSecond.'));

    expect([...parsed.chapters.keys()]).toEqual(['1:1', '2:1']);
  });

  it('self-heals a forward chapter jump within the three-chapter window', () => {
    const parsed = parseWitnessStructure(document('### BOOK A\n### 1\nFirst.\n### 3\nThird.\n### 4\nFourth.'));

    expect([...parsed.chapters.keys()]).toEqual(['1:1', '1:3', '1:4']);
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({ tier: 2, kind: 'chapter-sequence-conflict', expected: 2, got: 3 }));
  });

  it('leaves a missing chapter absent without stalling later chapters', () => {
    const parsed = parseWitnessStructure(document('### BOOK A\n### 1\nFirst.\n### 3\nThird.'));

    expect(parsed.chapters.has('1:2')).toBe(false);
    expect(parsed.chapters.get('1:3')?.text).toBe('Third.');
  });

  it('returns an empty map and diagnostic when the translation section is absent', () => {
    const parsed = parseWitnessStructure('# Different Work\n## Summary\nNothing.', 'Posterior Analytics');

    expect(parsed.chapters.size).toBe(0);
    expect(parsed.diagnostics).toEqual([{ tier: 2, line: 0, kind: 'translation-section-missing' }]);
  });

  it('accepts an endnote marker seated on the chapter numeral, in all three sup forms', () => {
    for (const heading of ['# 2¹', '### 2$^{1}$', '### 2$^1$', '### 2<sup>1</sup>']) {
      const parsed = parseWitnessStructure(document(`### BOOK A\n### 1\nFirst.\n${heading}\nSecond.`));

      expect(parsed.chapters.get('1:2')?.text).toBe('Second.');
      expect(parsed.diagnostics).toContainEqual(
        expect.objectContaining({ kind: 'chapter-heading-marker', got: 2, token: '1' })
      );
    }
  });

  it('does not end the translation section at a marker-bearing H2 chapter numeral', () => {
    const parsed = parseWitnessStructure(document('### BOOK A\n### 1\nFirst.\n## 2¹\nSecond.'));

    expect(parsed.chapters.get('1:2')?.text).toBe('Second.');
  });
});

describe('SEAT-witness-chapter', () => {
  const body = '### BOOK A\n### 1\nFirst chapter.\nOpening of the lost chapter here.\nMore of it.\n### 3\nThird.';

  it('splits the host chapter at the anchored line', () => {
    const parsed = parseWitnessStructure(document(body), undefined, [
      { book: 1, chapter: 2, anchor: 'Opening of the lost chapter' },
    ]);

    expect(parsed.chapters.get('1:1')?.text).toBe('First chapter.');
    expect(parsed.chapters.get('1:2')?.text).toBe('Opening of the lost chapter here.\nMore of it.');
    expect(parsed.chapters.get('1:3')?.text).toBe('Third.');
    expect(parsed.diagnostics.filter((d) => d.kind === 'witness-seat-failed')).toEqual([]);
  });

  it('refuses a seat for a chapter the walk already found', () => {
    const parsed = parseWitnessStructure(document(body), undefined, [
      { book: 1, chapter: 3, anchor: 'Third.' },
    ]);

    expect(parsed.diagnostics).toContainEqual(
      expect.objectContaining({ kind: 'witness-seat-failed', reason: 'chapter-1:3-already-present' })
    );
  });

  it('refuses unmatched and ambiguous anchors', () => {
    const unmatched = parseWitnessStructure(document(body), undefined, [
      { book: 1, chapter: 2, anchor: 'no such line' },
    ]);
    const ambiguous = parseWitnessStructure(document(`${body}\nOpening of the lost chapter again.`), undefined, [
      { book: 1, chapter: 2, anchor: 'Opening of the lost chapter' },
    ]);

    expect(unmatched.chapters.has('1:2')).toBe(false);
    expect(unmatched.diagnostics).toContainEqual(expect.objectContaining({ kind: 'witness-seat-failed', reason: 'anchor-unmatched' }));
    expect(ambiguous.chapters.has('1:2')).toBe(false);
    expect(ambiguous.diagnostics).toContainEqual(expect.objectContaining({ kind: 'witness-seat-failed', reason: 'anchor-ambiguous' }));
  });

  it('refuses an anchor inside a chapter at or after the seat target', () => {
    const parsed = parseWitnessStructure(document(body), undefined, [
      { book: 1, chapter: 2, anchor: 'Third.' },
    ]);

    expect(parsed.chapters.has('1:2')).toBe(false);
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({ kind: 'witness-seat-failed', reason: 'anchor-inside-1:3' }));
  });
});

describe('chapter-scoped stage-5 pairing', () => {
  it('keeps the config-absent path byte-identical and scopes enabled pairing', () => {
    const backbone = ['RUNNING HEAD', 'BOOK ONE', 'CHAPTER 1', '71a A plain office-remains.', 'CHAPTER 2', 'A decoy office-remains.'].join('\n');
    const witness = document('### BOOK A\n### 1\n71a A plain office—remains.\n### 2\nA decoy office-remains.')
      .replace('front matter', '71a A plain office-remains.');
    const baselineA = vote(backbone, witness, config(false));
    const baselineB = vote(backbone, witness, { ...config(false) });
    const scoped = vote(backbone, witness, config(true));

    expect(JSON.stringify(baselineA)).toBe(JSON.stringify(baselineB));
    expect(baselineA.text).toBe(backbone);
    expect(baselineA.changes).not.toContainEqual(expect.objectContaining({ rule: 'emdash-restore', before: 'office-remains.' }));
    expect(scoped.text).toContain('A plain office—remains.');
    expect(scoped.changes).toContainEqual(expect.objectContaining({ rule: 'emdash-restore', before: 'office-remains.', after: 'office—remains.' }));
  });

  it('reaches a heading-lost witness chapter through a SEAT-witness-chapter decision', () => {
    const backbone = ['RUNNING HEAD', 'BOOK ONE', 'CHAPTER 1', '71a First chapter.', 'CHAPTER 2', 'A plain office-remains.'].join('\n');
    // Chapter 2's heading is missing from the witness: its text trails ch 1.
    const witness = document('### BOOK A\n### 1\n71a First chapter.\nA plain office—remains.');
    const decisions = {
      checkedPatterns: new Set<string>(),
      seatWitnessChapters: [{ book: 1, chapter: 2, anchor: 'A plain office' }],
    };
    const unseated = vote(backbone, witness, config(true));
    const seated = vote(backbone, witness, config(true), decisions);

    expect(unseated.text).not.toContain('office—remains.');
    expect(seated.text).toContain('A plain office—remains.');
  });

  it('surfaces a failed witness seat as a flag record', () => {
    const backbone = ['RUNNING HEAD', 'BOOK ONE', 'CHAPTER 1', '71a First chapter.'].join('\n');
    const witness = document('### BOOK A\n### 1\n71a First chapter.');
    const decisions = {
      checkedPatterns: new Set<string>(),
      seatWitnessChapters: [{ book: 1, chapter: 2, anchor: 'no such line' }],
    };
    const outcome = vote(backbone, witness, config(true), decisions);

    expect(outcome.changes).toContainEqual(
      expect.objectContaining({
        rule: 'flag',
        evidence: expect.objectContaining({ kind: 'witness-seat-failed', anchor: 'no such line', reason: 'anchor-unmatched' }),
      })
    );
  });
});
