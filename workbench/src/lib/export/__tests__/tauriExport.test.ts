/**
 * Export runs pandoc through two Rust jobs (src-tauri/src/commands.rs):
 * `pandoc_version` says which pandoc Rust would use, `export_docx` runs it.
 * The window names the files; it never names a program or an argument.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { cmd: string; args?: Record<string, unknown> }[] = [];
let answers: Record<string, unknown> = {};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    return answers[cmd];
  },
}));

const { resolveExportPandoc, PANDOC_CONFIGURED_UNAVAILABLE_MESSAGE } = await import('../tauriExport');
const { PANDOC_UNAVAILABLE_MESSAGE } = await import('../pandoc');

beforeEach(() => {
  calls.length = 0;
  answers = {};
});

describe('resolveExportPandoc', () => {
  it('says the picked pandoc will not run, rather than using another', async () => {
    answers.pandoc_version = { picked: '/Users/u/bin/pandoc', version: null };
    expect(await resolveExportPandoc()).toEqual({ message: PANDOC_CONFIGURED_UNAVAILABLE_MESSAGE });
    expect(calls.map((c) => c.cmd)).toEqual(['pandoc_version']);
  });

  it('says pandoc is missing when none is picked or found', async () => {
    answers.pandoc_version = { picked: null, version: null };
    expect(await resolveExportPandoc()).toEqual({ message: PANDOC_UNAVAILABLE_MESSAGE });
  });

  it('exports by naming the files only', async () => {
    answers.pandoc_version = { picked: null, version: 'pandoc 3.6' };
    answers.export_docx = { code: 0, stdout: '', stderr: '', timed_out: false, spawned: true };
    const pandoc = await resolveExportPandoc();
    if (!('run' in pandoc)) throw new Error('expected a runner');
    const result = await pandoc.run({ markdownPath: '/appdata/e.md', docxPath: '/u/Out.docx', referenceDocPath: '/u/ref.docx' });
    expect(result.code).toBe(0);
    expect(calls[1]).toEqual({
      cmd: 'export_docx',
      args: { md: '/appdata/e.md', docx: '/u/Out.docx', referenceDoc: '/u/ref.docx' },
    });
  });

  it('reports a pandoc that never started as no exit code', async () => {
    answers.pandoc_version = { picked: null, version: 'pandoc 3.6' };
    answers.export_docx = { code: null, stdout: '', stderr: '', timed_out: false, spawned: false };
    const pandoc = await resolveExportPandoc();
    if (!('run' in pandoc)) throw new Error('expected a runner');
    expect((await pandoc.run({ markdownPath: '/a', docxPath: '/b.docx' })).code).toBeNull();
    expect(calls[1].args).toEqual({ md: '/a', docx: '/b.docx', referenceDoc: null });
  });
});
