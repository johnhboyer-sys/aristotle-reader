// D8 Phase D part 2 wiring guards — the interpolated-view plumbing that
// can't run headless (ProseMirror views, the reactive store, CSS), in the
// source-scan style of paragraphViewWiring.test.ts. The pure pieces are
// unit-tested elsewhere: usesParaLayer / showGranularityToggle / sourceSlices
// in interpolated.test.ts, expandRows granularity in gridRows.test.ts, the
// store in viewMode.test.ts. Live behaviour is verified in the dev harness.
import { beforeAll, describe, expect, it } from 'vitest';

let chapterSource = '';
let unitSource = '';
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
  unitSource = read('../InterpolatedUnit.svelte');
  cssSource = read('../editor.css');
});

function fnBody(name: string): string {
  const start = chapterSource.indexOf(`function ${name}(`);
  expect(start, `function ${name} exists`).toBeGreaterThan(-1);
  const end = chapterSource.indexOf('\n  }', start);
  return chapterSource.slice(start, end);
}

describe('cross-layer isolation (regression: para text leaking into english/english2)', () => {
  // viewAt resolves through the ACTIVE layer, so in a para-layer view it
  // hands back the mounted para view for EVERY sentence segment. Commit and
  // sentence-layer reads must therefore address views by EXPLICIT layer key
  // — the D1 plumbing used viewAt here and committed the paragraph text into
  // the sentence fields (found live during the interpolated pass).
  it('commitRowNow writes sentence fields only from explicit sentence-layer views', () => {
    const body = fnBody('commitRowNow');
    expect(body).toContain("views.get(vkey(i, s, 'sentence'))");
    expect(body).not.toContain('viewAt(i, s)');
  });

  it('segmentDoc (every sentence-layer read: snapshots, undo payloads, citation, the read-only block) is layer-explicit', () => {
    const body = fnBody('segmentDoc');
    expect(body).toContain("views.get(vkey(row, segment, 'sentence'))");
    expect(body).not.toContain('viewAt(row, segment)');
  });

  it('reloadFromDisk refreshes a mounted para view from englishPara (never Number("para") past the guard)', () => {
    const body = fnBody('reloadFromDisk');
    expect(body).toContain("sStr === 'para'");
    expect(body).toContain('row.englishPara ?? emptyRowDocJSON()');
  });
});

describe('view toggle now offers interpolated (D1 filter flipped on)', () => {
  it('the toggle offers every legal mode — the D1 interpolated filter is gone', () => {
    expect(chapterSource).toContain('const toggleModes = legalViewModes;');
    expect(chapterSource).not.toContain('filter((m) => m !== MODE_INTERPOLATED)');
  });

  it('the interpolated branch renders the stack from the SAME keyed displayRows', () => {
    expect(chapterSource).toContain('{#if viewMode === MODE_INTERPOLATED}');
    expect(chapterSource).toContain('class="interp-stack"');
    expect(chapterSource).toContain('<InterpolatedUnit');
  });
});

describe('granularity sub-toggle + layer selection (§2)', () => {
  it('layer + granularity come from the pure policy module, reactive per work', () => {
    expect(chapterSource).toContain("import { usesParaLayer, showGranularityToggle, sourceSlices, sourceOffsetAtDisplay } from './interpolated'");
    expect(chapterSource).toContain('usesParaLayer(scheme, viewMode, granularity)');
    expect(chapterSource).toContain('currentGranularity(model.workId)');
    expect(chapterSource).toContain('showGranularityToggle(scheme, viewMode)');
    expect(chapterSource).toContain('setGranularity(model.workId, g)');
  });

  it('a granularity flip re-expands the display rows (tracked by the refresh effect)', () => {
    expect(chapterSource).toContain('void granularity; // track');
  });

  it('the sub-toggle renders only when the policy allows it', () => {
    expect(chapterSource).toContain('{#if granularityToggle}');
    expect(chapterSource).toContain('aria-label="Interpolated granularity"');
  });
});

describe('the interpolated unit: field on top, display-only original beneath (§1)', () => {
  it('the field is the SAME EnglishCell as the grid (behavior parity inherited)', () => {
    expect(unitSource).toContain('<EnglishCell');
    expect(unitSource).toContain('{host}');
    expect(unitSource).toContain('{layer}');
  });

  it('the original is a plain div — never an editor, never contenteditable', () => {
    expect(unitSource).toContain('class="interp-source"');
    expect(unitSource).not.toContain('RowEditor'); // only via EnglishCell
    expect(unitSource).not.toContain('contenteditable');
    expect(unitSource).not.toContain('GreekCell'); // no editable-column pairing
  });

  it('sentence divisions render as separators between source slices', () => {
    expect(chapterSource).toContain('slices={interpSlices(d)}');
    expect(unitSource).toContain('class="interp-sep"');
  });

  it('the compact address label shows the raw address verbatim (gutter contract)', () => {
    expect(chapterSource).toContain('addr={d.address.raw}');
    expect(unitSource).toContain('class="interp-addr"');
  });
});

