// D8 Phase D part 3 wiring guards — STRUCTURE EDITING for document-spine
// works: the ChapterEditor plumbing that can't run headless (ProseMirror
// views, keyed remounts, the context menu), in the source-scan style of
// lineSplitWiring.test.ts / paragraphViewWiring.test.ts. The pure command
// halves are unit-tested in rowStructure.test.ts; live behaviour is verified
// in the dev harness.
import { beforeAll, describe, expect, it } from 'vitest';

let chapterSource = '';
let englishSource = '';
let unitSource = '';

beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
    readFileSync(path: string, encoding: 'utf-8'): string;
  };
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
    fileURLToPath(url: URL): string;
  };
  const read = (rel: string) =>
    fs.readFileSync(nodeUrl.fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
  chapterSource = read('../ChapterEditor.svelte');
  englishSource = read('../EnglishCell.svelte');
  unitSource = read('../InterpolatedUnit.svelte');
});

/** Body of a top-level `function name(...)` in ChapterEditor's script. */
function fnBody(name: string): string {
  const start = chapterSource.indexOf(`function ${name}(`);
  expect(start, `function ${name} exists`).toBeGreaterThan(-1);
  const end = chapterSource.indexOf('\n  }', start);
  return chapterSource.slice(start, end);
}

describe('capability gating (D8 §2 — Bekker/corpus rows refuse row-level ops)', () => {
  it('the structure menu is built ONLY under the pure gates; corpus paragraph docs keep the AI-only menu', () => {
    const menu = fnBody('onGreekContextMenu');
    expect(menu).toContain('canEditRowStructure(scheme)');
    expect(menu).toContain('canGroupLines(scheme)');
    // The Busse/corpus fallback inside the paragraph-unit branch is unchanged.
    expect(menu).toContain('aiOnly: true, noun, rowNoun, translateRows: paraTranslateRows');
    // The D6 grid path is intact (Bekker labels + snapping pinned by
    // lineSplitWiring.test.ts).
    expect(menu).toContain('snapToWordStart(row.greek, d.greekStart + within)');
  });

  it('both perform paths re-check the gate (belt and braces, not just menu construction)', () => {
    expect(fnBody('performParagraphSplit')).toContain('if (!canEditRowStructure(scheme)) return;');
    expect(fnBody('performParagraphMerge')).toContain('if (!canEditRowStructure(scheme)) return;');
    expect(fnBody('toggleChunkStart')).toContain('canGroupLines(scheme)');
  });
});

