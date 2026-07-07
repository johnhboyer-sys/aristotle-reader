import { describe, expect, it } from 'vitest';
import { normalizeReferenceText } from '../normalize';

describe('normalizeReferenceText', () => {
  it('strips U+00AD soft hyphens', () => {
    const raw = 'soft­hyphen word';
    expect(normalizeReferenceText(raw).display).toBe('softhyphen word');
    expect(normalizeReferenceText(raw).rawKept).toBe('softhyphen word');
  });

  it('rejoins end-of-line hyphenation', () => {
    const raw = 'This is a hy-\nphenated word.';
    expect(normalizeReferenceText(raw).display).toBe('This is a hyphenated word.');
  });

  it('converts CRLF to LF', () => {
    const raw = 'Line one.\r\nLine two.\r\n\r\nSecond paragraph.';
    const { display, rawKept } = normalizeReferenceText(raw);
    expect(rawKept).not.toContain('\r');
    expect(display).toBe('Line one. Line two.\n\nSecond paragraph.');
  });

  it('converts bare CR to LF', () => {
    const raw = 'Line one.\rLine two.';
    expect(normalizeReferenceText(raw).display).toBe('Line one. Line two.');
  });

  it('folds U+2028 and U+2029 to a real line break', () => {
    const raw = 'Para one line one Para one line two Para two.';
    const { display } = normalizeReferenceText(raw);
    // Both separators fold to \n, and since they abut no blank line, the
    // paragraph collapse should join them into one paragraph as a fluent line.
    expect(display).toBe('Para one line one Para one line two Para two.');
  });

  it('collapses hard-wrapped OCR lines into a single paragraph', () => {
    const raw = 'We have to inquire\nwhat substance is,\nand once more.';
    expect(normalizeReferenceText(raw).display).toBe(
      'We have to inquire what substance is, and once more.',
    );
  });

  it('keeps a blank line as a paragraph break', () => {
    const raw = 'First paragraph\nwrapped here.\n\nSecond paragraph\nalso wrapped.';
    expect(normalizeReferenceText(raw).display).toBe(
      'First paragraph wrapped here.\n\nSecond paragraph also wrapped.',
    );
  });

  it('collapses runs of 3+ blank lines to one paragraph break', () => {
    const raw = 'First.\n\n\n\nSecond.';
    expect(normalizeReferenceText(raw).display).toBe('First.\n\nSecond.');
  });

  it('rawKept preserves line structure (does not collapse to prose)', () => {
    const raw = 'We have to inquire\nwhat substance is.\n\nSecond paragraph.';
    const { rawKept } = normalizeReferenceText(raw);
    expect(rawKept).toBe('We have to inquire\nwhat substance is.\n\nSecond paragraph.');
  });

  it('rawKept still applies line-ending and soft-hyphen normalization', () => {
    const raw = 'wor-\nd soft­hyphen\r\nnext line';
    const { rawKept } = normalizeReferenceText(raw);
    expect(rawKept).not.toContain('\r');
    expect(rawKept).not.toContain('­');
    expect(rawKept).toBe('word softhyphen\nnext line');
  });

  it('trims leading/trailing whitespace', () => {
    const raw = '\n\n  Hello world.  \n\n';
    expect(normalizeReferenceText(raw).display).toBe('Hello world.');
  });

  it('does not rejoin a hyphen when the continuation is not lowercase (conservative)', () => {
    const raw = 'End of sentence-\nNew Sentence starts.';
    // Continuation starts with uppercase "N" — not a plausible hyphenated
    // word continuation, so the hyphen and line break are left as OCR gave
    // them (paragraph-collapse still turns the line break into a space).
    expect(normalizeReferenceText(raw).display).toBe('End of sentence- New Sentence starts.');
  });
});
