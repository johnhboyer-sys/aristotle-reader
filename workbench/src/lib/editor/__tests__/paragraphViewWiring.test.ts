// D8 Phase D wiring guards — the paragraph-view plumbing that can't run
// headless (ProseMirror views, the reactive store, CSS), in the source-scan
// style of lineSplitWiring.test.ts. The pure pieces are unit-tested elsewhere:
// expandRows 'unit' in gridRows.test.ts, the store in viewMode.test.ts, the
// legality matrix in viewPolicy.test.ts. Live behaviour is verified in the
// browser harness.
import { beforeAll, describe, expect, it } from 'vitest';

let chapterSource = '';
let englishSource = '';
let rowSource = '';
let cssSource = '';

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
  rowSource = read('../RowEditor.svelte');
  cssSource = read('../editor.css');
});

function fnBody(name: string): string {
  const start = chapterSource.indexOf(`function ${name}(`);
  expect(start, `function ${name} exists`).toBeGreaterThan(-1);
  const end = chapterSource.indexOf('\n  }', start);
  return chapterSource.slice(start, end);
}

describe('view-mode store + toggle wiring', () => {
  it('the view mode comes from the clamped store, keyed on the work + scheme', () => {
    expect(chapterSource).toContain("import { currentViewMode, setViewMode } from './viewMode.svelte'");
    expect(chapterSource).toContain('currentViewMode(model.workId, scheme)');
    expect(chapterSource).toContain('setViewMode(model.workId, scheme, mode)');
  });

  it('the toggle appears only when more than one selectable view exists', () => {
    expect(chapterSource).toContain('{#if toggleModes.length > 1}');
    expect(chapterSource).toContain('legalViews(scheme)');
  });

  it('display expansion picks unit granularity for the paragraph-unit view', () => {
    expect(chapterSource).toContain("expandRows(model.rows, paragraphUnitView ? 'unit' : 'sentence')");
  });
});

describe('paragraph editing layer (englishPara)', () => {
  it('the layer is a third view-key dimension; para cells key to `${row}:para`', () => {
    expect(chapterSource).toContain('export type EditLayer =');
    expect(chapterSource).toContain("layer === 'para' ? `${row}:para` : `${row}:${segment}`");
  });

  it('the paragraph-unit English cell edits the para layer and mounts a para RowEditor', () => {
    expect(chapterSource).toContain("layer={paragraphUnitView ? 'para' : 'sentence'}");
    expect(englishSource).toContain('<RowEditor {row} {segment} {host} {layer} />');
    expect(rowSource).toContain('host.createView(row, segment, el, layer)');
  });

  it('commit writes englishPara from the para view (empty ⇒ absent, keeps old files byte-identical)', () => {
    const body = fnBody('commitRowNow');
    expect(body).toContain("const paraView = views.get(vkey(i, 0, 'para'))");
    expect(body).toContain('row.englishPara = doc.toJSON()');
    expect(body).toContain('delete row.englishPara');
  });

  it('a para edit pushes its own undo entry tagged layer:para; undo restores englishPara', () => {
    const para = fnBody('afterParaChange');
    expect(para).toContain("layer: 'para'");
    expect(para).toContain('englishPara: beforeDoc');
    const apply = fnBody('applyEntry');
    // Restore is exact per (row, segment, layer) — never viewAt (whose active
    // layer could push a sentence doc into a para view).
    expect(apply).toContain('row.englishPara = snap.englishPara.toJSON()');
    expect(apply).toContain("views.get(vkey(edit.row, 0, 'para'))");
    expect(apply).toContain("views.get(vkey(edit.row, s, 'sentence'))");
  });

  it('a sentence edit round-trips englishPara untouched through both snapshots', () => {
    const body = fnBody('afterDocChange');
    expect(body).toContain('const paraDocJSON = model.rows[row].englishPara');
    expect(body).toContain('...paraField');
  });
});

