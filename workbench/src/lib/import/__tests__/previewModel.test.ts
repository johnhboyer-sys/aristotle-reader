/**
 * Unit tests for the ImportDialog preview view-model (previewModel.ts).
 * Pure-logic module — no Svelte/DOM involved, so these fixtures build a
 * minimal ImportPlan by hand rather than running the full aligner.
 */

import { describe, expect, it } from 'vitest';
import {
  assignOrphan,
  buildPreviewState,
  discardOrphan,
  editRowText,
  flaggedFraction,
  importGate,
  isOrphanUnresolved,
  mergeIntoPrevious,
  pushToNext,
  unresolveOrphan,
  applyPreviewToPlan,
  REVIEW_BANNER_THRESHOLD,
} from '../previewModel';
import type { ImportPlan, PlanRow, OrphanLine } from '../plan';
import type { WorkManifest } from '../../works/manifest';

function row(partial: Partial<PlanRow> & { address: string }): PlanRow {
  return {
    spineGreek: 'γρ ' + partial.address,
    proposedEnglish: '',
    state: 'matched',
    flagged: false,
    ...partial,
  };
}

function makePlan(rows: PlanRow[], orphans: OrphanLine[] = [], blocked = orphans.length > 0): ImportPlan {
  return {
    ok: true,
    work: { id: 'metaphysics' } as WorkManifest,
    book: 7,
    chapter: 17,
    rows,
    orphans,
    blocked,
    flaggedFraction: rows.length ? rows.filter((r) => r.flagged).length / rows.length : 0,
    window: { flat: [], start: 0, end: rows.length - 1 },
    source: 'canonical',
    footnotes: [],
    notices: [],
  };
}

describe('buildPreviewState', () => {
  it('carries proposedEnglish/state/flagged/userGreek onto each preview row, untouched', () => {
    const plan = makePlan([
      row({ address: '1041a1', proposedEnglish: 'foo', state: 'matched', flagged: false }),
      row({
        address: '1041a2',
        proposedEnglish: 'bar',
        state: 'low-confidence',
        flagged: true,
        userGreek: 'divergent greek',
      }),
    ]);
    const preview = buildPreviewState(plan);
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]).toMatchObject({ english: 'foo', state: 'matched', flagged: false, touched: false });
    expect(preview.rows[1]).toMatchObject({
      english: 'bar',
      state: 'low-confidence',
      flagged: true,
      userGreek: 'divergent greek',
      touched: false,
    });
    expect(preview.orphans).toHaveLength(0);
  });

  it('seeds orphans as unresolved', () => {
    const plan = makePlan([row({ address: '1041a1' })], [{ importIndex: 0, greek: 'g', english: 'e' }]);
    const preview = buildPreviewState(plan);
    expect(preview.orphans).toHaveLength(1);
    expect(isOrphanUnresolved(preview.orphans[0])).toBe(true);
  });
});

describe('editRowText', () => {
  it('sets touched and updates text', () => {
    const plan = makePlan([row({ address: 'a1', proposedEnglish: 'orig' })]);
    let preview = buildPreviewState(plan);
    preview = editRowText(preview, 0, 'edited');
    expect(preview.rows[0].english).toBe('edited');
    expect(preview.rows[0].touched).toBe(true);
  });

  it('clears the split flag once the user touches that row (build brief item 3)', () => {
    const plan = makePlan([row({ address: 'a1', proposedEnglish: 'guess', state: 'split', flagged: true })]);
    let preview = buildPreviewState(plan);
    expect(preview.rows[0].state).toBe('split');
    preview = editRowText(preview, 0, 'confirmed text');
    expect(preview.rows[0].state).toBe('matched');
    expect(preview.rows[0].flagged).toBe(false);
  });

  it('does NOT clear low-confidence/merged flags on edit (provenance, not correctness)', () => {
    const lowConf = buildPreviewState(
      makePlan([row({ address: 'a1', proposedEnglish: 'x', state: 'low-confidence', flagged: true })]),
    );
    const editedLow = editRowText(lowConf, 0, 'y');
    expect(editedLow.rows[0].state).toBe('low-confidence');
    expect(editedLow.rows[0].flagged).toBe(true);

    const merged = buildPreviewState(
      makePlan([row({ address: 'a1', proposedEnglish: 'x', state: 'merged', flagged: true })]),
    );
    const editedMerged = editRowText(merged, 0, 'y');
    expect(editedMerged.rows[0].state).toBe('merged');
    expect(editedMerged.rows[0].flagged).toBe(true);
  });

  it('promotes no-source to matched once given non-empty text', () => {
    const plan = makePlan([row({ address: 'a1', proposedEnglish: '', state: 'no-source', flagged: true })]);
    let preview = buildPreviewState(plan);
    preview = editRowText(preview, 0, 'now has text');
    expect(preview.rows[0].state).toBe('matched');
    expect(preview.rows[0].flagged).toBe(false);
  });
});

