import { describe, expect, it } from 'vitest';
import { CLI_TOOLS, CUSTOM_TOOL } from '../tools';
import { parseClaudeJson, parseCodexJsonl, parsePlainText } from '../parse';

// Each tool's program and arguments live in Rust (src-tauri/src/jobs.rs);
// the window keeps only what it shows and how it reads the answer.
describe('CLI_TOOLS registry', () => {
  it('has specs for claude and codex keyed by id (Gemini disabled until tested)', () => {
    expect(Object.keys(CLI_TOOLS)).toEqual(['claude', 'codex']);
    for (const [id, spec] of Object.entries(CLI_TOOLS)) expect(spec.id).toBe(id);
  });

  it('reads each tool’s output with its own parser', () => {
    expect(CLI_TOOLS.claude.parseOutput).toBe(parseClaudeJson);
    expect(CLI_TOOLS.codex.parseOutput).toBe(parseCodexJsonl);
    expect(CUSTOM_TOOL.parseOutput).toBe(parsePlainText);
  });

  it('carries no program path or argument', () => {
    for (const spec of [...Object.values(CLI_TOOLS), CUSTOM_TOOL]) {
      expect(Object.keys(spec).sort()).toEqual(['id', 'label', 'parseOutput']);
    }
  });
});
