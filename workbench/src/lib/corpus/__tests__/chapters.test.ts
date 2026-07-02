import { describe, expect, it } from 'vitest';
import { extractChaptersExplicit, extractChaptersGrc, type SpineForChapters } from '../chapters';
import { norm } from '../normalize';

// SYNTHETIC fake-Greek-looking fixtures only — no TLG-derived text.

describe('norm', () => {
  it('strips diacritics, lowercases, and drops punctuation/non-Greek-Latin chars', () => {
    expect(norm('Πάντες ἄνθρωποι')).toBe('παντες ανθρωποι');
    expect(norm('τοῦ εἰδέναι ὀρέγονται, φύσει.')).toBe('του ειδεναι ορεγονται φυσει');
  });

  it('matches diacritic-different spellings of the same base word', () => {
    // σημεῖον (perispomenon/iota) vs a hypothetical σημειον (bare) should
    // normalize identically once accents are stripped.
    expect(norm('σημεῖον')).toBe(norm('σημειον'));
    // Elision apostrophes (both ASCII-lookalike ’ and modifier-letter ʼ) are
    // themselves stripped by the [^α-ωa-z ] filter — the base letter survives.
    expect(norm('δ’')).toBe('δ');
    expect(norm('δʼ')).toBe('δ');
  });

  it('collapses whitespace and trims', () => {
    expect(norm('  πολλὰ   κενα   ')).toBe('πολλα κενα');
  });
});

describe('extractChaptersExplicit', () => {
  const spine: SpineForChapters = {
    segments: [
      { column: '1a', lines: [{ n: 1, text: 'x' }] },
      { column: '1b', lines: [{ n: 1, text: 'x' }] },
    ],
  };

  it('parses manifest-declared Bekker starts and marks the first as bookstart', () => {
    const chapters = extractChaptersExplicit(spine, [
      { n: 1, bekker: '1a1' },
      { n: 2, bekker: '1a16' },
      { n: 3, bekker: '1b4', title: 'Of Something' },
    ]);
    expect(chapters).toEqual([
      { book: 1, chapter: '1', column: '1a', line: '1', wordIndex: 0, bookstart: true },
      { book: 1, chapter: '2', column: '1a', line: '16', wordIndex: 0, bookstart: false },
      {
        book: 1, chapter: '3', column: '1b', line: '4', wordIndex: 0, bookstart: false,
        title: 'Of Something',
      },
    ]);
  });

  it('skips malformed bekker refs without throwing', () => {
    const chapters = extractChaptersExplicit(spine, [
      { n: 1, bekker: 'not-a-ref' },
      { n: 2, bekker: '1a5' },
    ]);
    expect(chapters).toEqual([
      { book: 1, chapter: '2', column: '1a', line: '5', wordIndex: 0, bookstart: true },
    ]);
  });
});

describe('extractChaptersGrc', () => {
  // A tiny two-chapter spine: book 1 spans column 1a only.
  const spine: SpineForChapters = {
    segments: [
      {
        column: '1a',
        lines: [
          { n: 1, text: 'παντες ανθρωποι του ειδεναι ορεγονται φυσει' },
          { n: 2, text: 'δευτερον κεφαλαιον αρχεται ενταυθα ακριβως' },
        ],
      },
    ],
  };

  it('anchors the first chapter at the spine start and text-aligns later chapters via a word prefix', () => {
    const grcXml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <div type="textpart" subtype="book" n="1">
        <div type="textpart" subtype="section" n="1">
          <p>παντες ανθρωποι του ειδεναι ορεγονται φυσει</p>
        </div>
        <div type="textpart" subtype="section" n="2">
          <p>δευτερον κεφαλαιον αρχεται ενταυθα ακριβως</p>
        </div>
      </div>
    </body></text></TEI>`;
    const chapters = extractChaptersGrc(spine, grcXml, { chapterSubtype: 'section' });
    expect(chapters).toEqual([
      { book: 1, chapter: '1', column: '1a', line: '1', wordIndex: 0, bookstart: true },
      { book: 1, chapter: '2', column: '1a', line: '2', wordIndex: 0, bookstart: false },
    ]);
  });

  it('matches a chapter opening whose accents/breathing differ from the spine', () => {
    // Spine line 2 has bare "δευτερον" (no diacritics, as if OCR/TLG-normalized);
    // the grc TEI opening for chapter 2 carries accents. norm() must equate them.
    const accentedSpine: SpineForChapters = {
      segments: [
        {
          column: '1a',
          lines: [
            { n: 1, text: 'παντες ανθρωποι του ειδεναι ορεγονται φυσει' },
            { n: 2, text: 'δεύτερον κεφάλαιον ἄρχεται ἐνταῦθα ἀκριβῶς' },
          ],
        },
      ],
    };
    const grcXml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <div type="textpart" subtype="book" n="1">
        <div type="textpart" subtype="section" n="1">
          <p>παντες ανθρωποι του ειδεναι ορεγονται φυσει</p>
        </div>
        <div type="textpart" subtype="section" n="2">
          <p>δεῦτερον κεφάλαιον ἄρχεται ἐνταῦθα ἀκριβῶς</p>
        </div>
      </div>
    </body></text></TEI>`;
    const chapters = extractChaptersGrc(accentedSpine, grcXml, { chapterSubtype: 'section' });
    expect(chapters[1]).toEqual({
      book: 1, chapter: '2', column: '1a', line: '2', wordIndex: 0, bookstart: false,
    });
  });

  it('falls back to the div Bekker milestone when the opening text does not match the spine', () => {
    // Chapter 2's opening text is completely unrelated to the spine content,
    // but the div carries an inline Bekker milestone pinning it to 1a,2.
    const grcXml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <div type="textpart" subtype="book" n="1">
        <div type="textpart" subtype="section" n="1">
          <p><milestone unit="page" n="1a"/><milestone unit="line" n="1"/>παντες ανθρωποι του ειδεναι ορεγονται φυσει</p>
        </div>
        <div type="textpart" subtype="section" n="2">
          <p><milestone unit="line" n="2"/>ολως αλλο κειμενον που δεν ταιριαζει καθολου</p>
        </div>
      </div>
    </body></text></TEI>`;
    const chapters = extractChaptersGrc(spine, grcXml, { chapterSubtype: 'section' });
    expect(chapters[1]).toMatchObject({ book: 1, chapter: '2', column: '1a', line: '2' });
  });

  it('marks bookstart true only for the first chapter of each book', () => {
    const twoBookSpine: SpineForChapters = {
      segments: [
        { column: '1a', lines: [{ n: 1, text: 'πρωτο βιβλιο πρωτη γραμμη εδω' }] },
        { column: '2a', lines: [{ n: 1, text: 'δευτερο βιβλιο πρωτη γραμμη εδω' }] },
      ],
    };
    const grcXml = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>
      <div type="textpart" subtype="book" n="1">
        <div type="textpart" subtype="section" n="1">
          <p>πρωτο βιβλιο πρωτη γραμμη εδω</p>
        </div>
      </div>
      <div type="textpart" subtype="book" n="2">
        <div type="textpart" subtype="section" n="1">
          <p>δευτερο βιβλιο πρωτη γραμμη εδω</p>
        </div>
      </div>
    </body></text></TEI>`;
    const chapters = extractChaptersGrc(twoBookSpine, grcXml, { chapterSubtype: 'section' });
    expect(chapters).toEqual([
      { book: 1, chapter: '1', column: '1a', line: '1', wordIndex: 0, bookstart: true },
      { book: 2, chapter: '1', column: '2a', line: '1', wordIndex: 0, bookstart: true },
    ]);
  });
});
