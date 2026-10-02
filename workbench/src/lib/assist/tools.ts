/**
 * CLI tool registry (D7 §"Provider registry").
 *
 * What the window knows about each AI CLI: its label and how to read its
 * output. Which program runs, and with what arguments, Rust decides
 * (`AssistTool` in src-tauri/src/jobs.rs, the custom command in
 * src-tauri/src/sandbox.rs) — the window names a tool and sends a prompt,
 * never a program or argv (workbench-design/sandboxing-plan.md).
 *
 * Pure data + parser references: no IO, no Tauri, no editor/model/library
 * coupling (isolation.test.ts enforces that).
 */

import type { ParseResult } from './parse';
import { parseClaudeJson, parseCodexJsonl, parsePlainText } from './parse';

export type CliToolId = 'claude' | 'codex' | 'gemini' | 'custom';

export interface CliToolSpec {
  id: CliToolId;
  /** Human label for the settings picker. */
  label: string;
  /** How to turn the tool's raw stdout into a ParseResult. */
  parseOutput(stdout: string): ParseResult;
}

/** The built-in registry, keyed by id. Claude prints a JSON envelope, Codex a
 * JSONL event stream (`--json`); Gemini's plain text is UNVERIFIED — no
 * gemini was installed where the flags were checked. */
export const CLI_TOOLS: Record<'claude' | 'codex' | 'gemini', CliToolSpec> = {
  claude: { id: 'claude', label: 'Claude Code', parseOutput: parseClaudeJson },
  codex: { id: 'codex', label: 'Codex (OpenAI)', parseOutput: parseCodexJsonl },
  gemini: { id: 'gemini', label: 'Gemini', parseOutput: parsePlainText },
};

/** The user's own command, approved in a native confirmation; plain stdout. */
export const CUSTOM_TOOL: CliToolSpec = { id: 'custom', label: 'Custom', parseOutput: parsePlainText };
