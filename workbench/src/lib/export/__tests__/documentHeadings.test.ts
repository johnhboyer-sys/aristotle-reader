/**
 * The lines a translator marks are headings in the compiled file.
 *
 * Until now the export layer read no heading mark at all: "Objection 1",
 * "Sed contra", "Respondeo" and an Article's "Utrum…" title each printed as an
 * ordinary paragraph, and a Word document compiled from a fully marked-up work
 * had no outline. John's rule for the bilingual side, given 2026-07-31 and
 * applying to every tier: the ENGLISH is the heading, the source goes under it
 * in italics.
 */
import { describe, expect, it } from 'vitest';
import { documentToPandocMarkdown } from '../pandocMarkdown';
import { compileWorkMarkdown } from '../compile';
import type { ChapterFile, HeaderMark } from '../../chapterfile/types';
import type { WorkManifest } from '../../works/manifest';

// Part / Question / Article / Utrum — the Summa's shape, one tier per role.
const WORK: WorkManifest = {
  id: 'summa',
  title: 'Summa Theologiae',
  author: '',
  scheme: 'paragraph',
  books: [{ n: 1, label: '' }],
  profile: {
    levels: [
      { name: 'Part', navRole: 'book', depth: 0 },
      { name: 'Question', navRole: 'chapter', depth: 1 },
      { name: 'Article', navRole: 'heading', depth: 2 },
      { name: 'Objection', navRole: 'heading', depth: 3 },
      { name: 'Utrum', navRole: 'subtitle', depth: 3 },
    ],
  },
};

function docFile(
  rows: { source: string; english?: string; title?: string }[],
  headers: HeaderMark[],
): ChapterFile {
  const titles = rows.map((r) => r.title ?? '');
  return {
    meta: {
      schemaVersion: 1,
      work: 'summa',
      book: 1,
      chapter: 1,
      citationScheme: 'paragraph',
      spanStart: '¶1',
      spanEnd: `¶${rows.length}`,
      ...(headers.length > 0 ? { headers } : {}),
    },
    greekLines: rows.map((r) => r.source),
    englishLines: rows.map((r) => r.english ?? ''),
    ...(titles.some((t) => t.length > 0) ? { headingTitleLines: titles } : {}),
    footnotes: [],
  };
}

const SAMPLE = [
  { source: 'Articulus 1', english: 'Article 1' },
  { source: 'Utrum Deus sit', english: 'Whether God exists' },
  { source: 'Obiectio 1', english: 'Objection 1' },
  { source: 'Videtur quod non.', english: 'It seems that he does not.' },
];
const MARKS: HeaderMark[] = [
  { row: 1, level: 3 }, // Article  → heading tier, shallowest
  { row: 2, level: 5 }, // Utrum    → subtitle
  { row: 3, level: 4 }, // Objection → heading tier, one deeper
];

function paragraphsOf(markdown: string): string[] {
  return markdown.trim().split('\n\n');
}

describe('marked rows compile as headings', () => {
  it('gives each heading tier its own level, starting at ####', () => {
    const paras = paragraphsOf(documentToPandocMarkdown(docFile(SAMPLE, MARKS), WORK));
    expect(paras).toEqual([
      '# Summa Theologiae',
      '#### Article 1',
      '*Whether God exists*',
      '##### Objection 1',
      'It seems that he does not.',
    ]);
  });

  it('prints the heading once — never again as body text', () => {
    const md = documentToPandocMarkdown(docFile(SAMPLE, MARKS), WORK);
    expect(md.match(/Article 1/g)).toHaveLength(1);
  });

  it('reads none of it when the work has no marks (unchanged output)', () => {
    const paras = paragraphsOf(documentToPandocMarkdown(docFile(SAMPLE, []), WORK));
    expect(paras).toEqual([
      '# Summa Theologiae',
      'Article 1',
      'Whether God exists',
      'Objection 1',
      'It seems that he does not.',
    ]);
  });

  it('keeps an untranslated heading, in its own language', () => {
    const rows = [{ source: 'Articulus 1' }, { source: 'Videtur quod non.', english: 'It seems not.' }];
    const paras = paragraphsOf(documentToPandocMarkdown(docFile(rows, [{ row: 1, level: 3 }]), WORK));
    expect(paras[1]).toBe('#### Articulus 1');
  });

  it('prefers the title the translator typed over the translation', () => {
    const rows = [{ source: 'Articulus 1', english: 'Article 1', title: 'Article I: On God' }];
    const paras = paragraphsOf(documentToPandocMarkdown(docFile(rows, [{ row: 1, level: 3 }]), WORK));
    expect(paras[1]).toBe('#### Article I: On God');
  });

  it('still reads marks on a work that declares no profile', () => {
    // DEFAULT_PROFILE is two in-page heading tiers, which is what a work gets
    // before anyone opens "Manage levels…".
    const bare = { ...WORK, profile: undefined } as WorkManifest;
    const paras = paragraphsOf(
      documentToPandocMarkdown(docFile(SAMPLE, [{ row: 1, level: 1 }, { row: 3, level: 2 }]), bare),
    );
    expect(paras).toEqual([
      '# Summa Theologiae',
      '#### Article 1',
      'Whether God exists',
      '##### Objection 1',
      'It seems that he does not.',
    ]);
  });
});

