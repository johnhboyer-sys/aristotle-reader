import type { ChangeRecord } from './changelist';

export interface ReviewInstance {
  id: string;
  page: number;
  line?: number;
  before?: string;
  after?: string;
  prevLine?: string;
  lineText?: string;
  nextLine?: string;
  evidence?: Record<string, unknown>;
}

export interface ReviewGroup {
  category: string;
  patternKey: string;
  before?: string;
  after?: string;
  checked: boolean;
  instances: ReviewInstance[];
}

export interface ReviewModel {
  corpus: string;
  groups: ReviewGroup[];
}

export interface ReviewDecisions {
  checkedPatterns: Set<string>;
  /** Record ids excised from otherwise-approved batches (`EXCLUDE <id>`). */
  excludeIds?: Set<string>;
  /** John-mandated paragraph breaks with no machine record (`BREAK p<page>-L<line>`). */
  manualBreaks?: { page: number; line: number }[];
  /**
   * John-authored literal corrections for OCR garbles the witness can't
   * arbitrate — chiefly on the 18/74 Genie-dropout pages the pipeline reads
   * blind (`FIX <before> => <after>`). `before` is a unique on-line substring;
   * applied as a logged Tier-2 word-identity edit. Per-corpus DATA, so it
   * never affects the held-out neutrality gate.
   */
  corrections?: { before: string; after: string }[];
  /**
   * Standalone garbage lines to delete (`DROP <token>`) — a scan fragment
   * orphaned on its own line ("ss"). Removes a line whose whole trimmed
   * content equals the token. CAVEAT: footnote DEFINITION blocks put the note
   * number on its own line too ("18\n<note text>"), so DROP-by-token on a
   * bare number will also delete real footnote definitions — the leaked
   * footnote-MARKER cleanup needs context-anchored removal (the deferred
   * seating pass), not this. Safe only for non-numeric fragments.
   */
  dropLines?: string[];
}

// Diagnostic categories carry no decision \u2014 thousands of instances would
// bury the ~200 real checkboxes, so renderReview collapses them to summary
// counts (full detail stays in changes-stage5.jsonl).
const DIAGNOSTIC_CATEGORIES = new Set([
  'Spaced dash/alignment-gap diagnostics',
  'Greek diagnostics',
  'Paragraph diagnostics',
  'Coverage diagnostics',
  'Line-wrap diagnostics',
]);

function categoryFor(record: ChangeRecord): string {
  const kind = String(record.evidence?.kind ?? '');
  if (record.rule === 'wrap-join') return 'Line-wrap diagnostics';
  if (record.rule === 'paragraph-indent') return 'Paragraph breaks';
  if (kind === 'bekker-ambiguous' || kind === 'bekker-opener') return 'Bekker openers';
  if (kind === 'greek-run-unpaired') return 'Greek diagnostics';
  if (kind.includes('spaced-dash') || kind.includes('alignment-gap')) return 'Spaced dash/alignment-gap diagnostics';
  if (kind.includes('paragraph')) return 'Paragraph diagnostics';
  if (record.rule === 'no-witness-span' || kind === 'no-witness-span') return 'Coverage diagnostics';
  if (record.evidence?.witnessGreek === true || /[\u0370-\u03ff\u1f00-\u1fff]/u.test(`${record.before ?? ''}${record.after ?? ''}`)) return 'Greek';
  return 'Diacritic';
}

function greekRunText(record: Pick<ChangeRecord, 'evidence'>): { before: string; after: string } | null {
  const runLen = typeof record.evidence?.runLen === 'number' ? record.evidence.runLen : 0;
  const runBefore = record.evidence?.runBefore;
  const runAfter = record.evidence?.runAfter;
  if (runLen <= 1 || typeof runBefore !== 'string' || typeof runAfter !== 'string') return null;
  return { before: runBefore, after: runAfter };
}

export function patternKeyFor(record: Pick<ChangeRecord, 'rule' | 'before' | 'after' | 'evidence'>): string {
  const run = greekRunText(record);
  if (run) return `greek-run|${run.before}|${run.after}`;
  if (record.rule === 'paragraph-indent') return `paragraph-indent|${record.evidence?.support ?? ''}`;
  const kind = String(record.evidence?.kind ?? '');
  return `${kind || record.rule}|${record.before ?? ''}|${record.after ?? ''}`;
}

