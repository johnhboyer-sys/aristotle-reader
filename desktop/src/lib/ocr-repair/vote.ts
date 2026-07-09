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
import { classifyTicToken, isDisplayShapedLine, parseHeadingResidual, ticSpanOnLine } from '../pdf-import/line-shape';

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

interface ParagraphEdit {
  record: ChangeRecord;
  targetCol: number;
  side: 'recto' | 'verso';
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

function rectoTicSpan(line: string): [number, number] | null {
  const span = ticSpanOnLine(line, 'recto');
  if (span) return span;
  const match = / {4,}(\S+)\s*$/u.exec(line);
  if (!match || !classifyTicToken(match[1])) return null;
  const start = match.index + match[0].indexOf(match[1]);
  return [start, start + match[1].length];
}

export function setLeadingIndent(line: string, targetCol: number, side: 'recto' | 'verso'): string | null {
  const cr = line.endsWith('\r');
  const bare = stripCr(line);
  const recto = rectoTicSpan(bare);
  if (side === 'recto' && recto) {
    const [ticStart, ticEnd] = recto;
    const body = bare.slice(0, ticStart).trim();
    const prefix = `${' '.repeat(targetCol)}${body}`;
    const gap = ticStart - prefix.length;
    if (gap < 4) return null;
    return restoreCr(`${prefix}${' '.repeat(gap)}${bare.slice(ticStart, ticEnd)}${bare.slice(ticEnd)}`, cr);
  }
  const verso = ticSpanOnLine(bare, 'verso');
  if (side === 'verso' && verso) {
    const [, ticEnd] = verso;
    const body = bare.slice(ticEnd).trimStart();
    const gap = targetCol - ticEnd;
    if (gap < 1) return null;
    return restoreCr(`${bare.slice(0, ticEnd)}${' '.repeat(gap)}${body}`, cr);
  }
  return restoreCr(`${' '.repeat(targetCol)}${bare.trimStart()}`, cr);
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
    let expectedLineDelta = 0;
    for (const edit of rows.sort((a, b) => b.prov.col - a.prov.col)) {
      const next = replaceInLine(current, edit.prov.col, edit.record.before ?? '', edit.after);
      if (next === null) {
        changes.push(flagRecord(nextId, page, 'emdash-skipped-geometry', { before: edit.record.before, after: edit.after }, line, edit.prov.col));
        continue;
      }
      const expectedDelta = joinedTokenDelta(edit.record);
      if (wordTokenCount(current) - wordTokenCount(next) !== expectedDelta) {
        changes.push(flagRecord(nextId, page, 'token-count-invariant', { before: edit.record.before, after: edit.after }, line, edit.prov.col));
        continue;
      }
      current = next;
      expectedLineDelta += expectedDelta;
      changes.push(edit.record);
    }
    if (wordTokenCount(original) - wordTokenCount(current) !== expectedLineDelta) {
      throw new Error('stage 5 invariant failed: whitespace token count changed on edited line');
    }
    pages[page][line] = current;
  }
  const out = pages.map((page) => page.join('\n')).join('\f');
  assertDocumentInvariants(text, out);
  return { text: out, changes };
}

function applyParagraphEdits(text: string, edits: ParagraphEdit[], nextId: ReturnType<typeof changeFactory>): { text: string; changes: ChangeRecord[] } {
  const pages = text.split('\f').map((page) => page.split('\n'));
  const changes: ChangeRecord[] = [];
  for (const edit of edits) {
    const line = edit.record.line;
    if (line === undefined) continue;
    const current = pages[edit.record.page]?.[line];
    if (current === undefined) continue;
    const next = setLeadingIndent(current, edit.targetCol, edit.side);
    if (next === null) {
      changes.push(flagRecord(nextId, edit.record.page, 'paragraph-indent-skipped-geometry', { targetCol: edit.targetCol, side: edit.side }, line, edit.record.col));
      continue;
    }
    if (wordTokenCount(current) !== wordTokenCount(next)) {
      changes.push(flagRecord(nextId, edit.record.page, 'token-count-invariant', { rule: 'paragraph-indent', targetCol: edit.targetCol }, line, edit.record.col));
      continue;
    }
    pages[edit.record.page][line] = next;
    changes.push(edit.record);
  }
  const out = pages.map((page) => page.join('\n')).join('\f');
  assertDocumentInvariants(text, out);
  return { text: out, changes };
}

