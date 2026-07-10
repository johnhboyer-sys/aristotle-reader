import type { CorpusConfig } from './corpus-config';
import type { AlignOp, TokenProvenance } from './align';
import { matchKey } from './align';
import type { ChangeRecord } from './changelist';
import { classifyTicToken, ticSpanOnLine } from '../pdf-import/line-shape';

export interface ProjectionEdit { record: ChangeRecord; after: string; prov: TokenProvenance }
export interface WitnessProjection { edits: ProjectionEdit[]; records: ChangeRecord[] }
interface Options { nextId?: (page: number, line?: number, col?: number) => string; corrections?: { before: string; after: string }[]; occupied?: ChangeRecord[] }

const GREEK_RE = /[\u0370-\u03ff\u1f00-\u1fff]/u;
// The Genie witness writes superscripts four ways: <sup>7</sup>, $^{17}$,
// braceless $^7$, and literal Unicode superscript digits (knowledge³³) —
// accept all (a missed form leaves the garbled glyph in the text).
const SUP_RE = /^(.*?)(?:<sup>\s*(\d+)\s*<\/sup>|\$\^\{?(\d+)\}?\$|([⁰¹²³⁴⁵⁶⁷⁸⁹]+))$/iu;
const SUP_DIGITS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
function supToAscii(run: string): string {
  return [...run].map((ch) => SUP_DIGITS[ch] ?? ch).join('');
}
// True garble glyphs a mangled superscript leaves on a word's tail. The
// witness itself arbitrates real punctuation here: `base` is the witness word
// MINUS the marker, so a printed "taken?" would surface as base "taken?" and
// the tail test never sees the "?". Comma alone is deliberately ABSENT
// (review finding #3): print order marker-vs-comma is genuinely ambiguous and
// a silently eaten comma changes syntax — those sites glue after the comma
// instead ("virtue,7").
const GARBLED_TAIL_RE = /[>!*°®'’"”‘?]{1,2}$/u;

export function stripWitnessMarkup(raw: string): string {
  let value = raw.replace(/[*_]+/gu, '');
  value = value.replace(/<sup>\s*(\d+)\s*<\/sup>/giu, '$1').replace(/\$\^\{?(\d+)\}?\$/gu, '$1');
  value = value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/gu, (run) => supToAscii(run));
  if (/^\$.*\$$/u.test(value)) value = value.slice(1, -1);
  return value;
}

function folded(raw: string): string { return matchKey(stripWitnessMarkup(raw)); }
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}
function lineText(text: string, prov: TokenProvenance): string { return text.split('\f')[prov.page]?.split('\n')[prov.line] ?? ''; }
function contiguousRun(text: string, ops: Extract<AlignOp, { t: 'aOnly' }>[]): { before: string; prov: TokenProvenance } | null {
  const first = ops[0]?.aProv; const last = ops.at(-1)?.aProv;
  if (!first || !last || first.page !== last.page || first.line !== last.line) return null;
  const before = lineText(text, first).slice(first.col, last.col + ops.at(-1)!.aRaw.length);
  return before.trim().split(/\s+/u).length === ops.length ? { before, prov: first } : null;
}
function overlaps(record: ChangeRecord, rows: ChangeRecord[]): boolean {
  if (record.line === undefined || record.col === undefined) return false;
  const end = record.col + (record.before?.length ?? 1);
  return rows.some((row) => row.page === record.page && row.line === record.line && row.col !== undefined && row.col < end && row.col + (row.before?.length ?? 1) > record.col!);
}
function correctionOverlap(text: string, record: ChangeRecord, corrections: { before: string; after: string }[]): boolean {
  if (record.line === undefined || record.col === undefined) return false;
  const line = text.split('\f')[record.page]?.split('\n')[record.line] ?? ''; const end = record.col + (record.before?.length ?? 1);
  return corrections.some(({ before }) => { const at = line.indexOf(before); return at >= 0 && at < end && at + before.length > record.col!; });
}
function touchesGutter(text: string, record: ChangeRecord): boolean {
  if (record.line === undefined || record.col === undefined) return true;
  const line = text.split('\f')[record.page]?.split('\n')[record.line] ?? '';
  const end = record.col + (record.before?.length ?? 1);
  return (['verso', 'recto'] as const).some((side) => {
    const span = ticSpanOnLine(line, side);
    return span !== null && record.col! < span[1] && end > span[0];
  });
}

