// The TEI reader both source importers share. Every fixture below is modelled
// on a REAL file — a Diogenes export of Aristotle and of Plato (verified
// against the actual exports), and a Perseus TEI from sources/ — because the
// thing that breaks a citation reader is a structure you didn't know existed,
// not a rule you got wrong.
import { describe, expect, it } from 'vitest';
import { parseTeiRows } from '../teiRows';

const tei = (body: string, header = '') => `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>${header}</teiHeader>
  <text><body>${body}</body></text>
</TEI>`;

describe('Diogenes exports', () => {
  // Exactly the shape of tlg0086001.xml (Analytica priora).
  const aristotle = tei(`
<div type="Bekker-page" n="24a">
<l n="t"><label type="head"><hi rend="large ">ΑΝΑΛΥΤΙΚΩΝ ΠΡΟΤΕΡΩΝ Α.</hi></label> </l>
<l n="10" rend="indent(1)">Πρῶτον εἰπεῖν περὶ τί καὶ τίνος ἐστὶν ἡ σκέψις </l>
<l n="11">ἀπόδειξιν καὶ ἐπιστήμης ἀποδεικτικῆς </l>
</div>`);

  it('reads a one-tier work (Bekker pages)', () => {
    const doc = parseTeiRows(aristotle);
    expect(doc.levelNames).toEqual(['Bekker-page', 'line']);
    expect(doc.rows.map((r) => r.ref)).toEqual(['24a.t', '24a.10', '24a.11']);
  });

  it('keeps a heading line’s text instead of dropping it with its markup', () => {
    // <label>/<hi> is where these exports put a book's own title line.
    expect(parseTeiRows(aristotle).rows[0].text).toBe('ΑΝΑΛΥΤΙΚΩΝ ΠΡΟΤΕΡΩΝ Α.');
  });

  it('keeps a non-numeric line label ("t" for a title line)', () => {
    expect(parseTeiRows(aristotle).rows[0].ref).toBe('24a.t');
  });

  // Exactly the shape of tlg0059030.xml (Respublica).
  const republic = tei(`
<div type="Stephanus-page" n="327">
<div type="section" n="a">
<l n="1">Κατέβην χθὲς εἰς Πειραιᾶ </l>
<l n="2">προσευξόμενός τε τῇ θεῷ </l>
</div>
<div type="section" n="b">
<l n="1">προσευξάμενοι δὲ καὶ θεωρήσαντες </l>
</div>
</div>`);

  it('reads nested tiers, outermost first', () => {
    const doc = parseTeiRows(republic);
    expect(doc.levelNames).toEqual(['Stephanus-page', 'section', 'line']);
    expect(doc.rows.map((r) => r.ref)).toEqual(['327.a.1', '327.a.2', '327.b.1']);
  });

  it('restarts the inner tier without renumbering rows by position', () => {
    // The third row is "327.b.1", not "3" — the whole point of the importer.
    expect(parseTeiRows(republic).rows[2].ref).toBe('327.b.1');
  });

  // Exactly the shape of tlg0059039.xml (Epigrammata).
  it('reads an all-numeric tier stack', () => {
    const doc = parseTeiRows(
      tei(`
<div type="Book" n="5">
<div type="epigram" n="78">
<l n="p1"><label type="head"><hi rend="small">ΠΛΑΤΩΝΟΣ</hi></label> </l>
<l n="1">Τὴν ψυχὴν Ἀγάθωνα φιλῶν </l>
</div>
</div>`),
    );
    expect(doc.levelNames).toEqual(['Book', 'epigram', 'line']);
    expect(doc.rows.map((r) => r.ref)).toEqual(['5.78.p1', '5.78.1']);
  });
});

describe('Perseus TEI', () => {
  it('reads the older numbered div1/div2 form', () => {
    const doc = parseTeiRows(
      tei(`
<div1 type="book" n="1">
<div2 type="chapter" n="1">
<p n="1">Πάντες ἄνθρωποι τοῦ εἰδέναι ὀρέγονται φύσει.</p>
</div2>
</div1>`),
    );
    expect(doc.levelNames).toEqual(['book', 'chapter', 'line']);
    expect(doc.rows).toEqual([{ ref: '1.1.1', text: 'Πάντες ἄνθρωποι τοῦ εἰδέναι ὀρέγονται φύσει.' }]);
  });

  it('takes rows from <p> as well as <l>', () => {
    const doc = parseTeiRows(tei('<div type="section" n="1"><p n="1">Prose.</p></div>'));
    expect(doc.rows).toHaveLength(1);
  });
});

describe('structure handling', () => {
  it('ignores a div with no number — it groups, it does not cite', () => {
    const doc = parseTeiRows(
      tei('<div type="edition"><div type="book" n="1"><l n="1">Text.</l></div></div>'),
    );
    expect(doc.rows[0].ref).toBe('1.1');
    expect(doc.levelNames).toEqual(['book', 'line']);
  });

  it('still gives a row an address when the row itself is unnumbered', () => {
    // Losing the text would be worse than a repeated address.
    const doc = parseTeiRows(tei('<div type="section" n="4"><p>No number.</p></div>'));
    expect(doc.rows).toEqual([{ ref: '4', text: 'No number.' }]);
  });

  it('leaves editorial notes out of the reading text', () => {
    const doc = parseTeiRows(tei('<div type="s" n="1"><l n="1">Real text<note>editor says</note></l></div>'));
    expect(doc.rows[0].text).toBe('Real text');
  });

  it('collapses the whitespace these files wrap lines with', () => {
    const doc = parseTeiRows(tei('<div type="s" n="1"><l n="1">  spaced\n   out  </l></div>'));
    expect(doc.rows[0].text).toBe('spaced out');
  });

  it('returns no rows for a document with no body content, rather than throwing', () => {
    expect(parseTeiRows(tei('')).rows).toEqual([]);
  });
});

describe('header metadata', () => {
  it('reads title and author from the TEI header', () => {
    const doc = parseTeiRows(
      tei('<div type="s" n="1"><l n="1">x</l></div>', '<fileDesc><titleStmt><title>Respublica</title><author>Plato Phil.</author></titleStmt></fileDesc>'),
    );
    expect(doc.title).toBe('Respublica');
    expect(doc.author).toBe('Plato Phil.');
  });

  it('takes the FIRST title, which is the work’s, not the edition’s', () => {
    const doc = parseTeiRows(
      tei('<div type="s" n="1"><l n="1">x</l></div>', '<titleStmt><title>Respublica</title></titleStmt><sourceDesc><title>Oxford Classical Texts</title></sourceDesc>'),
    );
    expect(doc.title).toBe('Respublica');
  });

  it('leaves them unset when the header declares neither', () => {
    const doc = parseTeiRows(tei('<div type="s" n="1"><l n="1">x</l></div>'));
    expect(doc.title).toBeUndefined();
    expect(doc.author).toBeUndefined();
  });
});
