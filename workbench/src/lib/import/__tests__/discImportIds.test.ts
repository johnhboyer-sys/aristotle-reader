/**
 * A second disc import of the same title must not land on the first.
 *
 * Work ids are slugs of the title, and the slug generator takes the ids
 * already in the library so it can step to "physica-2". The disc route never
 * passed them: two imports of Physica both came out as `physica`, and the
 * second overwrote the first — chapter file, registry entry, and any
 * translation typed into it.
 */
import { describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: async (path: string) => files.has(path),
  readTextFile: async (path: string) => files.get(path) ?? '',
  readFile: async (path: string) => new TextEncoder().encode(files.get(path) ?? ''),
}));

const { importFromDisc } = await import('../discImport');

const EXPORT_DIR = '/cache/lines';
const XML_PATH = `${EXPORT_DIR}/Diogenes-Resources/xml/tlg/tlg0086031.xml`;
const XML = `<TEI.2><text><body>
  <div1 type="Bekker page" n="184a">
    <l n="t">ΦΥΣΙΚΗΣ ΑΚΡΟΑΣΕΩΣ Α</l>
    <l n="10">ἐπειδὴ τὸ εἰδέναι</l>
    <l n="11">καὶ τὸ ἐπίστασθαι</l>
  </div1>
</body></text></TEI.2>`;

const REQUEST = {
  discDir: '/disc',
  author: { id: 'TLG0086', name: 'Aristoteles Phil.' },
  work: { number: '031', title: 'Physica', levelNames: ['Bekker page', 'line'] },
  exportDir: EXPORT_DIR,
};

describe('importing the same work from the disc twice', () => {
  it('gives the second import its own id', async () => {
    files.set(XML_PATH, XML);

    const first = await importFromDisc({ ...REQUEST, existingIds: [] });
    expect(first.work.id).toBe('physica');

    const second = await importFromDisc({ ...REQUEST, existingIds: [first.work.id] });
    expect(second.work.id).toBe('physica-2');
    expect(second.file.meta.work).toBe('physica-2');
  });

  it('keeps stepping past every id the library already holds', async () => {
    files.set(XML_PATH, XML);
    const third = await importFromDisc({ ...REQUEST, existingIds: ['physica', 'physica-2'] });
    expect(third.work.id).toBe('physica-3');
  });
});