export function projectWitnessStructure(text: string, ops: AlignOp[], config: CorpusConfig, options: Options = {}): WitnessProjection {
  if (!config.witnessStructure) return { edits: [], records: [] };
  let serial = 0;
  const nextId = options.nextId ?? ((p: number, l?: number, c?: number) => `p${p}${l === undefined ? '' : `-L${l}`}${c === undefined ? '' : `-c${c}`}-wp${++serial}`);
  const records: ChangeRecord[] = []; const edits: ProjectionEdit[] = []; const occupied = [...(options.occupied ?? [])];
  // Each page's first non-blank line is what the frozen converter strips as
  // the page head — an edit there is invisible at best and trips the stage-5
  // running-head invariant. Route those to review instead.
  const pageHeadLines = text.split('\f').map((page) => {
    const lines = page.split('\n');
    const i = lines.findIndex((line) => line.replace(/\r$/u, '').trim() !== '');
    return i === -1 ? undefined : i;
  });
  const propose = (record: ChangeRecord, after: string, prov: TokenProvenance) => {
    const reason = prov.line === pageHeadLines[prov.page]
      ? 'page-head-line'
      : touchesGutter(text, record) ? 'gutter-overlap' : overlaps(record, occupied) || correctionOverlap(text, record, options.corrections ?? []) ? 'existing-edit-overlap' : null;
    if (reason) {
      records.push({ ...record, rule: 'flag', after: undefined, evidence: { ...record.evidence, kind: 'witness-projection-review', reason, proposed: after } }); return;
    }
    records.push(record); edits.push({ record, after, prov }); occupied.push(record);
  };

  const glueSup = (aRaw: string, aProv: TokenProvenance, bRaw: string): boolean => {
    const sup = SUP_RE.exec(bRaw);
    if (!sup) return false;
    const base = stripWitnessMarkup(sup[1]);
    let clean: string;
    if (aRaw.startsWith(base)) {
      // Strip a short debris tail; KEEP legit extra punctuation the witness
      // lacks (marker-before-comma print order) — the digit glues after it.
      const tail = aRaw.slice(base.length);
      clean = tail.length > 0 && tail.length <= 2 && GARBLED_TAIL_RE.test(tail) ? base : aRaw.replace(/[*_]/gu, '');
    } else {
      // The backbone token differs beyond a tail (quote-style mismatch,
      // debris the tail rule can't reach) — adopt the witness base outright:
      // same letters (matchKey-guarded below), cleaner OCR. Gluing onto the
      // raw token composed garbage like "false**" + 27 -> "false**27".
      clean = base;
    }
    if (matchKey(base) !== matchKey(clean)) return false;
    const digits = sup[2] ?? sup[3] ?? supToAscii(sup[4]);
    const after = `${clean}${digits}`;
    if (after === aRaw) return false;
    const record: ChangeRecord = { id: nextId(aProv.page, aProv.line, aProv.col), stage: 5, tier: 2, rule: 'word-identity', page: aProv.page, line: aProv.line, col: aProv.col, before: aRaw, after, evidence: { kind: 'witness-sup-marker', witnessRaw: bRaw } };
    propose(record, after, aProv);
    return true;
  };

  const consumed = new Set<number>();
  for (let i = 0; i + 1 < ops.length; i += 1) {
    const pair = [ops[i], ops[i + 1]];
    const a = pair.find((op): op is Extract<AlignOp, { t: 'aOnly' }> => op.t === 'aOnly');
    const b = pair.find((op): op is Extract<AlignOp, { t: 'bOnly' }> => op.t === 'bOnly');
    if (!a?.aProv || !b) continue;
    if (glueSup(a.aRaw, a.aProv, b.bRaw)) { consumed.add(i); consumed.add(i + 1); }
  }

  // Most marker-bearing witness tokens MATCH their backbone word (matchKey
  // folds markup and garble tails away — "dyads.*°" ↔ "dyads.<sup>10</sup>"),
  // so the aOnly/bOnly pairing above never sees them. Glue on match ops too;
  // this is where the bulk of the printed superscripts live.
  for (const op of ops) {
    if (op.t !== 'match' || !op.aProv) continue;
    if (!/<sup|\$\^|[⁰¹²³⁴⁵⁶⁷⁸⁹]/iu.test(op.bRaw)) continue;
    glueSup(op.aRaw, op.aProv, op.bRaw);
  }

  // Matched pairs that differ ONLY in quotation glyphs — the scan mangles
  // close-quotes ("such-and-such]'" for the printed ]") — adopt the witness
  // form, the cleaner OCR. Everything except the quote characters must be
  // byte-identical, so no word or punctuation content can change.
  const QUOTE_CLASS = /['’‘"“”]/u;
  const QUOTE_ALL = /['’‘"“”]/gu;
  for (const op of ops) {
    if (op.t !== 'match' || !op.aProv) continue;
    const bClean = stripWitnessMarkup(op.bRaw);
    if (op.aRaw === bClean || !QUOTE_CLASS.test(op.aRaw) && !QUOTE_CLASS.test(bClean)) continue;
    if (op.aRaw.replace(QUOTE_ALL, '') !== bClean.replace(QUOTE_ALL, '')) continue;
    const record: ChangeRecord = { id: nextId(op.aProv.page, op.aProv.line, op.aProv.col), stage: 5, tier: 2, rule: 'word-identity', page: op.aProv.page, line: op.aProv.line, col: op.aProv.col, before: op.aRaw, after: bClean, evidence: { kind: 'witness-quote-glyph', witnessRaw: op.bRaw } };
    propose(record, bClean, op.aProv);
  }

  for (let i = 0; i < ops.length;) {
    if (ops[i].t === 'match') { i += 1; continue; }
    const gapStart = i;
    const aOps: Extract<AlignOp, { t: 'aOnly' }>[] = []; const bOps: Extract<AlignOp, { t: 'bOnly' }>[] = [];
    while (i < ops.length && ops[i].t !== 'match') { if (!consumed.has(i)) { const op = ops[i]; if (op.t === 'aOnly') aOps.push(op); else bOps.push(op as Extract<AlignOp, { t: 'bOnly' }>); } i += 1; }
    if (gapStart === 0 || ops[gapStart - 1].t !== 'match' || i >= ops.length || ops[i].t !== 'match' || !aOps.length || !bOps.length) continue;
    const run = contiguousRun(text, aOps); if (!run) continue;
    const witnessRaw = bOps.map((op) => op.bRaw).join(' '); const after = bOps.map((op) => stripWitnessMarkup(op.bRaw)).join(' ');
    const foldedBefore = folded(run.before); const foldedWitness = folded(witnessRaw); const score = similarity(foldedBefore, foldedWitness);
    // Digit/punctuation-only runs fold to '' on BOTH sides and score a perfect
    // 1.0 — which would silently rewrite enumeration markers and numbers,
    // "(3)" -> "(5)" (review finding #1). No letters, no arbitration.
    const refused = aOps.length > 4 || bOps.length > 4 ? 'run-too-long' : GREEK_RE.test(run.before) || GREEK_RE.test(after) ? 'greek' : aOps.some((op) => classifyTicToken(op.aRaw.trim())) ? 'bekker-tic' : !foldedBefore || !foldedWitness ? 'no-letter-content' : score < 0.5 ? 'low-similarity' : null;
    const record: ChangeRecord = { id: nextId(run.prov.page, run.prov.line, run.prov.col), stage: 5, tier: 2, rule: refused ? 'flag' : 'word-identity', page: run.prov.page, line: run.prov.line, col: run.prov.col, before: run.before, after: refused ? undefined : after, evidence: { kind: refused ? 'witness-projection-review' : 'witness-projection', witnessRaw, similarity: score, reason: refused, joinedTokens: aOps.length - bOps.length } };
    if (refused) records.push(record); else propose(record, after, run.prov);
  }

  for (let i = 0; i < ops.length; i += 1) {
    const first = ops[i]; if (first.t !== 'match' || !first.aProv || !/^\*(?!\*)/u.test(first.bRaw)) continue;
    const span: Extract<AlignOp, { t: 'match' }>[] = []; let closed = false;
    for (let j = i; j < ops.length && ops[j].t === 'match'; j += 1) { const op = ops[j] as Extract<AlignOp, { t: 'match' }>; span.push(op); if (/\*(?!\*)[.,;:!?)]*$/u.test(op.bRaw)) { i = j; closed = true; break; } }
    if (!closed) continue;
    const provs = span.map((op) => op.aProv).filter((p): p is TokenProvenance => Boolean(p));
    if (provs.length !== span.length || provs.some((p) => p.page !== provs[0].page || p.line !== provs[0].line)) continue;
    const before = lineText(text, provs[0]).slice(provs[0].col, provs.at(-1)!.col + span.at(-1)!.aRaw.length); const witnessRaw = span.map((op) => op.bRaw).join(' ');
    // Skip running-head furniture italics (the work title). Only for
    // multi-word titles: a single-word title (Physics, Politics) folds equal
    // to a load-bearing body italic of the same word (review finding #4) —
    // and single-word furniture sits on page-head lines the propose() guard
    // already refuses.
    if (config.workTitle.trim().split(/\s+/u).length > 1 && matchKey(stripWitnessMarkup(witnessRaw)) === matchKey(config.workTitle)) continue;
    // A stray asterisk inside the wrapped range would corrupt the span —
    // strip it here (the standalone stray-deletion below is refused on
    // overlap with this wrap).
    const long = span.length > 6; const after = `*${before.replace(/\*/gu, '')}*`;
    const record: ChangeRecord = { id: nextId(provs[0].page, provs[0].line, provs[0].col), stage: 5, tier: 2, rule: long ? 'flag' : 'emphasis', page: provs[0].page, line: provs[0].line, col: provs[0].col, before, after: long ? undefined : after, evidence: { kind: long ? 'witness-projection-review' : 'witness-italics', witnessRaw, reason: long ? 'span-too-long' : undefined } };
    if (long) records.push(record); else propose(record, after, provs[0]);
  }

  // A literal '*' in a pdftotext backbone is always OCR debris — print
  // italics don't survive extraction as asterisks; these are mangled
  // superscripts the witness couldn't confirm. Any stray left in the text
  // pairs with a projected span's markers and shreds the importer's emphasis
  // scan (183 unclassifiable markers on the first Apostle re-import). The
  // projection's own spans exist only as pending edits at this point, so
  // every '*' visible in the source is stray by construction; ones inside a
  // range an earlier edit owns are refused by the overlap guard (the owner
  // already handles them).
  const pages = text.split('\f');
  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page].split('\n');
    for (let line = 0; line < lines.length; line += 1) {
      for (const glyph of ['*', '_'] as const) {
        for (let col = lines[line].indexOf(glyph); col !== -1; col = lines[line].indexOf(glyph, col + 1)) {
          const prov = { page, line, col };
          const record: ChangeRecord = { id: nextId(page, line, col), stage: 5, tier: 2, rule: 'word-identity', page, line, col, before: glyph, after: '', evidence: { kind: 'stray-asterisk' } };
          propose(record, '', prov);
        }
      }
    }
  }
  return { edits, records };
}
