import { describe, expect, it } from 'vitest';
import { markEnglishHtml } from '../lib/english-hit';
import { englishQueryUnits } from '../lib/search';

// The reader's English highlighter writes HTML from page text and a typed
// query, both of which it must treat as text.
describe('markEnglishHtml', () => {
  const mark = (query: string, text: string) => markEnglishHtml(text, englishQueryUnits(query), false);

  it.each(['(', '[', '\\', '<>', ')]['])('takes %s, which names no word, as a query that marks nothing', (term) => {
    expect(() => mark(term, 'alpha <b>beta</b> & gamma')).not.toThrow();
    expect(mark(term, 'alpha <b>beta</b> & gamma')).toBe('alpha &lt;b&gt;beta&lt;/b&gt; &amp; gamma');
  });

  it('escapes the page text around a word it marks, even inside literal markup', () => {
    expect(mark('b', 'alpha <b>beta</b>')).toBe('alpha &lt;<mark>b</mark>&gt;beta&lt;/<mark>b</mark>&gt;');
    expect(mark('*?', 'a <i> & b')).toBe('<mark>a</mark> &lt;<mark>i</mark>&gt; &amp; <mark>b</mark>');
  });

  it.each([
    // A later term must never match the <mark> tags an earlier one inserted.
    ['virtue mind', 'virtue of the mind', '<mark>virtue</mark> of the <mark>mind</mark>'],
    ['good mark', 'a good mark here', 'a <mark>good</mark> <mark>mark</mark> here'],
    // Whole words: "m" is no longer a prefix that marks "more".
    ['alpha m', 'alpha and more', '<mark>alpha</mark> and more'],
  ])('marks %s without re-marking inserted tags', (query, text, expected) => {
    const out = mark(query, text);
    expect(out).toBe(expected);
    expect(out).not.toMatch(/<mark>[^<]*<mark>/);
    expect(out).not.toContain('&lt;mark&gt;');
  });
});
