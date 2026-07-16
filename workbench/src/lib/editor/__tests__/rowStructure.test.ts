// Structure editing for document-spine works (design doc D8 §2/§3/§5) — the
// pure command halves. All node-env — docs built via parseRow, same style as
// gridRows.test.ts. The ChapterEditor wiring around these is pinned in
// structureEditingWiring.test.ts; live behaviour in the dev harness.
import { describe, expect, it } from 'vitest';

import {
  canEditRowStructure,
  canGroupLines,
  splitParagraphRow,
  mergeParagraphRows,
  paragraphMergeNeedsConfirm,
  addSentenceBoundary,
  joinBoundaryAt,
  addParagraphStart,
  removeParagraphStart,
} from '../rowStructure';
import type { RowStructure } from '../rowStructure';
import { AppHistory } from '../history';
import type { UndoEntry } from '../history';
import { parseRow, serializeRow } from '../serialize';
import { rowSchema, docFromJSON, emptyRowDocJSON } from '../schema';
import type { PMDocJSON } from '../schema';
import { getScheme } from '../../citation/registry';
import { isValidSplitOffset } from '../../chapterfile';

const doc = (markup: string): PMDocJSON => parseRow(markup).toJSON();
const textOf = (json: PMDocJSON): string => rowSchema.nodeFromJSON(json).textContent;
const markup = (json: PMDocJSON): string => serializeRow(rowSchema.nodeFromJSON(json));
const docsOf = (r: RowStructure): PMDocJSON[] => [r.english, ...(r.english2 ?? [])];

// Three "sentences" — offsets are CODE UNITS into this exact string. Both
// boundary targets are word starts preceded by a space (valid split points).
const SRC = 'πρῶτον μέρος ἐστίν. δεύτερον μέρος ἐνθάδε· τρίτον μέρος τέλος.';
const O1 = SRC.indexOf('δεύτερον');
const O2 = SRC.indexOf('τρίτον');
const MID2 = SRC.indexOf('ἐνθάδε'); // a word start INSIDE sentence 2

function paraRow(extra: Partial<RowStructure> = {}): RowStructure {
  return {
    greek: SRC,
    english: doc('first sentence.'),
    english2: [doc('second sentence.'), doc('third sentence.')],
    splitOffsets: [O1, O2],
    ...extra,
  };
}

describe('capability gates (D8 §2 — who owns row count)', () => {
  it('row-level split/merge is permitted ONLY for document-spine paragraph docs', () => {
    expect(canEditRowStructure(getScheme('paragraph'))).toBe(true);
    expect(canEditRowStructure(getScheme('plain-line'))).toBe(false); // lines group, never splice
    expect(canEditRowStructure(getScheme('bekker-standard'))).toBe(false); // corpus owns rows
    expect(canEditRowStructure(getScheme('bekker-metaphysics'))).toBe(false);
    expect(canEditRowStructure(getScheme('busse-paragraph'))).toBe(false); // corpus paragraph spine
  });

  it('chunk grouping is permitted ONLY for document-spine plain-line docs', () => {
    expect(canGroupLines(getScheme('plain-line'))).toBe(true);
    expect(canGroupLines(getScheme('paragraph'))).toBe(false);
    expect(canGroupLines(getScheme('bekker-standard'))).toBe(false);
    expect(canGroupLines(getScheme('busse-paragraph'))).toBe(false);
  });
});