function joinedTokenDelta(record: ChangeRecord): number {
  const joinedTokens = record.evidence?.joinedTokens;
  return typeof joinedTokens === 'number' && Number.isInteger(joinedTokens) && joinedTokens > 0 ? joinedTokens : 0;
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

const ORPHAN_OPEN_BRACKET_RE = /^[([{<]$/u;
const ORPHAN_CLOSE_BRACKET_RE = /^[)\]}>]$/u;
const WITNESS_OPEN_BRACKET_RE = /^[〈<(\[]/u;
const WITNESS_CLOSE_BRACKET_RE = /[〉>)\]]$/u;

interface GreekEdgeFold {
  before: string;
  col: number;
  joinedTokens: number;
  joinedPunct: string;
}

function openingGreekEdgeFold(
  punct: Extract<AlignOp, { t: 'aOnly' }> | undefined,
  word: Extract<AlignOp, { t: 'aOnly' }>,
  witness: Extract<AlignOp, { t: 'bOnly' }>,
  sourceText: string
): GreekEdgeFold | null {
  if (!punct?.aProv || !word.aProv || !ORPHAN_OPEN_BRACKET_RE.test(punct.aRaw) || !WITNESS_OPEN_BRACKET_RE.test(stripWitnessMarkup(witness.bRaw))) return null;
  const before = `${punct.aRaw} ${word.aRaw}`;
  return lineContext(sourceText, punct.aProv).slice(punct.aProv.col, punct.aProv.col + before.length) === before
    ? { before, col: punct.aProv.col, joinedTokens: 1, joinedPunct: punct.aRaw }
    : null;
}

function closingGreekEdgeFold(
  word: Extract<AlignOp, { t: 'aOnly' }>,
  punct: Extract<AlignOp, { t: 'aOnly' }> | undefined,
  witness: Extract<AlignOp, { t: 'bOnly' }>,
  sourceText: string
): GreekEdgeFold | null {
  if (!punct?.aProv || !word.aProv || !ORPHAN_CLOSE_BRACKET_RE.test(punct.aRaw) || !WITNESS_CLOSE_BRACKET_RE.test(stripWitnessMarkup(witness.bRaw))) return null;
  const before = `${word.aRaw} ${punct.aRaw}`;
  return lineContext(sourceText, word.aProv).slice(word.aProv.col, word.aProv.col + before.length) === before
    ? { before, col: word.aProv.col, joinedTokens: 1, joinedPunct: punct.aRaw }
    : null;
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
      const edgeFolds = new Map<AlignOp, GreekEdgeFold>();
      const foldedPunctOps = new Set<AlignOp>();
      // An orphan bracket can sit at the run's edges OR between two run
      // words ('Kai ( riJv …' — the print's '〈' split mid-run), so every
      // word checks its immediate aOps neighbors. A punct op folds at most
      // once, and never a slot occupied by another run word.
      for (let k = 0; k < aWords.length; k += 1) {
        const idx = aOps.indexOf(aWords[k]);
        const prevOp = aOps[idx - 1];
        const prevIsWord = k > 0 && aOps.indexOf(aWords[k - 1]) === idx - 1;
        if (prevOp?.t === 'aOnly' && !prevIsWord && !foldedPunctOps.has(prevOp)) {
          const fold = openingGreekEdgeFold(prevOp, aWords[k], bWords[k], sourceText);
          if (fold) {
            edgeFolds.set(aWords[k], fold);
            foldedPunctOps.add(prevOp);
          }
        }
        const nextOp = aOps[idx + 1];
        const nextIsWord = k < aWords.length - 1 && aOps.indexOf(aWords[k + 1]) === idx + 1;
        if (nextOp?.t === 'aOnly' && !nextIsWord && !foldedPunctOps.has(nextOp)) {
          const fold = closingGreekEdgeFold(aWords[k], nextOp, bWords[k], sourceText);
          if (fold) {
            const existing = edgeFolds.get(aWords[k]);
            edgeFolds.set(
              aWords[k],
              existing
                ? {
                    before: `${existing.before} ${fold.joinedPunct}`,
                    col: existing.col,
                    joinedTokens: existing.joinedTokens + fold.joinedTokens,
                    joinedPunct: `${existing.joinedPunct} ${fold.joinedPunct}`,
                  }
                : fold
            );
            foldedPunctOps.add(nextOp);
          }
        }
      }
      const runBefore = aWords.map((gapOp) => edgeFolds.get(gapOp)?.before ?? gapOp.aRaw).join(' ');
      const runAfter = bWords.map((gapOp) => stripWitnessMarkup(gapOp.bRaw)).join(' ');
      const consumedA = new Set<AlignOp>(aWords);
      for (const punctOp of foldedPunctOps) consumedA.add(punctOp);
      const consumedB = new Set<AlignOp>(bWords);
      for (let k = 0; k < aWords.length; k += 1) {
        const a = aWords[k];
        const b = bWords[k];
        if (!a.aProv) continue;
        const fold = edgeFolds.get(a);
        const evidence: Record<string, unknown> = {
          kind: 'greek',
          witnessGreek: true,
          runBefore,
          runAfter,
          runLen: aWords.length,
          runIdx: k,
          line: lineContext(sourceText, a.aProv),
        };
        if (fold) {
          evidence.joinedTokens = fold.joinedTokens;
          evidence.joinedPunct = fold.joinedPunct;
        }
        records.push({
          id: nextId(a.aProv.page, a.aProv.line, fold?.col ?? a.aProv.col),
          stage: 5,
          tier: 2,
          rule: 'word-identity',
          page: a.aProv.page,
          line: a.aProv.line,
          col: fold?.col ?? a.aProv.col,
          before: fold?.before ?? a.aRaw,
          after: stripWitnessMarkup(b.bRaw),
          evidence,
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
  if (decisions?.excludeIds?.has(record.id)) return false;
  return decisions?.checkedPatterns.has(patternKeyFor(record)) ?? false;
}

function plainWords(raw: string): string[] {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function contextPhrase(raw: string): string {
  return plainWords(raw.replace(/^\s*\d{1,4}[ab]\d{0,2}\b/iu, '')).slice(0, 4).join(' ');
}

function witnessParagraphStarts(witnessBody: string): Set<string> {
  const starts = new Set<string>();
  let atBreak = true;
  for (const line of witnessBody.split(/\n/u)) {
    if (line.trim() === '') {
      atBreak = true;
      continue;
    }
    if (atBreak) {
      const phrase = contextPhrase(line);
      if (phrase) starts.add(phrase);
    }
    atBreak = false;
  }
  return starts;
}

function pageSide(lines: string[]): 'recto' | 'verso' {
  if (lines.some((line) => ticSpanOnLine(stripCr(line), 'verso'))) return 'verso';
  return 'recto';
}

function bodyStartCol(line: string, side: 'recto' | 'verso'): number | null {
  const bare = stripCr(line);
  if (side === 'verso') {
    const verso = ticSpanOnLine(bare, 'verso');
    const body = verso ? bare.slice(verso[1]) : bare;
    const col = firstAlphaCol(body);
    return col === null ? null : col + (verso?.[1] ?? 0);
  }
  const recto = ticSpanOnLine(bare, 'recto');
  const body = recto ? bare.slice(0, recto[0]) : bare;
  const col = firstAlphaCol(body);
  return col;
}

function lineBody(line: string, side: 'recto' | 'verso'): string {
  const bare = stripCr(line);
  if (side === 'verso') {
    const verso = ticSpanOnLine(bare, 'verso');
    return verso ? bare.slice(verso[1]).trimStart() : bare.trimStart();
  }
  const recto = ticSpanOnLine(bare, 'recto');
  return (recto ? bare.slice(0, recto[0]) : bare).trim();
}

function sentenceBoundary(line: string): boolean {
  return /[.?!'"′)]$/u.test(line.trim());
}

function firstAlphaCol(line: string): number | null {
  const m = /[A-Za-z]/u.exec(line);
  return m ? m.index : null;
}

function modalBodyMargin(lines: string[], side: 'recto' | 'verso', skipHead: number | null): number {
  if (side === 'verso') return 11;
  const cols: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i === skipHead || stripCr(lines[i]).trim() === '') continue;
    const col = bodyStartCol(lines[i], side);
    if (col !== null) cols.push(col);
  }
  if (cols.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const col of cols) counts.set(col, (counts.get(col) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function firstNonBlankLine(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i += 1) {
    if (stripCr(lines[i]).trim() !== '') return i;
  }
  return null;
}

function paragraphRecord(
  nextId: ReturnType<typeof changeFactory>,
  page: number,
  line: number,
  col: number,
  kind: 'paragraph-break-lost' | 'paragraph-break-spurious',
  support: 'dual-blank' | 'page-top' | 'page-top-dual' | 'under-indent' | 'jitter' | 'john-manual',
  action: 'insert' | 'snap' | 'flag',
  targetCol: number,
  offset: number,
  modal: number,
  side: 'recto' | 'verso',
  witnessContext: string
): ChangeRecord {
  return {
    id: nextId(page, line, col),
    stage: 5,
    tier: 2,
    rule: 'paragraph-indent',
    page,
    line,
    col,
    before: support,
    after: action,
    evidence: { kind, support, action, targetCol, offset, modal, side, witnessContext },
  };
}

const SHORT_LINE_MARGIN = 10;
const NOTE_HEAD_RE = /^\d{1,2}[.)]?\s+\S/u;

// ---------------------------------------------------------------------------
// §A/§B of stage6-fixes-2-spec: line-wrap joins. The scan flattens a print
// em-dash at line end to a bare hyphen ("kind-" / "e.g."), and wraps lexical
// compounds at their hyphen ("split-" / "footed"); the frozen converter's
// §3.4 rule (lowercase continuation → drop hyphen, glue) then yields
// "kinde.g." / "splitfooted". The witness arbitrates each wrap INTRA-LINE:
// dash joint → rejoin with the dash; plain-hyphen joint → rejoin keeping the
// hyphen; solid form → genuine soft wrap, leave for the converter; both or
// neither → Tier-2 card.

interface WrapJoin {
  record: ChangeRecord;
  page: number;
  line1: number;
  line2: number;
  w1: string; // alpha core of the fragment, without its trailing hyphen
  w2: string; // raw first token of line 2
  joiner: string;
}

function normWrapToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^[^\p{L}]+/u, '')
    .replace(/[^\p{L}]+$/u, '');
}

function witnessJointIndex(witnessBody: string): { joints: Map<string, Set<string>>; solids: Set<string> } {
  const joints = new Map<string, Set<string>>();
  const solids = new Set<string>();
  for (const rawLine of witnessBody.split('\n')) {
    const line = stripWitnessMarkup(rawLine).trimEnd();
    // Lookahead keeps chained compounds overlapping: "multi-split-footed"
    // must index BOTH (multi|split) and (split|footed).
    for (const m of line.matchAll(/([\p{L}][\p{L}.]*) ?([—–-]) ?(?=([\p{L}][\p{L}.]*))/gu)) {
      // w2 present on the same line by construction — intra-line evidence.
      const key = `${normWrapToken(m[1])}|${normWrapToken(m[3])}`;
      const set = joints.get(key) ?? new Set<string>();
      set.add(m[2]);
      joints.set(key, set);
    }
    for (const m of line.matchAll(/\p{L}{2,}/gu)) solids.add(m[0].toLowerCase());
  }
  return { joints, solids };
}

function classifyWrapJoins(
  pages: string[][],
  witnessBody: string,
  nextId: ReturnType<typeof changeFactory>
): { records: ChangeRecord[]; joins: WrapJoin[] } {
  const { joints, solids } = witnessJointIndex(witnessBody);
  const records: ChangeRecord[] = [];
  const joins: WrapJoin[] = [];
  let prevPageTail: { page: number; idx: number; body: string; raw: string } | null = null;
  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page];
    const head = firstNonBlankLine(lines);
    const side = pageSide(lines);
    const bodies: { idx: number; body: string; raw: string }[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (i === head) continue;
      const raw = stripCr(lines[i]);
      if (raw.trim() === '') continue;
      const body = lineBody(raw, side);
      if (body === '' || parseHeadingResidual(body) || isDisplayShapedLine(body)) continue;
      bodies.push({ idx: i, body, raw });
    }
    // Cross-page wraps: a page ending in a hyphen fragment whose witness
    // evidence says dash joint or compound gets a Tier-2 card — token moves
    // across a page seam are never automatic. Solid-form soft wraps are the
    // converter's own cross-page glue and need nothing.
    if (prevPageTail && bodies.length > 0) {
      const frag = /([\p{L}]+)-$/u.exec(prevPageTail.body.trimEnd());
      const next = /^(\S+)/u.exec(bodies[0].body.trimStart());
      if (frag && next) {
        const key = `${normWrapToken(frag[1])}|${normWrapToken(next[1])}`;
        const dashes = joints.get(key);
        const solid = solids.has(`${normWrapToken(frag[1])}${normWrapToken(next[1])}`);
        if (dashes || !solid) {
          records.push({
            id: nextId(prevPageTail.page, prevPageTail.idx, prevPageTail.raw.lastIndexOf(`${frag[1]}-`)),
            stage: 5,
            tier: 2,
            rule: 'wrap-join',
            page: prevPageTail.page,
            line: prevPageTail.idx,
            before: `${frag[1]}-`,
            after: `${frag[1]}|${next[1]}`,
            evidence: {
              kind: 'wrap-cross-page',
              w2: next[1],
              nextPage: page,
              jointDashes: dashes ? [...dashes] : [],
              solidSeen: solid,
            },
          });
        }
      }
    }
    prevPageTail = bodies.length > 0 ? { page, ...bodies[bodies.length - 1] } : prevPageTail;
    for (let k = 0; k + 1 < bodies.length; k += 1) {
      // Adjacent print lines only — a blank line between means the hyphen ends
      // a paragraph, which is not a wrap.
      if (bodies[k + 1].idx !== bodies[k].idx + 1) continue;
      const frag = /([\p{L}]+)-$/u.exec(bodies[k].body.trimEnd());
      if (!frag) continue;
      const next = /^(\S+)/u.exec(bodies[k + 1].body.trimStart());
      if (!next) continue;
      const w1 = frag[1];
      const w2 = next[1];
      const key = `${normWrapToken(w1)}|${normWrapToken(w2)}`;
      const dashes = joints.get(key);
      const solid = solids.has(`${normWrapToken(w1)}${normWrapToken(w2)}`);
      const col = bodies[k].raw.lastIndexOf(`${w1}-`);
      if (dashes && dashes.size === 1 && !solid) {
        const joiner = [...dashes][0];
        const record: ChangeRecord = {
          id: nextId(page, bodies[k].idx, col),
          stage: 5,
          tier: 1,
          rule: 'wrap-join',
          page,
          line: bodies[k].idx,
          col,
          before: `${w1}-`,
          after: `${w1}${joiner}${w2}`,
          evidence: {
            kind: joiner === '-' ? 'lexical-compound' : 'emdash-joint',
            w2,
            line2: bodies[k + 1].idx,
            joinedTokens: 1,
          },
        };
        joins.push({ record, page, line1: bodies[k].idx, line2: bodies[k + 1].idx, w1, w2, joiner });
        records.push(record);
      } else if (!dashes && solid) {
        continue; // soft wrap — the converter's §3.4 glue is correct
      } else {
        records.push({
          id: nextId(page, bodies[k].idx, col),
          stage: 5,
          tier: 2,
          rule: 'wrap-join',
          page,
          line: bodies[k].idx,
          col,
          before: `${w1}-`,
          after: `${w1}|${w2}`,
          evidence: {
            kind: 'wrap-ambiguous',
            w2,
            line2: bodies[k + 1].idx,
            jointDashes: dashes ? [...dashes] : [],
            solidSeen: solid,
          },
        });
      }
    }
  }
  return { records, joins };
}

function applyWrapJoins(
  text: string,
  joins: WrapJoin[],
  nextId: ReturnType<typeof changeFactory>
): { text: string; changes: ChangeRecord[] } {
  const pages = text.split('\f').map((page) => page.split('\n'));
  const changes: ChangeRecord[] = [];
  for (const join of joins) {
    const line1 = pages[join.page]?.[join.line1];
    const line2 = pages[join.page]?.[join.line2];
    if (line1 === undefined || line2 === undefined) continue;
    // Recompute from the CURRENT lines — earlier stage-5 respells may have
    // already restored the dash in place (fragment now ends "w1—").
    const bare1 = stripCr(line1);
    const side: 'recto' | 'verso' = ticSpanOnLine(bare1, 'recto') ? 'recto' : 'verso';
    const body1 = lineBody(bare1, side);
    const fragMatch = new RegExp(`${join.w1}[-—–]$`, 'u').exec(body1.trimEnd());
    if (!fragMatch) {
      changes.push(flagRecord(nextId, join.page, 'wrap-join-skipped-shape', { w1: join.w1, w2: join.w2 }, join.line1));
      continue;
    }
    const before = fragMatch[0];
    // Audit fidelity: an earlier stage-5 respell may have already restored
    // the dash in place — record what the line actually said at apply time.
    join.record.before = before;
    const after = `${join.w1}${join.joiner}${join.w2}`;
    const col1 = bare1.lastIndexOf(before);
    const next1 = replaceInLine(line1, col1, before, after);
    if (next1 === null) {
      changes.push(flagRecord(nextId, join.page, 'wrap-join-skipped-geometry', { w1: join.w1, w2: join.w2 }, join.line1, col1));
      continue;
    }
    const bare2 = stripCr(line2);
    // w2 at a token boundary only (a bare indexOf could hit a substring of an
    // earlier word); removal goes through replaceInLine so a trailing recto
    // tic is re-padded back to its ORIGINAL column — slicing shifted the tic
    // out of the converter's band and dropped the line.
    const escaped = join.w2.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const m2 = new RegExp(`(?:^|[ \\t])${escaped}(?=[ \\t]|$)`, 'u').exec(bare2);
    if (!m2) {
      changes.push(flagRecord(nextId, join.page, 'wrap-join-skipped-shape', { w1: join.w1, w2: join.w2, line2: join.line2 }, join.line2));
      continue;
    }
    const c2 = m2.index === 0 ? 0 : m2.index + 1;
    const followedBySpace = bare2[c2 + join.w2.length] === ' ';
    const before2 = followedBySpace ? `${join.w2} ` : join.w2;
    const next2 = replaceInLine(line2, c2, before2, '');
    if (next2 === null) {
      changes.push(flagRecord(nextId, join.page, 'wrap-join-skipped-geometry', { w1: join.w1, w2: join.w2, line2: join.line2 }, join.line2, c2));
      continue;
    }
    if (stripCr(next2).trim() === '') {
      changes.push(flagRecord(nextId, join.page, 'wrap-join-skipped-empty-line', { w1: join.w1, w2: join.w2 }, join.line2));
      continue;
    }
    const beforeTokens = wordTokenCount(stripCr(line1)) + wordTokenCount(bare2);
    const afterTokens = wordTokenCount(stripCr(next1)) + wordTokenCount(stripCr(next2));
    if (beforeTokens - afterTokens !== 1) {
      changes.push(flagRecord(nextId, join.page, 'token-count-invariant', { rule: 'wrap-join', w1: join.w1, w2: join.w2 }, join.line1, col1));
      continue;
    }
    pages[join.page][join.line1] = next1;
    pages[join.page][join.line2] = next2;
    changes.push(join.record);
  }
  const out = pages.map((page) => page.join('\n')).join('\f');
  assertDocumentInvariants(text, out);
  return { text: out, changes };
}

// §D of stage6-fixes-2-spec: at stage 5 the translator footnotes still sit at
// page bottoms, so "the previous page's last body line" must not latch onto a
// NOTE — cross-seam sentence evidence would judge against apparatus text
// (which is why the 73a20 page-top jitter went undetected: the page above
// ends in a sentence-final note). A trailing block separated from the body by
// a line gap and headed by a bare note number is excluded.
function lastTextBody(
  lines: string[],
  side: 'recto' | 'verso',
  head: number | null
): { body: string; maxWidth: number } | null {
  const bodies: { idx: number; body: string; col: number }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i === head) continue;
    const raw = stripCr(lines[i]);
    if (raw.trim() === '') continue;
    const body = lineBody(raw, side);
    if (body === '' || parseHeadingResidual(body) || isDisplayShapedLine(body)) continue;
    const col = bodyStartCol(raw, side);
    bodies.push({ idx: i, body, col: col ?? 0 });
  }
  if (bodies.length === 0) return null;
  const counts = new Map<number, number>();
  for (const b of bodies) counts.set(b.col, (counts.get(b.col) ?? 0) + 1);
  const modal = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  // Walk up from the bottom, shedding apparatus: note TEXT sits far right of
  // the body margin (Barnes prints a lone marker digit, then the note deeply
  // indented — the bare digit itself is display-filtered above), and one-line
  // notes ("15. Reading …") are gap-separated with a bare note-number head.
  let end = bodies.length;
  while (end > 0) {
    const cur = bodies[end - 1];
    if (cur.col >= modal + 6) {
      end -= 1;
      continue;
    }
    const gapAbove = end >= 2 && cur.idx - bodies[end - 2].idx > 1;
    if (gapAbove && NOTE_HEAD_RE.test(cur.body.trimStart())) {
      end -= 1;
      continue;
    }
    break;
  }
  if (end === 0) return null;
  let maxWidth = 0;
  for (let k = 0; k < end; k += 1) maxWidth = Math.max(maxWidth, bodies[k].body.trimEnd().length);
  return { body: bodies[end - 1].body, maxWidth };
}

