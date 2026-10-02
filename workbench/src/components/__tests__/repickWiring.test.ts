// Phase 4 of workbench-design/sandboxing-plan.md: a stored folder or file the
// window may no longer use says so and offers "Choose … again". The logic is
// tested in lib/__tests__/picks.test.ts; these components have no headless DOM
// here, so what is checked is the wiring (source-scan style, like
// addWorkDialogEmptyState.test.ts).
import { beforeAll, describe, expect, it } from 'vitest';

const src: Record<string, string> = {};

beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
    readFileSync(path: string, encoding: 'utf-8'): string;
  };
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
    fileURLToPath(url: URL): string;
  };
  for (const name of [
    '../../App.svelte',
    '../LibraryRepickDialog.svelte',
    '../LibraryFolderSettings.svelte',
    '../AddWorkDialog.svelte',
    '../SourceImportDialog.svelte',
    '../ExportButton.svelte',
    '../CompileDialog.svelte',
    '../ExportSettings.svelte',
  ]) {
    src[name.split('/').pop()!] = fs.readFileSync(nodeUrl.fileURLToPath(new URL(name, import.meta.url)), 'utf-8');
  }
});

describe('the library folder', () => {
  it('is checked before the library loads, and the boot waits for the answer', () => {
    const app = src['App.svelte'];
    expect(app).toContain("import LibraryRepickDialog from './components/LibraryRepickDialog.svelte';");
    const check = app.indexOf('await libraryRootProblem()');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(app.indexOf('await reloadWorks();', check));
    expect(app).toContain('<LibraryRepickDialog');
  });

  it('holds the rest of the window still while it waits (Grok: Tab reached Settings)', () => {
    const app = src['App.svelte'];
    expect(app).toContain('<div class="shell" inert={libraryRepick !== null}>');
    // Mounted outside the inert shell, so its own buttons still work.
    expect(app).toMatch(/<\/div>\n\n\{#if libraryRepick\}\n  <LibraryRepickDialog/);
  });

  it('says plainly that the default location shows a different library', () => {
    const dialog = src['LibraryRepickDialog.svelte'];
    expect(dialog).not.toContain('The default keeps the library on this Mac');
    expect(dialog).toContain('won’t appear');
  });

  it('offers to choose it again, or to use the default location', () => {
    const dialog = src['LibraryRepickDialog.svelte'];
    expect(dialog).toContain("repickReason('library'");
    expect(dialog).toContain("chooseAgainLabel('library')");
    expect(dialog).toContain('repickLibraryRoot(');
    expect(dialog).toContain('Use the default location instead');
  });

  it('a new library folder is picked whole, two levels deep', () => {
    // pickLibraryFolder asks for recursive: true (lib/__tests__/picks.test.ts).
    expect(src['LibraryFolderSettings.svelte']).toContain("await pickLibraryFolder('Choose the shared folder for the library')");
    expect(src['LibraryFolderSettings.svelte']).not.toContain('dialog.open(');
  });
});

describe('the TLG/PHI folder', () => {
  it('Add work checks the saved folder and asks for it again with the reason', () => {
    const d = src['AddWorkDialog.svelte'];
    expect(d).toContain('await pickStatus(settings.tlgDir, true)');
    expect(d).toContain("repickReason('tlg'");
    expect(d).toContain("chooseAgainLabel('tlg')");
  });

  it('Add work says so when the folder picker itself fails', () => {
    const d = src['AddWorkDialog.svelte'];
    const fn = d.slice(d.indexOf('async function chooseTlgFolder'), d.indexOf('async function run('));
    expect(fn).toContain('try {');
    expect(fn).toContain('catch (err)');
  });

  it('Import a text checks the saved folder before reading it', () => {
    const d = src['SourceImportDialog.svelte'];
    const check = d.indexOf('await pickStatus(dir, true)');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(d.indexOf('await useDisc(usable, null)'));
    expect(d).toContain('repickReason(');
    expect(d).toContain('chooseAgainLabel(');
  });

  it('Import a text checks the PHI folder too, not only the TLG one', () => {
    const d = src['SourceImportDialog.svelte'];
    expect(d).toContain("for (const corpus of ['tlg', 'phi'] as const)");
    expect(d).toContain("repick.phi ? chooseAgainLabel('phi')");
    expect(d).toContain("repick.tlg ? chooseAgainLabel('tlg')");
  });
});

describe('the reference doc', () => {
  for (const name of ['ExportButton.svelte', 'CompileDialog.svelte']) {
    it(`${name} checks it before asking where to save, and stops with the reason`, () => {
      const d = src[name];
      const resolve = d.indexOf('await resolveReferenceDoc(');
      expect(resolve).toBeGreaterThan(-1);
      const save = Math.max(d.indexOf('await chooseDocxTarget('), d.indexOf('chooseDocxTarget(defaultPath)'));
      expect(save).toBeGreaterThan(-1);
      expect(resolve).toBeLessThan(save);
      expect(d).toContain("'problem' in reference");
    });
  }

  it('the chapter export shows one short sentence, which fits its one-line note', () => {
    expect(src['ExportButton.svelte']).toContain('note(REFERENCE_REPICK_SHORT');
  });

  it('both exports say when a moved reference doc meant other styles', () => {
    expect(src['ExportButton.svelte']).toContain('reference.note');
    expect(src['CompileDialog.svelte']).toContain('reference.note');
  });

  it('the whole-work note wraps a long path instead of running out of the dialog (Grok)', () => {
    expect(src['CompileDialog.svelte']).toMatch(/\.note \{[^}]*overflow-wrap: anywhere;/);
  });

  it('the whole-work export says what to do after choosing the reference doc again', () => {
    expect(src['CompileDialog.svelte']).toContain("note = 'Reference document chosen. Click Export… to export.'");
  });

  it('Settings › Export says why and offers to choose it again', () => {
    const d = src['ExportSettings.svelte'];
    expect(d).toContain('await pickStatus(referenceDocPath)');
    expect(d).toContain("repickReason('reference'");
    expect(d).toContain("chooseAgainLabel('reference')");
  });
});
