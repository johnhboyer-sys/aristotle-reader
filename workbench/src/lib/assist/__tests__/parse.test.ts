import { describe, expect, it } from 'vitest';
import { parseClaudeJson, parseCodexJsonl, parsePlainText } from '../parse';

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

describe('parsePlainText', () => {
  it('empty stdout -> { error, authLike: false }', () => {
    expect(parsePlainText('')).toEqual({ error: 'empty output', authLike: false });
    expect(parsePlainText('   \n\t ')).toEqual({ error: 'empty output', authLike: false });
  });

  it('plain prose -> { text }, trimmed', () => {
    expect(parsePlainText('  For thinking and being are the same.\n')).toEqual({
      text: 'For thinking and being are the same.',
    });
  });

  it('an auth-flavored plain-text error on stdout -> { error, authLike: true }', () => {
    const parsed = parsePlainText('Error: you are not authenticated. Please log in.');
    expect('error' in parsed && parsed.authLike).toBe(true);
  });

  it('non-auth prose that merely mentions ordinary words is not flagged auth-like', () => {
    const parsed = parsePlainText('The soul is in a way all existing things.');
    expect(parsed).toEqual({ text: 'The soul is in a way all existing things.' });
  });
});

describe('parseCodexJsonl', () => {
  it('extracts the last agent_message text from a realistic noisy JSONL stream', () => {
    const stdout = [
      '{"type":"reasoning","text":"thinking about the line"}',
      '{"type":"item.completed","item":{"id":"call_1","type":"mcp_tool_call","name":"noop"}}',
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"For thinking and being are the same."}}',
      '{"type":"turn.completed","usage":{"input_tokens":120,"output_tokens":9}}',
    ].join('\n');
    expect(parseCodexJsonl(stdout)).toEqual({ text: 'For thinking and being are the same.' });
  });

  it('when multiple agent_message events appear, returns the LAST one', () => {
    const stdout = [
      '{"type":"item.completed","item":{"type":"agent_message","text":"first draft"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"final answer"}}',
    ].join('\n');
    expect(parseCodexJsonl(stdout)).toEqual({ text: 'final answer' });
  });

  it('skips non-JSON noise lines without throwing', () => {
    const stdout = [
      'codex v0.142.4 starting...',
      '{not json',
      '{"type":"item.completed","item":{"type":"agent_message","text":"the answer"}}',
    ].join('\n');
    expect(() => parseCodexJsonl(stdout)).not.toThrow();
    expect(parseCodexJsonl(stdout)).toEqual({ text: 'the answer' });
  });

  it('no agent_message event -> { error: "no answer" }, auth-sniffing the raw stdout', () => {
    const noAnswer = '{"type":"turn.completed","usage":{}}';
    expect(parseCodexJsonl(noAnswer)).toEqual({ error: 'no answer', authLike: false });

    const authy = 'Please sign in to Codex first.\n{"type":"turn.completed"}';
    const parsed = parseCodexJsonl(authy);
    expect('error' in parsed && parsed.authLike).toBe(true);
  });

  it('empty stdout -> { error: "no answer" }', () => {
    expect(parseCodexJsonl('')).toEqual({ error: 'no answer', authLike: false });
  });

  it('trims the extracted agent_message text', () => {
    const stdout = '{"type":"item.completed","item":{"type":"agent_message","text":"  spaced out  "}}';
    expect(parseCodexJsonl(stdout)).toEqual({ text: 'spaced out' });
  });
});
