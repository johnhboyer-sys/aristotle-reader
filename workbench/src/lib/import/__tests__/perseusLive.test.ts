// Live check of the Perseus route against the real repositories. The unit
// tests in perseusSource.test.ts only ever see XML I wrote myself, which can
// prove the rules I already believe and nothing else. Real Perseus files carry
// entity references, nested wrapper divs, `<milestone>` line numbering, and
// headers laid out in ways I did not invent — and the URL scheme is a claim
// about someone else's repository that only the network can settle.
//
// Off by default: WORKBENCH_LIVE_PERSEUS=1 turns it on. A test suite that
// silently depends on GitHub being up is a test suite that fails for reasons
// that have nothing to do with the code.
import { describe, expect, it } from 'vitest';
import { fetchPerseusTei, importPerseusTei, parseCtsUrn, teiUrlFor } from '../perseusSource';

const live =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.WORKBENCH_LIVE_PERSEUS === '1';
const when = live ? describe : describe.skip;

when('Perseus, live', () => {
  it('imports Plato Republic with its Stephanus citations intact', async () => {
    const urn = 'urn:cts:greekLit:tlg0059.tlg030.perseus-grc2';
    const xml = await fetchPerseusTei(urn);
    const { work, file } = importPerseusTei(xml, { language: 'Greek' });

    // The header gives the Greek title; Perseus does not print "Republic".
    expect(work.title).toBe('Πολιτεία');
    expect(work.levels?.map((l) => l.name)).toEqual(['book', 'section']);
    expect(file.meta.rowRefs).toHaveLength(file.greekLines.length);
    // Book 1, Stephanus 327a — the whole point. Before the milestone split
    // this was "1.327", a row two thousand characters long covering a-d.
    expect(file.meta.rowRefs?.slice(0, 3)).toEqual(['1.327a', '1.327b', '1.327c']);
    expect(file.greekLines[0]).toMatch(/κατέβην/i);
    expect(file.greekLines[0].length).toBeLessThan(800);
  }, 60_000);

  it('imports Aristotle, who lives in First1KGreek rather than Perseus proper', async () => {
    // De Anima is not in canonical-greekLit at all. This is the text this
    // whole feature exists for, so it gets its own live check.
    const xml = await fetchPerseusTei('urn:cts:greekLit:tlg0086.tlg002.1st1K-grc1');
    const { work, file } = importPerseusTei(xml, { language: 'Greek' });
    expect(work.title).toBe('De anima');
    expect(file.greekLines.length).toBeGreaterThan(40);
    // Not "urn:cts:greekLit:tlg0086.1.1" — the CTS wrapper is not a tier.
    expect(file.meta.rowRefs?.[0]).toBe('1.1');
    // This edition divides only to the chapter and carries no milestones, so
    // the rows are chapters. That is the source's limit, not the importer's —
    // the disc route gives Bekker lines for the same work.
    expect(work.levels?.map((l) => l.name)).toEqual(['book', 'chapter']);
  }, 60_000);

  it('imports a Latin text from the other repository', async () => {
    const xml = await fetchPerseusTei('urn:cts:latinLit:phi0474.phi013.perseus-lat2');
    const { work, file } = importPerseusTei(xml, { language: 'Latin' });
    expect(file.greekLines.length).toBeGreaterThan(20);
    expect(work.title.length).toBeGreaterThan(0);
  }, 60_000);

  it('reports a missing text plainly rather than importing nothing', async () => {
    const urn = 'urn:cts:greekLit:tlg9999.tlg999.perseus-grc9';
    expect(teiUrlFor(parseCtsUrn(urn)!)).toContain('tlg9999');
    await expect(fetchPerseusTei(urn)).rejects.toThrow(/no text at that address/i);
  }, 60_000);
});
