// The whole-work export of an IMPORTED text, end to end: import → registry
// manifest → documentCompileInput → compileWorkMarkdown. An import has Book and
// chapter BOUNDARIES (works/citationDivisions, works/divisions), not marks, and
// the export used to split only at marks — so the Physics printed "## Book Α"
// once, every later book as a stray "#### Β." heading, and no chapters at all.
import { describe, expect, it } from 'vitest';
import { createSourceImport } from '../../import/createSourceImport';
import type { SourceImport } from '../../import/createSourceImport';
import { freeWorkManifest } from '../../works/freeWorks';
import { documentCompileInput } from '../documentExport';
import { compileWorkMarkdown } from '../compile';
import type { CompileMode } from '../compile';

const rowsOf = (refs: string[]) => refs.map((ref) => ({ ref, text: `gr ${ref}` }));

/** The markdown a whole-work export writes, with every row translated. */
function exported(imported: SourceImport, mode: CompileMode = 'english'): string {
  const { work, file } = imported;
  const translated = { ...file, englishLines: (file.meta.rowRefs ?? []).map((ref) => `en ${ref}`) };
  const prepared = documentCompileInput(translated, freeWorkManifest(work));
  return compileWorkMarkdown(prepared.chapters, prepared.work, { mode }).markdown;
}

const headingsOf = (md: string) => md.split('\n').filter((l) => l.startsWith('#'));

/** Historia plantarum's shape: each book opens with its printed title. */
const hp = () =>
  createSourceImport({
    title: 'HP',
    levelNames: ['Book', 'chapter', 'section', 'line'],
    rows: rowsOf(['1.t.1.1', '1.t.1.2', '1.1.1.1', '1.1.1.2', '1.2.1.1', '2.t.1.1', '2.1.1.1', '2.2.1.1']),
  });

describe('whole-work export of an import with Books and chapters', () => {
  it('heads every Book and every chapter, in order', () => {
    expect(headingsOf(exported(hp()))).toEqual([
      '# HP',
      '## Book 1',
      '### Chapter 1',
      '### Chapter 2',
      '## Book 2',
      '### Chapter 1',
      '### Chapter 2',
    ]);
  });

  it('puts every row’s English under its own chapter, once', () => {
    const md = exported(hp());
    for (const ref of ['1.1.1.1', '1.1.1.2', '1.2.1.1', '2.1.1.1', '2.2.1.1']) {
      expect(md.split(`en ${ref}`)).toHaveLength(2);
    }
    expect(md.indexOf('en 1.2.1.1')).toBeGreaterThan(md.indexOf('### Chapter 2'));
    expect(md.indexOf('en 2.1.1.1')).toBeGreaterThan(md.indexOf('## Book 2'));
  });

  it('keeps a book’s untitled title lines with its first chapter', () => {
    // "1.t.1.2" is a title line that is not the heading; it stays in the text.
    const md = exported(hp());
    expect(md.indexOf('en 1.t.1.2')).toBeGreaterThan(md.indexOf('### Chapter 1'));
    expect(md.indexOf('en 1.t.1.2')).toBeLessThan(md.indexOf('en 1.1.1.1'));
  });

  it('heads the Books and chapters in a bilingual export too', () => {
    expect(headingsOf(exported(hp(), 'bilingual'))).toEqual([
      '# HP',
      '## Book 1',
      '### Chapter 1',
      '### Chapter 2',
      '## Book 2',
      '### Chapter 1',
      '### Chapter 2',
    ]);
  });

  it('heads the Physics’ Books from the divisions table, with their letters', () => {
    // The disc route's shape: one printed title per book ("t", "8t"), Books
    // and chapters laid down by works/divisions.
    const imported = createSourceImport({
      title: 'Physics',
      levelNames: ['Bekker page', 'line'],
      rows: rowsOf(['184a.t', '184a.10', '184b.15', '192b.8t', '192b.9', '193a.1']),
    });
    imported.work.bookContainers = [
      { label: 'Book Α', start: 1 },
      { label: 'Book Β', start: 2 },
    ];
    imported.work.chapterContainers = [
      { label: 'Chapter 1', row: 2 },
      { label: 'Chapter 2', row: 3 },
      { label: 'Chapter 1', row: 5 },
    ];
    expect(headingsOf(exported(imported))).toEqual([
      '# Physics',
      '## Book Α',
      '### Chapter 1',
      '### Chapter 2',
      '## Book Β',
      '### Chapter 1',
    ]);
  });
});

describe('whole-work export of an import with chapters and no Books', () => {
  it('heads each chapter, with no Book heading over them', () => {
    // Theophrastus' fragments: Fragment › section › line.
    const imported = createSourceImport({
      title: 'Fragmenta',
      levelNames: ['Fragment', 'section', 'line'],
      rows: rowsOf(['4.t.1', '4.1.1', '5.1.1', '5.2.1']),
    });
    expect(headingsOf(exported(imported))).toEqual(['# Fragmenta', '### Fragment 4', '### Fragment 5']);
  });
});

describe('whole-work export of an import with no divisions', () => {
  it('is the plain single document it always was', () => {
    const imported = createSourceImport({ title: 'Ach', levelNames: ['line'], rows: rowsOf(['1', '2', '3']) });
    expect(headingsOf(exported(imported))).toEqual(['# Ach']);
  });
});