describe('"text stays at its unit" — both directions (§2)', () => {
  it("'unit' granularity shows the sentence layer read-only under the englishPara field (D1's block)", () => {
    expect(chapterSource).toContain('sentenceText={paragraphUnitView ? sentenceLayerText(d.rowIndex) : null}');
  });

  it("'sentence' granularity shows a non-empty englishPara ONCE per row, read-only, above the first block", () => {
    expect(chapterSource).toContain('paraText={paragraphUnitView || d.segment !== 0 ? null : paraLayerText(d.rowIndex)}');
    expect(chapterSource).toContain('function paraLayerText(i: number)');
    expect(chapterSource).toContain('hasParagraphEnglish');
    expect(unitSource).toContain('Paragraph-layer translation');
    // A <p> in the .sentence-layer family — never an editing surface.
    expect(unitSource).toContain('<p class="sentence-layer-text">{paraText}</p>');
  });
});

describe('AI menu + structure gestures in the interpolated view (§4 + refinement pass)', () => {
  it('the FIELD right-click stays AI-only; the ORIGINAL routes to the structure-aware source handler', () => {
    expect(chapterSource).toContain('onContext={(e) => onEnglishContextMenu(e, g)}');
    expect(chapterSource).toContain('onSourceContext={(e) => onInterpSourceContextMenu(e, g)}');
    expect(unitSource).toContain('oncontextmenu={onSourceContext ?? onContext}');
    // The grid's Greek handler itself is never reachable from the stack —
    // the source handler owns the display-offset mapping.
    expect(unitSource).not.toContain('onGreekContextMenu');
  });

  it('the source handler maps display offsets back to model offsets before the word snap', () => {
    const body = fnBody('onInterpSourceContextMenu');
    expect(body).toContain('sourceOffsetAtDisplay(row.greek, row.splitOffsets, within)');
    expect(body).toContain('sourceOffsetAtDisplay(d.greekSlice, undefined, within)');
    expect(body).toContain('snapToWordStart(row.greek, mapped)');
    expect(body).toContain('snapToWordStart(row.greek, d.greekStart + local)');
  });

  it('document-spine paragraph docs get the paraDoc menu in BOTH granularities; corpus unit blocks stay AI-only', () => {
    const body = fnBody('onInterpSourceContextMenu');
    expect(body).toContain('if (canEditRowStructure(scheme))');
    expect(body).toContain('canMergePrev: d.rowIndex > 0');
    expect(body).toContain('aiOnly: true');
  });

  it('a multi-block source selection batch-translates: the original counts as the source column', () => {
    expect(fnBody('columnOfDomNode')).toContain(".closest('.interp-source')");
    expect(fnBody('onInterpSourceContextMenu')).toContain('selectedGreekModelRows()');
  });

  it('the four AI items are live for ALL targets; para-layer menus carry unit nouns (D8 Phase E2)', () => {
    // The D1/D2 disabled state is gone; the English-cell menu labels its
    // target with the unit derived from (rowUnit, active layer).
    expect(chapterSource).not.toContain('aiDisabled');
    expect(fnBody('onEnglishContextMenu')).toContain('noun: assistUnitFor(activeLayer(), d.rowIndex)');
  });
});

describe('grouping + CSS (§3, §5)', () => {
  it('line-doc chunk grouping extends to the interpolated stack; unit views need none', () => {
    expect(chapterSource).toContain('const interp = viewMode === MODE_INTERPOLATED;');
    expect(chapterSource).toContain('if (paragraphUnitView || (viewMode !== MODE_PARAGRAPH && !interp)) return out;');
    expect(unitSource).toContain('class:chunk-start={chunkStart}');
  });

  it('the stack is a centered readable measure with the editor conventions', () => {
    expect(cssSource).toContain('.interp-stack {');
    expect(cssSource).toMatch(/\.interp-stack\s*{[^}]*max-width:\s*min\(70ch, 100%\)/);
    expect(cssSource).toMatch(/\.interp-stack\s*{[^}]*font-size:\s*var\(--work-fs\)/);
    expect(cssSource).toContain('.interp-source {');
    expect(cssSource).toContain('.interp-sep {');
    expect(cssSource).toContain('.interp-unit.chunk-start {');
    // Focused-unit whisper adapts the .row-focus family.
    expect(cssSource).toContain('.interp-unit.row-focus {');
  });
});