describe('mergeIntoPrevious / pushToNext', () => {
  function twoRowPreview() {
    const plan = makePlan([
      row({ address: 'a1', proposedEnglish: 'first' }),
      row({ address: 'a2', proposedEnglish: 'second' }),
    ]);
    return buildPreviewState(plan);
  }

  it('mergeIntoPrevious moves text up and empties the source row', () => {
    let preview = twoRowPreview();
    preview = mergeIntoPrevious(preview, 1);
    expect(preview.rows[0].english).toBe('first second');
    expect(preview.rows[1].english).toBe('');
    expect(preview.rows[0].touched).toBe(true);
    expect(preview.rows[1].touched).toBe(true);
  });

  it('mergeIntoPrevious is a no-op at row 0', () => {
    let preview = twoRowPreview();
    const before = preview;
    preview = mergeIntoPrevious(preview, 0);
    expect(preview).toBe(before);
  });

  it('pushToNext moves text down and empties the source row', () => {
    let preview = twoRowPreview();
    preview = pushToNext(preview, 0);
    expect(preview.rows[1].english).toBe('first second');
    expect(preview.rows[0].english).toBe('');
  });

  it('pushToNext is a no-op on the last row', () => {
    let preview = twoRowPreview();
    const before = preview;
    preview = pushToNext(preview, 1);
    expect(preview).toBe(before);
  });
});

describe('orphan resolution', () => {
  function orphanPreview() {
    const plan = makePlan(
      [row({ address: 'a1', proposedEnglish: 'existing' })],
      [{ importIndex: 0, greek: 'g', english: 'orphan text' }],
    );
    return buildPreviewState(plan);
  }

  it('assignOrphan appends text to the target row and resolves the orphan', () => {
    let preview = orphanPreview();
    preview = assignOrphan(preview, 0, 'a1');
    expect(preview.rows[0].english).toBe('existing orphan text');
    expect(isOrphanUnresolved(preview.orphans[0])).toBe(false);
    expect(preview.orphans[0].assignedTo).toBe('a1');
  });

  it('discardOrphan resolves without touching any row', () => {
    let preview = orphanPreview();
    preview = discardOrphan(preview, 0);
    expect(preview.rows[0].english).toBe('existing');
    expect(isOrphanUnresolved(preview.orphans[0])).toBe(false);
    expect(preview.orphans[0].discarded).toBe(true);
  });

  it('unresolveOrphan after assign strips the appended text back out', () => {
    let preview = orphanPreview();
    preview = assignOrphan(preview, 0, 'a1');
    preview = unresolveOrphan(preview, 0);
    expect(preview.rows[0].english).toBe('existing');
    expect(isOrphanUnresolved(preview.orphans[0])).toBe(true);
  });

  it('unresolveOrphan after discard just re-opens it', () => {
    let preview = orphanPreview();
    preview = discardOrphan(preview, 0);
    preview = unresolveOrphan(preview, 0);
    expect(isOrphanUnresolved(preview.orphans[0])).toBe(true);
  });
});

describe('importGate', () => {
  it('disables with a singular sentence for exactly one unresolved orphan', () => {
    const plan = makePlan(
      [row({ address: 'a1' })],
      [{ importIndex: 0, greek: 'g', english: 'e' }],
    );
    const preview = buildPreviewState(plan);
    const gate = importGate(plan, preview);
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toMatch(/One imported line/);
  });

  it('disables with a plural sentence for multiple unresolved orphans', () => {
    const plan = makePlan(
      [row({ address: 'a1' })],
      [
        { importIndex: 0, greek: 'g', english: 'e' },
        { importIndex: 1, greek: 'g2', english: 'e2' },
      ],
    );
    const preview = buildPreviewState(plan);
    const gate = importGate(plan, preview);
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toMatch(/2 imported lines/);
  });

  it('enables once every orphan is resolved and the plan is not blocked', () => {
    const plan = makePlan(
      [row({ address: 'a1' })],
      [{ importIndex: 0, greek: 'g', english: 'e' }],
      false,
    );
    let preview = buildPreviewState(plan);
    preview = discardOrphan(preview, 0);
    const gate = importGate(plan, preview);
    expect(gate.enabled).toBe(true);
    expect(gate.reason).toBeNull();
  });

  it('stays disabled when the plan itself is blocked even with zero orphans', () => {
    const plan = makePlan([row({ address: 'a1' })], [], true);
    const preview = buildPreviewState(plan);
    const gate = importGate(plan, preview);
    expect(gate.enabled).toBe(false);
    expect(gate.reason).not.toBeNull();
  });
});

describe('flaggedFraction', () => {
  it('recomputes live as rows are resolved', () => {
    const plan = makePlan([
      row({ address: 'a1', state: 'split', flagged: true, proposedEnglish: 'x' }),
      row({ address: 'a2', state: 'matched', flagged: false, proposedEnglish: 'y' }),
    ]);
    let preview = buildPreviewState(plan);
    expect(flaggedFraction(preview)).toBe(0.5);
    preview = editRowText(preview, 0, 'confirmed');
    expect(flaggedFraction(preview)).toBe(0);
  });

  it('is 0 for an empty row set', () => {
    expect(flaggedFraction({ rows: [], orphans: [] })).toBe(0);
  });

  it('REVIEW_BANNER_THRESHOLD is 0.25 per d3 §5', () => {
    expect(REVIEW_BANNER_THRESHOLD).toBe(0.25);
  });
});

describe('applyPreviewToPlan', () => {
  it('writes edited English back onto a plan copy without mutating the original', () => {
    const plan = makePlan([row({ address: 'a1', proposedEnglish: 'orig' })]);
    let preview = buildPreviewState(plan);
    preview = editRowText(preview, 0, 'edited');
    const applied = applyPreviewToPlan(plan, preview);
    expect(applied.rows[0].proposedEnglish).toBe('edited');
    expect(plan.rows[0].proposedEnglish).toBe('orig'); // original untouched
  });
});
