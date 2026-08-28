// Books-as-containers wiring guards for the library rail (BOOKS-SPEC §B3), in
// the source-scan style of lineSplitWiring.test.ts — the rail is a Svelte
// component with no headless DOM here, so what CAN be checked mechanically is
// the wiring: that "+ Book" reaches a container handler and NOT the editor,
// that the Book layer renders through groupOutlineByBooks, and that the
// "Begin a book here" item passes (bookIndex, rootOrdinal). The grouping
// itself is unit-tested in outline.test.ts / bookContainers.test.ts.
import { beforeAll, describe, expect, it } from 'vitest';

import { buildOutlineTree, groupOutlineByBooks } from '../../lib/editor/outline';
import type { OutlineItem } from '../../lib/editor/outline';

let railSource = '';
let appSource = '';

beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
    readFileSync(path: string, encoding: 'utf-8'): string;
  };
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
    fileURLToPath(url: URL): string;
  };
  const read = (rel: string) =>
    fs.readFileSync(nodeUrl.fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
  railSource = read('../LibraryRail.svelte');
  appSource = read('../../App.svelte');
});

describe('"+ Book" creates a container, never a line of text', () => {
  it('the rail button calls onAddBookContainer and the old insert-a-line props are gone', () => {
    expect(railSource).toContain('onclick={() => onAddBookContainer?.()}>+ Book<');
    expect(railSource).not.toContain('onAddBook?.');
    expect(railSource).not.toContain('onAddChapter');
    // "+ Chapter" is removed entirely: chapters are made by marking a line.
    expect(railSource).not.toContain('+ Chapter');
  });

  it('App no longer writes a heading row from the rail (the bug being fixed)', () => {
    expect(appSource).not.toContain('appendHeadingForRole');
    expect(appSource).toContain('updateFreeWorkBookContainers');
    expect(appSource).toContain('createBookContainerQueue');
  });

  it('every container handler is a pure transform routed through the edit queue', () => {
    for (const op of [
      'withAddedBookContainer',
      'withInsertedBookContainerAfter',
      'withRenamedBookContainer',
      'withRemovedBookContainer',
      'withBookStartAt',
    ]) {
      // Each transform reads `current` — the queue's newest list — never the
      // possibly-stale saved snapshot, which is what lost an edit before.
      expect(appSource, `${op} wired`).toMatch(
        new RegExp(`editBookContainers\\(\\(current\\) =>\\s*${op}\\(current`),
      );
    }
    expect(appSource).toContain('void bookQueue.edit(workId, docBookContainers, transform);');
    expect(appSource).toContain('await updateFreeWorkBookContainers(workId, containers);');
    expect(appSource).toContain('await reloadWorks();');
  });

  it('the rail never offers a Book tier for MARKING a row', () => {
    // Marking a row as a Book writes heading metadata into the chapter file —
    // the same text mutation "+ Book" was fixed to stop doing. Books are
    // containers; only Chapter/heading tiers stay markable.
    expect(railSource).toContain("lvl.navRole === 'book' ? [] :");
    expect(railSource).toContain('{#each markableLevels as lvl (lvl.level)}');
    expect(railSource).not.toContain('{#each levels as lvl, i (i)}');
  });
});

describe('the Book layer renders only when containers exist', () => {
  it('the rail groups the outline and falls back to the flat tree', () => {
    expect(railSource).toContain('groupOutlineByBooks(outlineTree, bookContainers)');
    // No Book containers → the flat render. The condition widened when chapter
    // boundaries arrived (a work can have those and no marks at all), but the
    // outline still renders through the same snippet.
    expect(railSource).toContain('{:else if outlineTree.length > 0 || chapterContainers.length > 0}');
    expect(railSource).toContain('{@render outlineNodes(outlineTree)}');
    // A Book's chapters go through the SAME snippet as the flat tree.
    expect(railSource).toContain('{@render outlineNodes(bk.nodes)}');
  });

  it('an empty Book renders a hint instead of a blank row', () => {
    expect(railSource).toContain('{#if bk.nodes.length > 0}');
    expect(railSource).toContain('No chapters yet');
  });

  it('Books reuse the .book-row chevron and the expanded map, keyed :book:', () => {
    expect(railSource).toContain('`${selected?.workId ?? \'\'}:book:${index}`');
    expect(railSource).toContain('class="book-row"');
  });

  it('the Book menu offers Rename / Add Book after / Remove (chapters stay)', () => {
    expect(railSource).toContain('Remove Book (chapters stay)');
    expect(railSource).toContain('Add Book after');
    expect(railSource).toContain('onclick={bookMenuRename}');
    // Book rename is keyed separately from the heading rename.
    expect(railSource).toContain('let editingBook = $state<number | null>(null)');
  });
});

describe('"Begin a book here…" carries (bookIndex, rootOrdinal)', () => {
  it('the menu section is gated on containers AND on the node being a root', () => {
    // Needs a SECOND Book to move: the first always begins at the document top.
    expect(railSource).toContain('{#if outlineBooks.length > 1 && railMenu.rootOrdinal > 0}');
    expect(railSource).toContain('{#each outlineBooks.slice(1) as bk (bk.index)}');
    expect(railSource).toContain('Begin a book here…');
    expect(railSource).toContain('onclick={() => railMenuSetBookStart(bk.index)}');
    expect(railSource).toContain('onSetBookStart?.(bookIndex, railMenu.rootOrdinal)');
    // The ordinal is the 1-based position in the ROOT list, and only a Book- or
    // Chapter-marked root gets one: the export cannot cut the text at a heading,
    // so a Book beginning there would group differently in the rail than in the
    // compiled output.
    expect(railSource).toContain("node.item.navRole === 'book' || node.item.navRole === 'chapter'");
    expect(railSource).toContain('[node.item.rowIndex, i + 1] as const');
  });

  it('the rail menu keeps its viewport clamping and internal scroll', () => {
    expect(railSource).toContain('maxHeight: Math.max(140, vh - y - RAIL_MENU_MARGIN)');
    expect(railSource).toContain('max-height:${railMenu.maxHeight}px');
    expect(railSource).toContain('max-height:${bookMenu.maxHeight}px');
  });
});

describe('what the rail actually renders per Book (grouping over a real outline)', () => {
  const item = (rowIndex: number, level: number, label: string): OutlineItem => ({
    rowIndex,
    level,
    navRole: level === 1 ? 'chapter' : 'heading',
    depth: level - 1,
    label,
  });

  it('containers put the right chapters under the right Books', () => {
    const roots = buildOutlineTree([
      item(0, 1, 'One'),
      item(1, 2, 'One.a'),
      item(2, 1, 'Two'),
      item(3, 1, 'Three'),
    ]);
    expect(roots.map((r) => r.item.label)).toEqual(['One', 'Two', 'Three']);

    const books = groupOutlineByBooks(roots, [
      { label: 'Alpha', start: 1 },
      { label: 'Beta', start: 3 },
      { label: 'Gamma', start: 9 },
    ]);
    expect(books.map((b) => [b.index, b.label, b.nodes.map((n) => n.item.label)])).toEqual([
      [0, 'Alpha', ['One', 'Two']],
      [1, 'Beta', ['Three']],
      // Past the end of the outline: a legitimately EMPTY Book, still rendered.
      [2, 'Gamma', []],
    ]);
    // Nested headings stay with their chapter, not lifted into the Book.
    expect(books[0].nodes[0].children.map((c) => c.item.label)).toEqual(['One.a']);
  });
});
