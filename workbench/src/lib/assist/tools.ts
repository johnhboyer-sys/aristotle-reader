/**
 * CLI tool registry (D7 §"Provider registry", Slice A — pure).
 *
 * Today the assist layer knows how to drive four kinds of AI CLI, each with
 * its own binary-resolution ladder, print/non-interactive flags, prompt
 * delivery channel, and output parser. This module is the single source of
 * truth for those specs. It is pure data + parser references: no IO, no Tauri,
 * no editor/model/library coupling (isolation.test.ts enforces that).
 *
 * The Claude spec is the known-good one, carried over verbatim from the
 * hardcoded d4 path (`claude -p --output-format json`, prompt over stdin,
 * `parseClaudeJson`). The Codex and Gemini specs encode BEST-EFFORT
 * non-interactive invocations — see the per-spec comments for what was
 * verified against the installed `--help` versus documented-default guesses.
 * The `custom` spec is the reliable escape hatch: the user points it at any
 * binary with any args and either prompt channel, and it parses plain stdout.
 */

import type { ParseResult } from './parse';
import { parseClaudeJson, parseCodexJsonl, parsePlainText } from './parse';

export type CliToolId = 'claude' | 'codex' | 'gemini' | 'custom';

export interface CliToolSpec {
  id: CliToolId;
  /** Human label for the settings picker. */
  label: string;
  /** The bare binary name for the `command -v <binName>` login-shell rung. */
  binName: string;
  /** Per-tool absolute candidate ladder, in priority order. */
  candidatePaths(home: string): string[];
  /** Fixed print / non-interactive flags (prepended to any prompt-as-arg). */
  args: string[];
  /** How the composed prompt reaches the tool: piped on stdin, or a trailing argv element. */
  promptVia: 'stdin' | 'arg';
  /** How to turn the tool's raw stdout into a ParseResult. */
  parseOutput(stdout: string): ParseResult;
}

// ---------------------------------------------------------------------------
// Built-in specs
// ---------------------------------------------------------------------------

/**
 * Claude Code — `claude -p --output-format json` prints a JSON envelope whose
 * `result` field is plain prose; `parseClaudeJson` extracts it. Prompt over
 * stdin. Ladder = the historical claude candidatePaths (see detect.ts).
 *
 * `--strict-mcp-config --mcp-config {"mcpServers":{}}` runs with NO MCP servers:
 * Claude Code otherwise loads the user's globally-configured MCP servers
 * (~/.claude.json) on startup regardless of cwd, and any of those (e.g. an
 * Apple Music integration) launching would touch protected folders — attributed
 * to the parent .app under macOS TCC → a prompt storm. A plain translation
 * needs no MCP tools, so an empty strict config keeps startup clean and fast.
 * Verified 2026-07-06 against claude 2.1.201: same JSON envelope, correct result.
 */
