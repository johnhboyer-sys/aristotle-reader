import { describe, expect, it } from 'vitest';
import { curlyEnglish, curlyEnglishHtml, greekElision, noBreakBeforeDash } from '../lib/typography';

describe('reader typography', () => {
  it('handles nested quotes, brackets, apostrophes and opening positions', () => {
    expect(curlyEnglish(`"He said 'yes'."`)).toBe('“He said ‘yes’.”');
    expect(curlyEnglish(`don't 'tis ["yes"] ("yes")`)).toBe('don’t ‘tis [“yes”] (“yes”)');
    expect(curlyEnglish(`word —"yes"`)).toBe('word\u2060—“yes”');
  });
  it('carries quote context across tags and leaves attributes and entities intact', () => {
    expect(curlyEnglishHtml('<a title="x">"y"</a>')).toBe('<a title="x">“y”</a>');
    expect(curlyEnglishHtml('<i>"x</i>"')).toBe('<i>“x</i>”');
    expect(curlyEnglishHtml('a &quot; &amp; &#39; &#x27;')).toBe('a &quot; &amp; &#39; &#x27;');
    expect(curlyEnglishHtml('<b title="a > b">word </b> —"yes"')).toBe('<b title="a > b">word</b>\u2060—“yes”');
  });
  it('joins em dashes, including ones with no space, without duplicate joiners', () => {
    expect(noBreakBeforeDash('a \n —b—c\u2060—d')).toBe('a\u2060—b\u2060—c\u2060—d');
    expect(curlyEnglish('a — b')).toBe('a\u2060— b');
    expect(curlyEnglishHtml('a — b')).toBe('a\u2060— b');
  });
  it('keeps the koronis and modifier apostrophe', () => {
    expect(greekElision("ἀλλ' ἀλλ‘ ἀλλ’ ἀλλ᾽ ἀλλʼ")).toBe('ἀλλ’ ἀλλ’ ἀλλ’ ἀλλ᾽ ἀλλʼ');
  });
});
