// Phase-4A §1: the TAG grammar extension. Legacy pin first — a representative
// legacy body (3–4-digit suffix-less columns, 1–2-digit bare lines, chapter
// tags, plus a warning-producing sequence) must parse byte-identically under
// the new grammar: identical tags, offsets, and warnings, hardcoded here from
// the pre-extension parse. Then the new forms: {16a}/{1a} short pages,
// {1181a25} column-with-starting-line, and the {15} vs {15a} disambiguation.

import { describe, expect, it } from 'vitest';
import { parseTranslationFile } from '../translation-file';

function withFrontmatter(body: string, id = 'test'): string {
  return `---
formatVersion: 1
work: ne
translator: Test
license: public-domain
language: en
id: ${id}
---
${body}`;
}

describe('TAG grammar extension §1: legacy pin', () => {
  it('parses a representative legacy body byte-identically (tags, offsets, warnings)', () => {
    // Every legacy tag form in one body: chapter, 4-digit column, 3-digit
    // column, bare lines (1- and 2-digit), a non-advancing line (warning),
    // a line tag before any column (warning + ignored), and a non-advancing
    // column (warning).
    const body =
      '{3}orphan {1.7}Alpha beta {1094a}gamma delta {5}epsilon zeta {15}eta ' +
      '{15}theta {999b}iota {2}kappa {1094b}lambda mu.\n';
    const p = parseTranslationFile(withFrontmatter(body));

    // Hardcoded from the pre-Phase-4A grammar's parse of this exact body —
    // the pin. Do not regenerate these from the code under test.
    expect(p.text).toBe('orphan Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.\n');
    expect(p.tags).toEqual([
      { kind: 'chapter', raw: '1.7', offset: 7, book: 1, chapter: 7 },
      { kind: 'column', raw: '1094a', offset: 18, column: '1094a', line: 1, citation: '1094a1' },
      { kind: 'line', raw: '5', offset: 30, column: '1094a', line: 5, citation: '1094a5' },
      { kind: 'line', raw: '15', offset: 43, column: '1094a', line: 15, citation: '1094a15' },
      { kind: 'line', raw: '15', offset: 47, column: '1094a', line: 15, citation: '1094a15' },
      { kind: 'column', raw: '999b', offset: 53, column: '999b', line: 1, citation: '999b1' },
      { kind: 'line', raw: '2', offset: 58, column: '999b', line: 2, citation: '999b2' },
      { kind: 'column', raw: '1094b', offset: 64, column: '1094b', line: 1, citation: '1094b1' },
    ]);
    expect(p.warnings).toEqual([
      'line tag {3} before any column tag — ignored (no column context)',
      'line {15} does not advance within 1094a (previous: 15)',
      'column {999b} does not advance from {1094a} — check the source tags',
    ]);
    expect(p.density).toBe('five-line-or-column');
  });

  it('a suffix-less column tag still resets the line context to 0 (a following {1} does not warn)', () => {
    const p = parseTranslationFile(withFrontmatter('{1094a}alpha {1}beta.\n'));
    expect(p.warnings).toEqual([]);
    expect(p.tags[1]).toEqual({ kind: 'line', raw: '1', offset: 6, column: '1094a', line: 1, citation: '1094a1' });
  });
});

describe('TAG grammar extension §1: new forms', () => {
  it('{16a} and {1a}: 1–2-digit Bekker pages are legal column tags (line 1)', () => {
    const p = parseTranslationFile(withFrontmatter('{16a}alpha beta {20}gamma {1a}delta.\n'));
    expect(p.warnings).toEqual(['column {1a} does not advance from {16a} — check the source tags']);
    expect(p.tags).toEqual([
      { kind: 'column', raw: '16a', offset: 0, column: '16a', line: 1, citation: '16a1' },
      { kind: 'line', raw: '20', offset: 11, column: '16a', line: 20, citation: '16a20' },
      { kind: 'column', raw: '1a', offset: 17, column: '1a', line: 1, citation: '1a1' },
    ]);
  });

  it('{1181a25}: a column tag with a starting line enters the column at that line', () => {
    const p = parseTranslationFile(withFrontmatter('{1181a25}alpha {30}beta {25}gamma.\n'));
    expect(p.tags[0]).toEqual({
      kind: 'column', raw: '1181a25', offset: 0, column: '1181a', line: 25, citation: '1181a25',
    });
    // {30} advances from the entered line 25 — no warning; a later {25} does
    // not advance and warns against the suffix-set context.
    expect(p.tags[1]).toEqual({ kind: 'line', raw: '30', offset: 6, column: '1181a', line: 30, citation: '1181a30' });
    expect(p.warnings).toEqual(['line {25} does not advance within 1181a (previous: 30)']);
  });

  it('{15a} is a column tag, {15} is a bare line tag — the letter disambiguates', () => {
    const p = parseTranslationFile(withFrontmatter('{15a}alpha {15}beta.\n'));
    expect(p.tags[0].kind).toBe('column');
    expect(p.tags[0].citation).toBe('15a1');
    expect(p.tags[1].kind).toBe('line');
    expect(p.tags[1].citation).toBe('15a15');
  });

  it('adjacent tags each swallow their own trailing space: "{1.1} {1094a} Every"', () => {
    const p = parseTranslationFile(withFrontmatter('{1.1} {1094a} Every good thing.\n'));
    expect(p.text).toBe('Every good thing.\n');
    expect(p.tags).toEqual([
      { kind: 'chapter', raw: '1.1', offset: 0, book: 1, chapter: 1 },
      { kind: 'column', raw: '1094a', offset: 0, column: '1094a', line: 1, citation: '1094a1' },
    ]);
  });
});
