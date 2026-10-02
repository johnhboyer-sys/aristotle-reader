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

vi.mock('../../runtime', () => ({ isTauri: () => true }));
const existing = new Set<string>();
vi.mock('@tauri-apps/plugin-fs', () => ({ exists: async (path: string) => existing.has(path) }));
vi.mock('@tauri-apps/api/path', () => ({
  resolveResource: async (rel: string) => `/App.app/Contents/Resources/${rel}`,
}));
const BUNDLED = '/App.app/Contents/Resources/resources/reference.docx';

const { chooseDocxTarget, resolveExportPandoc, resolveReferenceDoc, PANDOC_CONFIGURED_UNAVAILABLE_MESSAGE, REFERENCE_REPICK_SHORT } = await import('../tauriExport');
const { PANDOC_UNAVAILABLE_MESSAGE } = await import('../pandoc');

beforeEach(() => {
  calls.length = 0;
  answers = {};
  existing.clear();
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

  it('explains a run that timed out or never started instead of reporting a null exit code', async () => {
    answers.pandoc_version = { picked: null, version: 'pandoc 3.6' };
    const pandoc = await resolveExportPandoc();
    if (!('run' in pandoc)) throw new Error('expected a runner');
    answers.export_docx = { code: null, stdout: '', stderr: '', timed_out: true, spawned: true };
    expect((await pandoc.run({ markdownPath: '/a', docxPath: '/b.docx' })).stderr).toBe('Pandoc took too long and was stopped.');
    answers.export_docx = { code: null, stdout: '', stderr: '', timed_out: false, spawned: false };
    expect((await pandoc.run({ markdownPath: '/a', docxPath: '/b.docx' })).stderr).toBe("Pandoc couldn't be started.");
  });
});

describe('chooseDocxTarget', () => {
  it('asks Rust to open the save dialog, so export_docx will accept the file', async () => {
    answers.choose_docx_target = '/Users/u/Physics 1.1.docx';
    expect(await chooseDocxTarget('/Users/u/Exports/Physics 1.1.docx')).toBe('/Users/u/Physics 1.1.docx');
    expect(calls).toEqual([{ cmd: 'choose_docx_target', args: { defaultPath: '/Users/u/Exports/Physics 1.1.docx' } }]);
  });

  it('is null when the user cancels', async () => {
    answers.choose_docx_target = null;
    expect(await chooseDocxTarget('Out.docx')).toBeNull();
  });
});

describe('resolveReferenceDoc', () => {
  it('uses the reference doc the user picked', async () => {
    answers.pick_status = 'ok';
    expect(await resolveReferenceDoc('/Users/u/House.docx')).toEqual({ path: '/Users/u/House.docx' });
    expect(calls).toEqual([{ cmd: 'pick_status', args: { path: '/Users/u/House.docx', deep: false } }]);
  });

  it('asks for it again when it was not picked, instead of quietly exporting without it', async () => {
    answers.pick_status = 'not-picked';
    existing.add(BUNDLED);
    for (const fallback of [true, false]) {
      const choice = await resolveReferenceDoc('/Users/u/House.docx', fallback);
      expect(choice).toHaveProperty('problem');
      if (!('problem' in choice)) throw new Error('expected a problem');
      expect(choice.problem).toContain('reference document');
      expect(choice.problem).toContain('Settings › Export');
    }
  });

  it('still falls back when a picked one has since gone, as it always has, but says so', async () => {
    answers.pick_status = 'missing';
    existing.add(BUNDLED);
    const withBundled = await resolveReferenceDoc('/Users/u/Gone.docx');
    expect(withBundled).toMatchObject({ path: BUNDLED });
    const without = await resolveReferenceDoc('/Users/u/Gone.docx', false);
    expect(without).toMatchObject({ path: undefined });
    for (const choice of [withBundled, without]) {
      if (!('note' in choice) || !choice.note) throw new Error('expected a note');
      expect(choice.note).toContain('/Users/u/Gone.docx');
    }
  });

  it('has a one-sentence form of the problem for the chapter export', () => {
    expect(REFERENCE_REPICK_SHORT).toBe('Choose your reference document again in Settings › Export.');
  });

  it('uses the bundled one, or none, when nothing is set', async () => {
    existing.add(BUNDLED);
    expect(await resolveReferenceDoc(undefined)).toEqual({ path: BUNDLED });
    expect(await resolveReferenceDoc(undefined, false)).toEqual({ path: undefined });
    existing.clear();
    expect(await resolveReferenceDoc(undefined)).toEqual({ path: undefined });
    expect(calls).toEqual([]);
  });
});
