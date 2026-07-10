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
});