describe('"text stays at its unit" — read-only sentence layer (§4)', () => {
  it('the read-only block renders the joined sentence text, labelled and non-editable', () => {
    expect(chapterSource).toContain('function sentenceLayerText(i: number)');
    expect(chapterSource).toContain('sentenceText={paragraphUnitView ? sentenceLayerText(d.rowIndex) : null}');
    expect(englishSource).toContain('class="sentence-layer"');
    expect(englishSource).toContain('Sentence-layer translation');
    // A <p>, not a RowEditor — never an editing surface.
    expect(englishSource).toContain('<p class="sentence-layer-text">{sentenceText}</p>');
    expect(cssSource).toContain('.sentence-layer {');
  });
});

describe('paragraph-chunk grouping for line docs (§5)', () => {
  it('chunk starts come from model.paragraphStarts as pure display metadata', () => {
    expect(chapterSource).toContain('const chunkStartGrids =');
    expect(chapterSource).toContain('model.paragraphStarts ?? []');
    expect(chapterSource).toContain('chunkStart={chunkStartGrids.has(g)}');
    expect(cssSource).toMatch(/\.chapter-grid\.view-paragraph .*\.chunk-start/);
  });
});

describe('AI modes are LIVE (and layer-correct) in the paragraph-unit view (D8 Phase E2)', () => {
  it('the disabled state + tooltip are gone: para-layer targets get the full AI menu', () => {
    expect(chapterSource).not.toContain('aiDisabled');
    expect(chapterSource).not.toContain('coming soon');
  });

  it('assist writes are layer-EXPLICIT (vkey with the captured layer, never viewAt)', () => {
    expect(fnBody('insertSuggestionIntoRow')).toContain('views.get(vkey(row, segment, assistLayer))');
    expect(fnBody('fillRowEnglish')).toContain('views.get(vkey(row, segment, layer))');
    expect(fnBody('invokeAssist')).toContain('assistLayer = activeLayer()');
  });

  it('para-layer Check reads englishPara, falling back to the sentence join the view shows (same rule as Ask/context)', () => {
    const body = fnBody('targetEnglish');
    expect(body).toContain(
      "if (layer === 'para') return plainRowText(paraDoc(row)) ?? plainRowText(joinedRowDoc(row))",
    );
  });

  it('footnote insertion is blocked in para-layer views with a notice ([ENGLISH.PARA] has no markers)', () => {
    const body = fnBody('insertFootnote');
    expect(body).toContain("if (activeLayer() === 'para')");
    const guardAt = body.indexOf("activeLayer() === 'para'");
    const markerAt = body.indexOf('footnoteMarker.create');
    expect(guardAt).toBeGreaterThan(-1);
    expect(markerAt).toBeGreaterThan(guardAt); // guard runs FIRST
    expect(body).toContain('translating by paragraph');
  });

  it('a view/granularity switch cancels in-flight assist + batch (stale layer can never land)', () => {
    // Both cancellations live in the SAME view-mode effect as the re-expansion.
    const effectAt = chapterSource.indexOf('void granularity; // track');
    const windowSrc = chapterSource.slice(effectAt, effectAt + 700);
    expect(windowSrc).toContain('dismissAssist();');
    expect(windowSrc).toContain('batchAbort?.abort();');
    expect(windowSrc).toContain('refreshDisplayRows();');
  });
});

describe('grid view is untouched (D6 identity preserved)', () => {
  it('the sentence-layer view key stays the exact D6 `${row}:${segment}` string', () => {
    expect(chapterSource).toContain('layer === \'para\' ? `${row}:para` : `${row}:${segment}`');
  });

  it('paragraph wrapping never explodes width (proportional grc track in paragraph view)', () => {
    expect(cssSource).toContain('.chapter-grid.view-paragraph {');
    expect(cssSource).toMatch(/\.chapter-grid\.view-paragraph\s*{[^}]*minmax\(0, 1fr\)/);
  });
});
