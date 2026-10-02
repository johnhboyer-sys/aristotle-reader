// Settings › Export names line numbers for any text, not only Aristotle's
// Bekker lines (John, 2026-10-02). Source-scan style, like
// addWorkDialogEmptyState.test.ts.
import { beforeAll, describe, expect, it } from 'vitest';

let source = '';

beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
    readFileSync(path: string, encoding: 'utf-8'): string;
  };
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
    fileURLToPath(url: URL): string;
  };
  source = fs.readFileSync(nodeUrl.fileURLToPath(new URL('../ExportSettings.svelte', import.meta.url)), 'utf-8');
});

describe('Settings › Export: line numbers', () => {
  it('says "Line numbers", not "Bekker line numbers"', () => {
    expect(source).toContain('<legend>Line numbers</legend>');
    expect(source).not.toContain('Bekker line numbers');
  });

  it('names pages as well as columns', () => {
    expect(source).toContain('At each page or column start only');
  });
});
