import { describe, expect, it } from 'vitest';
import { detectUnit, splitIntoLineRows, splitIntoParagraphRows } from '../segmentDetect';

describe('detectUnit', () => {
  it('empty text defaults to lines', () => {
    expect(detectUnit('')).toBe('lines');
    expect(detectUnit('   \n  \n  ')).toBe('lines');
  });

  it('a single short line defaults to lines', () => {
    expect(detectUnit('Hello there.')).toBe('lines');
  });

  it('a single long line (one giant block, no wraps) is paragraphs', () => {
    const longLine =
      'This is a single very long unwrapped paragraph line that just keeps going and going without any line breaks at all in it.';
    expect(detectUnit(longLine)).toBe('paragraphs');
  });

  it('blank-line-separated long prose blocks (hard-wrapped) is paragraphs', () => {
    const text = [
      'It is the mark of an educated mind to be able to entertain a thought',
      'without accepting it, and this capacity for suspended judgment is one',
      'of the rarest and most valuable habits a thinker can cultivate.',
      '',
      'We are what we repeatedly do. Excellence, then, is not an act but a',
      'habit, formed over long practice and refined by continual correction',
      'of small errors along the way.',
    ].join('\n');
    expect(detectUnit(text)).toBe('paragraphs');
  });

  it('many short lines with blank-line stanza breaks is lines (verse)', () => {
    const text = [
      'Whose woods these are I think I know.',
      'His house is in the village though;',
      'He will not see me stopping here',
      'To watch his woods fill up with snow.',
      '',
      'My little horse must think it queer',
      'To stop without a farmhouse near',
      'Between the woods and frozen lake',
      'The darkest evening of the year.',
    ].join('\n');
    expect(detectUnit(text)).toBe('lines');
  });

  it('short Greek verse-like lines are lines', () => {
    const text = ['μῆνιν ἄειδε θεὰ', 'Πηληϊάδεω Ἀχιλῆος', 'οὐλομένην'].join('\n');
    expect(detectUnit(text)).toBe('lines');
  });

  it('a few short lines mixed into a mostly-prose text stays paragraphs', () => {
    const text = [
      'Dear Reader,',
      '',
      'It is the mark of an educated mind to be able to entertain a thought',
      'without accepting it, and this capacity for suspended judgment is one',
      'of the rarest and most valuable habits a thinker can cultivate.',
    ].join('\n');
    expect(detectUnit(text)).toBe('paragraphs');
  });

  it('normalizes CRLF before detecting', () => {
    const text = [
      'It is the mark of an educated mind to be able to entertain a thought',
      'without accepting it, and this capacity for suspended judgment is one',
    ].join('\r\n');
    expect(detectUnit(text)).toBe('paragraphs');
  });
});

describe('splitIntoParagraphRows', () => {
  it('splits on blank-line-separated blocks and unwraps hard-wrapped lines', () => {
    const text = [
      'It is the mark of an educated mind to be able to entertain a thought',
      'without accepting it.',
      '',
      'We are what we repeatedly do.',
      'Excellence, then, is a habit.',
    ].join('\n');
    expect(splitIntoParagraphRows(text)).toEqual([
      'It is the mark of an educated mind to be able to entertain a thought without accepting it.',
      'We are what we repeatedly do. Excellence, then, is a habit.',
    ]);
  });

  it('trims whitespace and drops empty blocks (multiple blank lines collapse)', () => {
    const text = '  first block  \n\n\n\n  second block  \n\n\n';
    expect(splitIntoParagraphRows(text)).toEqual(['first block', 'second block']);
  });

  it('empty text yields no rows', () => {
    expect(splitIntoParagraphRows('')).toEqual([]);
    expect(splitIntoParagraphRows('   \n\n  ')).toEqual([]);
  });

  it('normalizes CRLF', () => {
    const text = 'line one\r\nline two\r\n\r\nsecond para';
    expect(splitIntoParagraphRows(text)).toEqual(['line one line two', 'second para']);
  });

  it('handles a single unwrapped block with no blank lines', () => {
    expect(splitIntoParagraphRows('one\ntwo\nthree')).toEqual(['one two three']);
  });
});

describe('splitIntoLineRows', () => {
  it('drops blank lines from `lines` and records group starts', () => {
    const text = ['a', 'b', '', 'c', 'd', 'e'].join('\n');
    const result = splitIntoLineRows(text);
    expect(result.lines).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.paragraphStarts).toEqual([1, 3]);
  });

  it('no blank lines at all yields paragraphStarts [1]', () => {
    const result = splitIntoLineRows(['a', 'b', 'c'].join('\n'));
    expect(result.lines).toEqual(['a', 'b', 'c']);
    expect(result.paragraphStarts).toEqual([1]);
  });

  it('multiple consecutive blank lines only open one new group', () => {
    const text = ['a', '', '', '', 'b', 'c'].join('\n');
    const result = splitIntoLineRows(text);
    expect(result.lines).toEqual(['a', 'b', 'c']);
    expect(result.paragraphStarts).toEqual([1, 2]);
  });

  it('trims trailing whitespace but preserves leading', () => {
    const result = splitIntoLineRows('  a  \nb\t\n');
    expect(result.lines).toEqual(['  a', 'b']);
  });

  it('empty text yields no lines and no paragraph starts', () => {
    const result = splitIntoLineRows('');
    expect(result.lines).toEqual([]);
    expect(result.paragraphStarts).toEqual([]);
  });

  it('leading/trailing blank lines around content do not add spurious groups', () => {
    const text = ['', '', 'a', 'b', ''].join('\n');
    const result = splitIntoLineRows(text);
    expect(result.lines).toEqual(['a', 'b']);
    expect(result.paragraphStarts).toEqual([1]);
  });

  it('normalizes CRLF', () => {
    const result = splitIntoLineRows('a\r\nb\r\n\r\nc');
    expect(result.lines).toEqual(['a', 'b', 'c']);
    expect(result.paragraphStarts).toEqual([1, 3]);
  });
});
