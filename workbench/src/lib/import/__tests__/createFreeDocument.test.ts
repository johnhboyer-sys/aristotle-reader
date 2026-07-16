import { describe, expect, it } from 'vitest';
import { buildDocumentChapterFile, createFreeDocument, slugForTitle } from '../createFreeDocument';
import { parseChapterFile, serializeChapterFile, isValidSplitOffset } from '../../chapterfile';
import { parseRowSegments } from '../../editor/serialize';
import { hydrateFromFile, serializeModel } from '../../library/autosave';
import type { ChapterModel } from '../../editor/model';

const PARA_TEXT = [
  'This is the first sentence. This is the second sentence of paragraph one.',
  '',
  'Paragraph two has exactly one sentence with no internal boundary',
  '',
  'Wrapped prose stays one paragraph',
  'when the lines are not blank-separated. A second sentence follows here.',
].join('\n');

const LINE_TEXT = [
  'μῆνιν ἄειδε θεὰ',
  'Πηληϊάδεω Ἀχιλῆος',
  '',
  'οὐλομένην, ἣ μυρί᾽',
  'ἄλγε᾽ ἔθηκε',
].join('\n');

describe('buildDocumentChapterFile — filling a container slot', () => {
  it('targets the given (work, book, chapter) and segments per scheme', () => {
    const file = buildDocumentChapterFile({
      workId: 'summa-theologiae',
      book: 1,
      chapter: 3,
      scheme: 'paragraph',
      text: PARA_TEXT,
    });
    expect(file.meta.work).toBe('summa-theologiae');
    expect(file.meta.book).toBe(1);
    expect(file.meta.chapter).toBe(3);
    expect(file.meta.citationScheme).toBe('paragraph');
    expect(file.meta.spanStart).toBe('¶1');
    expect(file.greekLines.length).toBe(3);
    // Round-trips through the frozen serializer.
    expect(parseChapterFile(serializeChapterFile(file))).toEqual(file);
  });

  it('a plain-line work numbers rows plainly and round-trips', () => {
    const file = buildDocumentChapterFile({
      workId: 'iliad',
      book: 2,
      chapter: 5,
      scheme: 'plain-line',
      text: LINE_TEXT,
    });
    expect(file.meta.book).toBe(2);
    expect(file.meta.chapter).toBe(5);
    expect(file.meta.spanStart).toBe('1');
    expect(parseChapterFile(serializeChapterFile(file))).toEqual(file);
  });

  it('throws when the text yields no rows', () => {
    expect(() =>
      buildDocumentChapterFile({ workId: 'x', book: 1, chapter: 1, scheme: 'paragraph', text: '   ' }),
    ).toThrow(/no text/i);
  });

  it('produces the same file createFreeDocument writes for chapter 1', () => {
    const { work, file } = createFreeDocument({ title: 'Notes', unit: 'paragraphs', text: PARA_TEXT });
    const direct = buildDocumentChapterFile({
      workId: work.id,
      book: 1,
      chapter: 1,
      scheme: 'paragraph',
      text: PARA_TEXT,
    });
    expect(direct).toEqual(file);
  });
});

describe('slugForTitle', () => {
  it('lowercases, hyphenates, and folds diacritics', () => {
    expect(slugForTitle('Über die Seele!')).toBe('uber-die-seele');
    expect(slugForTitle('  My   New Document ')).toBe('my-new-document');
  });

  it('falls back to "document" when nothing survives (e.g. a Greek title)', () => {
    expect(slugForTitle('Περὶ ψυχῆς')).toBe('document');
  });

  it('uniquifies against existing ids with a numeric suffix', () => {
    expect(slugForTitle('Notes', ['notes'])).toBe('notes-2');
    expect(slugForTitle('Notes', ['notes', 'notes-2'])).toBe('notes-3');
    expect(slugForTitle('Notes', ['other'])).toBe('notes');
  });
});