// A witness paragraph break at the top of a page is confounded: the reflowed
// witness routinely opens a fresh paragraph at a print page turn, so witness
// evidence alone says nothing there. The print must corroborate through the
// previous page's last body line: mid-sentence forbids a paragraph break
// (kill the candidate); sentence-final AND short of the page's body width is
// the print's own break evidence (dual support); sentence-final at full
// width stays ambiguous for per-instance review.
function pageTopSupport(prevPageLastBody: string | null, prevPageMaxWidth: number): 'page-top' | 'page-top-dual' | null {
  if (prevPageLastBody === null) return 'page-top';
  if (!sentenceBoundary(prevPageLastBody)) return null;
  if (prevPageLastBody.trim().length < prevPageMaxWidth - SHORT_LINE_MARGIN) return 'page-top-dual';
  return 'page-top';
}

function classifyParagraphs(
  pages: string[][],
  witnessStarts: Set<string>,
  nextId: ReturnType<typeof changeFactory>,
  manualBreaks: { page: number; line: number }[] = []
): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  let prevPageLastBody: string | null = null;
  let prevPageMaxWidth = 0;
  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page];
    const head = firstNonBlankLine(lines);
    const side = pageSide(lines);
    const modal = modalBodyMargin(lines, side, head);
    for (const brk of manualBreaks.filter((b) => b.page === page)) {
      const raw = stripCr(lines[brk.line] ?? '');
      if (raw.trim() === '') continue;
      const firstCol = bodyStartCol(raw, side) ?? 0;
      // John-mandated break (print-verified, no machine evidence): same
      // kind/action as machine inserts so an approved insert batch applies it.
      records.push(paragraphRecord(nextId, page, brk.line, firstCol, 'paragraph-break-lost', 'john-manual', 'insert', modal + 4, firstCol - modal, modal, side, ''));
    }
    let previousBodyLine: string | null = null;
    let seenBody = false;
    let afterHeading = false;
    for (let line = 0; line < lines.length; line += 1) {
      const raw = stripCr(lines[line]);
      if (line === head || raw.trim() === '') continue;
      const body = lineBody(raw, side);
      if (body === '') continue;
      if (parseHeadingResidual(body)) {
        afterHeading = true;
        continue;
      }
      if (isDisplayShapedLine(body)) continue;
      const firstCol = bodyStartCol(raw, side);
      if (firstCol === null) continue;
      const offset = firstCol - modal;
      const phrase = contextPhrase(body);
      const witnessBreak = phrase !== '' && witnessStarts.has(phrase);
      const blankPrecedes = line > 0 && stripCr(lines[line - 1]).trim() === '';
      const pageTop = !seenBody;
      const wasAfterHeading = afterHeading;
      afterHeading = false;
      // §E-b: never INSERT on the first body line after a division heading —
      // the converter opens a paragraph at every chapter regardless, and the
      // indent is pure title bait for §5 capture (witness "breaks" there
      // vacuously: every chapter starts a witness paragraph).
      if (offset <= 1 && witnessBreak && !wasAfterHeading && (blankPrecedes || pageTop || offset === 1)) {
        const support = pageTop
          ? pageTopSupport(prevPageLastBody, prevPageMaxWidth)
          : blankPrecedes
            ? 'dual-blank'
            : 'under-indent';
        if (support !== null) {
          records.push(paragraphRecord(nextId, page, line, firstCol, 'paragraph-break-lost', support, 'insert', modal + 4, offset, modal, side, phrase));
        }
      } else if ((offset === 1 || offset === 2) && !witnessBreak) {
        // §C: page-top raw jitter — previousBodyLine resets per page, so the
        // first body line of a page borrows the previous page's last TEXT
        // line (footnote-aware, §D) as its sentence evidence.
        const prevLine = previousBodyLine ?? (pageTop ? prevPageLastBody : null);
        if (prevLine && !sentenceBoundary(prevLine)) {
          records.push(paragraphRecord(nextId, page, line, firstCol, 'paragraph-break-spurious', 'jitter', 'snap', modal, offset, modal, side, phrase));
        } else if (offset === 2 && prevLine && sentenceBoundary(prevLine)) {
          records.push(paragraphRecord(nextId, page, line, firstCol, 'paragraph-break-spurious', 'under-indent', 'flag', modal, offset, modal, side, phrase));
        }
      }
      previousBodyLine = body;
      seenBody = true;
    }
    const pageText = lastTextBody(lines, side, head);
    if (pageText !== null) {
      prevPageLastBody = pageText.body;
      prevPageMaxWidth = pageText.maxWidth;
    }
  }
  return records;
}