describe('splitParagraphRow (D8 §2)', () => {
  it('split AT a sentence boundary: the boundary becomes the row break, segments follow their sentences', () => {
    const res = splitParagraphRow(paraRow(), O2)!;
    expect(res).not.toBeNull();
    expect(res.first.greek).toBe('πρῶτον μέρος ἐστίν. δεύτερον μέρος ἐνθάδε·');
    expect(res.second.greek).toBe('τρίτον μέρος τέλος.');
    // O2 itself is consumed by the row break — dropped from BOTH sides.
    expect(res.first.splitOffsets).toEqual([O1]);
    expect(res.second.splitOffsets).toBeUndefined();
    expect(docsOf(res.first).map(textOf)).toEqual(['first sentence.', 'second sentence.']);
    expect(docsOf(res.second).map(textOf)).toEqual(['third sentence.']);
  });

  it('split MID-sentence: the straddling sentence keeps its English in `first`; its source tail becomes an untranslated leading sentence', () => {
    const res = splitParagraphRow(paraRow(), MID2)!;
    expect(res.first.greek).toBe('πρῶτον μέρος ἐστίν. δεύτερον μέρος');
    expect(res.second.greek).toBe('ἐνθάδε· τρίτον μέρος τέλος.');
    // Sentence 2's English stays with its start (never divided by guesswork).
    expect(docsOf(res.first).map(textOf)).toEqual(['first sentence.', 'second sentence.']);
    // The remnant is an empty segment so segment↔boundary pairing holds.
    expect(docsOf(res.second).map(textOf)).toEqual(['', 'third sentence.']);
    expect(res.second.splitOffsets).toEqual([res.second.greek.indexOf('τρίτον')]);
    expect(res.second.splitOffsets!.every((o) => isValidSplitOffset(res.second.greek, o))).toBe(true);
  });

  it('split before the first boundary: every boundary and every later segment re-bases into `second`', () => {
    const p = SRC.indexOf('μέρος'); // inside sentence 1
    const res = splitParagraphRow(paraRow(), p)!;
    expect(res.first.greek).toBe('πρῶτον');
    expect(res.first.splitOffsets).toBeUndefined();
    expect(docsOf(res.first).map(textOf)).toEqual(['first sentence.']);
    expect(docsOf(res.second).map(textOf)).toEqual(['', 'second sentence.', 'third sentence.']);
    expect(res.second.splitOffsets).toEqual([
      res.second.greek.indexOf('δεύτερον'),
      res.second.greek.indexOf('τρίτον'),
    ]);
  });

  it('an unsplit, untranslated row splits into two untranslated rows (empty-row edge)', () => {
    const res = splitParagraphRow({ greek: SRC, english: emptyRowDocJSON() }, O1)!;
    expect(docsOf(res.first).map(textOf)).toEqual(['']);
    expect(docsOf(res.second).map(textOf)).toEqual(['']);
    expect(res.first.splitOffsets).toBeUndefined();
    expect(res.second.splitOffsets).toBeUndefined();
  });

  it('englishPara stays ENTIRELY on the first row; the new row starts without one', () => {
    const para = doc('the whole paragraph translation.');
    const res = splitParagraphRow(paraRow({ englishPara: para }), O2)!;
    expect(res.first.englishPara).toEqual(para);
    expect(res.second.englishPara).toBeUndefined();
  });

  it('drift extras (english2 beyond the offsets) anchor at the text end and move to `second`, never dropped', () => {
    const res = splitParagraphRow(
      paraRow({ english2: [doc('second sentence.'), doc('third sentence.'), doc('drift extra')] }),
      O2,
    )!;
    expect(docsOf(res.first).map(textOf)).toEqual(['first sentence.', 'second sentence.']);
    expect(docsOf(res.second).map(textOf)).toEqual(['third sentence.', 'drift extra']);
    // Offsets never run LONGER than segments-1.
    expect((res.second.splitOffsets ?? []).length).toBeLessThanOrEqual(docsOf(res.second).length - 1);
  });

  it('rejects offset 0, the text end, and mid-word offsets (isValidSplitOffset is the single authority)', () => {
    expect(splitParagraphRow(paraRow(), 0)).toBeNull();
    expect(splitParagraphRow(paraRow(), SRC.length)).toBeNull();
    expect(splitParagraphRow(paraRow(), SRC.indexOf('ρῶτον'))).toBeNull(); // letter before it
  });
});

