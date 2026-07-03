import { describe, expect, it } from 'vitest';
import {
  pandocDocxArgs,
  resolvePandocProgram,
  runPandocTauri,
  PANDOC_SCOPE_CANDIDATES,
} from '../pandoc';
import type { PandocDocxJob } from '../pandoc';

describe('pandocDocxArgs', () => {
  it('builds the markdown→docx argv, reference-doc optional', () => {
    const job: PandocDocxJob = { markdownPath: '/tmp/in.md', docxPath: '/tmp/out.docx' };
    expect(pandocDocxArgs(job)).toEqual(['-f', 'markdown', '-t', 'docx', '-o', '/tmp/out.docx', '/tmp/in.md']);
    expect(pandocDocxArgs({ ...job, referenceDocPath: '/r.docx' })).toEqual([
      '-f', 'markdown', '-t', 'docx', '-o', '/tmp/out.docx', '--reference-doc', '/r.docx', '/tmp/in.md',
    ]);
  });
});

describe('resolvePandocProgram (GUI-PATH fix)', () => {
  it('prefers the Homebrew absolute path when it exists', async () => {
    const program = await resolvePandocProgram(async (p) => p === '/opt/homebrew/bin/pandoc');
    expect(program).toBe('pandoc-homebrew');
  });

  it('falls back to /usr/local when Homebrew is absent', async () => {
    const program = await resolvePandocProgram(async (p) => p === '/usr/local/bin/pandoc');
    expect(program).toBe('pandoc-usr-local');
  });

  it('falls back to the bare name when no absolute candidate exists', async () => {
    const program = await resolvePandocProgram(async () => false);
    expect(program).toBe('pandoc');
  });

  it('treats a throwing exists probe as "not found" and degrades to the bare name', async () => {
    const program = await resolvePandocProgram(async () => {
      throw new Error('no fs plugin here');
    });
    expect(program).toBe('pandoc');
  });

  it('probes candidates in declared preference order', async () => {
    const probed: string[] = [];
    await resolvePandocProgram(async (p) => {
      probed.push(p);
      return false;
    });
    expect(probed).toEqual(PANDOC_SCOPE_CANDIDATES.map((c) => c.path));
  });
});

describe('runPandocTauri program threading', () => {
  function fakeShell() {
    const calls: Array<{ program: string; args: string[] }> = [];
    return {
      calls,
      shell: {
        Command: {
          create(program: string, args: string[]) {
            calls.push({ program, args });
            return {
              execute: async () => ({ code: 0, stdout: '', stderr: '' }),
            };
          },
        },
      },
    };
  }

  const job: PandocDocxJob = { markdownPath: '/tmp/in.md', docxPath: '/tmp/out.docx' };

  it('uses an explicitly resolved program name unchanged', async () => {
    const { calls, shell } = fakeShell();
    const result = await runPandocTauri(job, shell, 'pandoc-homebrew');
    expect(result.code).toBe(0);
    expect(calls).toEqual([{ program: 'pandoc-homebrew', args: pandocDocxArgs(job) }]);
  });

  it('resolves to a scope name itself when none is passed (degrading to bare "pandoc" outside Tauri)', async () => {
    const { calls, shell } = fakeShell();
    await runPandocTauri(job, shell);
    // In this Node/vitest environment plugin-fs's `exists` cannot succeed, so
    // the internal resolution degrades to the bare name — the pre-fix behavior.
    expect(calls).toHaveLength(1);
    expect(calls[0].program).toBe('pandoc');
    expect(calls[0].args).toEqual(pandocDocxArgs(job));
  });
});
