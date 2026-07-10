// ocr-repair/changelist.ts
//
// The audit trail. Every alteration any stage makes to the text is one
// ChangeRecord (handoff non-negotiable 5: a cleanup that can't show its work
// didn't happen). Tier 1 = mechanical, auto-applied, logged. Tier 2 = changes
// which WORD the text says — never auto-applied; they become review-file
// entries and are only applied after John's decision. Greek-script or
// diacritic-bearing tokens are always Tier 2.

export type Tier = 1 | 2;

export type RuleId =
  | 'slice'
  | 'head-insert'
  | 'heading-normalize'
  | 'folio-repair'
  | 'tic-reseat'
  | 'bekker-digit'
  | 'spacing-collapse'
  | 'paragraph-indent'
  | 'footnote-head'
  | 'footnote-marker'
  | 'emdash-restore'
  | 'wrap-join' // line-wrap dash joints / lexical compounds rejoined across the wrap
  | 'ligature'
  | 'emphasis'
  | 'word-identity' // Tier 2 only
  | 'no-witness-span' // flag record, no edit: witness coverage gap
  | 'flag'; // flag record, no edit: anything left in place for human eyes

export interface ChangeRecord {
  /** Stable id, e.g. "p117-L14-c52-1" — page/line/col plus a per-site counter. */
  id: string;
  stage: number;
  tier: Tier;
  rule: RuleId;
  /** 0-based form-feed page index at the time of the edit. */
  page: number;
  /** 0-based line within the page, where line-scoped. */
  line?: number;
  /** 0-based column, where token-scoped. */
  col?: number;
  before?: string;
  after?: string;
  /** Free-form supporting facts (cadence state, witness reading, span). */
  evidence?: Record<string, unknown>;
}

export function makeChangeId(page: number, line?: number, col?: number, seq = 1): string {
  let id = `p${page}`;
  if (line !== undefined) id += `-L${line}`;
  if (col !== undefined) id += `-c${col}`;
  return `${id}-${seq}`;
}

export function toJsonl(records: ChangeRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
}