describe('mergeParagraphRows (D8 §2)', () => {
  it('joins the source with a single space; the join point becomes a sentence boundary; segments append', () => {
    const a: RowStructure = { greek: 'πρῶτον μέρος.', english: doc('one.') };
    const b: RowStructure = {
      greek: 'δεύτερον μέρος· τρίτον.',
      english: doc('two.'),
      english2: [doc('three.')],
      splitOffsets: ['δεύτερον μέρος· '.length],
    };
    const res = mergeParagraphRows(a, b);
    expect(res.row.greek).toBe('πρῶτον μέρος. δεύτερον μέρος· τρίτον.');
    const joint = 'πρῶτον μέρος.'.length + 1;
    expect(res.row.splitOffsets).toEqual([joint, joint + 'δεύτερον μέρος· '.length]);
    expect(docsOf(res.row).map(textOf)).toEqual(['one.', 'two.', 'three.']);
  });

  it('split at a sentence boundary then merge restores the original row exactly (round trip)', () => {
    const original = paraRow({ englishPara: doc('whole paragraph.') });
    const { first, second } = splitParagraphRow(original, O2)!;
    const back = mergeParagraphRows(first, second).row;
    expect(back.greek).toBe(original.greek);
    expect(back.splitOffsets).toEqual(original.splitOffsets);
    expect(docsOf(back).map(markup)).toEqual(docsOf(original).map(markup));
    expect(back.englishPara).toEqual(original.englishPara);
  });

  it('both rows carry englishPara → joined with a single space, paraJoinPos at the seam (confirm-guarded)', () => {
    const a = paraRow({ englishPara: doc('First para.') });
    const b: RowStructure = { greek: 'ἄλλο.', english: emptyRowDocJSON(), englishPara: doc('Second para.') };
    expect(paragraphMergeNeedsConfirm(a, b)).toBe(true);
    const res = mergeParagraphRows(a, b);
    expect(textOf(res.row.englishPara!)).toBe('First para. Second para.');
    expect(res.paraJoinPos).toBe(docFromJSON(a.englishPara!).content.size);
  });

  it('one side has englishPara → kept verbatim, no confirm', () => {
    const a = paraRow({ englishPara: doc('Only para.') });
    const b: RowStructure = { greek: 'ἄλλο.', english: emptyRowDocJSON() };
    expect(paragraphMergeNeedsConfirm(a, b)).toBe(false);
    expect(paragraphMergeNeedsConfirm(b, a)).toBe(false);
    expect(textOf(mergeParagraphRows(a, b).row.englishPara!)).toBe('Only para.');
    expect(textOf(mergeParagraphRows(b, a).row.englishPara!)).toBe('Only para.');
    expect(mergeParagraphRows(b, a).paraJoinPos).toBe(0);
  });

  it('an empty-source side neither adds a join boundary nor loses any English', () => {
    const a = paraRow();
    const empty: RowStructure = { greek: '', english: doc('stranded english') };
    const withEmptyB = mergeParagraphRows(a, empty).row;
    expect(withEmptyB.greek).toBe(SRC);
    expect(docsOf(withEmptyB).map(textOf)).toContain('stranded english');
    expect((withEmptyB.splitOffsets ?? []).length).toBeLessThanOrEqual(docsOf(withEmptyB).length - 1);

    const withEmptyA = mergeParagraphRows(empty, a).row;
    expect(withEmptyA.greek).toBe(SRC);
    // b's boundaries re-base by 0 when a is empty.
    expect(withEmptyA.splitOffsets).toEqual([O1, O2]);
    expect(docsOf(withEmptyA).map(textOf)).toEqual([
      'stranded english',
      'first sentence.',
      'second sentence.',
      'third sentence.',
    ]);
  });
});

describe('addSentenceBoundary (D8 §3 — sentence fix-up on paragraph rows)', () => {
  it('inserts a boundary mid-row: the covering sentence keeps its English, the new sentence starts empty', () => {
    const res = addSentenceBoundary(paraRow(), MID2)!;
    expect(res.splitOffsets).toEqual([O1, MID2, O2]);
    expect([res.english, ...(res.english2 ?? [])].map(textOf)).toEqual([
      'first sentence.',
      'second sentence.',
      '',
      'third sentence.',
    ]);
  });

  it('works on an unsplit row (the D6 single-split case, same machinery)', () => {
    const res = addSentenceBoundary({ greek: SRC, english: doc('all of it.') }, O1)!;
    expect(res.splitOffsets).toEqual([O1]);
    expect([res.english, ...(res.english2 ?? [])].map(textOf)).toEqual(['all of it.', '']);
  });

  it('rejects an existing boundary and invalid offsets', () => {
    expect(addSentenceBoundary(paraRow(), O1)).toBeNull();
    expect(addSentenceBoundary(paraRow(), 0)).toBeNull();
    expect(addSentenceBoundary(paraRow(), SRC.indexOf('ρῶτον'))).toBeNull();
  });
});

