// Pure row-keymap logic: paste planning (distribute vs flatten) and the
// typing-transaction shape check used for undo coalescing.
import { describe, expect, it } from 'vitest';
import { planPaste, splitSegments, flattenSegments } from '../plugins/rowKeymap';

describe('splitSegments', () => {
  it('splits on \\n, \\r\\n and \\r', () => {
    expect(splitSegments('a\nb\r\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops trailing empty segments from a final newline', () => {
    expect(splitSegments('a\nb\n')).toEqual(['a', 'b']);
    expect(splitSegments('a\n\n')).toEqual(['a']);
  });

  it('keeps interior empty segments (blank line = empty row)', () => {
    expect(splitSegments('a\n\nb')).toEqual(['a', '', 'b']);
  });
});

describe('planPaste', () => {
  it('single-line paste inserts as-is', () => {
    expect(planPaste('some prose', true, 0)).toEqual({ kind: 'insert', text: 'some prose' });
    expect(planPaste('some prose', false, 0)).toEqual({ kind: 'insert', text: 'some prose' });
  });

  it('distributes N segments when the remainder is empty and N-1 empty rows follow', () => {
    expect(planPaste('one\ntwo\nthree', true, 2)).toEqual({
      kind: 'distribute',
      segments: ['one', 'two', 'three'],
    });
    // More empties than needed is fine too.
    expect(planPaste('one\ntwo', true, 5)).toEqual({ kind: 'distribute', segments: ['one', 'two'] });
  });

  it('flattens when the caret has content after it', () => {
    expect(planPaste('one\ntwo', false, 5)).toEqual({ kind: 'flatten', text: 'one two' });
  });

  it('flattens when the following rows are not empty enough', () => {
    expect(planPaste('one\ntwo\nthree', true, 1)).toEqual({ kind: 'flatten', text: 'one two three' });
  });

  it('never proposes creating rows: distribution requires exactly following empties', () => {
    // 4 segments at the end of the chapter with only 2 rows below → flatten.
    expect(planPaste('a\nb\nc\nd', true, 2).kind).toBe('flatten');
  });

  it('flatten trims segment edges and skips blank lines', () => {
    expect(flattenSegments([' one ', '', 'two  ', 'three'])).toBe('one two three');
  });
});
