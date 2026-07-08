import type { CorpusConfig } from './corpus-config';
import { makeChangeId } from './changelist';
import type { ChangeRecord } from './changelist';
import { alignTokens, matchKey } from './align';
import type { AlignOp, TokenProvenance } from './align';
import { pairWitnessPages } from './witness-pairing';
import type { PairingReport } from './witness-pairing';
import { buildReviewModel, patternKeyFor } from './review';
import type { ReviewDecisions, ReviewModel } from './review';
import { extractWitnessAnchors } from './witness-anchors';
import { classifyTicToken } from '../pdf-import/line-shape';
import { ticSpanOnLine } from '../pdf-import/line-shape';

export interface VoteOptions {
  stage3Records?: ChangeRecord[];
  droppedLines?: string[];
}

export interface DroppedLineClassification {
  ref: string;
  column: string;
  class: 'markerLost' | 'genuineGap';
}

export interface VoteOutcome {
  text: string;
  changes: ChangeRecord[];
  review: ReviewModel;
  pairing: PairingReport;
  dropped: DroppedLineClassification[];
  counters: {
    punctCaseDiffs: number;
  };
}

interface PendingEdit {
  record: ChangeRecord;
  after: string;
  prov: TokenProvenance;
  automatic: boolean;
}

const DASH_RE = /[—–]/u;
const INTERIOR_HYPHEN_RE = /(?<=\p{L})-{1,2}(?=\p{L})/u;
const LIGATURE_RE = /[ﬁﬂﬀﬃﬄ]/u;
const GREEK_RE = /[\u0370-\u03ff\u1f00-\u1fff]/u;
const LETTER_RE = /\p{L}/u;

function stripped(raw: string): string {
  return raw.normalize('NFD').replace(/\p{M}/gu, '');
}

function hasDiacriticChange(a: string, b: string): boolean {
  return (a !== stripped(a) || b !== stripped(b)) && stripped(a).toLowerCase() === stripped(b).toLowerCase();
}

function hasGreek(raw: string): boolean {
  return GREEK_RE.test(raw);
}

function wordTokenCount(line: string): number {
  return line.trim() === '' ? 0 : line.trim().split(/\s+/u).length;
}

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function restoreCr(line: string, cr: boolean): string {
  return cr ? `${line}\r` : line;
}

function changeFactory(): (page: number, line: number | undefined, col: number | undefined) => string {
  const counts = new Map<string, number>();
  return (page, line, col) => {
    const key = `${page}:${line ?? ''}:${col ?? ''}`;
    const seq = (counts.get(key) ?? 0) + 1;
    counts.set(key, seq);
    return makeChangeId(page, line, col, seq);
  };
}

function flagRecord(
  nextId: ReturnType<typeof changeFactory>,
  page: number,
  kind: string,
  evidence: Record<string, unknown>,
  line?: number,
  col?: number
): ChangeRecord {
  return {
    id: nextId(page, line, col),
    stage: 5,
    tier: 2,
    rule: 'flag',
    page,
    line,
    col,
    evidence: { kind, ...evidence },
  };
}

function lineContext(text: string, prov: TokenProvenance): string {
  return text.split('\f')[prov.page]?.split('\n')[prov.line] ?? '';
}

function replaceInLine(line: string, col: number, before: string, after: string): string | null {
  const cr = line.endsWith('\r');
  const bare = stripCr(line);
  const actualCol = bare.slice(col, col + before.length) === before ? col : bare.indexOf(before);
  if (actualCol < 0) return null;
  const recto = ticSpanOnLine(bare, 'recto');
  if (recto && actualCol < recto[0]) {
    const [ticStart, ticEnd] = recto;
    const body = bare.slice(0, ticStart).trimEnd();
    const replacedBody = `${body.slice(0, actualCol)}${after}${body.slice(actualCol + before.length)}`;
    const gap = ticStart - replacedBody.length;
    if (gap < 4) return null;
    return restoreCr(`${replacedBody}${' '.repeat(gap)}${bare.slice(ticStart, ticEnd)}${bare.slice(ticEnd)}`, cr);
  }
  return restoreCr(`${bare.slice(0, actualCol)}${after}${bare.slice(actualCol + before.length)}`, cr);
}

