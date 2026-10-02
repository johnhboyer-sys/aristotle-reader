/**
 * "Add work from TLG" exports through the same Rust job as the disc importer,
 * `diogenes_export`, and shares its cache. It used to run perl through a
 * shell-plugin scope the window could call with its own arguments.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Set<string>();
const calls: { cmd: string; args?: Record<string, unknown> }[] = [];
let run = { code: 0, stdout: '', stderr: '', timed_out: false, spawned: true };

const OUT_DIR = '/appdata/corpus/disc-export/lines';
const XML = `${OUT_DIR}/Diogenes-Resources/xml/tlg/tlg0086031.xml`;

vi.mock('@tauri-apps/plugin-fs', () => ({ exists: async (path: string) => files.has(path) }));
vi.mock('@tauri-apps/api/path', () => ({ appDataDir: async () => '/appdata/' }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    if (cmd === 'diogenes_status') return '/Applications/Diogenes.app/Contents/server';
    if (cmd === 'diogenes_export') return { out_dir: OUT_DIR, run };
    throw new Error(`unexpected command ${cmd}`);
  },
}));

const { diogenesAvailable, exportWorkXml } = await import('../onboarding');

beforeEach(() => {
  files.clear();
  calls.length = 0;
  run = { code: 0, stdout: '', stderr: '', timed_out: false, spawned: true };
});

describe('onboarding export', () => {
  it('asks Rust whether Diogenes is installed', async () => {
    expect(await diogenesAvailable()).toBe(true);
    expect(calls).toEqual([{ cmd: 'diogenes_status', args: undefined }]);
  });

  it('exports in lines mode by naming data only, and reads where Rust wrote', async () => {
    expect(await exportWorkXml('0086', '031', '/Users/u/TLG')).toBe(XML);
    expect(calls).toEqual([
      { cmd: 'diogenes_export', args: { corpus: 'tlg', author: '0086', lineMode: 'lines', discDir: '/Users/u/TLG' } },
    ]);
  });

  it('uses an earlier export without running anything', async () => {
    files.add(XML);
    expect(await exportWorkXml('0086', '031', '/Users/u/TLG')).toBe(XML);
    expect(calls).toEqual([]);
  });

  it('returns null when the export fails', async () => {
    run = { ...run, code: 2 };
    expect(await exportWorkXml('0086', '031', '/Users/u/TLG')).toBeNull();
  });
});