describe('bilingual headings — English over the source', () => {
  it('alternating: the English is the heading, the source italic under it', () => {
    const paras = paragraphsOf(
      documentToPandocMarkdown(docFile(SAMPLE, MARKS), WORK, 'bilingual', 'alternating'),
    );
    expect(paras.slice(1, 6)).toEqual([
      '#### Article 1',
      '*Articulus 1*',
      '*Whether God exists*',
      '*Utrum Deus sit*',
      '##### Objection 1',
    ]);
  });

  it('translation-first does not flip a heading — English still leads', () => {
    const paras = paragraphsOf(
      documentToPandocMarkdown(docFile(SAMPLE, MARKS), WORK, 'bilingual', 'alternating', 'translation-first'),
    );
    expect(paras[1]).toBe('#### Article 1');
    expect(paras[2]).toBe('*Articulus 1*');
  });

  it('table: a heading closes the table and stands on the page', () => {
    const rows = [
      { source: 'Prooemium', english: 'Preface' },
      { source: 'Articulus 1', english: 'Article 1' },
      { source: 'Videtur quod non.', english: 'It seems not.' },
    ];
    const paras = paragraphsOf(
      documentToPandocMarkdown(docFile(rows, [{ row: 2, level: 3 }]), WORK, 'bilingual', 'table'),
    );
    expect(paras[1].startsWith('|  |  |')).toBe(true); // the rows before it
    expect(paras[2]).toBe('#### Article 1');
    expect(paras[3]).toBe('*Articulus 1*');
    expect(paras[4].startsWith('|  |  |')).toBe(true); // a fresh table after
    expect(paras[2]).not.toContain('|');
  });

  it('block: each language stream carries the heading in its own tongue', () => {
    const rows = [
      { source: 'Articulus 1', english: 'Article 1' },
      { source: 'Videtur quod non.', english: 'It seems not.' },
    ];
    const paras = paragraphsOf(
      documentToPandocMarkdown(docFile(rows, [{ row: 1, level: 3 }]), WORK, 'bilingual', 'block'),
    );
    expect(paras.slice(1)).toEqual([
      '#### Articulus 1',
      'Videtur quod non.',
      '#### Article 1',
      'It seems not.',
    ]);
  });
});

describe('marked rows inside a compiled container work', () => {
  const CONTAINER = {
    ...WORK,
    books: [{ n: 1, label: 'Prima Pars' }],
    documentBooks: [{ n: 1, label: 'Prima Pars', chapters: [{ n: 1, label: 'Question 2' }] }],
  } as WorkManifest;

  it('emits in-page headings under the Book/Chapter headings, the root row once', () => {
    // Row 1 is the chapter root: compile renders it as "### Question 2" and the
    // body must not repeat it. Rows 2 and 3 are in-page marks.
    const file = docFile(
      [
        { source: 'Quaestio 2', english: 'Question 2' },
        { source: 'Articulus 1', english: 'Article 1' },
        { source: 'Obiectio 1', english: 'Objection 1' },
        { source: 'Videtur quod non.', english: 'It seems not.' },
      ],
      [{ row: 1, level: 2 }, { row: 2, level: 3 }, { row: 3, level: 4 }],
    );
    const md = compileWorkMarkdown([file], CONTAINER).markdown;
    expect(md).toBe(
      '# Summa Theologiae\n\n' +
        '## Prima Pars\n\n' +
        '### Question 2\n\n' +
        '#### Article 1\n\n' +
        '##### Objection 1\n\n' +
        'It seems not.\n',
    );
  });
});