function firstNonBlank(lines: string[]): string {
  return lines.find((line) => stripCr(line).trim() !== '') ?? '';
}

function assertDocumentInvariants(before: string, after: string) {
  if ((before.match(/\f/gu) ?? []).length !== (after.match(/\f/gu) ?? []).length) {
    throw new Error('stage 5 invariant failed: form-feed count changed');
  }
  const beforeHeads = before.split('\f').map((page) => firstNonBlank(page.split('\n')));
  const afterHeads = after.split('\f').map((page) => firstNonBlank(page.split('\n')));
  if (beforeHeads.some((head, i) => head !== afterHeads[i])) {
    throw new Error('stage 5 invariant failed: running head changed');
  }
}

function applyPendingEdits(text: string, edits: PendingEdit[], nextId: ReturnType<typeof changeFactory>): { text: string; changes: ChangeRecord[] } {
  const pages = text.split('\f').map((page) => page.split('\n'));
  const byLine = new Map<string, PendingEdit[]>();
  for (const edit of edits) {
    const key = `${edit.prov.page}:${edit.prov.line}`;
    const rows = byLine.get(key) ?? [];
    rows.push(edit);
    byLine.set(key, rows);
  }
  const changes: ChangeRecord[] = [];
  for (const [key, rows] of byLine) {
    const [pageRaw, lineRaw] = key.split(':');
    const page = Number(pageRaw);
    const line = Number(lineRaw);
    let current = pages[page]?.[line];
    if (current === undefined) continue;
    const original = current;
    for (const edit of rows.sort((a, b) => b.prov.col - a.prov.col)) {
      const next = replaceInLine(current, edit.prov.col, edit.record.before ?? '', edit.after);
      if (next === null) {
        changes.push(flagRecord(nextId, page, 'emdash-skipped-geometry', { before: edit.record.before, after: edit.after }, line, edit.prov.col));
        continue;
      }
      if (wordTokenCount(current) !== wordTokenCount(next)) {
        changes.push(flagRecord(nextId, page, 'token-count-invariant', { before: edit.record.before, after: edit.after }, line, edit.prov.col));
        continue;
      }
      current = next;
      changes.push(edit.record);
    }
    if (wordTokenCount(original) !== wordTokenCount(current)) {
      throw new Error('stage 5 invariant failed: whitespace token count changed on edited line');
    }
    pages[page][line] = current;
  }
  const out = pages.map((page) => page.join('\n')).join('\f');
  assertDocumentInvariants(text, out);
  return { text: out, changes };
}

function witnessRefFor(raw: string): string | undefined {
  const m = /^(\d{1,4}[ab])(?:\d{0,2})?$/u.exec(raw);
  return m?.[1];
}

function isClosedDashRestore(aRaw: string, bRaw: string): boolean {
  return DASH_RE.test(bRaw) && !DASH_RE.test(aRaw) && matchKey(aRaw) === matchKey(bRaw) && wordTokenCount(aRaw) === 1 && wordTokenCount(bRaw) === 1;
}

function dashRestorationAfter(aRaw: string, bRaw: string): string | null {
  const dash = bRaw.match(DASH_RE)?.[0];
  if (!dash) return null;
  if (INTERIOR_HYPHEN_RE.test(aRaw)) return aRaw.replace(INTERIOR_HYPHEN_RE, dash);

  const dashIndex = bRaw.search(DASH_RE);
  const lettersBeforeDash = [...bRaw.slice(0, dashIndex)].filter((ch) => LETTER_RE.test(ch)).length;
  if (lettersBeforeDash <= 0) return null;

  let seen = 0;
  for (let i = 0; i < aRaw.length; i += 1) {
    const ch = aRaw[i];
    if (!LETTER_RE.test(ch)) continue;
    seen += 1;
    if (seen === lettersBeforeDash) return `${aRaw.slice(0, i + 1)}${dash}${aRaw.slice(i + 1)}`;
  }
  return null;
}

function isLigatureRestore(aRaw: string, bRaw: string): boolean {
  return LIGATURE_RE.test(bRaw) && matchKey(aRaw) === matchKey(bRaw);
}

