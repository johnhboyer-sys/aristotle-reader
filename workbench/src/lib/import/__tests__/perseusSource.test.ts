// The Perseus routes — the ones that need nothing installed. Address parsing
// is where this breaks in practice: people paste whatever Scaife's URL bar
// shows them, which is rarely a bare urn.
import { describe, expect, it } from 'vitest';
import {
  parseCtsUrn,
  teiUrlFor,
  fetchPerseusTei,
  languageFor,
  importPerseusTei,
  NOT_A_URN_MESSAGE,
  NOT_FOUND_MESSAGE,
  FETCH_FAILED_MESSAGE,
} from '../perseusSource';

const REPUBLIC = 'urn:cts:greekLit:tlg0059.tlg030.perseus-grc2';

describe('parseCtsUrn', () => {
  it('reads a bare urn', () => {
    expect(parseCtsUrn(REPUBLIC)).toEqual({
      namespace: 'greekLit',
      group: 'tlg0059',
      work: 'tlg030',
      version: 'perseus-grc2',
    });
  });

  it('pulls the urn out of a Scaife reader URL', () => {
    // What you get from the address bar.
    expect(parseCtsUrn(`https://scaife.perseus.org/reader/${REPUBLIC}/`)?.work).toBe('tlg030');
  });

  it('drops a passage reference — the whole work is imported', () => {
    expect(parseCtsUrn(`${REPUBLIC}:327a`)?.version).toBe('perseus-grc2');
  });

  it('reads a Latin urn', () => {
    expect(parseCtsUrn('urn:cts:latinLit:phi0474.phi013.perseus-lat1')?.namespace).toBe('latinLit');
  });

  it('accepts a urn naming only the work, with no edition', () => {
    expect(parseCtsUrn('urn:cts:greekLit:tlg0059.tlg030')).toEqual({
      namespace: 'greekLit',
      group: 'tlg0059',
      work: 'tlg030',
    });
  });

  it('refuses a namespace Perseus does not publish', () => {
    expect(parseCtsUrn('urn:cts:hebrewLit:x.y.z')).toBeNull();
  });

  it('refuses text that carries no urn at all', () => {
    expect(parseCtsUrn('https://example.com/something')).toBeNull();
    expect(parseCtsUrn('')).toBeNull();
  });
});

describe('teiUrlFor', () => {
  it('builds the canonical file URL', () => {
    expect(teiUrlFor(parseCtsUrn(REPUBLIC)!)).toBe(
      'https://raw.githubusercontent.com/PerseusDL/canonical-greekLit/master/data/tlg0059/tlg030/tlg0059.tlg030.perseus-grc2.xml',
    );
  });

  it('uses the Latin repository for a Latin urn', () => {
    const url = teiUrlFor(parseCtsUrn('urn:cts:latinLit:phi0474.phi013.perseus-lat1')!);
    expect(url).toContain('canonical-latinLit');
  });

  it('cannot name a file for a urn with no edition', () => {
    expect(teiUrlFor(parseCtsUrn('urn:cts:greekLit:tlg0059.tlg030')!)).toBeNull();
  });
});

describe('fetchPerseusTei', () => {
  const ok = (text: string) => async () => ({ ok: true, status: 200, text: async () => text });

  it('returns the fetched TEI', async () => {
    expect(await fetchPerseusTei(REPUBLIC, ok('<TEI/>'))).toBe('<TEI/>');
  });

  it('refuses an address that is not a urn, before touching the network', async () => {
    let called = false;
    const spy = async () => {
      called = true;
      return { ok: true, status: 200, text: async () => '' };
    };
    await expect(fetchPerseusTei('nonsense', spy)).rejects.toThrow(NOT_A_URN_MESSAGE);
    expect(called).toBe(false);
  });

  it('says plainly when Perseus has no such text', async () => {
    const missing = async () => ({ ok: false, status: 404, text: async () => '' });
    await expect(fetchPerseusTei(REPUBLIC, missing)).rejects.toThrow(NOT_FOUND_MESSAGE);
  });

  it('says plainly when the network is unreachable', async () => {
    const offline = async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    };
    await expect(fetchPerseusTei(REPUBLIC, offline)).rejects.toThrow(FETCH_FAILED_MESSAGE);
  });

  it('asks for an edition when the urn names only a work', async () => {
    await expect(fetchPerseusTei('urn:cts:greekLit:tlg0059.tlg030', ok(''))).rejects.toThrow(/which edition/);
  });
});

describe('languageFor', () => {
  it('maps the namespaces', () => {
    expect(languageFor(parseCtsUrn(REPUBLIC)!)).toBe('Greek');
    expect(languageFor(parseCtsUrn('urn:cts:latinLit:phi0474.phi013.perseus-lat1')!)).toBe('Latin');
  });
});

describe('importPerseusTei', () => {
  const xml = `<TEI xmlns="http://www.tei-c.org/ns/1.0">
    <teiHeader><titleStmt><title>Respublica</title><author>Plato</author></titleStmt></teiHeader>
    <text><body>
      <div type="Stephanus-page" n="327"><div type="section" n="a">
        <l n="1">Κατέβην χθὲς</l>
      </div></div>
    </body></text>
  </TEI>`;

  it('builds a work whose rows keep the source citations', () => {
    const { work, file } = importPerseusTei(xml);
    expect(work.title).toBe('Respublica');
    expect(work.author).toBe('Plato');
    expect(file.meta.rowRefs).toEqual(['327.a.1']);
  });

  it('names the tiers the way the file declares them', () => {
    expect(importPerseusTei(xml).work.levels?.map((l) => l.name)).toEqual([
      'Stephanus-page',
      'section',
      'line',
    ]);
  });

  it('takes the language from the caller, since TEI rarely says', () => {
    expect(importPerseusTei(xml, { language: 'Greek' }).work.language).toBe('Greek');
  });

  it('refuses a file with no text rather than making an empty work', () => {
    const empty = '<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body/></text></TEI>';
    expect(() => importPerseusTei(empty)).toThrow(/no text/i);
  });
});
