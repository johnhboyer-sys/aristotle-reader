import { describe, expect, it } from 'vitest';
import { wordAt } from '../wordAt';

describe('wordAt', () => {
  const line = 'Πάντες ἄνθρωποι τοῦ εἰδέναι ὀρέγονται φύσει.';

  it('finds the first word from an offset in its interior', () => {
    expect(wordAt(line, 2)).toEqual({ text: 'Πάντες', start: 0, end: 6 });
  });

  it('finds the first word from its start offset', () => {
    expect(wordAt(line, 0)).toEqual({ text: 'Πάντες', start: 0, end: 6 });
  });

  it('finds a mid-line word, not a neighbor', () => {
    // "ἄνθρωποι" starts at index 7
    const idx = line.indexOf('ἄνθρωποι');
    expect(wordAt(line, idx + 3)).toEqual({ text: 'ἄνθρωποι', start: idx, end: idx + 8 });
  });

  it('returns null for an offset on whitespace', () => {
    expect(wordAt(line, 6)).toBeNull(); // the space after Πάντες
  });

  it('returns null for an offset on trailing punctuation', () => {
    expect(wordAt(line, line.length - 1)).toBeNull(); // the period
  });

  it('clamps an offset at line end to the last character', () => {
    const short = 'λόγος';
    expect(wordAt(short, short.length)).toEqual({ text: 'λόγος', start: 0, end: 5 });
  });

  it('returns null for an empty string', () => {
    expect(wordAt('', 0)).toBeNull();
  });

  it('includes a trailing elision apostrophe as part of the word', () => {
    const text = "σημεῖον δ' ὅτι";
    const idx = text.indexOf('δ');
    expect(wordAt(text, idx)).toEqual({ text: "δ'", start: idx, end: idx + 2 });
  });

  it('does not pull in a neighboring word across a space', () => {
    const text = 'τὸ γὰρ ζητεῖν';
    const idx = text.indexOf('γὰρ');
    const span = wordAt(text, idx + 1)!;
    expect(span.text).toBe('γὰρ');
    expect(text[span.start - 1]).toBe(' ');
    expect(text[span.end]).toBe(' ');
  });

  it('handles a word at the very end of the line', () => {
    const text = 'ζητεῖν φύσει';
    const start = text.indexOf('φύσει');
    expect(wordAt(text, text.length - 1)).toEqual({ text: 'φύσει', start, end: text.length });
  });
});
