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
}

// Diagnostic categories carry no decision \u2014 thousands of instances would
// bury the ~200 real checkboxes, so renderReview collapses them to summary
// counts (full detail stays in changes-stage5.jsonl).
const DIAGNOSTIC_CATEGORIES = new Set([
  'Spaced dash/alignment-gap diagnostics',
  'Greek diagnostics',
  'Paragraph diagnostics',
  'Coverage diagnostics',
]);

function categoryFor(record: ChangeRecord): string {
  const kind = String(record.evidence?.kind ?? '');
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
      checked: false,
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
  return { checkedPatterns };
}
