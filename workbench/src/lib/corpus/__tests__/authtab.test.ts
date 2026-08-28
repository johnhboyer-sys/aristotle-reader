// AUTHTAB.DIR is a binary format from 1985 with no spec in the repo, so these
// tests do two jobs: pin the record rules against hand-built bytes, and — when
// a real disc is present — check the parser against the actual TLG and PHI
// discs, which is the only thing that can prove the rules are right.
import { describe, expect, it } from 'vitest';
import { parseAuthtab, corpusForAuthorId, authorNumber, filterAuthors } from '../authtab';
import { TLG_AUTHTAB_HEAD_B64, PHI_AUTHTAB_HEAD_B64 } from './fixtures/authtabHeads';

/** Decode a base64 fixture without node:Buffer (this suite runs in the
 * frontend environment; atob is the portable path). */
function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Build a record: id + name, optional language marker, 0xFF terminator. */
function record(text: string, langCode?: string): number[] {
  const bytes = [...text].map((c) => c.charCodeAt(0));
  if (langCode) bytes.push(0x83, langCode.charCodeAt(0));
  bytes.push(0xff);
  return bytes;
}

const disc = (...records: number[][]) => new Uint8Array(records.flat());

describe('parseAuthtab', () => {
  it('reads id and name from a record', () => {
    expect(parseAuthtab(disc(record('TLG0086 Aristoteles Phil.')))).toEqual([
      { id: 'TLG0086', name: 'Aristoteles Phil.' },
    ]);
  });

  it('strips the & typography directives that wrap a name', () => {
    // How every name is actually stored: "&1" opens a font run, "&" closes it.
    expect(parseAuthtab(disc(record('TLG0116 &1Abydenus &Hist.')))[0].name).toBe('Abydenus Hist.');
  });

  it('stops the name at the alternate one the disc keeps beside it', () => {
    // The real TLG record, byte for byte:
    //   TLG0086 &1Aristoteles &Phil. et &1Corpus Aristotelicum&\x80Aristotle
    // Thirteen authors carry an English name after 0x80 — Homer, the New
    // Testament, John Chrysostom. Keeping it made one name of two, and a work
    // imported from the disc was filed under the pair.
    const authors = parseAuthtab(
      disc([
        ...[...'TLG0086 &1Aristoteles &Phil. et &1Corpus Aristotelicum&'].map((c) => c.charCodeAt(0)),
        0x80,
        ...[...'Aristotle'].map((c) => c.charCodeAt(0)),
        0xff,
      ]),
    );
    expect(authors).toEqual([{ id: 'TLG0086', name: 'Aristoteles Phil. et Corpus Aristotelicum' }]);
  });

  it('still reads the language when the marker sits past the alternate name', () => {
    const authors = parseAuthtab(
      disc([
        ...[...'TLG0012 &1Homerus &Epic.'].map((c) => c.charCodeAt(0)),
        0x80,
        ...[...'Homer'].map((c) => c.charCodeAt(0)),
        0x83,
        'g'.charCodeAt(0),
        0xff,
      ]),
    );
    expect(authors).toEqual([{ id: 'TLG0012', name: 'Homerus Epic.', language: 'greek' }]);
  });

  it('reads the language from the 0x83 marker and keeps it out of the name', () => {
    // The bug this pins: without consuming the code byte, every PHI author is
    // called "Aemilius Sural".
    const [author] = parseAuthtab(disc(record('LAT2300 &1Aemilius& Sura', 'l')));
    expect(author).toEqual({ id: 'LAT2300', name: 'Aemilius Sura', language: 'latin' });
  });

  it('leaves language unset when the disc declares none', () => {
    expect(parseAuthtab(disc(record('TLG0086 Aristoteles')))[0].language).toBeUndefined();
  });

  it('understands every language code the discs use', () => {
    const bytes = disc(
      record('TLG0001 Greek One', 'g'),
      record('LAT0001 Latin One', 'l'),
      record('HEB0001 Hebrew One', 'h'),
      record('COP0001 Coptic One', 'c'),
    );
    expect(parseAuthtab(bytes).map((a) => a.language)).toEqual(['greek', 'latin', 'hebrew', 'coptic']);
  });

  it('skips the header record, which has no author id', () => {
    const bytes = disc([...[...'TLG Greek Data Bank'].map((c) => c.charCodeAt(0)), 0xff], record('TLG0086 Aristoteles'));
    expect(parseAuthtab(bytes).map((a) => a.id)).toEqual(['TLG0086']);
  });

  it('treats a run of terminators as one separator', () => {
    // Both discs pad some records with 0xFF 0xFF.
    const bytes = new Uint8Array([...record('TLG0001 One'), 0xff, ...record('TLG0002 Two')]);
    expect(parseAuthtab(bytes)).toHaveLength(2);
  });

  it('skips a malformed record instead of refusing the whole disc', () => {
    const bytes = disc(record('TLG0001 One'), record('!!! garbage'), record('TLG0002 Two'));
    expect(parseAuthtab(bytes).map((a) => a.id)).toEqual(['TLG0001', 'TLG0002']);
  });

  it('skips a record whose name is empty after markup is stripped', () => {
    expect(parseAuthtab(disc(record('TLG0001 &1&')))).toEqual([]);
  });

  it('returns nothing for an empty file rather than throwing', () => {
    expect(parseAuthtab(new Uint8Array())).toEqual([]);
  });
});