function candidateFromMatch(
  op: Extract<AlignOp, { t: 'match' }>,
  nextId: ReturnType<typeof changeFactory>,
  sourceText: string,
  counters: VoteOutcome['counters']
): { record?: ChangeRecord; edit?: PendingEdit } | null {
  if (!op.aProv || op.aRaw === op.bRaw) return {};
  const page = op.aProv.page;
  const line = op.aProv.line;
  const col = op.aProv.col;
  if (isClosedDashRestore(op.aRaw, op.bRaw)) {
    const after = dashRestorationAfter(op.aRaw, op.bRaw);
    if (after === null) return {};
    const record: ChangeRecord = {
      id: nextId(page, line, col),
      stage: 5,
      tier: 1,
      rule: 'emdash-restore',
      page,
      line,
      col,
      before: op.aRaw,
      after,
      evidence: { witnessRef: witnessRefFor(op.bRaw), dashChar: op.bRaw.match(DASH_RE)?.[0] },
    };
    return { record, edit: { record, after, prov: op.aProv, automatic: true } };
  }
  if (isLigatureRestore(op.aRaw, op.bRaw)) {
    const record: ChangeRecord = {
      id: nextId(page, line, col),
      stage: 5,
      tier: 1,
      rule: 'ligature',
      page,
      line,
      col,
      before: op.aRaw,
      after: stripWitnessMarkup(op.bRaw),
      evidence: { witnessRef: witnessRefFor(op.bRaw) },
    };
    return { record, edit: { record, after: stripWitnessMarkup(op.bRaw), prov: op.aProv, automatic: true } };
  }
  // A backbone token that IS a Bekker tic carries geometry, not wording —
  // its witness counterpart is an apparatus anchor (kept in the stream as a
  // sync point), never a word-identity disagreement. Same for a glued-opener
  // blob ('689ato') stage 3 left ambiguous: proposing the witness's anchor
  // token would delete the fused word; the blob is already Tier-2-recorded
  // by stage 3 and belongs to the geometry campaign, not the vote.
  if (classifyTicToken(op.aRaw.trim()) || /^\d{1,4}[ab]\p{L}+/u.test(op.aRaw.trim())) return null;
  if (hasGreek(op.aRaw) || hasGreek(op.bRaw) || hasDiacriticChange(op.aRaw, op.bRaw) || matchKey(op.aRaw) !== matchKey(op.bRaw)) {
    const record: ChangeRecord = {
      id: nextId(page, line, col),
      stage: 5,
      tier: 2,
      rule: 'word-identity',
      page,
      line,
      col,
      before: op.aRaw,
      after: stripWitnessMarkup(op.bRaw),
      evidence: {
        kind: hasGreek(op.aRaw) || hasGreek(op.bRaw) ? 'greek' : 'diacritic',
        witnessRaw: op.bRaw,
        line: lineContext(sourceText, op.aProv),
      },
    };
    return { record, edit: { record, after: stripWitnessMarkup(op.bRaw), prov: op.aProv, automatic: false } };
  }
  counters.punctCaseDiffs += 1;
  return {};
}

function stage3ReviewRecords(records: ChangeRecord[], nextId: ReturnType<typeof changeFactory>): ChangeRecord[] {
  return records
    .filter((record) => record.rule === 'bekker-digit' && record.tier === 2 && record.evidence?.kind === 'bekker-ambiguous')
    .map((record): ChangeRecord => {
      const witnessAnchor = record.evidence?.witnessAnchor as { ref?: string } | undefined;
      const candidates = record.evidence?.candidates as string[] | undefined;
      return {
        id: record.id,
        stage: 5,
        tier: 2,
        rule: 'bekker-digit',
        page: record.page,
        line: record.line,
        col: record.col,
        before: record.before,
        after: witnessAnchor?.ref ?? candidates?.[0],
        evidence: { ...record.evidence, kind: 'bekker-opener', sourceStage: 3, stage5Id: nextId(record.page, record.line, record.col) },
      };
    })
    .filter((record) => record.after !== undefined);
}

/**
 * Genie decorates tokens with markdown/LaTeX (*word*, **w**, $..$, <sup>);
 * a proposed `after` must carry ONLY text that could enter the backbone.
 */
function stripWitnessMarkup(raw: string): string {
  let t = raw.replace(/\*+/gu, '');
  if (/^\$.*\$$/u.test(t)) t = t.slice(1, -1);
  return t.replace(/<\/?sup>/giu, '');
}

