import type { CorpusConfig } from './corpus-config';
import { makeChangeId } from './changelist';
import type { ChangeRecord } from './changelist';
import type { ReviewDecisions } from './review';
import type { WitnessAnchor } from './witness-anchors';
import { classifyTicToken, isDisplayShapedLine, parseHeadingResidual } from '../pdf-import/line-shape';

export interface GutterOutcome {
  text: string;
  changes: ChangeRecord[];
}

type Side = 'recto' | 'verso';
type BekkerCol = 'a' | 'b';

interface BekkerValue {
  kind: 'full';
  page: number;
  col: BekkerCol;
  line?: number;
}

interface BareValue {
  kind: 'bare';
  n: number;
}

type CandidateValue = BekkerValue | BareValue;

interface RunningState {
  page: number;
  col: BekkerCol;
  line: number;
}

interface Candidate {
  side: Side;
  lineIdx: number;
  raw: string;
  startCol: number;
  endCol: number;
  values: CandidateValue[];
  clean: CandidateValue | null;
  display: boolean;
  residualStart: number;
}

interface AcceptedCandidate {
  candidate: Candidate;
  value: CandidateValue;
  canonical: string;
  repaired: boolean;
  confusions: string[];
  stateBefore: RunningState;
  stateAfter: RunningState;
  flags: string[];
}

interface PageScan {
  recto: AcceptedCandidate[];
  verso: AcceptedCandidate[];
  rectoRaw: Candidate[];
  versoRaw: Candidate[];
  flags: ChangeRecord[];
  excluded: Set<number>;
  bodyText: boolean;
}

const D = '[0-9IlrOoSsZz|]';
const C = '[abAB36h]';
const RELAXED_TOKEN_RE = new RegExp(`(?:${D}{1,4} ${C}${D}{0,2}|[0-9IlrOoSsZz|abAB36h]{1,6})`, 'u');
const EDGE_TOKEN_RE = new RegExp(`^(?:${D}{1,4} ${C}${D}{0,2}|[0-9IlrOoSsZz|abAB36h]{1,6})$`, 'u');
const DIGITISH_RE = /^[0-9IlrOoSsZz|]+$/u;
const HAS_ARABIC_DIGIT_RE = /[0-9]/u;
const DASH_RANGE_RE = /\d\s*[–—-]\s*\d/u;
const FOOTNOTE_LINE_RE = /^\s*(\d+\.\s|[*†])/u;
const LONE_INTEGER_RE = /^\s*\d+\s*\r?$/u;

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function restoreCr(line: string, cr: boolean): string {
  return cr ? `${line}\r` : line;
}

function firstNonBlankLine(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i += 1) {
    if (stripCr(lines[i]).trim() !== '') return i;
  }
  return null;
}

function findBottomFurnitureStart(lines: string[]): number | null {
  let lastNonBlank = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (stripCr(lines[i]).trim() !== '') lastNonBlank = i;
  }
  if (lastNonBlank === -1) return null;

  let i = lastNonBlank;
  let boundary: number | null = null;
  if (LONE_INTEGER_RE.test(stripCr(lines[i]))) {
    boundary = i;
    i -= 1;
    while (i >= 0 && stripCr(lines[i]).trim() === '') i -= 1;
  }

  let topmostNote: number | null = null;
  while (i >= 0) {
    const line = stripCr(lines[i]);
    if (line.trim() === '') {
      let k = i;
      while (k >= 0 && stripCr(lines[k]).trim() === '') k -= 1;
      if (k < 0 || !isDisplayShapedLine(stripLikelyTicEnds(stripCr(lines[k])).trim())) break;
      i = k;
      continue;
    }
    if (FOOTNOTE_LINE_RE.test(line)) topmostNote = i;
    i -= 1;
  }
  if (topmostNote !== null) boundary = topmostNote;
  return boundary;
}

function stripLikelyTicEnds(line: string): string {
  let s = line.replace(/^\s*\d{1,4}[ab]?\d{0,2}\s{2,}/u, '');
  s = s.replace(/\s{2,}\d{1,4}[ab]?\d{0,2}\s*$/u, '');
  return s;
}

function changeFactory(): (
  page: number,
  line: number | undefined,
  col: number | undefined
) => string {
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
    stage: 3,
    tier: 2,
    rule: 'flag',
    page,
    line,
    col,
    evidence: { kind, ...evidence },
  };
}

function orderOf(page: number, col: BekkerCol): number {
  return page * 2 + (col === 'a' ? 0 : 1);
}

function compareRef(a: { page: number; col: BekkerCol }, b: { page: number; col: BekkerCol }): number {
  return orderOf(a.page, a.col) - orderOf(b.page, b.col);
}

function inRange(value: BekkerValue, config: CorpusConfig): boolean {
  return compareRef(value, config.bekkerStart) >= 0 && compareRef(value, config.bekkerEnd) <= 0;
}

function nextColumn(state: RunningState): { page: number; col: BekkerCol } {
  return state.col === 'a' ? { page: state.page, col: 'b' } : { page: state.page + 1, col: 'a' };
}

function canonical(value: CandidateValue): string {
  if (value.kind === 'bare') return String(value.n);
  return `${value.page}${value.col}${value.line ?? ''}`;
}

