import { describe, expect, it } from 'vitest';
import { CLI_TOOLS, specForCustom, type CliToolSpec } from '../tools';
import { parseClaudeJson, parseCodexJsonl, parsePlainText } from '../parse';

const CODEX_ARGS = ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', '-c', 'mcp_servers={}', '-'];

const HOME = '/Users/john';

describe('CLI_TOOLS registry', () => {
  it('has specs for claude, codex, gemini keyed by id', () => {
    expect(CLI_TOOLS.claude.id).toBe('claude');
    expect(CLI_TOOLS.codex.id).toBe('codex');
    expect(CLI_TOOLS.gemini.id).toBe('gemini');
  });

  it('claude spec: known-good flags, stdin, JSON parser, historical ladder', () => {
    const spec = CLI_TOOLS.claude;
    expect(spec.binName).toBe('claude');
    expect(spec.args).toEqual([
      '-p',
      '--output-format',
      'json',
      '--strict-mcp-config',
      '--mcp-config',
      '{"mcpServers":{}}',
    ]);
    expect(spec.promptVia).toBe('stdin');
    expect(spec.parseOutput).toBe(parseClaudeJson);
    expect(spec.candidatePaths(HOME)).toEqual([
      `${HOME}/.claude/local/claude`,
      `${HOME}/.local/bin/claude`,
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
    ]);
  });

  it('codex spec: verified exec/--json/skip-git-check invocation, stdin, JSONL parser, codex ladder', () => {
    const spec = CLI_TOOLS.codex;
    expect(spec.binName).toBe('codex');
    expect(spec.args).toEqual(CODEX_ARGS);
    expect(spec.promptVia).toBe('stdin');
    expect(spec.parseOutput).toBe(parseCodexJsonl);
    expect(spec.candidatePaths(HOME)).toEqual([
      '/opt/homebrew/bin/codex',
      `${HOME}/.local/bin/codex`,
      '/usr/local/bin/codex',
      `${HOME}/.codex/bin/codex`,
    ]);
  });

  it('gemini spec: prompt-as-arg, plain-text parser, gemini ladder', () => {
    const spec = CLI_TOOLS.gemini;
    expect(spec.binName).toBe('gemini');
    expect(spec.args).toEqual(['-p']);
    expect(spec.promptVia).toBe('arg');
    expect(spec.parseOutput).toBe(parsePlainText);
    expect(spec.candidatePaths(HOME)).toEqual([
      `${HOME}/.gemini/bin/gemini`,
      `${HOME}/.local/bin/gemini`,
      '/opt/homebrew/bin/gemini',
      '/usr/local/bin/gemini',
    ]);
  });

  // Table test over the built-in specs' invariant properties.
  const table: [keyof typeof CLI_TOOLS, string[], 'stdin' | 'arg', (s: string) => unknown][] = [
    ['claude', ['-p', '--output-format', 'json', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'], 'stdin', parseClaudeJson],
    ['codex', CODEX_ARGS, 'stdin', parseCodexJsonl],
    ['gemini', ['-p'], 'arg', parsePlainText],
  ];
  it.each(table)('%s spec matches its expected args/promptVia/parser', (id, args, promptVia, parser) => {
    const spec: CliToolSpec = CLI_TOOLS[id];
    expect(spec.args).toEqual(args);
    expect(spec.promptVia).toBe(promptVia);
    expect(spec.parseOutput).toBe(parser);
  });
});

describe('specForCustom', () => {
  it('uses the supplied binPath as its only candidate, plain-text parser, no command -v rung', () => {
    const spec = specForCustom({ binPath: '/opt/mytool/bin/ai', args: ['--go'], promptVia: 'arg' });
    expect(spec.id).toBe('custom');
    expect(spec.binName).toBe(''); // no name-based command -v rung
    expect(spec.args).toEqual(['--go']);
    expect(spec.promptVia).toBe('arg');
    expect(spec.parseOutput).toBe(parsePlainText);
    expect(spec.candidatePaths('/whatever')).toEqual(['/opt/mytool/bin/ai']);
  });

  it('defaults: no args, stdin prompt channel, empty candidate list when binPath is absent', () => {
    const spec = specForCustom(undefined);
    expect(spec.args).toEqual([]);
    expect(spec.promptVia).toBe('stdin');
    expect(spec.candidatePaths('/whatever')).toEqual([]);
  });

  it('partial config: binPath present but args/promptVia omitted falls to defaults', () => {
    const spec = specForCustom({ binPath: '/usr/bin/foo' });
    expect(spec.args).toEqual([]);
    expect(spec.promptVia).toBe('stdin');
    expect(spec.candidatePaths('/h')).toEqual(['/usr/bin/foo']);
  });
});
