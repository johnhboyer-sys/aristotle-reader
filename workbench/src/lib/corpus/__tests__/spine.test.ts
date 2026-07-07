import { describe, expect, it } from 'vitest';
import { parseSpine, type SpineManifest } from '../spine';

// SYNTHETIC fake-Greek-looking fixtures only — no TLG-derived text (copyright
// guard: workbench/ must never carry real corpus text or XML).

const oneBookManifest: SpineManifest = {
  work_id: 'Test',
  greek_edition: 'Test Edition',
  books: [{ n: 1, start: '1a1', end: '2b99' }],
};

describe('parseSpine', () => {
  it('assigns lines to segments keyed by book:column, preserving order', () => {
    const xml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <div type="Bekker-page" n="1a">
        <l n="1">λορεμ ιψυμ δολορ</l>
        <l n="2">σιτ αμετ κονσεκτετυρ</l>
      </div>
      <div type="Bekker-page" n="1b">
        <l n="1">αδιπισκινγ ελιτ σεδ</l>
      </div>
    </body></text></TEI>`;
    const spine = parseSpine(xml, oneBookManifest);
    expect(spine.segments).toHaveLength(2);
    expect(spine.segments[0]).toMatchObject({ id: '1:1a', book: 1, column: '1a' });
    expect(spine.segments[0].lines).toEqual([
      { n: 1, text: 'λορεμ ιψυμ δολορ' },
      { n: 2, text: 'σιτ αμετ κονσεκτετυρ' },
    ]);
    expect(spine.segments[1]).toMatchObject({ id: '1:1b', book: 1, column: '1b' });
    expect(spine.segments[1].lines).toEqual([{ n: 1, text: 'αδιπισκινγ ελιτ σεδ' }]);
    expect(spine.unassigned_lines).toEqual([]);
  });

  it('rejoins a word hyphenated across two lines within the same column', () => {
    const xml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <div type="Bekker-page" n="1a">
        <l n="1">τουτο εστιν καλο-</l>
        <l n="2">κακαγαθια και αλλα</l>
      </div>
    </body></text></TEI>`;
    const spine = parseSpine(xml, oneBookManifest);
    const [seg] = spine.segments;
    expect(seg.lines[0]).toEqual({ n: 1, text: 'τουτο εστιν καλοκακαγαθια', joined: true });
    expect(seg.lines[1]).toEqual({ n: 2, text: 'και αλλα' });
  });

  it('rejoins a word hyphenated across a column boundary', () => {
    const xml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <div type="Bekker-page" n="1a">
        <l n="35">τελος εστιν ευδαιμο-</l>
      </div>
      <div type="Bekker-page" n="1b">
        <l n="1">νια και αρετη</l>
      </div>
    </body></text></TEI>`;
    const spine = parseSpine(xml, oneBookManifest);
    const bySeg = Object.fromEntries(spine.segments.map((s) => [s.column, s]));
    expect(bySeg['1a'].lines[0]).toEqual({ n: 35, text: 'τελος εστιν ευδαιμονια', joined: true });
    expect(bySeg['1b'].lines[0]).toEqual({ n: 1, text: 'και αρετη' });
  });

  it('numbers lines from the n attribute and collects non-numeric labels as headings', () => {
    const xml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <div type="Bekker-page" n="1a">
        <l n="t1"><label type="head">ΤΙΤΛΟΣ</label></l>
        <l n="1">πρωτη γραμμη κειμενου</l>
        <l n="2">δευτερη γραμμη κειμενου</l>
      </div>
    </body></text></TEI>`;
    const spine = parseSpine(xml, oneBookManifest);
    expect(spine.headings).toEqual([{ column: '1a', text: 'ΤΙΤΛΟΣ' }]);
    expect(spine.segments[0].lines.map((l) => l.n)).toEqual([1, 2]);
  });

  it('splits a compound-numbered physical line at word-boundary bars, rejoining mid-word bars', () => {
    const xml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <div type="Bekker-page" n="1a">
        <l n="8,9">καθολου πρω|τον | δευτερον μερος</l>
      </div>
    </body></text></TEI>`;
    const spine = parseSpine(xml, oneBookManifest);
    expect(spine.segments[0].lines).toEqual([
      { n: 8, text: 'καθολου πρωτον' },
      { n: 9, text: 'δευτερον μερος' },
    ]);
  });

  it('keeps an inline milestone element from corrupting the flattened line text', () => {
    const xml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <div type="Bekker-page" n="1a">
        <l n="1">πρωτον μερος <pb/> δευτερον μερος</l>
      </div>
    </body></text></TEI>`;
    const spine = parseSpine(xml, oneBookManifest);
    expect(spine.segments[0].lines[0].text).toBe('πρωτον μερος δευτερον μερος');
  });

  it('places lines outside every book range in unassigned_lines', () => {
    const xml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <div type="Bekker-page" n="9a">
        <l n="1">εξω απο τα βιβλια</l>
      </div>
    </body></text></TEI>`;
    const spine = parseSpine(xml, oneBookManifest);
    expect(spine.segments).toEqual([]);
    expect(spine.unassigned_lines).toEqual([{ column: '9a', n: 1, text: 'εξω απο τα βιβλια' }]);
  });

  it('maps a Busse-scheme page div onto a synthetic a-side Bekker column', () => {
    const manifest: SpineManifest = {
      work_id: 'Isagoge',
      greek_edition: 'Test Busse Edition',
      citation_scheme: 'busse',
      books: [{ n: 1, start: '1a1', end: '5a99' }],
    };
    const xml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <div type="page" n="2">
        <l n="1">πορφυριου εισαγωγη</l>
      </div>
    </body></text></TEI>`;
    const spine = parseSpine(xml, manifest);
    expect(spine.segments[0]).toMatchObject({ column: '2a', book: 1 });
  });
});