describe('joinBoundaryAt (D8 §3 — which boundary a "Join sentences" removes)', () => {
  it('a click inside sentence N removes the boundary at its start; the first sentence has none', () => {
    expect(joinBoundaryAt([O1, O2], 2)).toBeNull(); // sentence 0
    expect(joinBoundaryAt([O1, O2], O1)).toBe(0); // at/inside sentence 1
    expect(joinBoundaryAt([O1, O2], O1 + 3)).toBe(0);
    expect(joinBoundaryAt([O1, O2], O2 + 3)).toBe(1); // sentence 2
    expect(joinBoundaryAt(undefined, 5)).toBeNull();
    expect(joinBoundaryAt([], 5)).toBeNull();
  });
});

describe('paragraph_starts toggles (D8 §5 — pure display metadata)', () => {
  it('add inserts sorted and de-duped; remove filters; both never mutate their input', () => {
    const starts = [1, 5];
    expect(addParagraphStart(starts, 3)).toEqual([1, 3, 5]);
    expect(addParagraphStart(starts, 5)).toEqual([1, 5]);
    expect(addParagraphStart(undefined, 4)).toEqual([4]);
    expect(removeParagraphStart(starts, 5)).toEqual([1]);
    expect(removeParagraphStart(undefined, 5)).toEqual([]);
    expect(starts).toEqual([1, 5]);
  });
});

describe('structural undo entries ride AppHistory unchanged (D8 §2)', () => {
  const structuralEntry = (): UndoEntry => ({
    edits: [],
    structural: {
      index: 1,
      before: [{ greek: SRC, docs: [parseRow('one')] }],
      after: [
        { greek: SRC.slice(0, O1 - 1), docs: [parseRow('one')] },
        { greek: SRC.slice(O1), docs: [parseRow('')] },
      ],
    },
    selBefore: null,
    selAfter: null,
  });

  it('a structural entry never coalesces and round-trips intact through undo/redo', () => {
    const h = new AppHistory();
    const entry = structuralEntry();
    h.push(entry, { coalesceKey: 'typing:1.0', now: 0 });
    h.push(structuralEntry(), { coalesceKey: 'typing:1.0', now: 10 }); // same key, inside the window
    expect(h.depth).toBe(2); // edits: [] entries can never merge
    const popped = h.undo()!;
    expect(popped.structural).toBeDefined();
    expect(popped.structural!.before).toHaveLength(1);
    expect(popped.structural!.after).toHaveLength(2);
    expect(h.canRedo).toBe(true);
    expect(h.redo()!.structural!.index).toBe(1);
  });

  it('a paraStarts entry (chunk grouping) round-trips its before/after lists', () => {
    const h = new AppHistory();
    h.push({ edits: [], paraStarts: { before: [1], after: [1, 3] }, selBefore: null, selAfter: null });
    const entry = h.undo()!;
    expect(entry.paraStarts).toEqual({ before: [1], after: [1, 3] });
  });
});

describe('heading role survives split/merge (D8 heading tools — no silent demotion)', () => {
  it('split keeps the heading on `first`, leaves `second` ordinary', () => {
    const res = splitParagraphRow(paraRow({ headingLevel: 3 }), O1)!;
    expect(res.first.headingLevel).toBe(3);
    expect(res.second.headingLevel).toBeUndefined();
  });

  it('a non-heading row splits with no heading on either side', () => {
    const res = splitParagraphRow(paraRow(), O1)!;
    expect(res.first.headingLevel).toBeUndefined();
    expect(res.second.headingLevel).toBeUndefined();
  });

  it('merge preserves a heading from `a` (the row merged into)', () => {
    const merged = mergeParagraphRows(paraRow({ headingLevel: 2 }), paraRow());
    expect(merged.row.headingLevel).toBe(2);
  });

  it('merge preserves a heading carried only by `b`', () => {
    const merged = mergeParagraphRows(paraRow(), paraRow({ headingLevel: 4 }));
    expect(merged.row.headingLevel).toBe(4);
  });
});