describe('row-level paragraph split/merge (D8 §2)', () => {
  it('split goes through the pure splitParagraphRow and pushes ONE structural undo entry', () => {
    const body = fnBody('performParagraphSplit');
    expect(body).toContain('splitParagraphRow(row, offset)');
    expect(body.match(/history\.push\(/g)).toHaveLength(1);
    expect(body).toContain('structural: { index: r, before, after: newRows.map(structSnapshotOfRow) }');
    expect(body).toContain('spliceRows(r, 1, newRows)');
  });

  it('merge goes through the pure mergeParagraphRows, confirm-guarded on both-englishPara, ONE structural entry', () => {
    expect(fnBody('requestParagraphMerge')).toContain('paragraphMergeNeedsConfirm(model.rows[r - 1], model.rows[r])');
    const body = fnBody('performParagraphMerge');
    expect(body).toContain('mergeParagraphRows(a, b)');
    expect(body.match(/history\.push\(/g)).toHaveLength(1);
    expect(body).toContain('spliceRows(r - 1, 2, [newRow])');
  });

  it('the splice primitive flushes EVERY pending commit first, then suppresses commits until the remount settles', () => {
    const body = fnBody('spliceRows');
    expect(body).toContain('for (const i of [...commitTimers.keys()]) commitRowNow(i);');
    expect(body).toContain('structuralRemount = true;');
    expect(body).toContain('reassignDocumentAddresses();');
    expect(fnBody('commitRowNow')).toContain('if (structuralRemount) return;');
  });

  it('positional-key component REUSE below the splice gets its content refreshed (ordinal addresses name positions)', () => {
    // Found live: after a merge, the shifted row keeps the display key its
    // position always had, so Svelte reuses the old component — its mounted
    // view must be refreshed from the model or it shows the wrong row.
    const body = fnBody('spliceRows');
    expect(body).toContain('for (let i = index; i < model.rows.length; i++) refreshRowViews(i);');
  });

  it('ordinal addresses re-derive through the ONE derivation autosave/hydration use', () => {
    const body = fnBody('reassignDocumentAddresses');
    expect(body).toContain("if (scheme.spineSource !== 'document') return;");
    expect(body).toContain('documentOrdinalAddress(scheme, i + 1)');
  });

  it('a keyed remount cannot double-claim a view key: createView evicts, destroyView honours the eviction', () => {
    expect(chapterSource).toContain('evictedViewKeys.add(vkey(row, segment, layer));');
    expect(chapterSource).toContain('if (evictedViewKeys.delete(vkey(row, segment, layer))) return;');
  });

  it('structural undo/redo replaces the spliced span from the snapshots and restores focus after the remount', () => {
    expect(fnBody('applyEntry')).toContain('if (entry.structural)');
    const body = fnBody('applyStructuralEntry');
    expect(body).toContain('spliceRows(s.index, removeCount, snaps.map(rowModelFromStructSnapshot))');
    expect(body).toContain('focusSel(sel)');
  });

  it('the menu model is built by buildCtxMenu — item sets/wording are matrix-pinned in ctxMenu.test.ts', () => {
    // Every ctxMenu assignment routes through withMenuModel → buildCtxMenu;
    // the template renders the model and never re-decides items.
    expect(chapterSource).toContain("import { buildCtxMenu } from './ctxMenu'");
    expect(chapterSource).toContain('{#each ctxMenu.model.groups as group, gi (gi)}');
    expect(chapterSource).not.toContain('ctx-menu-title">Split');
    // "Merge with previous" only exists below row 0 — the paraDoc input
    // carries the gate.
    expect(fnBody('onGreekContextMenu')).toContain('canMergePrev: d.rowIndex > 0');
  });
});

describe('sentence-boundary fix-up relabel (D8 §3 — same D6 machinery, sentence wording)', () => {
  // Sentence-vs-D6 labels are pinned per input in ctxMenu.test.ts's matrix
  // ('document-spine paragraph ops + sentence fix-up' / 'D6 line gestures').

  it('sentence split manipulates splitOffsets via the pure addSentenceBoundary — ONE row-bundle entry, no row created', () => {
    const body = fnBody('performSentenceSplit');
    expect(body).toContain('addSentenceBoundary(row, offset)');
    expect(body.match(/history\.push\(/g)).toHaveLength(1);
    expect(body).toContain('before, after: snapshotRow(r)');
    expect(body).not.toContain('spliceRows');
  });

  it('sentence join reuses the D6 un-split path (mergeSegments + confirm) with sentence wording', () => {
    const body = fnBody('requestSentenceJoin');
    expect(body).toContain('mergeNeedsConfirm(row, boundary)');
    expect(body).toContain('performUnsplit(r, boundary)');
    expect(body).toContain('join them into one sentence?');
    // The override threads through the SAME cell confirm; the D6 default
    // wording stays in EnglishCell for line un-splits.
    expect(englishSource).toContain("unsplitMessage ?? 'Merge these two English paragraphs back into one line?'");
    expect(unitSource).toContain('{unsplitMessage}');
  });

  it('the un-split view refresh is layer-EXPLICIT so a para-view join can never write sentence text into englishPara', () => {
    expect(fnBody('performUnsplit')).toContain("views.get(vkey(r, boundary, 'sentence'))");
  });
});

describe('chunk grouping for plain-line docs (D8 §5)', () => {
  it('the toggle edits paragraph_starts only — no row or text changes — with its own undoable entry', () => {
    const body = fnBody('toggleChunkStart');
    expect(body).toContain('addParagraphStart(before, ordinal)');
    expect(body).toContain('removeParagraphStart(before, ordinal)');
    expect(body).toContain('paraStarts: { before, after: after.slice() }');
    expect(body).not.toContain('spliceRows');
    expect(body).not.toContain('row.english');
  });

  it('undo/redo restores the captured paragraph_starts lists', () => {
    const body = fnBody('applyEntry');
    expect(body).toContain('entry.paraStarts.before : entry.paraStarts.after');
    expect(body).toContain('model.paragraphStarts = starts.length > 0 ? starts.slice() : undefined;');
  });

  it('the menu items: row 1 never offers a toggle; add/remove follows membership', () => {
    const menu = fnBody('onGreekContextMenu');
    expect(menu).toContain('d.rowIndex > 0 && d.segment === 0');
    // The chunk items themselves are pinned in ctxMenu.test.ts
    // ('plain-line chunk grouping').
    expect(menu).toContain("? ('remove' as const)");
  });
});

describe('interpolated view: English cells stay AI-only (structure lives on the SOURCE — refinement pass)', () => {
  it('the English-cell handler carries no paraDoc/chunk entries in any view', () => {
    const body = fnBody('onEnglishContextMenu');
    expect(body).not.toContain('paraDoc');
    expect(body).not.toContain('chunk');
    expect(body).toContain('aiOnly: true');
  });
});
