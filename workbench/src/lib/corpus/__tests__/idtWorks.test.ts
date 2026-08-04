// The .IDT reader gives the import dialog an author's works and the NAMES of
// their citation tiers. Getting a tier label wrong is silent — the text still
// imports, it just calls "Stephanus page" something else — so these pin the
// record grammar against real bytes and hand-built edge cases.
import { describe, expect, it } from 'vitest';
import { parseIdtWorks, discTitle } from '../idtWorks';
import { TLG0086_IDT_HEAD_B64 } from './fixtures/idtHead';

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** ASCII with the high bit set, as the disc writes record numbers. */
const highBit = (text: string) => [...text].map((c) => c.charCodeAt(0) | 0x80);
const pascal = (text: string) => [text.length, ...[...text].map((c) => c.charCodeAt(0))];

/** A work record: 0x02, 4 header bytes, 0xEF, level 1, number, name, labels. */
function workRecord(number: string, title: string, labels: [number, string][]): number[] {
  return [
    0x02, 0x00, 0x00, 0x00, 0x00,
    0xef, 0x81,
    ...highBit(number), 0xff,
    0x10, 0x01, ...pascal(title),
    ...labels.flatMap(([tier, label]) => [0x11, tier, ...pascal(label)]),
  ];
}

describe('real disc bytes (fixture)', () => {
  const parsed = parseIdtWorks(fromBase64(TLG0086_IDT_HEAD_B64));

  it('reads the author number and name', () => {
    expect(parsed.number).toBe('0086');
    expect(parsed.name).toMatch(/Aristoteles/);
  });

  it('reads the work number and title', () => {
    expect(parsed.works[0].number).toBe('001');
    expect(parsed.works[0].title).toBe('Analytica priora et posteriora');
  });

  it('reads the tier labels outermost first', () => {
    // The disc keys them innermost-up; the outer tier must come first here or
    // an imported address would be labelled inside out.
    expect(parsed.works[0].levelNames).toEqual(['Bekker page', 'line']);
  });
});

describe('parseIdtWorks', () => {
  it('reads several works from one author', () => {
    const bytes = new Uint8Array([
      ...workRecord('001', 'Euthyphro', [[2, 'Stephanus page'], [1, 'section'], [0, 'line']]),
      ...workRecord('002', 'Apologia Socratis', [[2, 'Stephanus page'], [1, 'section'], [0, 'line']]),
    ]);
    const works = parseIdtWorks(bytes).works;
    expect(works.map((w) => w.number)).toEqual(['001', '002']);
    expect(works[0].levelNames).toEqual(['Stephanus page', 'section', 'line']);
  });

  it('keeps a work that declares no tier labels', () => {
    const works = parseIdtWorks(new Uint8Array(workRecord('001', 'Untitled', []))).works;
    expect(works).toEqual([{ number: '001', title: 'Untitled', levelNames: [] }]);
  });

  it('ignores a stray 0x02 that is not a record', () => {
    // The scan tries every 0x01/0x02 byte, so this is the case that decides
    // whether junk becomes a phantom work.
    const bytes = new Uint8Array([0x02, 0x02, 0x02, 0x99, 0x02, ...workRecord('001', 'Real', [])]);
    expect(parseIdtWorks(bytes).works.map((w) => w.title)).toEqual(['Real']);
  });

  it('rejects a record whose number is not digits', () => {
    const bytes = new Uint8Array([
      0x02, 0x00, 0x00, 0x00, 0x00, 0xef, 0x81, ...highBit('abc'), 0xff,
      0x10, 0x01, ...pascal('Nope'),
    ]);
    expect(parseIdtWorks(bytes).works).toEqual([]);
  });

  it('rejects a record with no terminator after the number, instead of scanning the file', () => {
    // Unbounded here made the whole parse quadratic: every 0x02 byte read to EOF.
    const bytes = new Uint8Array([0x02, 0x00, 0x00, 0x00, 0x00, 0xef, 0x81, ...highBit('000000000000')]);
    expect(parseIdtWorks(bytes).works).toEqual([]);
  });

  it('returns nothing for an empty file rather than throwing', () => {
    expect(parseIdtWorks(new Uint8Array()).works).toEqual([]);
  });

  it('does not mistake a truncated record for a work', () => {
    expect(parseIdtWorks(new Uint8Array([0x02, 0x00, 0x00, 0x00, 0x00, 0xef])).works).toEqual([]);
  });
});

describe('discTitle', () => {
  it('leaves a Roman title alone', () => {
    expect(discTitle('Analytica priora et posteriora')).toBe('Analytica priora et posteriora');
  });

  it('decodes a Greek run into polytonic Greek', () => {
    // Exactly how the Athenian Constitution is stored on the disc.
    expect(discTitle('$*)AQHNAI/WN POLITEI/A&')).toBe('Ἀθηναίων πολιτεία');
  });

  it('handles a title that switches script mid-way', () => {
    expect(discTitle('Fragmenta $LO/GOI&')).toBe('Fragmenta λόγοι');
  });

  it('drops numbered font switches', () => {
    expect(discTitle('&1Plato& Phil.')).toBe('Plato Phil.');
  });
});