function normalizeDigit(ch: string, confusions: string[]): string | null {
  const map: Record<string, string> = { I: '1', l: '1', '|': '1', r: '1', O: '0', o: '0', S: '5', s: '5', Z: '2', z: '2' };
  if (/^\d$/u.test(ch)) return ch;
  const mapped = map[ch];
  if (!mapped) return null;
  const label = `${ch}->${mapped}`;
  if (!confusions.includes(label)) confusions.push(label);
  return mapped;
}

function normalizeDigits(raw: string, confusions: string[]): number | null {
  let out = '';
  for (const ch of raw) {
    const digit = normalizeDigit(ch, confusions);
    if (digit === null) return null;
    out += digit;
  }
  return out === '' ? null : Number(out);
}

export function decodeBareLetters(raw: string): { value: number; confusions: string[] } | null {
  const confusions: string[] = [];
  const n = normalizeDigits(raw, confusions);
  return n !== null && n >= 1 && n <= 99 ? { value: n, confusions } : null;
}

function normalizeCol(raw: string, confusions: string[]): BekkerCol | null {
  if (raw === 'a' || raw === 'A') return 'a';
  if (raw === 'b' || raw === 'B') return 'b';
  if (raw === '3' || raw === 'h') {
    confusions.push(`${raw}->a`);
    return 'a';
  }
  if (raw === '6') {
    confusions.push('6->b');
    return 'b';
  }
  return null;
}

