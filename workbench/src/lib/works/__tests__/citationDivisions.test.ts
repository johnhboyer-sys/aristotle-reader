// Books and chapters read off a text's own citation tiers. The shapes here are
// the ones a survey of the cached disc exports and Perseus found; the live
// tests (discImportLive, perseusLive) run the rule over the real texts.
import { describe, expect, it } from 'vitest';
import { citationDivisions } from '../citationDivisions';

/** Historia plantarum's shape: Book › chapter › section › line, each book
 * opening with a title "chapter" `t` that prints three lines. */
const HP = [
  '1.t.1.1', '1.t.1.2', '1.t.1.3',
  '1.1.1.1', '1.1.1.2', '1.1.2.1',
  '1.2.1.1',
  '2.t.1.1',
  '2.1.1.1', '2.2.1.1',
];
const HP_TIERS = ['Book', 'chapter', 'section', 'line'];

describe('citationDivisions', () => {
  it('makes Books from a book tier and chapters from the tier under it', () => {
    const d = citationDivisions(HP, HP_TIERS, []);
    expect(d.books).toEqual([
      { label: 'Book 1', start: 1 },
      { label: 'Book 2', start: 2 },
    ]);
    expect(d.chapters).toEqual([
      { label: 'Chapter 1', row: 4 },
      { label: 'Chapter 2', row: 7 },
      { label: 'Chapter 1', row: 9 },
      { label: 'Chapter 2', row: 10 },
    ]);
  });

  it('marks only the FIRST title row of each book as a heading', () => {
    // The other title rows stay in the text, to be read and translated.
    expect(citationDivisions(HP, HP_TIERS, []).headers).toEqual([
      { row: 1, level: 1 },
      { row: 8, level: 1 },
    ]);
  });

  it('keeps the title headings the edition already had, and counts Books among them', () => {
    // A row the importer already marked (a line numbered "t") is an outline
    // root too, so Book 2 begins at the THIRD root, not the second.
    const d = citationDivisions(HP, HP_TIERS, [{ row: 5, level: 1 }]);
    expect(d.headers.map((h) => h.row)).toEqual([1, 5, 8]);
    expect(d.books.map((b) => b.start)).toEqual([1, 3]);
  });

  it('labels Books with the number the citation gives, not a letter', () => {
    const d = citationDivisions(['1.t', '1.1.1', '2.t', '2.1.1'], ['book', 'chapter', 'section'], []);
    expect(d.books.map((b) => b.label)).toEqual(['Book 1', 'Book 2']);
  });

  it('leaves Books out when a book prints no title, and puts the book in the chapter label', () => {
    // A Book is a boundary over outline roots; a book with no title row has no
    // root to begin at, and a Book laid on the wrong root would mis-file its
    // chapters.
    const d = citationDivisions(['1.1.1', '1.1.2', '1.2.1', '2.1.1'], ['book', 'chapter', 'section'], []);
    expect(d.books).toEqual([]);
    expect(d.headers).toEqual([]);
    expect(d.chapters).toEqual([
      { label: '1.1', row: 1 },
      { label: '1.2', row: 3 },
      { label: '2.1', row: 4 },
    ]);
  });

  it('takes the outermost tier as chapters when there is no book tier', () => {
    // Theophrastus' fragments: Fragment › section › line.
    const d = citationDivisions(['4.t.1', '4.1.1', '4.1.2', '5.1.1', '5.2.1'], ['Fragment', 'section', 'line'], []);
    expect(d.books).toEqual([]);
    expect(d.chapters).toEqual([
      { label: 'Fragment 4', row: 1 },
      { label: 'Fragment 5', row: 4 },
    ]);
    // A fragment's own title is its first line, not a heading.
    expect(d.headers).toEqual([]);
  });

  it('makes a two-tier text (fragment and line) into chapters', () => {
    const d = citationDivisions(['1.1', '1.2', '2.1'], ['Fragment', 'line'], []);
    expect(d.chapters).toEqual([
      { label: 'Fragment 1', row: 1 },
      { label: 'Fragment 2', row: 3 },
    ]);
  });

  it('gives a title tier no chapter of its own', () => {
    const d = citationDivisions(['t.1', '1.1', '2.1'], ['Section', 'line'], []);
    expect(d.chapters).toEqual([
      { label: 'Section 1', row: 2 },
      { label: 'Section 2', row: 3 },
    ]);
  });

  it('never divides by a page, folio or column — those are reference grids', () => {
    // Bekker works get their chapters from the divisions table instead.
    for (const tier of ['Bekker-page', 'Usener-page', 'Folio', 'column']) {
      const d = citationDivisions(['4a.1', '4a.2', '4b.1'], [tier, 'line'], []);
      expect(d).toEqual({ headers: [], books: [], chapters: [] });
    }
  });

  it('leaves a single tier (line numbers alone) undivided', () => {
    expect(citationDivisions(['1', '2', '3'], ['line'], [])).toEqual({ headers: [], books: [], chapters: [] });
  });

  it('passes a book tier over when it has only one value, and divides by the tier under it', () => {
    // FGrHist-style: Volume-Jacoby#-F › fragment › line, one volume.
    const d = citationDivisions(['3.1.1', '3.1.2', '3.2.1'], ['Volume-Jacoby#-F', 'fragment', 'line'], []);
    expect(d.books).toEqual([]);
    expect(d.chapters).toEqual([
      { label: 'Fragment 1', row: 1 },
      { label: 'Fragment 2', row: 3 },
    ]);
  });

  it('names a play tier as the Books', () => {
    const d = citationDivisions(
      ['Aio.t.1', 'Aio.2.1', 'Aio.3.1', 'Dait.t.1', 'Dait.1.1'],
      ['Play', 'fragment', 'line'],
      [],
    );
    expect(d.books).toEqual([
      { label: 'Play Aio', start: 1 },
      { label: 'Play Dait', start: 2 },
    ]);
    expect(d.chapters.map((c) => c.label)).toEqual(['Fragment 2', 'Fragment 3', 'Fragment 1']);
  });

  it('does nothing when the tiers are unknown', () => {
    expect(citationDivisions(['1.1', '1.2'], [], [])).toEqual({ headers: [], books: [], chapters: [] });
  });
});
