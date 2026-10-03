// Pure helpers for the AssistSettings UI (D7 §"Settings UI", Slice C).
import { beforeAll, describe, expect, it } from 'vitest';
import {
  providerOptions,
  detectLabel,
  CLI_TOOL_IDS,
} from '../assistSettingsOptions';

describe('providerOptions', () => {
  it('marks the three API-key providers experimental, and nothing else (John 2026-10-03)', () => {
    const experimental = providerOptions()
      .filter((o) => o.experimental)
      .map((o) => o.id);
    expect(experimental).toEqual(['openai', 'anthropic', 'google']);
  });

  it('lists the built-in CLIs, custom, then the three API providers', () => {
    const opts = providerOptions();
    // No Gemini: disabled until its own tools can be switched off and that is
    // tested (workbench-design/sandboxing-plan.md).
    expect(opts.map((o) => o.id)).toEqual([
      'claude',
      'codex',
      'custom',
      'openai',
      'anthropic',
      'google',
    ]);
  });

  it('groups each option correctly', () => {
    const opts = providerOptions();
    const byId = Object.fromEntries(opts.map((o) => [o.id, o.group]));
    expect(byId.claude).toBe('cli');
    expect(byId.codex).toBe('cli');
    expect(byId.custom).toBe('custom');
    expect(byId.openai).toBe('api');
    expect(byId.anthropic).toBe('api');
    expect(byId.google).toBe('api');
  });

  it('uses the registry labels for built-in CLIs', () => {
    const opts = providerOptions();
    const label = (id: string) => opts.find((o) => o.id === id)?.label;
    expect(label('claude')).toBe('Claude Code');
    expect(label('codex')).toBe('Codex (OpenAI)');
    expect(label('custom')).toBe('Custom command');
  });
});

describe('CLI_TOOL_IDS', () => {
  it('is exactly the built-in tool ids', () => {
    expect([...CLI_TOOL_IDS].sort()).toEqual(['claude', 'codex']);
  });
});

describe('detectLabel', () => {
  it('maps each detect state to its status sentence', () => {
    expect(detectLabel('unknown')).toBe('');
    expect(detectLabel('checking')).toBe('Checking…');
    expect(detectLabel('not-found')).toBe('Not found');
    expect(detectLabel('found', '/opt/homebrew/bin/claude')).toBe('Found: /opt/homebrew/bin/claude');
    expect(detectLabel('found')).toBe('Found');
  });
});

// ── Settings › AI says what leaves the machine (source scan) ───────────────

describe('AssistSettings text (source scan)', () => {
  let src = '';
  beforeAll(async () => {
    const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
      readFileSync(path: string, encoding: 'utf-8'): string;
    };
    const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
      fileURLToPath(url: URL): string;
    };
    src = fs.readFileSync(
      nodeUrl.fileURLToPath(new URL('../../../components/AssistSettings.svelte', import.meta.url)),
      'utf-8',
    );
  });

  it('keeps the promise the resolver now honours: no choice copies, never sends', () => {
    expect(src).toContain('with no choice, the app just copies the');
    expect(src).toContain('Copy to clipboard only');
  });

  it('says what is sent, to whom, and that nothing else leaves the Mac', () => {
    expect(src).toContain('What leaves this Mac');
    expect(src).toContain('Perseus or FREED');
    expect(src).toContain('no usage data');
  });

  it('lists allowed providers with a way to take each back', () => {
    expect(src).toContain('revokeConsent(');
    expect(src).toContain('>Take back<');
  });

  it('tags experimental choices and says why beside the key fields', () => {
    expect(src).toContain('opt.experimental');
    expect(src).toContain("haven't been tried with a real key yet");
    expect(src).toContain('unencrypted');
  });
});