function paragraphEdits(records: ChangeRecord[], decisions: ReviewDecisions | undefined): ParagraphEdit[] {
  return records
    .filter((record) => checked(decisions, record))
    .filter((record) => record.evidence?.action === 'insert' || record.evidence?.action === 'snap')
    .map((record) => ({
      record,
      targetCol: Number(record.evidence?.targetCol),
      side: (record.evidence?.side === 'verso' ? 'verso' : 'recto') as 'recto' | 'verso',
    }))
    .filter((edit) => Number.isInteger(edit.targetCol) && edit.targetCol >= 0);
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

  const paragraphRecords = classifyParagraphs(
    backbone.split('\f').map((page) => page.split('\n')),
    witnessParagraphStarts(witnessBody),
    nextId,
    decisions?.manualBreaks ?? []
  );
  reviewRecords.push(...paragraphRecords);
  const paragraphEditList = paragraphEdits(paragraphRecords, decisions);

  const wrapOutcome = classifyWrapJoins(
    backbone.split('\f').map((page) => page.split('\n')),
    witnessBody,
    nextId
  );
  reviewRecords.push(...wrapOutcome.records.filter((record) => record.tier === 2));

  const applied = applyPendingEdits(backbone, edits, nextId);
  const wrapApplied = applyWrapJoins(applied.text, wrapOutcome.joins, nextId);
  const paragraphApplied = applyParagraphEdits(wrapApplied.text, paragraphEditList, nextId);
  const review = buildReviewModel(config.id, reviewRecords.filter((record) => record.tier === 2), backbone);
  const appliedIds = new Set([...applied.changes, ...wrapApplied.changes, ...paragraphApplied.changes].map((record) => record.id));
  const changes = [
    ...applied.changes,
    ...wrapApplied.changes,
    ...paragraphApplied.changes,
    ...coverageRecords,
    ...reviewRecords.filter((record) => record.tier === 2 && !appliedIds.has(record.id)),
  ];
  return {
    text: paragraphApplied.text,
    changes,
    review,
    pairing: pairing.report,
    dropped: classifyDroppedLines(options.droppedLines ?? [], witness),
    counters,
  };
}