function isGarbleToken(raw: string): boolean {
  return (raw.match(/[A-Za-z]/gu)?.length ?? 0) >= 2;
}

function isCleanGreekWitness(raw: string): boolean {
  const t = stripWitnessMarkup(raw);
  return hasGreek(t) && !/[A-Za-z\{}$]/u.test(t);
}

function classifyGapOp(
  op: Exclude<AlignOp, { t: 'match' }>,
  lastProv: TokenProvenance,
  records: ChangeRecord[],
  nextId: ReturnType<typeof changeFactory>
): TokenProvenance {
  if (op.t === 'aOnly') {
    const prov = op.aProv ?? lastProv;
    if (matchKey(op.aRaw) !== '') {
      records.push(flagRecord(nextId, prov.page, 'alignment-gap', { backbone: op.aRaw }, prov.line, prov.col));
    }
    return prov;
  }
  if (/^[—–-]+$/u.test(op.bRaw)) {
    records.push(flagRecord(nextId, lastProv.page, 'spaced-dash-diagnostic', { witness: op.bRaw }, lastProv.line, lastProv.col));
  } else if (matchKey(op.bRaw) !== '') {
    records.push(flagRecord(nextId, lastProv.page, 'alignment-gap', { witness: op.bRaw }, lastProv.line, lastProv.col));
  }
  return lastProv;
}

function classifyGaps(ops: AlignOp[], nextId: ReturnType<typeof changeFactory>, sourceText: string): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  let lastProv: TokenProvenance = { page: 0, line: 0, col: 0 };
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    if (op.t === 'match') {
      if (op.aProv) lastProv = op.aProv;
      continue;
    }

    const region: Exclude<AlignOp, { t: 'match' }>[] = [];
    const aOps: Extract<AlignOp, { t: 'aOnly' }>[] = [];
    const bOps: Extract<AlignOp, { t: 'bOnly' }>[] = [];
    for (; i < ops.length && ops[i].t !== 'match'; i += 1) {
      const gapOp = ops[i] as Exclude<AlignOp, { t: 'match' }>;
      region.push(gapOp);
      if (gapOp.t === 'aOnly') aOps.push(gapOp);
      else bOps.push(gapOp);
    }
    i -= 1;

    const bGreek = bOps.filter((gapOp) => hasGreek(gapOp.bRaw));
    if (bGreek.length === 0) {
      for (const gapOp of region) lastProv = classifyGapOp(gapOp, lastProv, records, nextId);
      continue;
    }

    const aWords = aOps.filter((gapOp) => isGarbleToken(gapOp.aRaw));
    const bWords = bOps.filter((gapOp) => isCleanGreekWitness(gapOp.bRaw));
    if (aWords.length > 0 && aWords.length === bWords.length) {
      const runBefore = aWords.map((gapOp) => gapOp.aRaw).join(' ');
      const runAfter = bWords.map((gapOp) => stripWitnessMarkup(gapOp.bRaw)).join(' ');
      const consumedA = new Set<AlignOp>(aWords);
      const consumedB = new Set<AlignOp>(bWords);
      for (let k = 0; k < aWords.length; k += 1) {
        const a = aWords[k];
        const b = bWords[k];
        if (!a.aProv) continue;
        records.push({
          id: nextId(a.aProv.page, a.aProv.line, a.aProv.col),
          stage: 5,
          tier: 2,
          rule: 'word-identity',
          page: a.aProv.page,
          line: a.aProv.line,
          col: a.aProv.col,
          before: a.aRaw,
          after: stripWitnessMarkup(b.bRaw),
          evidence: {
            kind: 'greek',
            witnessGreek: true,
            runBefore,
            runAfter,
            runLen: aWords.length,
            runIdx: k,
            line: lineContext(sourceText, a.aProv),
          },
        });
      }
      for (const gapOp of region) {
        if (consumedA.has(gapOp) || consumedB.has(gapOp)) {
          if (gapOp.t === 'aOnly' && gapOp.aProv) lastProv = gapOp.aProv;
          continue;
        }
        lastProv = classifyGapOp(gapOp, lastProv, records, nextId);
      }
      continue;
    }

    const prov = aWords[0]?.aProv ?? aOps.find((gapOp) => gapOp.aProv)?.aProv ?? lastProv;
    records.push(
      flagRecord(
        nextId,
        prov.page,
        'greek-run-unpaired',
        { backbone: aWords.map((gapOp) => gapOp.aRaw).join(' '), witness: bGreek.map((gapOp) => gapOp.bRaw).join(' ') },
        prov.line,
        prov.col
      )
    );
    for (const gapOp of region) {
      if (gapOp.t === 'aOnly' && gapOp.aProv) lastProv = gapOp.aProv;
    }
  }
  return records;
}