function dedupeValues(values: CandidateValue[]): CandidateValue[] {
  const seen = new Set<string>();
  const out: CandidateValue[] = [];
  for (const value of values) {
    const key = value.kind === 'bare' ? `bare:${value.n}` : `full:${value.page}:${value.col}:${value.line ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

function cleanValue(raw: string): CandidateValue | null {
  const cls = classifyTicToken(raw);
  if (!cls) return null;
  if (cls.kind === 'bare') return { kind: 'bare', n: cls.bareValue! };
  return { kind: 'full', page: cls.fullPage!, col: cls.fullCol!, line: cls.fullLine };
}

function decodeValues(raw: string): { values: CandidateValue[]; confusions: Map<string, string[]> } {
  const values: CandidateValue[] = [];
  const confusionMap = new Map<string, string[]>();
  const add = (value: CandidateValue, confusions: string[]) => {
    values.push(value);
    confusionMap.set(value.kind === 'bare' ? `bare:${value.n}` : `full:${value.page}:${value.col}:${value.line ?? ''}`, confusions);
  };

  const compact = raw.replace(/ /gu, '');
  if (!HAS_ARABIC_DIGIT_RE.test(compact)) return { values: [], confusions: confusionMap };

  const full = new RegExp(`^(${D}{1,4}) ?(${C})(${D}{0,2})$`, 'u').exec(raw);
  if (full) {
    const confusions: string[] = raw.includes(' ') ? ['spaced'] : [];
    const page = normalizeDigits(full[1], confusions);
    const col = normalizeCol(full[2], confusions);
    const line = full[3] === '' ? undefined : normalizeDigits(full[3], confusions);
    if (page !== null && col !== null && line !== null) add({ kind: 'full', page, col, line }, confusions);
  }

  if (DIGITISH_RE.test(compact)) {
    const bareConfusions: string[] = [];
    const n = normalizeDigits(compact, bareConfusions);
    if (n !== null && compact.length <= 2 && n >= 1 && n <= 99) add({ kind: 'bare', n }, bareConfusions);

    for (let colPos = 1; colPos < compact.length; colPos += 1) {
      const confusions = ['glued'];
      const page = normalizeDigits(compact.slice(0, colPos), confusions);
      const col = normalizeCol(compact[colPos], confusions);
      const lineRaw = compact.slice(colPos + 1);
      const line = lineRaw === '' ? undefined : normalizeDigits(lineRaw, confusions);
      if (page !== null && col !== null && line !== null) add({ kind: 'full', page, col, line }, confusions);
    }
  }

  return { values: dedupeValues(values), confusions: confusionMap };
}

function isPlausibleBare(value: number, state: RunningState): boolean {
  if (value < 1 || value > 99 || value <= state.line) return false;
  if (value % 5 === 0) return true;
  return state.line <= 1 && (value === 4 || value === 5);
}

function isAcceptable(value: CandidateValue, state: RunningState, config: CorpusConfig): boolean {
  if (value.kind === 'bare') return isPlausibleBare(value.n, state);
  return inRange(value, config) && orderOf(value.page, value.col) >= orderOf(state.page, state.col);
}

function applyValue(value: CandidateValue, state: RunningState): RunningState {
  if (value.kind === 'bare') return { ...state, line: value.n };
  return { page: value.page, col: value.col, line: value.line ?? 1 };
}

function expectedKey(state: RunningState): Set<string> {
  const next = nextColumn(state);
  const expected = new Set<string>([`full:${next.page}:${next.col}:`, `full:${next.page}:${next.col}:1`]);
  if (state.line === 0) {
    expected.add(`full:${state.page}:${state.col}:`);
    expected.add(`full:${state.page}:${state.col}:1`);
  }
  const bare = state.line <= 1 ? 5 : state.line + 5;
  if (bare <= 99) expected.add(`bare:${bare}`);
  if (state.line <= 1) expected.add('bare:4');
  return expected;
}

function valueKey(value: CandidateValue): string {
  return value.kind === 'bare' ? `bare:${value.n}` : `full:${value.page}:${value.col}:${value.line ?? ''}`;
}

function nearestWitness(value: CandidateValue, witnessPages?: WitnessAnchor[][]): WitnessAnchor | undefined {
  if (!witnessPages || value.kind !== 'full') return undefined;
  const anchors = witnessPages.flat();
  let best: WitnessAnchor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const distance = Math.abs(orderOf(anchor.page, anchor.col) - orderOf(value.page, value.col));
    if (distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}

function validateRun(
  candidates: Candidate[],
  incoming: RunningState,
  config: CorpusConfig,
  page: number,
  nextId: ReturnType<typeof changeFactory>,
  decisions?: ReviewDecisions
): { accepted: AcceptedCandidate[]; flags: ChangeRecord[]; endState: RunningState } {
  const accepted: AcceptedCandidate[] = [];
  const flags: ChangeRecord[] = [];
  let state = { ...incoming };

  for (const candidate of candidates) {
    if (candidate.display) {
      flags.push(flagRecord(nextId, page, 'tic-candidate-on-display-line', { raw: candidate.raw }, candidate.lineIdx, candidate.startCol));
      continue;
    }

    let acceptable = candidate.values.filter((value) => isAcceptable(value, state, config));
    // Unmarked column roll: a clean low bare (5/10/15) rejected only because
    // the previous column's line count is already high is the print opening
    // a new column without a full-form (the converter models this too). A
    // wrong roll can only surface later as a column-jump against a
    // range-gated full-form, never as silent corruption.
    let rolled: RunningState | null = null;
    if (
      acceptable.length === 0 &&
      candidate.clean?.kind === 'bare' &&
      candidate.clean.n % 5 === 0 &&
      candidate.clean.n <= 15 &&
      state.line >= 20
    ) {
      const next = nextColumn(state);
      const trial: RunningState = { page: next.page, col: next.col, line: 0 };
      if (inRange({ kind: 'full', page: trial.page, col: trial.col }, config) && isPlausibleBare(candidate.clean.n, trial)) {
        rolled = trial;
        acceptable = [candidate.clean];
      }
    }
    if (candidate.clean && acceptable.length === 0) {
      flags.push(flagRecord(nextId, page, 'clean-off-cadence', { raw: candidate.raw, cadenceState: state }, candidate.lineIdx, candidate.startCol));
      continue;
    }
    if (acceptable.length === 0) continue;

    let value: CandidateValue | null = null;
    let repaired = false;
    if (candidate.clean) {
      value = acceptable.find((v) => valueKey(v) === valueKey(candidate.clean!)) ?? null;
    } else {
      // Garbled tokens repair ONLY when the cadence expectation makes the
      // decode unique. A garble whose lone in-range decode is NOT the
      // expected value stays unrepaired (Tier-2 ambiguous record) — rewriting
      // it here would be an unlogged token change past the uniqueness gate.
      const expected = expectedKey(state);
      const expectedMatches = acceptable.filter((v) => expected.has(valueKey(v)));
      if (expectedMatches.length === 1) {
        value = expectedMatches[0];
        repaired = true;
      }
    }
    if (!value) {
      if (!candidate.clean) {
        const approved = acceptable.find((v) => decisions?.checkedPatterns.has(`bekker-opener|${candidate.raw}|${canonical(v)}`));
        if (approved) {
          value = approved;
          repaired = true;
        }
      }
    }

    if (!value) {
      // State resync past a garbled opener the uniqueness gate refused to
      // rewrite: when its lone in-range monotone decode is a full-form,
      // advance the cadence STATE only. The token stays raw (Tier-2 logged);
      // downstream bares and repairs read the corrected column. A state
      // advance is bookkeeping, not a text edit.
      const fulls = acceptable.filter((v): v is BekkerValue => v.kind === 'full');
      if (!candidate.clean && fulls.length === 1) state = applyValue(fulls[0], state);
      continue;
    }

    const after = applyValue(value, rolled ?? state);
    const canon = canonical(value);
    if (!classifyTicToken(canon)) continue;
    const flagsForCandidate: string[] = [];
    if (rolled) flagsForCandidate.push(`unmarked-roll:${rolled.page}${rolled.col}`);
    if (value.kind === 'full') {
      const expected = nextColumn(state);
      const jump = orderOf(value.page, value.col) - orderOf(expected.page, expected.col);
      if (jump > 0) flagsForCandidate.push(`column-jump:${expected.page}${expected.col}->${value.page}${value.col}`);
    }
    const confusions = decodeValues(candidate.raw).confusions.get(valueKey(value)) ?? [];
    accepted.push({ candidate, value, canonical: canon, repaired, confusions, stateBefore: state, stateAfter: after, flags: flagsForCandidate });
    state = after;
  }
  return { accepted, flags, endState: state };
}

function candidateResidual(line: string, candidate: { startCol: number; endCol: number; side: Side }): { residual: string; residualStart: number } {
  if (candidate.side === 'verso') {
    let i = candidate.endCol;
    while (line[i] === ' ') i += 1;
    return { residual: line.slice(i), residualStart: i };
  }
  return { residual: line.slice(0, candidate.startCol).trimEnd(), residualStart: 0 };
}

function trailingEdgeToken(line: string): { raw: string; startCol: number; endCol: number } | null {
  const tokens = [...line.matchAll(/\S+/gu)].map((match) => ({
    raw: match[0],
    startCol: match.index,
    endCol: match.index + match[0].length,
  }));
  if (tokens.length === 0) return null;
  const last = tokens[tokens.length - 1];
  const previous = tokens[tokens.length - 2];
  if (previous && previous.endCol + 1 === last.startCol) {
    const spaced = `${previous.raw} ${last.raw}`;
    if (EDGE_TOKEN_RE.test(spaced) && decodeValues(spaced).values.some((value) => value.kind === 'full')) {
      return { raw: spaced, startCol: previous.startCol, endCol: last.endCol };
    }
  }
  return EDGE_TOKEN_RE.test(last.raw) ? last : null;
}

/**
 * A tic candidate is refused only for genuinely tabular residuals — near-empty
 * of letters, or carrying two separate wide runs (a multi-cell row). A single
 * internal ≥4-space run is ordinary justified-OCR prose (14.6% of Lennox
 * lines) and must not disqualify a gutter-edge tic.
 */
function isTabularResidual(residual: string): boolean {
  const alpha = residual.match(/[A-Za-z]/gu)?.length ?? 0;
  if (alpha < 3) return residual.trim() !== '' && isDisplayShapedLine(residual);
  const wideRuns = residual.trim().match(/ {4,}/gu)?.length ?? 0;
  return wideRuns >= 2;
}

function leadingEdgeToken(line: string): { raw: string; startCol: number; endCol: number } | null {
  const tokens = [...line.matchAll(/\S+/gu)].map((match) => ({
    raw: match[0],
    startCol: match.index,
    endCol: match.index + match[0].length,
  }));
  if (tokens.length === 0) return null;
  const first = tokens[0];
  const second = tokens[1];
  // Spaced verso garble ('639 6' = 639b). The second token must carry a real
  // digit or be a lone column glyph — otherwise '5 all the…' would decode as
  // a full-form via the l->1 confusion.
  if (
    second &&
    first.endCol + 1 === second.startCol &&
    (HAS_ARABIC_DIGIT_RE.test(second.raw) || /^[ab36h]$/u.test(second.raw))
  ) {
    const spaced = `${first.raw} ${second.raw}`;
    if (EDGE_TOKEN_RE.test(spaced) && decodeValues(spaced).values.some((value) => value.kind === 'full')) {
      return { raw: spaced, startCol: first.startCol, endCol: second.endCol };
    }
  }
  return EDGE_TOKEN_RE.test(first.raw) ? first : null;
}

function extractCandidates(lines: string[], excluded: Set<number>, page: number, nextId: ReturnType<typeof changeFactory>): { recto: Candidate[]; verso: Candidate[]; flags: ChangeRecord[] } {
  const recto: Candidate[] = [];
  const verso: Candidate[] = [];
  const flags: ChangeRecord[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (excluded.has(i)) continue;
    const line = stripCr(lines[i]);
    if (line.trim() === '') continue;
    if (DASH_RANGE_RE.test(line)) continue;
    // A line that IS a division heading ('CHAPTER 4') must never donate its
    // numeral to the gutter — re-padding it would make the converter's own
    // scanner claim the numeral as a tic and the heading would lose its
    // number. Genuine tic-bearing headings ('Book 8   1155a1') have a wide
    // gap, fail the heading grammar as a whole line, and pass through.
    if (parseHeadingResidual(line.trim())) continue;

    const leading = leadingEdgeToken(line);
    const trailing = trailingEdgeToken(line);
    const found: Candidate[] = [];

    if (leading && leading.startCol <= 3 && line.slice(leading.endCol).trim() !== '') {
      const { values } = decodeValues(leading.raw);
      const residual = candidateResidual(line, { startCol: leading.startCol, endCol: leading.endCol, side: 'verso' });
      if (values.length > 0) {
        found.push({
          side: 'verso',
          lineIdx: i,
          raw: leading.raw,
          startCol: leading.startCol,
          endCol: leading.endCol,
          values,
          clean: cleanValue(leading.raw),
          display: isTabularResidual(residual.residual),
          residualStart: residual.residualStart,
        });
      }
    } else if (leading === null && found.length === 0) {
      // Glued verso opener: OCR fused the marginal full-form to the first
      // body word ('683athe'). Decode the numeric part only; the residual
      // starts INSIDE the token, so the standard verso re-layout re-emits
      // it as tic + margin-padded word — the split falls out of the
      // existing machinery. Uniqueness-gated like any garble (clean:null).
      const first = /^(\s*)(\S+)/u.exec(line);
      const glued = first ? /^(\d{1,4}[ab])(\p{L}{2,}.*)$/u.exec(first[2]) : null;
      // Indent gate is looser than the plain-tic ≤3: a glued opener can sit
      // at the body margin itself (OCR pulled the tic into the column). The
      // cadence-uniqueness gate is what prevents false splits.
      if (glued && first![1].length <= 6) {
        const startCol = first![1].length;
        const { values } = decodeValues(glued[1]);
        const residualStart = startCol + glued[1].length;
        if (values.length > 0) {
          found.push({
            side: 'verso',
            lineIdx: i,
            raw: first![2],
            startCol,
            endCol: startCol + glued[1].length,
            values,
            clean: null,
            display: isTabularResidual(line.slice(residualStart).trim()),
            residualStart,
          });
        }
      }
    }

    if (trailing) {
      const raw = trailing.raw;
      const startCol = trailing.startCol;
      const before = line.slice(0, startCol);
      const gap = before.length - before.trimEnd().length;
      if (startCol >= 30 && gap >= 1 && before.trim() !== '' && EDGE_TOKEN_RE.test(raw)) {
        const { values } = decodeValues(raw);
        const residual = candidateResidual(line, { startCol, endCol: trailing.endCol, side: 'recto' });
        if (values.length > 0) {
          found.push({
            side: 'recto',
            lineIdx: i,
            raw,
            startCol,
            endCol: trailing.endCol,
            values,
            clean: cleanValue(raw),
            display: isTabularResidual(residual.residual),
            residualStart: residual.residualStart,
          });
        }
      }
    }

    if (found.length > 1) {
      flags.push(flagRecord(nextId, page, 'two-candidates-line', { raw: found.map((c) => c.raw) }, i));
      continue;
    }
    for (const candidate of found) (candidate.side === 'recto' ? recto : verso).push(candidate);

    const midline = new RegExp(` {4,}(${D}{1,4}${C}?${D}{0,2}|${D}{1,2})(?=\\s|$)`, 'u').exec(line);
    if (midline && found.length === 0 && RELAXED_TOKEN_RE.test(midline[1])) {
      flags.push(flagRecord(nextId, page, 'midline-candidate', { raw: midline[1] }, i, midline.index));
    }
  }

  return { recto, verso, flags };
}

function pageExcluded(lines: string[]): Set<number> {
  const excluded = new Set<number>();
  const head = firstNonBlankLine(lines);
  if (head !== null) excluded.add(head);
  const bottom = findBottomFurnitureStart(lines);
  if (bottom !== null) {
    for (let i = bottom; i < lines.length; i += 1) excluded.add(i);
  }
  return excluded;
}

function scanPage(
  lines: string[],
  incoming: RunningState,
  config: CorpusConfig,
  page: number,
  nextId: ReturnType<typeof changeFactory>,
  decisions?: ReviewDecisions
): PageScan & { rectoState: RunningState; versoState: RunningState } {
  const excluded = pageExcluded(lines);
  const extracted = extractCandidates(lines, excluded, page, nextId);
  const recto = validateRun(extracted.recto, incoming, config, page, nextId, decisions);
  const verso = validateRun(extracted.verso, incoming, config, page, nextId, decisions);
  const bodyText = lines.some((line, i) => !excluded.has(i) && /[A-Za-z]/u.test(stripCr(line)));
  return {
    recto: recto.accepted,
    verso: verso.accepted,
    rectoRaw: extracted.recto,
    versoRaw: extracted.verso,
    rectoState: recto.endState,
    versoState: verso.endState,
    flags: [...extracted.flags, ...recto.flags, ...verso.flags],
    excluded,
    bodyText,
  };
}

function chooseSide(
  scan: PageScan,
  lastSide: Side | null,
  config: CorpusConfig
): { side: Side | null; accepted: AcceptedCandidate[]; conflict: boolean; inherited: boolean } {
  const R = scan.recto.length;
  const V = scan.verso.length;
  if (R >= 2 && V < 2) return { side: 'recto', accepted: scan.recto, conflict: false, inherited: false };
  if (V >= 2 && R < 2) return { side: 'verso', accepted: scan.verso, conflict: false, inherited: false };
  if (R >= 2 && V >= 2) {
    if (R > V) return { side: 'recto', accepted: scan.recto, conflict: false, inherited: false };
    if (V > R) return { side: 'verso', accepted: scan.verso, conflict: false, inherited: false };
    const rFull = scan.recto.some((a) => a.value.kind === 'full');
    const vFull = scan.verso.some((a) => a.value.kind === 'full');
    if (rFull !== vFull) return rFull ? { side: 'recto', accepted: scan.recto, conflict: false, inherited: false } : { side: 'verso', accepted: scan.verso, conflict: false, inherited: false };
    return { side: null, accepted: [], conflict: true, inherited: false };
  }

  const rectoFull = scan.recto.some((a) => a.value.kind === 'full');
  const versoFull = scan.verso.some((a) => a.value.kind === 'full');
  if (rectoFull && !versoFull) return { side: 'recto', accepted: scan.recto, conflict: false, inherited: false };
  if (versoFull && !rectoFull) return { side: 'verso', accepted: scan.verso, conflict: false, inherited: false };
  const hinted = config.side === 'recto' || config.side === 'verso' ? config.side : null;
  const side = lastSide ?? hinted ?? 'recto';
  return { side, accepted: side === 'recto' ? scan.recto : scan.verso, conflict: false, inherited: true };
}

function firstAlphaCol(line: string): number | null {
  const m = /[A-Za-z]/u.exec(line);
  return m ? m.index : null;
}

function versoModalMargin(lines: string[], accepted: AcceptedCandidate[], excluded: Set<number>): number {
  const byLine = new Map(accepted.map((a) => [a.candidate.lineIdx, a]));
  const alphaCols: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (excluded.has(i) || stripCr(lines[i]).trim() === '') continue;
    const acceptedLine = byLine.get(i);
    const line = stripCr(lines[i]);
    const col = acceptedLine ? firstAlphaCol(line.slice(acceptedLine.candidate.residualStart)) : firstAlphaCol(line);
    if (col !== null) alphaCols.push(col + (acceptedLine ? acceptedLine.candidate.residualStart : 0));
  }
  return mode(alphaCols) ?? 11;
}

function acceptedLineNumber(a: AcceptedCandidate): number {
  return a.value.kind === 'bare' ? a.value.n : a.value.line ?? 1;
}

function acceptedColumn(a: AcceptedCandidate): { page: number; col: BekkerCol } {
  return a.value.kind === 'bare'
    ? { page: a.stateBefore.page, col: a.stateBefore.col }
    : { page: a.value.page, col: a.value.col };
}

function sameColumn(a: { page: number; col: BekkerCol }, b: { page: number; col: BekkerCol }): boolean {
  return a.page === b.page && a.col === b.col;
}

function bodyResidual(line: string, side: Side, token: { startCol: number; endCol: number }): string {
  return candidateResidual(line, { startCol: token.startCol, endCol: token.endCol, side }).residual;
}

function recoverBracketedBares(
  lines: string[],
  side: Side,
  accepted: AcceptedCandidate[],
  excluded: Set<number>,
  incoming: RunningState,
  config: CorpusConfig,
  page: number,
  nextId: ReturnType<typeof changeFactory>,
  nextAcrossPages?: (column: { page: number; col: BekkerCol }, afterLine: number) => number | null
): { accepted: AcceptedCandidate[]; records: ChangeRecord[] } {
  const claimed = new Set(accepted.map((a) => `${a.candidate.lineIdx}:${a.candidate.startCol}`));
  const recovered: AcceptedCandidate[] = [];
  const records: ChangeRecord[] = [];
  const modalMargin = side === 'verso' ? versoModalMargin(lines, accepted, excluded) : 11;

  for (let i = 0; i < lines.length; i += 1) {
    if (excluded.has(i) || stripCr(lines[i]).trim() === '') continue;
    if (accepted.some((a) => a.candidate.lineIdx === i)) continue;
    const line = stripCr(lines[i]);
    if (DASH_RANGE_RE.test(line) || parseHeadingResidual(line.trim())) continue;

    const token = side === 'verso' ? leadingEdgeToken(line) : trailingEdgeToken(line);
    if (!token || token.raw.length > 2 || claimed.has(`${i}:${token.startCol}`)) continue;
    if (side === 'verso') {
      if (token.startCol > modalMargin - 2) continue;
    } else {
      const before = line.slice(0, token.startCol);
      const gap = before.length - before.trimEnd().length;
      if (token.startCol < 30 || gap < 1 || before.trim() === '') continue;
    }
    const decoded = decodeBareLetters(token.raw);
    if (!decoded) continue;
    const n = decoded.value;
    const residual = bodyResidual(line, side, token);
    if (isDisplayShapedLine(stripLikelyTicEnds(residual).trim())) continue;

    const column = (() => {
      const before = [...accepted, ...recovered]
        .filter((a) => a.candidate.lineIdx < i)
        .sort((a, b) => b.candidate.lineIdx - a.candidate.lineIdx)[0];
      return before ? acceptedColumn(before) : { page: incoming.page, col: incoming.col };
    })();
    if (!inRange({ kind: 'full', page: column.page, col: column.col }, config)) continue;

    const same = [...accepted, ...recovered]
      .filter((a) => sameColumn(acceptedColumn(a), column))
      .sort((a, b) => a.candidate.lineIdx - b.candidate.lineIdx);
    const previousAccepted = same.filter((a) => a.candidate.lineIdx < i).at(-1);
    const nextAccepted = same.find((a) => a.candidate.lineIdx > i);
    const prev = previousAccepted ? acceptedLineNumber(previousAccepted) : sameColumn(column, incoming) ? incoming.line : 0;
    const next = nextAccepted ? acceptedLineNumber(nextAccepted) : nextAcrossPages?.(column, n) ?? null;
    if (!isPlausibleBare(n, { page: column.page, col: column.col, line: prev })) continue;
    if (prev <= 0 || next === null || !(prev < n && n < next)) continue;
    if (same.some((a) => acceptedLineNumber(a) === n)) continue;

    const candidate: Candidate = {
      side,
      lineIdx: i,
      raw: token.raw,
      startCol: token.startCol,
      endCol: token.endCol,
      values: [{ kind: 'bare', n }],
      clean: null,
      display: false,
      residualStart: candidateResidual(line, { startCol: token.startCol, endCol: token.endCol, side }).residualStart,
    };
    const stateBefore: RunningState = { page: column.page, col: column.col, line: prev };
    const acceptedCandidate: AcceptedCandidate = {
      candidate,
      value: { kind: 'bare', n },
      canonical: String(n),
      repaired: true,
      confusions: decoded.confusions,
      stateBefore,
      stateAfter: { ...stateBefore, line: n },
      flags: [],
    };
    recovered.push(acceptedCandidate);
    claimed.add(`${i}:${token.startCol}`);
    records.push({
      id: nextId(page, i, token.startCol),
      stage: 3,
      tier: 1,
      rule: 'bekker-digit',
      page,
      line: i,
      col: token.startCol,
      before: token.raw,
      after: String(n),
      evidence: {
        kind: 'bracketed-bare-recovery',
        bracket: { prev, next },
        confusions: decoded.confusions,
      },
    });
  }

  return {
    accepted: [...accepted, ...recovered].sort((a, b) => a.candidate.lineIdx - b.candidate.lineIdx),
    records,
  };
}

function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function shiftLine(line: string, delta: number): string {
  const cr = line.endsWith('\r');
  const bare = stripCr(line);
  if (bare.trim() === '' || delta === 0) return line;
  if (delta > 0) return restoreCr(`${' '.repeat(delta)}${bare}`, cr);
  return restoreCr(bare.replace(new RegExp(`^ {0,${-delta}}`, 'u'), ''), cr);
}

function relayoutPage(
  lines: string[],
  side: Side,
  accepted: AcceptedCandidate[],
  excluded: Set<number>
): { lines: string[]; evidence: Record<string, unknown>; flags: string[] } {
  const byLine = new Map(accepted.map((a) => [a.candidate.lineIdx, a]));
  const ticLines: Record<string, unknown>[] = [];
  const flags = [...new Set(accepted.flatMap((a) => a.flags))];
  const out = [...lines];

  if (side === 'recto') {
    let ticCol = 40;
    for (const a of accepted) ticCol = Math.max(ticCol, stripCr(lines[a.candidate.lineIdx]).slice(0, a.candidate.startCol).trimEnd().length + 4);
    for (const a of accepted) {
      const idx = a.candidate.lineIdx;
      const cr = lines[idx].endsWith('\r');
      const body = stripCr(lines[idx]).slice(0, a.candidate.startCol).trimEnd();
      out[idx] = restoreCr(`${body}${' '.repeat(Math.max(4, ticCol - body.length))}${a.canonical}`, cr);
      ticLines.push({ lineIdx: idx, oldStartCol: a.candidate.startCol, newStartCol: ticCol, raw: a.candidate.raw });
      if (ticCol > 80 && !flags.includes('long-body-for-recto-tic')) flags.push('long-body-for-recto-tic');
    }
    return { lines: out, evidence: { side, margin: { ticCol, gap: 4 }, linesShifted: 0, ticLines, flags }, flags };
  }

  const from = versoModalMargin(lines, accepted, excluded);
  const delta = 11 - from;
  for (let i = 0; i < lines.length; i += 1) {
    if (excluded.has(i) || stripCr(lines[i]).trim() === '') continue;
    const acceptedLine = byLine.get(i);
    if (!acceptedLine) {
      out[i] = shiftLine(lines[i], delta);
      continue;
    }
    const cr = lines[i].endsWith('\r');
    const line = stripCr(lines[i]);
    const residual = line.slice(acceptedLine.candidate.residualStart);
    const newResidualStart = Math.max(acceptedLine.canonical.length + 1, acceptedLine.candidate.residualStart + delta);
    out[i] = restoreCr(`${acceptedLine.canonical}${' '.repeat(newResidualStart - acceptedLine.canonical.length)}${residual}`, cr);
    ticLines.push({ lineIdx: i, oldStartCol: acceptedLine.candidate.startCol, newStartCol: 0, raw: acceptedLine.candidate.raw });
  }
  return { lines: out, evidence: { side, margin: { from, to: 11, delta }, linesShifted: out.filter((line, i) => line !== lines[i]).length, ticLines, flags }, flags };
}

function bekkerDigitRecords(
  accepted: AcceptedCandidate[],
  page: number,
  nextId: ReturnType<typeof changeFactory>,
  witnessPages?: WitnessAnchor[][]
): ChangeRecord[] {
  const out: ChangeRecord[] = [];
  for (const a of accepted) {
    if (!a.repaired) continue;
    out.push({
      id: nextId(page, a.candidate.lineIdx, a.candidate.startCol),
      stage: 3,
      tier: 1,
      rule: 'bekker-digit',
      page,
      line: a.candidate.lineIdx,
      col: a.candidate.startCol,
      before: a.candidate.raw,
      after: a.canonical,
      evidence: {
        confusions: a.confusions,
        cadenceState: a.stateBefore,
        witnessAnchor: nearestWitness(a.value, witnessPages),
      },
    });
  }
  return out;
}

function ambiguousBekkerRecords(
  candidates: Candidate[],
  accepted: AcceptedCandidate[],
  incoming: RunningState,
  page: number,
  config: CorpusConfig,
  nextId: ReturnType<typeof changeFactory>,
  witnessPages?: WitnessAnchor[][]
): ChangeRecord[] {
  const claimed = new Set(accepted.map((a) => `${a.candidate.lineIdx}:${a.candidate.startCol}`));
  const out: ChangeRecord[] = [];
  for (const candidate of candidates) {
    if (claimed.has(`${candidate.lineIdx}:${candidate.startCol}`) || candidate.clean || candidate.display) continue;
    const possible = candidate.values.filter((value) => isAcceptable(value, incoming, config));
    if (possible.length === 0) continue;
    out.push({
      id: nextId(page, candidate.lineIdx, candidate.startCol),
      stage: 3,
      tier: 2,
      rule: 'bekker-digit',
      page,
      line: candidate.lineIdx,
      col: candidate.startCol,
      before: candidate.raw,
      evidence: {
        kind: 'bekker-ambiguous',
        candidates: possible.map((value) => canonical(value)),
        cadenceState: incoming,
        witnessAnchor: nearestWitness(possible.find((value) => value.kind === 'full') ?? possible[0], witnessPages),
      },
    });
  }
  return out;
}

function nextAcceptedLineAcrossPages(
  pages: string[][],
  fromPage: number,
  column: { page: number; col: BekkerCol },
  afterLine: number,
  sideHint: Side | null,
  config: CorpusConfig,
  decisions?: ReviewDecisions
): number | null {
  const quietId = changeFactory();
  let state: RunningState = { page: column.page, col: column.col, line: afterLine };
  let lastSide = sideHint;
  for (let page = fromPage; page < pages.length; page += 1) {
    const scan = scanPage(pages[page], state, config, page, quietId, decisions);
    const decision = chooseSide(scan, lastSide, config);
    if (decision.conflict || !decision.side) continue;
    const same = decision.accepted
      .filter((a) => sameColumn(acceptedColumn(a), column))
      .sort((a, b) => a.candidate.lineIdx - b.candidate.lineIdx);
    const next = same.find((a) => acceptedLineNumber(a) > afterLine);
    if (next) return acceptedLineNumber(next);
    const laterColumn = decision.accepted.find((a) => compareRef(acceptedColumn(a), column) > 0);
    if (laterColumn) return null;
    if (decision.accepted.length > 0) state = decision.accepted[decision.accepted.length - 1].stateAfter;
    lastSide = decision.side;
  }
  return null;
}

export function reseatGutter(raw: string, config: CorpusConfig, witnessPages?: WitnessAnchor[][], decisions?: ReviewDecisions): GutterOutcome {
  const nextId = changeFactory();
  const pages = raw.split('\f').map((segment) => segment.split('\n'));
  const changes: ChangeRecord[] = [];
  let state: RunningState = { page: config.bekkerStart.page, col: config.bekkerStart.col, line: 0 };
  let lastSide: Side | null = config.side === 'recto' || config.side === 'verso' ? config.side : null;

  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page];
    const scan = scanPage(lines, state, config, page, nextId, decisions);
    changes.push(...scan.flags);
    const decision = chooseSide(scan, lastSide, config);

    if (decision.conflict) {
      changes.push(flagRecord(nextId, page, 'side-conflict', { recto: scan.recto.map((a) => a.canonical), verso: scan.verso.map((a) => a.canonical) }));
      continue;
    }
    if (!decision.side) continue;
    if (decision.inherited && scan.bodyText && decision.accepted.length === 0) {
      changes.push(flagRecord(nextId, page, 'side-inherited-no-tics', { side: decision.side }));
    }
    const rawCandidates = decision.side === 'recto' ? scan.rectoRaw : scan.versoRaw;
    const recovered = recoverBracketedBares(
      lines,
      decision.side,
      decision.accepted,
      scan.excluded,
      state,
      config,
      page,
      nextId,
      (column, afterLine) => nextAcceptedLineAcrossPages(pages, page + 1, column, afterLine, decision.side, config, decisions)
    );
    decision.accepted = recovered.accepted;
    changes.push(...recovered.records);
    const recoveredSites = new Set(recovered.records.map((record) => `${record.line}:${record.col}`));
    changes.push(...ambiguousBekkerRecords(rawCandidates, decision.accepted, state, page, config, nextId, witnessPages));
    const shouldRelayout = decision.accepted.length > 0 || (decision.side === 'verso' && scan.bodyText);
    if (shouldRelayout) {
      const layout = relayoutPage(lines, decision.side, decision.accepted, scan.excluded);
      pages[page] = layout.lines;
      changes.push(...bekkerDigitRecords(
        decision.accepted.filter((a) => !recoveredSites.has(`${a.candidate.lineIdx}:${a.candidate.startCol}`)),
        page,
        nextId,
        witnessPages
      ));
      changes.push({
        id: nextId(page, undefined, undefined),
        stage: 3,
        tier: 1,
        rule: 'tic-reseat',
        page,
        evidence: layout.evidence,
      });
      for (const flag of layout.flags) {
        if (flag.startsWith('column-jump:')) changes.push(flagRecord(nextId, page, 'column-jump', { jump: flag }));
        if (flag === 'long-body-for-recto-tic') changes.push(flagRecord(nextId, page, 'long-body-for-recto-tic', {}));
      }
      if (decision.accepted.length > 0) state = decision.accepted[decision.accepted.length - 1].stateAfter;
      lastSide = decision.side;
    } else {
      lastSide = decision.side;
    }
  }

  return { text: pages.map((page) => page.join('\n')).join('\f'), changes };
}
