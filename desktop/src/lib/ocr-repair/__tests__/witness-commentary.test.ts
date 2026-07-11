import { describe, expect, it } from 'vitest';
import { parseWitnessCommentary, type CommentaryChapterSeat } from '../witness-commentary';

const span = (body: string) => ({ startLine: 0, endLine: 0, text: `## COMMENTARIES ON THE *POSTERIOR ANALYTICS*\nintro text about Bekker pages\n${body}` });

describe('witness commentary parsing', () => {
  it('walks books, chapters, and numbered notes', () => {
    const c = parseWitnessCommentary(span('BOOK A\n1\n1. First note.\n2. Second note.\n2\n1. Next chapter note.\n### BOOK B\n### 1\n1. Book two note.'));

    expect(c.notes.get('1:1')?.get(2)).toBe('Second note.');
    expect(c.notes.get('1:2')?.get(1)).toBe('Next chapter note.');
    expect(c.notes.get('2:1')?.get(1)).toBe('Book two note.');
    expect(c.diagnostics).toEqual([]);
  });

  it('skips page furniture and treats out-of-window numerals as folios', () => {
    const c = parseWitnessCommentary(span('BOOK A\n1\n1. A note.\n---\n74\n75 *Commentaries, Book A*\n_Commentaries, Book A_\ncontinuation of the note.\n2. Another.'));

    expect(c.notes.get('1:1')?.get(1)).toBe('A note.\ncontinuation of the note.');
    expect(c.notes.get('1:1')?.get(2)).toBe('Another.');
  });

  it('accepts escaped ordinal dots', () => {
    const c = parseWitnessCommentary(span('BOOK A\n1\n1\\. Escaped first.\n2\\. Escaped second.'));

    expect(c.notes.get('1:1')?.get(1)).toBe('Escaped first.');
    expect(c.notes.get('1:1')?.get(2)).toBe('Escaped second.');
  });

  it('rejects restarting enumerations inside a note body as continuations', () => {
    const c = parseWitnessCommentary(span('BOOK A\n1\n1. Alpha.\n5. Big jump rejected.\n2. Beta.'));

    expect(c.notes.get('1:1')?.get(1)).toBe('Alpha.\n5. Big jump rejected.');
    expect(c.notes.get('1:1')?.get(5)).toBeUndefined();
  });

  it('seats a chapter whose heading the witness lost', () => {
    const seats: CommentaryChapterSeat[] = [{ book: 1, chapter: 2, anchor: 'Lost chapter opening note' }];
    const c = parseWitnessCommentary(span('BOOK A\n1\n1. First.\n1. Lost chapter opening note.\n2. Its second note.'), seats);

    expect(c.notes.get('1:2')?.get(1)).toBe('Lost chapter opening note.');
    expect(c.notes.get('1:2')?.get(2)).toBe('Its second note.');
    expect(c.diagnostics.filter((d) => d.kind === 'commentary-seat-failed')).toEqual([]);
  });

  it('refuses unmatched, ambiguous, and out-of-order seats', () => {
    const unmatched = parseWitnessCommentary(span('BOOK A\n1\n1. Only note.'), [{ book: 1, chapter: 2, anchor: 'nope' }]);
    const ambiguous = parseWitnessCommentary(span('BOOK A\n1\n1. Twice said.\n2. Twice said again.'), [{ book: 1, chapter: 2, anchor: 'Twice said' }]);
    const backward = parseWitnessCommentary(span('BOOK A\n1\n1. First.\n3\n1. Third chapter note.'), [{ book: 1, chapter: 2, anchor: 'Third chapter note' }]);

    expect(unmatched.diagnostics).toContainEqual(expect.objectContaining({ kind: 'commentary-seat-failed', reason: 'anchor-unmatched' }));
    expect(ambiguous.diagnostics).toContainEqual(expect.objectContaining({ kind: 'commentary-seat-failed', reason: 'anchor-ambiguous' }));
    expect(backward.diagnostics).toContainEqual(expect.objectContaining({ kind: 'commentary-seat-failed', reason: expect.stringContaining('seat-out-of-order') }));
  });

  it('infers a numeral-eaten note 1 when the first numbered note is 2', () => {
    const c = parseWitnessCommentary(span('BOOK A\n1\nUnnumbered opening that is really note one.\n2. Second note.'));

    expect(c.notes.get('1:1')?.get(1)).toBe('Unnumbered opening that is really note one.');
    expect(c.diagnostics).toContainEqual(expect.objectContaining({ kind: 'commentary-note-1-inferred' }));
  });

  it('stores an unnumbered chapter preamble as note 0 when note 1 exists', () => {
    const c = parseWitnessCommentary(span('BOOK A\n1\nA genuine chapter preamble.\n1. Real first note.'));

    expect(c.notes.get('1:1')?.get(0)).toBe('A genuine chapter preamble.');
    expect(c.notes.get('1:1')?.get(1)).toBe('Real first note.');
    expect(c.diagnostics.filter((d) => d.kind === 'commentary-note-1-inferred')).toEqual([]);
  });
});