function checked(decisions: ReviewDecisions | undefined, record: ChangeRecord): boolean {
  return decisions?.checkedPatterns.has(patternKeyFor(record)) ?? false;
}

function stage3Edits(records: ChangeRecord[], decisions: ReviewDecisions | undefined): PendingEdit[] {
  return records
    .filter((record) => checked(decisions, record))
    .filter((record): record is ChangeRecord & { line: number; col: number; before: string; after: string } =>
      record.line !== undefined && record.col !== undefined && record.before !== undefined && record.after !== undefined
    )
    .map((record) => ({ record, after: record.after, prov: { page: record.page, line: record.line, col: record.col }, automatic: false }));
}

export function classifyDroppedLines(droppedLines: string[], witnessText: string): DroppedLineClassification[] {
  const witnessColumns = new Set(extractWitnessAnchors(witnessText).flat().map((anchor) => `${anchor.page}${anchor.col}`));
  return droppedLines.map((ref) => {
    const m = /^(\d{1,4}[ab])\d{0,2}$/u.exec(ref);
    const column = m?.[1] ?? ref;
    return { ref, column, class: witnessColumns.has(column) ? 'markerLost' : 'genuineGap' };
  });
}

export function vote(
  backbone: string,
  witness: string,
  config: CorpusConfig,
  decisions?: ReviewDecisions,
  options: VoteOptions = {}
): VoteOutcome {
  const nextId = changeFactory();
  const pairing = pairWitnessPages(backbone, witness, config);
  const witnessBody = pairing.witnessBodyPages.map((page) => page.text).join('\n');
  const ops = alignTokens(backbone, witnessBody);
  const counters = { punctCaseDiffs: 0 };
  const reviewRecords: ChangeRecord[] = [];
  const edits: PendingEdit[] = [];
  const coverageRecords: ChangeRecord[] = pairing.report.rows
    .filter((row) => row.pairKind === 'no-witness-span')
    .map((row) => ({
      id: nextId(row.backbonePage, undefined, undefined),
      stage: 5,
      tier: 2,
      rule: 'no-witness-span',
      page: row.backbonePage,
      evidence: { kind: 'no-witness-span', bekkerSpan: row.bekkerSpan },
    }));

  for (const op of ops) {
    if (op.t !== 'match') continue;
    const candidate = candidateFromMatch(op, nextId, backbone, counters);
    if (!candidate?.record) continue;
    reviewRecords.push(candidate.record);
    if (candidate.edit && (candidate.edit.automatic || checked(decisions, candidate.record))) edits.push(candidate.edit);
  }

  const gapRecords = classifyGaps(ops, nextId, backbone);
  reviewRecords.push(...gapRecords);
  for (const record of gapRecords) {
    if (record.rule !== 'word-identity' || !checked(decisions, record)) continue;
    if (record.line === undefined || record.col === undefined || record.after === undefined) continue;
    edits.push({ record, after: record.after, prov: { page: record.page, line: record.line, col: record.col }, automatic: false });
  }

  const stage3Records = stage3ReviewRecords(options.stage3Records ?? [], nextId);
  reviewRecords.push(...stage3Records);
  edits.push(...stage3Edits(stage3Records, decisions));

  const applied = applyPendingEdits(backbone, edits, nextId);
  const review = buildReviewModel(config.id, reviewRecords.filter((record) => record.tier === 2), backbone);
  const appliedIds = new Set(applied.changes.map((record) => record.id));
  const changes = [
    ...applied.changes,
    ...coverageRecords,
    ...reviewRecords.filter((record) => record.tier === 2 && !appliedIds.has(record.id)),
  ];
  return {
    text: applied.text,
    changes,
    review,
    pairing: pairing.report,
    dropped: classifyDroppedLines(options.droppedLines ?? [], witness),
    counters,
  };
}
