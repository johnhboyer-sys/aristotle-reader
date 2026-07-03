import { describe, expect, it } from 'vitest';
import { parseClaudeJson } from '../parse';

describe('parseClaudeJson', () => {
  it('valid envelope with a result string -> { text }', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'This is indeed that which it was to be.',
      total_cost_usd: 0.01,
    });
    expect(parseClaudeJson(stdout)).toEqual({ text: 'This is indeed that which it was to be.' });
  });

  it('envelope with is_error true -> { error, authLike: false } for a non-auth message', () => {
    const stdout = JSON.stringify({ is_error: true, result: 'internal server error' });
    const parsed = parseClaudeJson(stdout);
    expect(parsed).toEqual({ error: 'internal server error', authLike: false });
  });

  it('envelope with is_error true and an auth-flavored message -> authLike: true', () => {
    const stdout = JSON.stringify({ is_error: true, result: 'Please sign in to continue.' });
    const parsed = parseClaudeJson(stdout);
    expect('error' in parsed && parsed.authLike).toBe(true);
  });

  it('is_error true with a variety of auth-ish phrasings all set authLike', () => {
    const phrasings = [
      'You are not authenticated.',
      'Not logged in — run `claude login`.',
      'Unauthorized: invalid credentials',
      'Invalid API key provided.',
      'Your session expired, please log in again.',
    ];
    for (const message of phrasings) {
      const parsed = parseClaudeJson(JSON.stringify({ is_error: true, result: message }));
      expect('error' in parsed && parsed.authLike, `expected authLike for: ${message}`).toBe(true);
    }
  });

  it('is_error true with no result field falls back to a generic error message, authLike false', () => {
    const parsed = parseClaudeJson(JSON.stringify({ is_error: true }));
    expect(parsed).toEqual({ error: 'CLI reported an error', authLike: false });
  });

  it('malformed JSON -> { error }, never throws', () => {
    expect(() => parseClaudeJson('{not json')).not.toThrow();
    const parsed = parseClaudeJson('{not json');
    expect('error' in parsed).toBe(true);
  });

  it('truncated JSON -> { error }, never throws', () => {
    const truncated = JSON.stringify({ is_error: false, result: 'partial sugg' }).slice(0, 20);
    expect(() => parseClaudeJson(truncated)).not.toThrow();
    expect('error' in parseClaudeJson(truncated)).toBe(true);
  });

  it('empty stdout -> { error }', () => {
    expect(parseClaudeJson('')).toEqual({ error: 'empty output', authLike: false });
    expect(parseClaudeJson('   \n  ')).toEqual({ error: 'empty output', authLike: false });
  });

  it('empty result string (success envelope) -> { error }', () => {
    const parsed = parseClaudeJson(JSON.stringify({ is_error: false, result: '' }));
    expect('error' in parsed).toBe(true);
  });

  it('result field missing entirely -> { error }', () => {
    const parsed = parseClaudeJson(JSON.stringify({ is_error: false }));
    expect('error' in parsed).toBe(true);
  });

  it('top-level JSON that is not an object (e.g. a bare array or number) -> { error }', () => {
    expect('error' in parseClaudeJson('[1,2,3]')).toBe(true);
    expect('error' in parseClaudeJson('42')).toBe(true);
    expect('error' in parseClaudeJson('null')).toBe(true);
  });

  it('never asks for nested JSON in the result — a plain-prose result string round-trips as-is', () => {
    const prose = 'This, then, is what it means "to be" — no braces, no quotes needed.';
    const parsed = parseClaudeJson(JSON.stringify({ is_error: false, result: prose }));
    expect(parsed).toEqual({ text: prose });
  });
});