const CLAUDE_SPEC: CliToolSpec = {
  id: 'claude',
  label: 'Claude Code',
  binName: 'claude',
  candidatePaths(home: string): string[] {
    return [
      `${home}/.claude/local/claude`,
      `${home}/.local/bin/claude`,
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
    ];
  },
  args: ['-p', '--output-format', 'json', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'],
  promptVia: 'stdin',
  parseOutput: parseClaudeJson,
};

/**
 * Codex (OpenAI CLI) — non-interactive `exec` mode.
 *
 * VERIFIED against the installed Codex CLI v0.142.4 (hand-tested 2026-07-03):
 *   - Non-interactive mode is `codex exec`. It REQUIRES `--skip-git-repo-check`
 *     — the app runs outside a git repo, and without it `codex exec` exits 1
 *     with "Not inside a trusted directory".
 *   - Prompt via stdin: a trailing `-` positional makes codex read the prompt
 *     from stdin. So promptVia 'stdin' and `args` ends with `-`.
 *   - Output is a JSONL EVENT STREAM (`--json`), not plain stdout. The finished
 *     translation is the last `item.completed` / `agent_message` event; the
 *     stream also carries reasoning, mcp_tool_call, and turn.completed usage
 *     events. `parseCodexJsonl` extracts the last agent_message text.
 *   - `--sandbox read-only` keeps codex from touching the workspace; `-c
 *     mcp_servers={}` disables MCP servers so codex doesn't detour into tool
 *     calls for a plain translation (verified it still returns a clean answer).
 */
const CODEX_SPEC: CliToolSpec = {
  id: 'codex',
  label: 'Codex (OpenAI)',
  binName: 'codex',
  candidatePaths(home: string): string[] {
    return [
      '/opt/homebrew/bin/codex',
      `${home}/.local/bin/codex`,
      '/usr/local/bin/codex',
      `${home}/.codex/bin/codex`,
    ];
  },
  // VERIFIED (v0.142.4): exec + --json event stream + --skip-git-repo-check
  // (required outside a git repo) + read-only sandbox + MCP disabled + stdin `-`.
  args: ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', '-c', 'mcp_servers={}', '-'],
  promptVia: 'stdin',
  parseOutput: parseCodexJsonl,
};

/**
 * Gemini (Google CLI) — non-interactive one-shot mode.
 *
 * BEST-EFFORT: unverified flags — no `gemini` binary is installed on this
 * machine, so these are the documented Google Gemini CLI defaults, not
 * hand-tested. The public CLI takes a one-shot prompt via `-p`/`--prompt`
 * (a positional arg), printing the answer as plain text. We encode promptVia
 * 'arg' with a leading `-p` sentinel replaced by the prompt; because we append
 * the prompt as the trailing argv element, `args` here are the fixed flags and
 * the composed prompt is added by buildCliInvocation. If a given Gemini build
 * reads the prompt differently, the custom command covers the mismatch.
 */
const GEMINI_SPEC: CliToolSpec = {
  id: 'gemini',
  label: 'Gemini',
  binName: 'gemini',
  candidatePaths(home: string): string[] {
    return [
      `${home}/.gemini/bin/gemini`,
      `${home}/.local/bin/gemini`,
      '/opt/homebrew/bin/gemini',
      '/usr/local/bin/gemini',
    ];
  },
  // BEST-EFFORT: unverified flags — Gemini CLI takes the prompt as a positional
  // arg after `-p`; custom command covers mismatches.
  args: ['-p'],
  promptVia: 'arg',
  parseOutput: parsePlainText,
};

/** The built-in registry, keyed by id (custom is built per-settings via `specForCustom`). */
export const CLI_TOOLS: Record<'claude' | 'codex' | 'gemini', CliToolSpec> = {
  claude: CLAUDE_SPEC,
  codex: CODEX_SPEC,
  gemini: GEMINI_SPEC,
};

/** The settings shape a custom command supplies (structural — see AssistSettings.custom in settings.ts). */
export interface CustomToolConfig {
  binPath?: string;
  args?: string[];
  promptVia?: 'stdin' | 'arg';
}

/**
 * Build a CliToolSpec for a user-supplied custom command. The custom command
 * has no candidate ladder — its binary path comes straight from settings
 * (`custom.binPath`), so `candidatePaths` returns just that path when present
 * (or nothing) and `binName` is empty (no `command -v` rung: a custom command
 * is an explicit absolute path, never resolved by name). Output is parsed as
 * plain text (trim). Defaults: no extra args, prompt over stdin.
 */
export function specForCustom(custom: CustomToolConfig | undefined): CliToolSpec {
  const binPath = custom?.binPath;
  const args = custom?.args ?? [];
  const promptVia = custom?.promptVia ?? 'stdin';
  return {
    id: 'custom',
    label: 'Custom',
    binName: '', // no name-based `command -v` rung for a custom command
    candidatePaths(_home: string): string[] {
      return binPath ? [binPath] : [];
    },
    args,
    promptVia,
    parseOutput: parsePlainText,
  };
}
