// Phase 4B: ImportDialog's accept-stage detection rule — a form-feed byte
// (\f) is pdftotext's page-break marker and never appears in a hand-authored
// or already-tagged translation file, so its presence is what routes an
// upload through convertLayoutExtraction before the metadata form. Exported
// as a small pure function (index.ts) so the rule is unit-testable without a
// DOM/Svelte harness — see ImportDialog.svelte's acceptText.

import { describe, expect, it } from 'vitest';
import { isLayoutExtraction } from '../index';

describe('isLayoutExtraction (§Phase-4B accept-stage detection rule)', () => {
  it('is false for a plain hand-tagged translation file', () => {
    const text = '{1.1} Every art and every inquiry... {1094a} But a certain difference...';
    expect(isLayoutExtraction(text)).toBe(false);
  });

  it('is false for a file with frontmatter and normal newlines', () => {
    const text = '---\ntranslator: Reeve\n---\n{1.1} Every good thing...\n\nNext paragraph.';
    expect(isLayoutExtraction(text)).toBe(false);
  });

  it('is true for text containing a form-feed page-break byte', () => {
    const text = 'NICOMACHEAN ETHICS\t\t\t1\n\nEvery art...\f\nBook 1\t\t\t2\n\nAnd every inquiry...';
    expect(isLayoutExtraction(text)).toBe(true);
  });

  it('is true even for a single bare \\f with no other content', () => {
    expect(isLayoutExtraction('\f')).toBe(true);
  });

  it('is false for the empty string', () => {
    expect(isLayoutExtraction('')).toBe(false);
  });
});