// Real bytes, so these run everywhere — CI and any machine without a disc.
// authtabLive.test.ts checks the WHOLE table on a machine that has one; this
// checks the same rules against the same format, always.
describe('real disc bytes (fixture)', () => {
  const tlg = parseAuthtab(fromBase64(TLG_AUTHTAB_HEAD_B64));
  const phi = parseAuthtab(fromBase64(PHI_AUTHTAB_HEAD_B64));

  it('reads the TLG head, skipping its "TLG Greek Data Bank" header record', () => {
    // 14, not 20: the fixture was cut after 20 terminators, and the doubled
    // 0xFF padding means terminators outnumber records.
    expect(tlg).toHaveLength(14);
    expect(tlg[0]).toEqual({ id: 'TLG0116', name: 'Abydenus Hist.' });
  });

  it('reads the PHI head, with the language byte the TLG disc lacks', () => {
    expect(phi).toHaveLength(13);
    expect(phi[0]).toEqual({ id: 'LAT2000', name: 'Ablabius', language: 'latin' });
  });

  it('handles the double 0xFF padding both discs use between some records', () => {
    // "Acesander" is followed by 0xFF 0xFF in the real file.
    expect(tlg.map((a) => a.id)).toContain('TLG0309');
  });

  it('strips markup from a name wrapped in it end to end', () => {
    // Stored as "&1Acta Alexandrinorum&" — markup on both sides, no plain part.
    expect(tlg.find((a) => a.id === 'TLG0300')?.name).toBe('Acta Alexandrinorum');
  });

  it('keeps a name that mixes plain and marked-up runs', () => {
    // "Gaius &1Acilius &Hist. et Phil."
    expect(tlg.find((a) => a.id === 'TLG2545')?.name).toBe('Gaius Acilius Hist. et Phil.');
  });

  it('keeps interior punctuation that is part of the name', () => {
    // "&1Albinus&, poet." — the comma and period are the name, not markup.
    expect(phi.find((a) => a.id === 'LAT2002')?.name).toBe('Albinus , poet.');
  });

  it('leaves no leftover markup or control characters in any name', () => {
    for (const a of [...tlg, ...phi]) {
      expect(a.name).not.toMatch(/[&\x00-\x1f\x7f-￿]/);
    }
  });
});

describe('disc ids', () => {
  it('routes TLG ids to the tlg corpus and everything else to phi', () => {
    expect(corpusForAuthorId('TLG0086')).toBe('tlg');
    expect(corpusForAuthorId('LAT0474')).toBe('phi');
    expect(corpusForAuthorId('COP0001')).toBe('phi');
  });

  it('extracts the four-digit number Diogenes takes for -n', () => {
    expect(authorNumber('TLG0086')).toBe('0086');
    expect(authorNumber('nonsense')).toBeNull();
  });
});

describe('filterAuthors', () => {
  const authors = [
    { id: 'TLG0086', name: 'Aristoteles Phil.' },
    { id: 'TLG0059', name: 'Plato Phil.' },
  ];

  it('matches on name, case-insensitively', () => {
    expect(filterAuthors(authors, 'plato').map((a) => a.id)).toEqual(['TLG0059']);
  });

  it('matches on id, so a known code still works', () => {
    expect(filterAuthors(authors, 'tlg0086').map((a) => a.id)).toEqual(['TLG0086']);
  });

  it('returns everything for a blank query', () => {
    expect(filterAuthors(authors, '   ')).toHaveLength(2);
  });
});
