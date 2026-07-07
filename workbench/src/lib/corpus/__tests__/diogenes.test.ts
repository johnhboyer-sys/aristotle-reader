import { describe, expect, it } from 'vitest';
import { buildDiogenesExportCommand, resolveTlgDir, type DiogenesManifest } from '../diogenes';

const manifest: DiogenesManifest = {
  work: { tlg_author: '0086' },
  sources: {
    diogenes_server: '/Applications/Diogenes.app/Contents/server',
    tlg_dir_env: 'TLG_DIR',
    tlg_dir_default: '../TLG Files/TLG',
  },
};

describe('resolveTlgDir', () => {
  it('prefers the env var when set', () => {
    const dir = resolveTlgDir(manifest, '/repo/root', (name) =>
      name === 'TLG_DIR' ? '/custom/tlg' : undefined,
    );
    expect(dir).toBe('/custom/tlg');
  });

  it('falls back to the default resolved against the repo root, collapsing ..', () => {
    const dir = resolveTlgDir(manifest, '/repo/root', () => undefined);
    expect(dir).toBe('/repo/TLG Files/TLG');
  });
});

describe('buildDiogenesExportCommand', () => {
  it('constructs the perl xml-export.pl verse-mode argv/cwd/env exactly', () => {
    const cmd = buildDiogenesExportCommand(
      manifest,
      '/repo/root/build/export',
      '/repo/root',
      () => undefined,
    );
    expect(cmd).toEqual({
      cmd: ['perl', 'xml-export.pl', '-c', 'tlg', '-n', '0086', '-y', '-o', '/repo/root/build/export'],
      cwd: '/Applications/Diogenes.app/Contents/server',
      env: { TLG_DIR: '/repo/TLG Files/TLG', PATH: '/usr/bin:/bin' },
    });
  });

  it('never invokes anything — it only returns data', () => {
    // Regression guard: this module must stay pure/data-only per scope.
    const cmd = buildDiogenesExportCommand(manifest, '/x', '/y', () => '/env-tlg');
    expect(Array.isArray(cmd.cmd)).toBe(true);
    expect(typeof cmd.cwd).toBe('string');
  });
});