describe('createFreeDocument — paragraph unit', () => {
  const doc = createFreeDocument({ title: 'Test Prose', unit: 'paragraphs', text: PARA_TEXT });

  it('builds one row per blank-line block (wrapped lines unwrapped)', () => {
    expect(doc.file.greekLines).toEqual([
      'This is the first sentence. This is the second sentence of paragraph one.',
      'Paragraph two has exactly one sentence with no internal boundary',
      'Wrapped prose stays one paragraph when the lines are not blank-separated. A second sentence follows here.',
    ]);
  });

  it('uses the paragraph scheme with ordinal ¶ spans, book/chapter 1/1', () => {
    expect(doc.file.meta.citationScheme).toBe('paragraph');
    expect(doc.file.meta.book).toBe(1);
    expect(doc.file.meta.chapter).toBe(1);
    expect(doc.file.meta.spanStart).toBe('¶1');
    expect(doc.file.meta.spanEnd).toBe('¶3');
    expect(doc.file.meta.columnStarts).toBeUndefined();
    expect(doc.file.meta.paragraphStarts).toBeUndefined();
  });

  it('seeds sentence boundaries into line_splits with ¶N refs, on word boundaries', () => {
    const splits = doc.file.meta.lineSplits ?? [];
    // ¶1 and ¶3 each have one internal boundary; ¶2 has none.
    expect(splits.map((s) => s.ref)).toEqual(['¶1', '¶3']);
    for (const s of splits) {
      const row = doc.file.greekLines[Number(s.ref.slice(1)) - 1];
      expect(isValidSplitOffset(row, s.offset)).toBe(true);
    }
    expect(doc.file.greekLines[0].slice(splits[0].offset)).toBe(
      'This is the second sentence of paragraph one.',
    );
  });

  it('writes k+1 empty English segments for a row with k seeded splits', () => {
    // Load-bearing: hydration's English-count-wins rule would otherwise drop
    // the seeded offsets on first open (see the module header).
    const segCounts = doc.file.englishLines.map((line) => parseRowSegments(line).length);
    expect(segCounts).toEqual([2, 1, 2]);
    for (const line of doc.file.englishLines) {
      for (const seg of parseRowSegments(line)) {
        expect(seg.content?.length ?? 0).toBe(0);
      }
    }
  });

  it('registers a paragraph-scheme work record with the trimmed title', () => {
    expect(doc.work).toEqual({ id: 'test-prose', title: 'Test Prose', scheme: 'paragraph' });
  });

  it('carries a trimmed language on the record only when given', () => {
    const withLang = createFreeDocument({
      title: 'T',
      language: '  German ',
      unit: 'paragraphs',
      text: 'One sentence only',
    });
    expect(withLang.work.language).toBe('German');
    const noLang = createFreeDocument({
      title: 'T',
      language: '   ',
      unit: 'paragraphs',
      text: 'One sentence only',
    });
    expect(noLang.work.language).toBeUndefined();
  });
});

describe('createFreeDocument — line unit', () => {
  const doc = createFreeDocument({ title: 'Test Verse', unit: 'lines', text: LINE_TEXT });

  it('builds one row per non-blank line, blank lines dropped', () => {
    expect(doc.file.greekLines).toEqual([
      'μῆνιν ἄειδε θεὰ',
      'Πηληϊάδεω Ἀχιλῆος',
      'οὐλομένην, ἣ μυρί᾽',
      'ἄλγε᾽ ἔθηκε',
    ]);
  });

  it('uses the plain-line scheme with plain ordinal spans', () => {
    expect(doc.file.meta.citationScheme).toBe('plain-line');
    expect(doc.file.meta.spanStart).toBe('1');
    expect(doc.file.meta.spanEnd).toBe('4');
  });

  it('records blank-line groups as paragraph_starts, no line_splits', () => {
    expect(doc.file.meta.paragraphStarts).toEqual([1, 3]);
    expect(doc.file.meta.lineSplits).toBeUndefined();
  });

  it('omits paragraph_starts when there is no grouping signal ([1] alone)', () => {
    const flat = createFreeDocument({ title: 'T', unit: 'lines', text: 'one\ntwo\nthree' });
    expect(flat.file.meta.paragraphStarts).toBeUndefined();
  });

  it('leaves every English row empty (single empty segment)', () => {
    expect(doc.file.englishLines).toEqual(['', '', '', '']);
  });
});

