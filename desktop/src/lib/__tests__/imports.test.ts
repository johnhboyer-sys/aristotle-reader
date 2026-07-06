// Phase 4B: unit coverage for the pure, registry-independent helpers pulled
// out of imports.ts so they're testable without the storage/alignment
// pipeline (runImport needs fetchBook/fetchChapters + a Tauri/browser store).
//
// - mergeChapterTitles: the "built-ins win, imports only fill gaps" rule for
//   an imported translation's converter-derived chapter titles (task 2).
// - resolveImportFootnote: label resolution against one record's footnotes
//   map, including scoped labels (continuous digits, per-chapter "b.c.N",
//   and the star/dagger work-level glyphs — phase3-final-spec.md §B5).

import { describe, expect, it } from 'vitest';
import { mergeChapterTitles, resolveImportFootnote } from '../imports';
import type { ImportRecord } from '../imports';

describe('mergeChapterTitles (§Phase-4B task 2: built-ins win, imports fill gaps)', () => {
  it('returns the built-in map unchanged when there are no imported titles', () => {
    const builtin = { '1': 'On Being' };
    expect(mergeChapterTitles(1, builtin, {})).toBe(builtin);
  });

  it('fills a chapter the built-in map has no title for', () => {
    const builtin = { '1': 'On Being' };
    const imported = { '1.2': 'Imported Title' };
    expect(mergeChapterTitles(1, builtin, imported)).toEqual({
      '1': 'On Being',
      '2': 'Imported Title',
    });
  });

  it('never overwrites an existing built-in title for the same chapter', () => {
    const builtin = { '1': 'On Being' };
    const imported = { '1.1': 'A Noisier PDF-Extracted Title' };
    expect(mergeChapterTitles(1, builtin, imported)).toEqual({ '1': 'On Being' });
  });

  it('only pulls in titles keyed to the requested book', () => {
    const builtin: Record<string, string> = {};
    const imported = { '1.1': 'Book 1 Ch 1', '2.1': 'Book 2 Ch 1' };
    expect(mergeChapterTitles(1, builtin, imported)).toEqual({ '1': 'Book 1 Ch 1' });
    expect(mergeChapterTitles(2, builtin, imported)).toEqual({ '1': 'Book 2 Ch 1' });
  });

  it('does not mutate the builtin object it was given', () => {
    const builtin = { '1': 'On Being' };
    mergeChapterTitles(1, builtin, { '1.2': 'Imported Title' });
    expect(builtin).toEqual({ '1': 'On Being' });
  });
});

describe('resolveImportFootnote (§B4.4 resolver core, incl. scoped labels)', () => {
  const baseRecord = (footnotes: Record<string, string>): ImportRecord => ({
    meta: {
      formatVersion: 1,
      work: 'EN',
      translator: 'Test',
      license: 'public-domain',
      language: 'en',
      id: 'test',
    },
    density: 'exhaustive',
    warnings: [],
    stats: { tagged: 0, placed: 0, interpolated: 0, chapters: 0 },
    overlaysByBook: {},
    alignment: {},
    footnotes,
  });

  it('resolves a continuous-scope plain-digit label', () => {
    const rec = baseRecord({ '1': 'Reading πρακτικαῖς.' });
    expect(resolveImportFootnote(rec, '1')).toBe('Reading πρακτικαῖς.');
  });

  it('resolves a per-chapter scoped label ("book.chapter.N")', () => {
    const rec = baseRecord({ '2.3.1': 'A chapter-scoped note.' });
    expect(resolveImportFootnote(rec, '2.3.1')).toBe('A chapter-scoped note.');
    // A different chapter's "1" is a DISTINCT identity — never collides.
    expect(resolveImportFootnote(rec, '1')).toBeNull();
  });

  it('resolves the star/dagger work-level glyph labels', () => {
    const rec = baseRecord({ '*': 'Translated by C. D. C. Reeve.', '†': 'Alt credit.' });
    expect(resolveImportFootnote(rec, '*')).toBe('Translated by C. D. C. Reeve.');
    expect(resolveImportFootnote(rec, '†')).toBe('Alt credit.');
  });

  it('returns null for a label with no definition', () => {
    const rec = baseRecord({ '1': 'Only note.' });
    expect(resolveImportFootnote(rec, '2')).toBeNull();
  });

  it('returns null (never throws) when the record is undefined (not a registered import)', () => {
    expect(resolveImportFootnote(undefined, '1')).toBeNull();
  });

  it('returns null when the record predates the footnotes field', () => {
    const rec = baseRecord({});
    delete (rec as { footnotes?: unknown }).footnotes;
    expect(resolveImportFootnote(rec, '1')).toBeNull();
  });
});
