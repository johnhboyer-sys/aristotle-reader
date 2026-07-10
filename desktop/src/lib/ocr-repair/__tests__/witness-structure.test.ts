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
});