describe('createFreeDocument — round trips', () => {
  function roundTrip(unit: 'lines' | 'paragraphs', text: string) {
    const { work, file } = createFreeDocument({ title: 'RT', unit, text });
    const content = serializeChapterFile(file);
    const back = parseChapterFile(content, 'createFreeDocument-rt');
    expect(back).toEqual(file);
    return { work, file, content, back };
  }

  it('paragraph doc survives serialize → parse exactly', () => {
    roundTrip('paragraphs', PARA_TEXT);
  });

  it('line doc survives serialize → parse exactly', () => {
    roundTrip('lines', LINE_TEXT);
  });

  it('hydrates with no notice and autosaves back byte-identically (paragraph doc)', () => {
    const { work, file, content, back } = roundTrip('paragraphs', PARA_TEXT);
    // Document-spine hydration: empty corpus spine, addresses from ordinals.
    const h = hydrateFromFile(back, [], work.scheme);
    expect(h.notice).toBeNull();
    expect(h.rows.map((r) => r.address.raw)).toEqual(['¶1', '¶2', '¶3']);
    expect(h.rows[0].splitOffsets).toHaveLength(1);
    expect(h.rows[1].splitOffsets).toBeUndefined();
    expect(h.spans).toEqual({ start: '¶1', end: '¶3' });

    const model: ChapterModel = {
      workId: file.meta.work,
      workTitle: 'RT',
      scheme: work.scheme,
      book: 1,
      bookLabel: '',
      chapter: 1,
      bekkerRange: '¶1–3',
      rows: h.rows,
      footnotes: h.footnotes,
      ...(h.paragraphStarts ? { paragraphStarts: h.paragraphStarts } : {}),
      dirty: false,
    };
    expect(serializeModel(model, h.spans)).toBe(content);
  });

  it('hydrates and autosaves back byte-identically (line doc, paragraph_starts kept)', () => {
    const { work, file, content, back } = roundTrip('lines', LINE_TEXT);
    const h = hydrateFromFile(back, [], work.scheme);
    expect(h.notice).toBeNull();
    expect(h.rows.map((r) => r.address.raw)).toEqual(['1', '2', '3', '4']);
    expect(h.paragraphStarts).toEqual([1, 3]);

    const model: ChapterModel = {
      workId: file.meta.work,
      workTitle: 'RT',
      scheme: work.scheme,
      book: 1,
      bookLabel: '',
      chapter: 1,
      bekkerRange: '1–4',
      rows: h.rows,
      footnotes: h.footnotes,
      paragraphStarts: h.paragraphStarts,
      dirty: false,
    };
    expect(serializeModel(model, h.spans)).toBe(content);
  });
});

describe('createFreeDocument — degenerate inputs', () => {
  it('throws a plain sentence on a blank title', () => {
    expect(() => createFreeDocument({ title: '   ', unit: 'lines', text: 'x' })).toThrow(
      /title/i,
    );
  });

  it('throws a plain sentence when the text yields no rows', () => {
    expect(() => createFreeDocument({ title: 'T', unit: 'lines', text: '' })).toThrow(/no text/i);
    expect(() => createFreeDocument({ title: 'T', unit: 'paragraphs', text: ' \n\n  \n' })).toThrow(
      /no text/i,
    );
  });

  it('a single unterminated paragraph seeds no line_splits', () => {
    const doc = createFreeDocument({ title: 'T', unit: 'paragraphs', text: 'no terminator here' });
    expect(doc.file.meta.lineSplits).toBeUndefined();
    expect(doc.file.greekLines).toEqual(['no terminator here']);
    expect(doc.file.englishLines).toEqual(['']);
  });

  it('uniquifies the work id against existing ids', () => {
    const doc = createFreeDocument(
      { title: 'Notes', unit: 'lines', text: 'x' },
      ['notes', 'metaphysics'],
    );
    expect(doc.work.id).toBe('notes-2');
    expect(doc.file.meta.work).toBe('notes-2');
  });
});
