// The auditable per-view context-menu matrix (refinement pass, "clean
// selection menu"). Every menu the editor can show is a row here; the
// wiring tests keep only routing/gating pins (which input reaches
// buildCtxMenu), never item strings.

import { describe, expect, it } from 'vitest';
import { buildCtxMenu } from '../ctxMenu';
import type { CtxMenuInput, CtxMenuItemId } from '../ctxMenu';
import { bekkerStandard } from '../../citation/schemes/bekkerStandard';
import { busseParagraph } from '../../citation/schemes/busseParagraph';
import { paragraphScheme } from '../../citation/schemes/paragraphScheme';
import { plainLineScheme } from '../../citation/schemes/plainLineScheme';

const BASE: CtxMenuInput = {
  scheme: bekkerStandard,
  merge: false,
  batchRowCount: 1,
  noun: 'line',
  rowNoun: 'line',
  sourceNoun: 'Greek',
};

function ids(input: Partial<CtxMenuInput>): CtxMenuItemId[][] {
  return buildCtxMenu({ ...BASE, ...input }).groups.map((g) => g.map((i) => i.id));
}

const AI: CtxMenuItemId[] = ['ai-translate', 'ai-reference', 'ai-check', 'ai-ask'];

describe('buildCtxMenu — the per-view menu matrix', () => {
  it('Bekker grid, unsplit row → D6 split, then the 4 AI modes', () => {
    expect(ids({})).toEqual([['line-split'], AI]);
  });

  it('Bekker grid, split row → D6 merge', () => {
    expect(ids({ merge: true })).toEqual([['line-merge'], AI]);
  });

  it('English cell (any view) → AI modes only, no divider group', () => {
    expect(ids({ aiOnly: true })).toEqual([AI]);
  });

  it('multi-row source selection → batch translate replaces the single translate', () => {
    expect(ids({ batchRowCount: 3 })[1][0]).toBe('ai-translate-batch');
  });

  it('plain-line grid, row > 0 → chunk toggle above the D6 items', () => {
    expect(ids({ scheme: plainLineScheme, chunk: 'add' })[0]).toEqual(['chunk-add', 'line-split']);
    expect(ids({ scheme: plainLineScheme, chunk: 'remove', merge: true })[0]).toEqual([
      'chunk-remove',
      'line-merge',
    ]);
  });

  it('plain-line grid, row 0 → no chunk toggle (first chunk is fixed)', () => {
    expect(ids({ scheme: plainLineScheme })[0]).toEqual(['line-split']);
  });

  it('document-spine paragraph row → para ops, sentence fix-up, AI — three groups', () => {
    expect(
      ids({
        scheme: paragraphScheme,
        paraDoc: { canMergePrev: true, joinBoundary: 4 },
        noun: 'paragraph',
        rowNoun: 'paragraph',
      }),
    ).toEqual([['para-split', 'para-merge'], ['sentence-split', 'sentence-join'], AI]);
  });

  it('paragraph row 0 / first sentence → no para merge, no sentence join', () => {
    expect(
      ids({ scheme: paragraphScheme, paraDoc: { canMergePrev: false, joinBoundary: null } }).slice(0, 2),
    ).toEqual([['para-split'], ['sentence-split']]);
  });

  it('Busse paragraph-view source cell → AI only (the corpus owns the rows)', () => {
    expect(ids({ scheme: busseParagraph, aiOnly: true, noun: 'paragraph', rowNoun: 'paragraph' })).toEqual([
      AI,
    ]);
  });
});

describe('buildCtxMenu — wording', () => {
  function titles(input: Partial<CtxMenuInput>): string[] {
    return buildCtxMenu({ ...BASE, ...input }).groups.flat().map((i) => i.title);
  }

  it('D6 line gestures (Bekker/plain-line grids) — refinement-pass copy', () => {
    expect(titles({})[0]).toBe('Split this line at this word');
    expect(titles({ merge: true })[0]).toBe('Rejoin this split line');
  });

  it('plain-line chunk grouping is worded as grouping — never confusable with the D6 split', () => {
    const add = buildCtxMenu({ ...BASE, scheme: plainLineScheme, chunk: 'add' }).groups[0];
    expect(add[0].title).toBe('Start a new paragraph at this line');
    expect(add[0].desc).toBe("Grouping only — the lines and their text don't change");
    expect(add[1].title).toBe('Split this line at this word');
    expect(titles({ scheme: plainLineScheme, chunk: 'remove' })[0]).toBe('Merge into the paragraph above');
  });

  it("a corpus paragraph work's grid labels the D6 gesture as the sentence fix-up it is", () => {
    expect(titles({ scheme: busseParagraph })[0]).toBe('Start new sentence here');
    expect(titles({ scheme: busseParagraph, merge: true })[0]).toBe('Join sentences');
  });

  it('document-spine paragraph ops + sentence fix-up', () => {
    const t = titles({ scheme: paragraphScheme, paraDoc: { canMergePrev: true, joinBoundary: 4 } });
    expect(t.slice(0, 4)).toEqual([
      'Split paragraph here',
      'Merge with previous paragraph',
      'Start new sentence here',
      'Join sentences',
    ]);
  });

  it('paragraph nouns thread into the AI items', () => {
    const ai = buildCtxMenu({ ...BASE, noun: 'paragraph', rowNoun: 'paragraph', batchRowCount: 2 }).groups[1];
    expect(ai[0].title).toBe('Translate 2 paragraphs with AI');
    expect(ai[0].desc).toBe("Fills each selected paragraph's English cell (asks before replacing existing text)");
    expect(ai[3].title).toBe('Ask AI about this paragraph…');
  });

  it("single translate targets 'this row' on line docs and the unit noun elsewhere", () => {
    expect(buildCtxMenu({ ...BASE }).groups[1][0].desc).toContain('this row');
    expect(buildCtxMenu({ ...BASE, noun: 'paragraph' }).groups[1][0].desc).toContain('this paragraph');
    expect(buildCtxMenu({ ...BASE, noun: 'sentence' }).groups[1][0].desc).toContain('this sentence');
  });

  it('check desc names the source language', () => {
    expect(buildCtxMenu({ ...BASE, sourceNoun: 'German' }).groups.at(-1)![2].desc).toBe(
      "Linguist's check of your English against the German",
    );
  });
});