export function buildReviewModel(corpus: string, records: ChangeRecord[], text: string): ReviewModel {
  const linesByPage = text.split('\f').map((page) => page.split('\n'));
  const grouped = new Map<string, ReviewGroup>();
  for (const record of records) {
    const key = patternKeyFor(record);
    const run = greekRunText(record);
    const group = grouped.get(key) ?? {
      category: categoryFor(record),
      patternKey: key,
      before: run?.before ?? record.before,
      after: run?.after ?? record.after,
      checked: record.rule === 'paragraph-indent' && (record.evidence?.support === 'dual-blank' || record.evidence?.support === 'page-top-dual'),
      instances: [],
    };
    const lines = linesByPage[record.page] ?? [];
    group.instances.push({
      id: record.id,
      page: record.page,
      line: record.line,
      before: record.before,
      after: record.after,
      prevLine: record.line === undefined ? undefined : lines[record.line - 1],
      lineText: record.line === undefined ? undefined : lines[record.line],
      nextLine: record.line === undefined ? undefined : lines[record.line + 1],
      evidence: record.evidence,
    });
    grouped.set(key, group);
  }
  const groups = [...grouped.values()].sort((a, b) => b.instances.length - a.instances.length || a.patternKey.localeCompare(b.patternKey));
  return { corpus, groups };
}

function renderContext(instance: ReviewInstance): string[] {
  const out: string[] = [];
  if (instance.prevLine !== undefined) out.push(`    - prev: ${instance.prevLine}`);
  if (instance.lineText !== undefined) out.push(`    - line: ${instance.lineText}`);
  if (instance.nextLine !== undefined) out.push(`    - next: ${instance.nextLine}`);
  return out;
}

export function renderReview(model: ReviewModel): string {
  const lines = [`# Stage 5 Review: ${model.corpus}`, ''];
  const categories = [...new Set(model.groups.map((group) => group.category))];
  for (const category of categories) {
    lines.push(`## ${category}`, '');
    const groups = model.groups.filter((item) => item.category === category);
    if (DIAGNOSTIC_CATEGORIES.has(category)) {
      const total = groups.reduce((n, g) => n + g.instances.length, 0);
      lines.push(
        `${total} informational record(s), nothing to decide — full detail in changes-stage5.jsonl.`,
        ''
      );
      continue;
    }
    for (const group of groups) {
      lines.push(`- [${group.checked ? 'x' : ' '}] ${group.before ?? ''} -> ${group.after ?? ''} (${group.instances.length}) <!-- pattern:${group.patternKey} -->`);
      for (const instance of group.instances) {
        lines.push(`  - ${instance.id} p${instance.page}${instance.line === undefined ? '' : ` L${instance.line}`}`);
        lines.push(...renderContext(instance));
      }
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

export function parseDecisions(md: string): ReviewDecisions {
  const checkedPatterns = new Set<string>();
  const re = /^- \[[xX]\].*<!-- pattern:(.*?) -->$/gmu;
  for (const match of md.matchAll(re)) checkedPatterns.add(match[1]);
  const excludeIds = new Set<string>();
  for (const match of md.matchAll(/^EXCLUDE\s+(\S+)\s*$/gmu)) excludeIds.add(match[1]);
  const manualBreaks: { page: number; line: number }[] = [];
  for (const match of md.matchAll(/^BREAK\s+p(\d+)-L(\d+)\s*$/gmu)) {
    manualBreaks.push({ page: Number(match[1]), line: Number(match[2]) });
  }
  const corrections: { before: string; after: string }[] = [];
  for (const match of md.matchAll(/^FIX\s+(.+?)\s+=>\s+(.*?)\s*$/gmu)) {
    if (match[1]) corrections.push({ before: match[1], after: match[2] });
  }
  const dropLines: string[] = [];
  for (const match of md.matchAll(/^DROP\s+(\S+)\s*$/gmu)) dropLines.push(match[1]);
  return { checkedPatterns, excludeIds, manualBreaks, corrections, dropLines };
}
