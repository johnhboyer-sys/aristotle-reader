/**
 * The disc importer runs Diogenes through one Rust job, `diogenes_export`
 * (src-tauri/src/commands.rs). The window names the corpus, the author, the
 * line mode and the disc folder; Rust picks perl and Diogenes, builds the
 * arguments and chooses the output folder.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
const calls: { cmd: string; args?: Record<string, unknown> }[] = [];
let diogenes: string | null = '/Applications/Diogenes.app/Contents/server';

const OUT_DIR = '/appdata/corpus/disc-export/lines';
const XML_PATH = `${OUT_DIR}/Diogenes-Resources/xml/tlg/tlg0086031.xml`;
const XML = `<TEI.2><text><body>
  <div1 type="Bekker page" n="184a">
    <l n="10">ἐπειδὴ τὸ εἰδέναι</l>
    <l n="11">καὶ τὸ ἐπίστασθαι</l>
  </div1>
</body></text></TEI.2>`;

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: async (path: string) => files.has(path),
  readTextFile: async (path: string) => files.get(path) ?? '',
  readFile: async (path: string) => new TextEncoder().encode(files.get(path) ?? ''),
}));
vi.mock('@tauri-apps/api/path', () => ({ appDataDir: async () => '/appdata/' }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    if (cmd === 'diogenes_status') return diogenes;
    if (cmd === 'diogenes_export') {
      files.set(XML_PATH, XML);
      return { out_dir: OUT_DIR, run: { code: 0, stdout: '', stderr: '', timed_out: false, spawned: true } };
    }
    throw new Error(`unexpected command ${cmd}`);
  },
}));

const { importFromDisc, NO_DIOGENES_MESSAGE } = await import('../discImport');

const REQUEST = {
  discDir: '/disc',
  author: { id: 'TLG0086', name: 'Aristoteles Phil.' },
  work: { number: '031', title: 'Physica', levelNames: ['Bekker page', 'line'] },
};

beforeEach(() => {
  files.clear();
  calls.length = 0;
  diogenes = '/Applications/Diogenes.app/Contents/server';
});

describe('importing from a disc', () => {
  it('asks Rust for the export by naming data only', async () => {
    const imported = await importFromDisc(REQUEST);
    expect(imported.file.greekLines.join(' ')).toContain('ἐπειδὴ');
    expect(calls).toEqual([
      { cmd: 'diogenes_status', args: undefined },
      { cmd: 'diogenes_export', args: { corpus: 'tlg', author: '0086', lineMode: 'lines', discDir: '/disc' } },
    ]);
  });

  it('reads a cached export without running anything', async () => {
    files.set(XML_PATH, XML);
    await importFromDisc(REQUEST);
    expect(calls).toEqual([]);
  });

  it('says Diogenes is needed when Rust finds none', async () => {
    diogenes = null;
    await expect(importFromDisc(REQUEST)).rejects.toThrow(NO_DIOGENES_MESSAGE);
    expect(calls.map((c) => c.cmd)).toEqual(['diogenes_status']);
  });
});
