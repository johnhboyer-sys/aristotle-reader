// Running references for imported works. Without these an imported Republic
// exports as clean prose with no 327a anywhere — losing the one thing the
// import existed to capture.
import { describe, expect, it } from 'vitest';
import { sourceRefStamps, documentToPandocMarkdown } from '../pandocMarkdown';
import { createSourceImport } from '../../import/createSourceImport';
import type { WorkMeta } from '../../citation/types';

const rows = [
  { ref: '327.a.1', text: 'Κατέβην χθὲς' },
  { ref: '327.a.2', text: 'προσευξόμενός τε' },
  { ref: '327.b.1', text: 'προσευξάμενοι δὲ' },
  { ref: '328.a.1', text: 'καὶ ὁ Ἀδείμαντος' },
];

const chapterOf = (spec: Parameters<typeof createSourceImport>[0]) => createSourceImport(spec).file;

describe('sourceRefStamps', () => {
  it('stamps when a tier above the line changes, not every line', () => {
    // Only the changed tail is printed — repeating "327." on every stamp is
    // how a margin becomes unreadable.
    const stamps = sourceRefStamps(chapterOf({ title: 'Respublica', rows }));
    expect([...stamps.entries()]).toEqual([
      [0, '[327.a]'],
      [2, '[b]'],
      [3, '[328.a]'],
    ]);
  });

  it('never stamps the line number itself', () => {
    // "327.a.1" must not appear — a reader cites the section, not our row.
    const stamps = sourceRefStamps(chapterOf({ title: 'R', rows }));
    for (const stamp of stamps.values()) expect(stamp).not.toMatch(/\.\d+\]$/);
  });

  it('works at any tier depth, without knowing the source’s vocabulary', () => {
    // Aristotle: Bekker page then line, two tiers rather than three.
    const bekker = chapterOf({
      title: 'De Anima',
      rows: [
        { ref: '402a.1', text: 'one' },
        { ref: '402a.2', text: 'two' },
        { ref: '402b.1', text: 'three' },
      ],
    });
    expect([...sourceRefStamps(bekker).values()]).toEqual(['[402a]', '[402b]']);
  });

  it('stamps a one-component address, which is the citation itself', () => {
    // Nothing to strip: an epigram numbered 1, 2, 3 is cited by that number.
    const flat = chapterOf({ title: 'F', rows: [{ ref: '1', text: 'a' }, { ref: '2', text: 'b' }] });
    expect([...sourceRefStamps(flat).values()]).toEqual(['[1]', '[2]']);
  });

  it('stamps every section of a Perseus prose text, because each is cited', () => {
    // The shape a real Republic import produces: book . Stephanus section, and
    // the section is the row. Dropping it would leave one [1] for the book.
    const republic = chapterOf({
      title: 'Respublica',
      rows: [
        { ref: '1.327a', text: 'κατέβην' },
        { ref: '1.327b', text: 'προσευξάμενοι' },
        { ref: '1.327c', text: 'καὶ ὀλίγῳ' },
        { ref: '2.357a', text: 'ἐγὼ μὲν οὖν' },
      ],
    });
    expect([...sourceRefStamps(republic).values()]).toEqual(['[1.327a]', '[327b]', '[327c]', '[2.357a]']);
  });

  it('stamps a Bekker page once, not each of its lines', () => {
    // The shape a real disc import produces in verse mode, title line included.
    const deAnima = chapterOf({
      title: 'De anima',
      rows: [
        { ref: '402a.t', text: 'ΠΕΡΙ ΨΥΧΗΣ Α' },
        { ref: '402a.1', text: 'Τῶν καλῶν' },
        { ref: '402a.2', text: 'λον δ’ ἑτέραν' },
        { ref: '402b.1', text: 'ἔστι δὲ' },
      ],
    });
    expect([...sourceRefStamps(deAnima).values()]).toEqual(['[402a]', '[402b]']);
  });

  it('gives nothing for a file that is not an import', () => {
    expect(sourceRefStamps({ meta: {} } as never).size).toBe(0);
  });

  it('does not re-stamp when a tier returns to a value it had before', () => {
    // Transposed fragments: the stamp tracks CHANGE, so 327.a coming back
    // after 327.b stamps again — which is right, the reader needs to know.
    const jumbled = chapterOf({
      title: 'J',
      rows: [
        { ref: '1.a.1', text: 'one' },
        { ref: '1.b.1', text: 'two' },
        { ref: '1.a.2', text: 'three' },
      ],
    });
    expect([...sourceRefStamps(jumbled).values()]).toEqual(['[1.a]', '[b]', '[a]']);
  });
});

describe('in the exported markdown', () => {
  const work: WorkMeta = {
    id: 'respublica',
    title: 'Respublica',
    author: 'Plato',
    scheme: 'source-ref',
    books: [],
  };

  it('carries the reference into the English export', () => {
    const file = chapterOf({ title: 'Respublica', rows });
    // Translate a row so it renders (untranslated rows become an ellipsis).
    file.englishLines[0] = 'I went down to the Piraeus';
    const markdown = documentToPandocMarkdown(file, work);
    expect(markdown).toContain('[327.a]');
  });

  it('leaves an ordinary document export untouched', () => {
    // The regression that matters: files with no row_refs must be byte-identical.
    const plain = {
      meta: { schemaVersion: 1, work: 'doc', book: 1, chapter: 1, citationScheme: 'plain-line' as const, spanStart: '1', spanEnd: '1' },
      greekLines: ['a'],
      englishLines: ['[{"type":"doc","content":[{"type":"paragraph"}]}]'],
      footnotes: [],
    };
    expect(sourceRefStamps(plain).size).toBe(0);
  });
});
