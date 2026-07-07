// Line-split Slice 2 wiring guards (design doc D6) — source scans in the
// assistController.test.ts / copyCitation.test.ts style. The pure logic
// (expandRows, split/un-split commands, keymap navigation, undo shape) is
// unit-tested in gridRows.test.ts / rowKeymap.test.ts / history.test.ts;
// these pin the load-bearing ChapterEditor/RowEditor/CSS wiring that can't
// run headless: the right-click gesture, the citation/assist call-site
// folding (d6 §7), the one-entry undo pushes and the display plumbing.
// Live verification happens in the browser harness.
import { beforeAll, describe, expect, it } from 'vitest';

let chapterSource = '';
let greekSource = '';
let englishSource = '';
let rowSource = '';
let gutterSource = '';
let cssSource = '';

beforeAll(async () => {
  // Computed specifier: no @types/node in this project (see the same trick
  // in copyCitation.test.ts).
  const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
    readFileSync(path: string, encoding: 'utf-8'): string;
  };
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
    fileURLToPath(url: URL): string;
  };
  const read = (rel: string) =>
    fs.readFileSync(nodeUrl.fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
  chapterSource = read('../ChapterEditor.svelte');
  greekSource = read('../GreekCell.svelte');
  englishSource = read('../EnglishCell.svelte');
  rowSource = read('../RowEditor.svelte');
  gutterSource = read('../RowGutter.svelte');
  cssSource = read('../editor.css');
});

/** Body of a top-level `function name(...)` in ChapterEditor's script. */
function fnBody(name: string): string {
  const start = chapterSource.indexOf(`function ${name}(`);
  expect(start, `function ${name} exists`).toBeGreaterThan(-1);
  const end = chapterSource.indexOf('\n  }', start);
  return chapterSource.slice(start, end);
}

describe('display expansion wiring', () => {
  it('the grid iterates expandRows-derived display rows keyed by the stable DisplayRow key', () => {
    // Granularity is chosen by the view (D8): 'unit' for the paragraph-unit
    // view, 'sentence' (the D6 default) everywhere else.
    expect(chapterSource).toContain("expandRows(model.rows, paragraphUnitView ? 'unit' : 'sentence')");
    expect(chapterSource).toContain('{#each displayRows as d, g (d.key)}');
  });

  it('view identity is (row, segment, layer): registry keys, host contract, RowEditor mount', () => {
    // (row, segment) stays the D6 identity; D8 adds the editing LAYER (sentence
    // vs paragraph) as a third key dimension so the paragraph editor
    // (englishPara) never collides with the sentence cells.
    expect(chapterSource).toContain('const vkey = (row: number, segment: number, layer: EditLayer');
    expect(chapterSource).toContain('createView(row: number, segment: number, el: HTMLElement, layer: EditLayer)');
    expect(rowSource).toContain('host.createView(row, segment, el, layer)');
    expect(rowSource).toContain('host.destroyView(row, segment, layer)');
  });

  it('both segments’ gutters show the same raw address; continuation Greek is indented 1.5em', () => {
    expect(chapterSource).toContain('raw={d.address.raw}');
    expect(gutterSource).toContain('{raw}');
    expect(greekSource).toContain('class:cont={continuation}');
    expect(cssSource).toMatch(/\.grc-cell\.cont\s*{[^}]*padding-left:\s*1\.5em/);
  });

  it('the RowContext index is a live grid-ordinal getter (survives ordinal shifts)', () => {
    const body = fnBody('rowContext');
    expect(body).toContain('get index()');
    expect(body).toContain('gridOrdinalOf(row, segment)');
    expect(body).toContain('isContinuation: (k) => displayRows[k]?.continuation ?? false');
  });
});

describe('split gesture wiring (D6 §4.1)', () => {
  it('right-click on the Greek cell opens the context menu', () => {
    expect(greekSource).toContain('oncontextmenu={onContext}');
    expect(chapterSource).toContain('onContext={(e) => onGreekContextMenu(e, g)}');
  });

  it('the menu offers "Start new paragraph here" on unsplit lines and "Merge paragraph back" on split ones', () => {
    expect(chapterSource).toContain('>Start new paragraph here</span>');
    expect(chapterSource).toContain('>Merge paragraph back</span>');
  });

  it('the click offset snaps to a word gap via snapToWordStart; an invalid spot no-ops with the status line', () => {
    const menu = fnBody('onGreekContextMenu');
    expect(menu).toContain('snapToWordStart(row.greek, d.greekStart + within)');
    const split = fnBody('menuSplit');
    expect(split).toContain("setStatus('Choose the Greek word where the new paragraph starts.')");
  });

  it('English divides at the caret only when it sits in THAT row’s English cell (John §4.2)', () => {
    const body = fnBody('performSplit');
    expect(body).toContain('focusedRow === r && focusedSegment === 0');
    expect(body).toContain('splitUnsplitRow(row, offset, caret)');
  });

  it('split is ONE undo entry capturing the row’s structural before/after', () => {
    const body = fnBody('performSplit');
    expect(body.match(/history\.push\(/g)).toHaveLength(1);
    expect(body).toContain('before, after: snapshotRow(r)');
  });
});

describe('un-split wiring (d6 divergence F + §4.4)', () => {
  it('un-split confirms ONLY when both cells are non-empty, with the exact sentence', () => {
    expect(chapterSource).toContain('mergeNeedsConfirm(row, boundary)');
    expect(englishSource).toContain('Merge these two English paragraphs back into one line?');
  });

  it('the rejoin goes through the pure mergeSegments (serialize.ts joinRowDocs single-space convention)', () => {
    const body = fnBody('performUnsplit');
    expect(body).toContain('mergeSegments(row, boundary)');
    expect(body.match(/history\.push\(/g)).toHaveLength(1);
  });

  it('a stale continuation unmount never clobbers the merged row (destroyView guard)', () => {
    // The guard now also admits the paragraph layer (always alive while the
    // row exists); the sentence branch keeps the D6 segment-count check.
    expect(chapterSource).toContain('segment < segmentCount(model.rows[row])');
    expect(chapterSource).toContain('if (alive) commitRowNow(row)');
  });
});

describe('call-site folding (d6 §7)', () => {
  it('copy-as-citation folds a split line’s segments into ONE CitationRowInput via the joined doc', () => {
    const body = fnBody('copyCitation');
    expect(body).toContain('joinedRowDoc(r)');
    expect(body).toContain('address: model.rows[r].address'); // one address per LINE
    // …and the joined doc comes from serialize.ts's single join convention.
    expect(fnBody('joinedRowDoc')).toContain('joinRowDocs(rowDocsJSON(i))');
  });

  it('assist context treats a split line as ONE line: address once, draft = segments joined, window in Bekker lines', () => {
    const body = fnBody('runAssist');
    expect(body).toContain('rowCount: model.rows.length'); // ±6 counts LINES, not segments
    expect(body).toContain('draftAt: (i) => plainRowText(joinedRowDoc(i))');
    expect(body).toContain('targetIndex: row'); // the model row, not a grid ordinal
  });

  it('requestAssist from a continuation targets that segment’s cell for Insert', () => {
    expect(chapterSource).toContain('insertSuggestion: (row, segment, text) => insertSuggestionIntoRow(row, segment, text)');
    const body = fnBody('insertSuggestionIntoRow');
    expect(body).toContain('viewAt(row, segment)');
  });
});
