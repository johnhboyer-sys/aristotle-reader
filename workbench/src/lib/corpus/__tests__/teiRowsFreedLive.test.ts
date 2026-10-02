// Live check of teiRows against the real CLLG FREED files. The fixtures in
// teiRows.test.ts quote their shapes; only the files themselves can say there
// is no third shape I have not seen.
//
// Off by default: WORKBENCH_LIVE_FREED=1 turns it on (as WORKBENCH_LIVE_PERSEUS
// does for perseusLive.test.ts), so the suite never depends on gitlab.inria.fr.
import { describe, expect, it } from 'vitest';
import { parseTeiRows } from '../teiRows';
import { importPerseusTei } from '../../import/perseusSource';

const live =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.WORKBENCH_LIVE_FREED === '1';
const when = live ? describe : describe.skip;

const freed = async (path: string): Promise<string> => {
  const url = `https://gitlab.inria.fr/api/v4/projects/66209/repository/files/${encodeURIComponent(path)}/raw?ref=main`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.text();
};

when('CLLG FREED, live', () => {
  it('imports the Metaphysics from its first column, 980a', async () => {
    const xml = await freed('data/tlg0086/tlg025/tlg0086.tlg025.cllg-grc1.xml');
    const { file } = importPerseusTei(xml, { language: 'Greek' });
    expect(file.meta.rowRefs?.slice(0, 3)).toEqual(['980a', '980b', '981a']);
    expect(file.greekLines[0]).toMatch(/^Πάντες ἄνθρωποι/);
  }, 60_000);

  it('imports the Physics from its first column, 184a', async () => {
    const xml = await freed('data/tlg0086/tlg031/tlg0086.tlg031.cllg-grc1.xml');
    const { file } = importPerseusTei(xml, { language: 'Greek' });
    expect(file.meta.rowRefs?.[0]).toBe('184a');
  }, 60_000);

  it('reads the Iliad without its marginal signs', async () => {
    const doc = parseTeiRows(await freed('data/tlg0012/tlg001/tlg0012.tlg001.cllg-grc1.xml'));
    expect(doc.rows.length).toBeGreaterThan(15_000);
    expect(doc.rows[1]).toEqual({ ref: '1.2', text: "οὐλομένην, ἣ μυρί' Ἀχαιοῖς ἄλγε' ἔθηκε," });
    // Every sign the file's Marginalia segs hold; none belongs to the text.
    const signs = ['>', '—', '⸖', '※', 'Ͻ'];
    expect(doc.rows.filter((r) => signs.some((s) => r.text.includes(s)))).toEqual([]);
  }, 60_000);
});
