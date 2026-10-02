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
    // Not "urn:cts:greekLit:tlg0086.1.1" — the CTS wrapper is not a tier. The
    // first row is Book 1's printed title, which the edition sets inside its
    // first chapter, and the Book hangs on it.
    expect(file.meta.rowRefs?.slice(0, 2)).toEqual(['1.1.t', '1.1']);
    expect(file.greekLines[0]).toBe('ΠΕΡΙ ΨΥΧΗΣ Α.');
    expect(work.bookContainers?.map((b) => b.label)).toEqual(['Book 1', 'Book 2', 'Book 3']);
    // This edition divides only to the chapter and carries no milestones, so
    // the rows are chapters. That is the source's limit, not the importer's —
    // the disc route gives Bekker lines for the same work.
    expect(work.levels?.map((l) => l.name)).toEqual(['book', 'chapter']);
  }, 60_000);

  it('imports the Nicomachean Ethics with its Bekker numbers', async () => {
    // The edition Perseus serves prints Bekker as milestones over its own
    // book/section divisions — `<milestone unit="page" resp="Bekker"
    // n="1094a"/>` and a line every fifth. Those numbers are the citation for
    // Aristotle, and this is the one Perseus route that carries them.
    const xml = await fetchPerseusTei('urn:cts:greekLit:tlg0086.tlg010.perseus-grc2');
    const { work, file } = importPerseusTei(xml, { language: 'Greek' });

    expect(work.levels?.map((l) => l.name)).toEqual(['page', 'line']);
    expect(file.meta.rowRefs?.slice(0, 4)).toEqual(['1094a.1', '1094a.5', '1094a.10', '1094a.15']);
    expect(file.greekLines[0]).toMatch(/πᾶσα τέχνη/);
    // The page survives the section boundary it is carried across.
    expect(file.meta.rowRefs?.every((ref) => /^\d+[ab]\.\d+$/.test(ref))).toBe(true);
  }, 60_000);

  it('imports a Latin text from the other repository', async () => {
    const xml = await fetchPerseusTei('urn:cts:latinLit:phi0474.phi013.perseus-lat2');
    const { work, file } = importPerseusTei(xml, { language: 'Latin' });
    expect(file.greekLines.length).toBeGreaterThan(20);
    expect(work.title.length).toBeGreaterThan(0);
  }, 60_000);

  it('reports a missing text plainly rather than importing nothing', async () => {
    const urn = 'urn:cts:greekLit:tlg9999.tlg999.perseus-grc9';
    expect(teiUrlFor(parseCtsUrn(urn)!)).toContain('raw.githubusercontent.com');
    expect(teiUrlFor(parseCtsUrn(urn)!)).toContain('tlg9999');
    await expect(fetchPerseusTei(urn)).rejects.toThrow('Perseus has no text at that address.');
  }, 60_000);

  it('imports the Iliad from FREED, marked line 18.605* included', async () => {
    // The TLG prints 18.605 as "605*"; until the grammar took the mark, the
    // whole Iliad was refused over that one line.
    const xml = await fetchPerseusTei('urn:cts:greekLit:tlg0012.tlg001.cllg-grc1');
    const { file } = importPerseusTei(xml, { language: 'Greek' });
    expect(file.meta.rowRefs).toContain('18.605*');
    expect(file.meta.rowRefs?.at(-1)).toBe('24.804');
  }, 60_000);

  it('imports the Odyssey from FREED with book and line', async () => {
    const xml = await fetchPerseusTei('urn:cts:greekLit:tlg0012.tlg002.cllg-grc1');
    const { work, file } = importPerseusTei(xml, { language: 'Greek' });
    expect(work.levels?.map((l) => l.name)).toEqual(['book', 'line']);
    // Each book's printed title is its first row, and its Book hangs on it.
    expect(file.meta.rowRefs?.slice(0, 2)).toEqual(['1.t', '1.1']);
    expect(file.meta.rowRefs?.at(-1)).toBe('24.548');
    expect(file.greekLines[1]).toMatch(/Ἄνδρα μοι ἔννεπε/);
    expect(work.bookContainers).toHaveLength(24);
  }, 60_000);

  it('imports Plotinus from FREED with its ennead/treatise/section divisions', async () => {
    const xml = await fetchPerseusTei('urn:cts:greekLit:tlg2000.tlg001.cllg-grc1');
    const { work, file } = importPerseusTei(xml, { language: 'Greek' });
    expect(work.levels?.map((l) => l.name)).toEqual(['ennead', 'chapter', 'section']);
    // Lettered sections are the edition's own (4.7.8a–8e).
    expect(file.meta.rowRefs?.every((ref) => /^\d+\.\d+\.\d+[a-z]?$/.test(ref))).toBe(true);
    expect(file.meta.rowRefs).toContain('4.7.8a');
  }, 60_000);

  it('gives the Anabasis its seven books and their chapters, from the citation tiers', async () => {
    const xml = await fetchPerseusTei('urn:cts:greekLit:tlg0032.tlg006.perseus-grc2');
    const { work, file } = importPerseusTei(xml, { language: 'Greek' });
    // Each book's <head> is its title row, and the Book hangs on it.
    expect(work.bookContainers?.map((b) => b.label)).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `Book ${n}`));
    expect(file.meta.rowRefs?.[0]).toBe('1.t');
    expect(file.greekLines[0]).toMatch(/Ἀναβάσεως/);
    const firstBook = work.chapterContainers?.filter((c) => file.meta.rowRefs?.[c.row - 1]?.startsWith('1.'));
    expect(firstBook?.map((c) => c.label)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `Chapter ${n}`));
  }, 60_000);

  it('reports a missing FREED text as FREED’s, not Perseus’s', async () => {
    await expect(fetchPerseusTei('urn:cts:greekLit:tlg0012.tlg009.cllg-grc1')).rejects.toThrow(
      'FREED has no text at that address.',
    );
  }, 60_000);
});
