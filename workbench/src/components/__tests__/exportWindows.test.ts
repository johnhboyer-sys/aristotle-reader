// Wiring of the two export windows (source-scan style: no headless DOM here;
// the logic is tested in lib/export/__tests__/choices.test.ts).
import { beforeAll, describe, expect, it } from 'vitest';

const src: Record<string, string> = {};

beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
    readFileSync(path: string, encoding: 'utf-8'): string;
  };
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
    fileURLToPath(url: URL): string;
  };
  for (const name of ['ExportButton', 'CompileDialog', 'ChapterExportDialog', 'ExportChoices']) {
    src[name] = fs.readFileSync(nodeUrl.fileURLToPath(new URL(`../${name}.svelte`, import.meta.url)), 'utf-8');
  }
});

describe('whole-work export window', () => {
  it('closes itself once the reveal has started, only when exportFinish says so', () => {
    const d = src.CompileDialog;
    const reveal = d.indexOf('opener.revealItemInDir(savePath)');
    expect(reveal).toBeGreaterThan(-1);
    const close = d.indexOf('if (finish.close) onClose();');
    expect(close).toBeGreaterThan(reveal);
    expect(d).toContain('exportFinish(referenceNote)');
  });

  it('does not close on a failed export or a cancel', () => {
    expect(src.CompileDialog.match(/onClose\(\)/g)?.length).toBe(1);
  });
});

describe('single-chapter export', () => {
  it('opens a window with the whole-work choices instead of exporting at once', () => {
    const b = src.ExportButton;
    expect(b).toContain('onclick={() => (chapterOpen = true)}');
    expect(b).toContain('<ChapterExportDialog');
    expect(b).toContain('async function exportChapter(choices: ExportChoices)');
  });

  it('passes the choices to the chapter renderer', () => {
    const b = src.ExportButton;
    for (const key of ['mode: choices.mode', 'bilingualLayout: choices.bilingualLayout', 'bilingualOrder: choices.bilingualOrder']) {
      expect(b).toContain(key);
    }
  });

  it('seeds the choices from Settings › Export, as the whole-work window does', () => {
    expect(src.ChapterExportDialog).toContain('seedChoices(await exportSettings()');
    expect(src.CompileDialog).toContain('seedChoices(prefs');
  });

  it('both windows show the one shared set of choices', () => {
    expect(src.ChapterExportDialog).toContain('<ExportChoices');
    expect(src.CompileDialog).toContain('<ExportChoices');
  });
});
