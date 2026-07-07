// Phase 4B: unit coverage for the pure, registry-independent helpers pulled
// out of imports.ts so they're testable without the storage/alignment
// pipeline (runImport needs fetchBook/fetchChapters + a Tauri/browser store).
//
// - resolveImportTitle (§Phase-4B-revised, John's call 2026-07-06): an
//   imported translation's own converter-derived chapter title is that
//   edition's editorial paratext — resolved for ONE registered import at ONE
//   book.chapter, rendered unaligned inside that import's own overlay
//   column, never merged into the reader's shared chapter-heading map.
// - resolveImportFootnote: label resolution against one record's footnotes
//   map, including scoped labels (continuous digits, per-chapter "b.c.N",
//   and the star/dagger work-level glyphs — phase3-final-spec.md §B5).

import { describe, expect, it } from 'vitest';
import { resolveImportFootnote, resolveImportTitle } from '../imports';
import type { ImportRecord } from '../imports';

describe('resolveImportTitle (§Phase-4B-revised: per-import, unaligned, chapter-opening title)', () => {
  const baseRecord = (titles: Record<string, string>): ImportRecord => ({
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
    titles,
  });

  it('resolves a captured title for its book.chapter key', () => {
    const rec = baseRecord({ '1.2': 'Imported Title' });
    expect(resolveImportTitle(rec, 1, '2')).toBe('Imported Title');
  });

  it('is scoped to the exact book — a same-numbered chapter in another book does not collide', () => {
    const rec = baseRecord({ '1.1': 'Book 1 Ch 1', '2.1': 'Book 2 Ch 1' });
    expect(resolveImportTitle(rec, 1, '1')).toBe('Book 1 Ch 1');
    expect(resolveImportTitle(rec, 2, '1')).toBe('Book 2 Ch 1');
  });

  it('returns null for a chapter with no captured title', () => {
    const rec = baseRecord({ '1.1': 'On Being' });
    expect(resolveImportTitle(rec, 1, '2')).toBeNull();
  });

  it('returns null (never throws) when the record is undefined (not a registered import)', () => {
    expect(resolveImportTitle(undefined, 1, '1')).toBeNull();
  });

  it('returns null when the record predates the titles field', () => {
    const rec = baseRecord({});
    delete (rec as { titles?: unknown }).titles;
    expect(resolveImportTitle(rec, 1, '1')).toBeNull();
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
