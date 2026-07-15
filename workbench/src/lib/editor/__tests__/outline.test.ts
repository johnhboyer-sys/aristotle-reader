import { describe, expect, it } from 'vitest';
import { buildOutline, buildOutlineTree, type OutlineItem } from '../outline';
import { buildRowDoc, type InlineRun } from '../serialize';
import { emptyRowDocJSON } from '../schema';
import type { RowModel } from '../model';
import { DEFAULT_PROFILE, type WorkProfile } from '../../works/profile';

const t = (text: string): InlineRun => ({ kind: 'text', text, marks: {} });
const row = (greek: string, opts: Partial<RowModel> = {}): RowModel => ({
  address: { scheme: 'plain-line', raw: '1' },
  greek,
  english: emptyRowDocJSON(),
  ...opts,
});

// A Summa-shaped profile: Part(book) › Question(chapter) › Article(heading) ›
// Article title(heading).
const SUMMA: WorkProfile = {
  levels: [
    { name: 'Part', navRole: 'book' },
    { name: 'Question', navRole: 'chapter' },
    { name: 'Article', navRole: 'heading' },
    { name: 'Article title', navRole: 'heading' },
  ],
};

describe('buildOutline', () => {
  it('includes only heading rows, in order, labeled by their translation, with nav-role', () => {
    const rows = [
      row('Articulus 1', { headingLevel: 3, english: buildRowDoc([t('Article 1')]).toJSON() }),
      row('Ad primum sic proceditur'),
      row('Utrum Deus sit', { headingLevel: 4, english: buildRowDoc([t('Whether God exists')]).toJSON() }),
    ];
    expect(buildOutline(rows, SUMMA)).toEqual([
      { rowIndex: 0, level: 3, navRole: 'heading', label: 'Article 1' },
      { rowIndex: 2, level: 4, navRole: 'heading', label: 'Whether God exists' },
    ]);
  });

  it('resolves nav-role from the profile (Part→book, Question→chapter)', () => {
    const rows = [
      row('Ia', { headingLevel: 1, english: buildRowDoc([t('Part I')]).toJSON() }),
      row('Quaestio 2', { headingLevel: 2, english: buildRowDoc([t('Question 2')]).toJSON() }),
    ];
    expect(buildOutline(rows, SUMMA)).toEqual([
      { rowIndex: 0, level: 1, navRole: 'book', label: 'Part I' },
      { rowIndex: 1, level: 2, navRole: 'chapter', label: 'Question 2' },
    ]);
  });

  it('falls back to the original text when the heading is untranslated', () => {
    const rows = [row('Articulus 1', { headingLevel: 1 })];
    expect(buildOutline(rows, DEFAULT_PROFILE)).toEqual([
      { rowIndex: 0, level: 1, navRole: 'heading', label: 'Articulus 1' },
    ]);
  });

  it('labels from the PARAGRAPH layer when that is where the translation lives (e.g. the Summa)', () => {
    const rows = [
      row('Articulus 1', { headingLevel: 1, englishPara: buildRowDoc([t('Article 1')]).toJSON() }),
    ];
    expect(buildOutline(rows, DEFAULT_PROFILE)).toEqual([
      { rowIndex: 0, level: 1, navRole: 'heading', label: 'Article 1' },
    ]);
  });

  it('returns [] when no row carries a heading level', () => {
    expect(buildOutline([row('plain'), row('text')], DEFAULT_PROFILE)).toEqual([]);
  });
});

describe('buildOutlineTree', () => {
  const item = (rowIndex: number, level: number, navRole: OutlineItem['navRole']): OutlineItem => ({
    rowIndex,
    level,
    navRole,
    label: `#${rowIndex}`,
  });
  // Assert nesting only: (rowIndex, [children]).
  const shape = (nodes: ReturnType<typeof buildOutlineTree>): unknown =>
    nodes.map((n) => [n.item.rowIndex, shape(n.children)]);

  it('nests Book › Chapter › heading', () => {
    const tree = buildOutlineTree([
      item(0, 1, 'book'),
      item(1, 2, 'chapter'),
      item(2, 3, 'heading'),
      item(3, 4, 'heading'),
    ]);
    expect(shape(tree)).toEqual([[0, [[1, [[2, [[3, []]]]]]]]]);
  });

  it('makes same-tier rows siblings and starts a fresh subtree at the next Chapter/Book', () => {
    const tree = buildOutlineTree([
      item(0, 1, 'book'),
      item(1, 2, 'chapter'),
      item(2, 3, 'heading'),
      item(3, 2, 'chapter'),
      item(4, 3, 'heading'),
      item(5, 1, 'book'),
    ]);
    expect(shape(tree)).toEqual([
      [0, [[1, [[2, []]]], [3, [[4, []]]]]],
      [5, []],
    ]);
  });

  it('nests a heading before any chapter directly under the book', () => {
    const tree = buildOutlineTree([
      item(0, 1, 'book'),
      item(1, 3, 'heading'),
      item(2, 2, 'chapter'),
      item(3, 3, 'heading'),
    ]);
    expect(shape(tree)).toEqual([[0, [[1, []], [2, [[3, []]]]]]]);
  });

  it('puts a chapter with no preceding book at the root', () => {
    const tree = buildOutlineTree([item(0, 2, 'chapter'), item(1, 3, 'heading')]);
    expect(shape(tree)).toEqual([[0, [[1, []]]]]);
  });

  it('nests deeper headings under shallower ones (all-heading doc)', () => {
    const tree = buildOutlineTree([
      item(0, 1, 'heading'),
      item(1, 2, 'heading'),
      item(2, 2, 'heading'),
      item(3, 1, 'heading'),
    ]);
    expect(shape(tree)).toEqual([
      [0, [[1, []], [2, []]]],
      [3, []],
    ]);
  });
});
