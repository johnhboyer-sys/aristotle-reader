import { describe, expect, it } from 'vitest';
import { escapeRe, highlightPrefixMatches } from '../lib/text';

describe('regex helpers', () => {
  it.each(['(', '[', '*?', '\\', 'λόγος'])('escapes %s for direct RegExp use', (term) => {
    expect(() => new RegExp(escapeRe(term), 'u')).not.toThrow();
  });

  it.each([
    ['(', 'alpha ( beta', 'alpha <mark>(</mark> beta'],
    ['[', 'alpha [ beta', 'alpha <mark>[</mark> beta'],
    ['*?', 'alpha *? beta', 'alpha <mark>*?</mark> beta'],
    ['\\', 'alpha \\ beta', 'alpha <mark>\\</mark> beta'],
    ['λόγος', 'ὁ λόγος καλός', 'ὁ <mark>λόγος</mark> καλός'],
  ])('highlights %s without corrupting escaped text', (term, text, expected) => {
    expect(() => highlightPrefixMatches(text, [term])).not.toThrow();
    expect(highlightPrefixMatches(text, [term])).toBe(expected);
  });

  it.each([
    // A later term must never match the <mark> tags an earlier term inserted.
    [['virtue', 'mind'], 'virtue of the mind', '<mark>virtue</mark> of the <mark>mind</mark>'],
    [['good', 'mark'], 'a good mark here', 'a <mark>good</mark> <mark>mark</mark> here'],
    // A term that is a prefix of "mark" ("m") is the worst case for the old bug.
    [['alpha', 'm'], 'alpha and more', '<mark>alpha</mark> and <mark>more</mark>'],
  ])('highlights multiple terms without re-marking inserted tags (%o)', (terms, text, expected) => {
    const out = highlightPrefixMatches(text, terms as string[]);
    expect(out).toBe(expected);
    // The literal tag name must never appear wrapped in its own <mark>.
    expect(out).not.toMatch(/<mark>[^<]*<mark>/);
    expect(out).not.toContain('&lt;mark&gt;');
  });
});
