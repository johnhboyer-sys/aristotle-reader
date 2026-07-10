import { decodeWitnessHeadRef } from './witness-anchors';

export interface TokenProvenance {
  page: number;
  line: number;
  col: number;
}

export interface AlignedToken {
  raw: string;
  key: string;
  prov?: TokenProvenance;
}

export type AlignOp =
  | { t: 'match'; aRaw: string; bRaw: string; aProv?: TokenProvenance }
  | { t: 'aOnly'; aRaw: string; aProv?: TokenProvenance }
  | { t: 'bOnly'; bRaw: string };

const TOKEN_RE = /\S+/gu;
const FULL_OPENER_RE = /^(\d{1,4})([ab])(?:\d{0,2})$/u;
const BARE_LINE_NUMBER_RE = /^(?:5|10|15|20|25|30)$/u;

export function matchKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}]/gu, '');
}

function openerKey(raw: string): string | null {
  const m = FULL_OPENER_RE.exec(raw);
  if (m) return `${Number(m[1])}${m[2]}`;
  const decoded = decodeWitnessHeadRef(raw);
  return decoded ? `${decoded.page}${decoded.col}` : null;
}

export function tokenizeBackbone(text: string): AlignedToken[] {
  const tokens: AlignedToken[] = [];
  const pages = text.split('\f');
  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page].split('\n');
    for (let line = 0; line < lines.length; line += 1) {
      for (const match of lines[line].matchAll(TOKEN_RE)) {
        tokens.push({ raw: match[0], key: matchKey(match[0]), prov: { page, line, col: match.index } });
      }
    }
  }
  return tokens;
}

export function tokenizeWitness(text: string): AlignedToken[] {
  const tokens: AlignedToken[] = [];
  for (const line of text.split(/\n/u)) {
    if (isWitnessRunningHeadLine(line)) continue;
    const normalized = line.replace(/&nbsp;/giu, ' ');
    for (const match of normalized.matchAll(TOKEN_RE)) {
      const raw = cleanWitnessToken(match[0]);
      if (raw === '' || BARE_LINE_NUMBER_RE.test(raw)) continue;
      tokens.push({ raw, key: matchKey(raw) });
    }
  }
  return tokens;
}

function cleanWitnessToken(raw: string): string {
  let token = raw.replace(/\*\*/gu, '');
  if (/^\$.*\$$/u.test(token)) token = token.slice(1, -1);
  if (/^<sup>\s*[^<]*\s*<\/sup>$/iu.test(token)) return '';
  return token;
}

function isWitnessRunningHeadLine(line: string): boolean {
  const trimmed = line.replace(/&nbsp;/giu, ' ').trim();
  if (trimmed === '' || decodeWitnessHeadRef(trimmed)) return false;
  if (trimmed.length > 80 || /[.!?;:]/u.test(trimmed)) return false;
  const words = trimmed.match(/\p{L}+/gu) ?? [];
  if (words.length < 2 || words.length > 8) return false;
  const letters = words.join('');
  return letters === letters.toLocaleUpperCase();
}

interface Pair {
  a: number;
  b: number;
}

const SMALL_LCS_MAX_TOKENS = 800;
const LINEAR_LCS_CELL_CAP = 40_000_000;

type KeyedToken = { token: AlignedToken; index: number };

function keyed(tokens: AlignedToken[], from: number, to: number): { token: AlignedToken; index: number }[] {
  const out: { token: AlignedToken; index: number }[] = [];
  for (let i = from; i < to; i += 1) {
    if (tokens[i].key !== '') out.push({ token: tokens[i], index: i });
  }
  return out;
}

function matrixLcsPairs(aTokens: AlignedToken[], bTokens: AlignedToken[], aFrom: number, aTo: number, bFrom: number, bTo: number): Pair[] {
  const a = keyed(aTokens, aFrom, aTo);
  const b = keyed(bTokens, bFrom, bTo);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i].token.key === b[j].token.key ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: Pair[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i].token.key === b[j].token.key) {
      pairs.push({ a: a[i].index, b: b[j].index });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

function lcsScoreForward(a: KeyedToken[], aFrom: number, aTo: number, b: KeyedToken[], bFrom: number, bTo: number): Uint32Array {
  const bLen = bTo - bFrom;
  let prev = new Uint32Array(bLen + 1);
  let curr = new Uint32Array(bLen + 1);
  for (let i = aFrom; i < aTo; i += 1) {
    const aKey = a[i].token.key;
    for (let j = 0; j < bLen; j += 1) {
      curr[j + 1] = aKey === b[bFrom + j].token.key ? prev[j] + 1 : Math.max(prev[j + 1], curr[j]);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
    curr.fill(0);
  }
  return prev;
}

function lcsScoreReverse(a: KeyedToken[], aFrom: number, aTo: number, b: KeyedToken[], bFrom: number, bTo: number): Uint32Array {
  const bLen = bTo - bFrom;
  let prev = new Uint32Array(bLen + 1);
  let curr = new Uint32Array(bLen + 1);
  for (let i = aTo - 1; i >= aFrom; i -= 1) {
    const aKey = a[i].token.key;
    for (let j = bLen - 1; j >= 0; j -= 1) {
      curr[j] = aKey === b[bFrom + j].token.key ? prev[j + 1] + 1 : Math.max(prev[j], curr[j + 1]);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
    curr.fill(0);
  }
  return prev;
}

function hirschbergPairs(a: KeyedToken[], aFrom: number, aTo: number, b: KeyedToken[], bFrom: number, bTo: number): Pair[] {
  const aLen = aTo - aFrom;
  const bLen = bTo - bFrom;
  if (aLen === 0 || bLen === 0) return [];
  if (aLen * bLen > LINEAR_LCS_CELL_CAP) return [];
  if (aLen === 1) {
    for (let j = bFrom; j < bTo; j += 1) {
      if (a[aFrom].token.key === b[j].token.key) return [{ a: a[aFrom].index, b: b[j].index }];
    }
    return [];
  }
  if (bLen === 1) {
    for (let i = aFrom; i < aTo; i += 1) {
      if (a[i].token.key === b[bFrom].token.key) return [{ a: a[i].index, b: b[bFrom].index }];
    }
    return [];
  }

  const aMid = aFrom + Math.floor(aLen / 2);
  const left = lcsScoreForward(a, aFrom, aMid, b, bFrom, bTo);
  const right = lcsScoreReverse(a, aMid, aTo, b, bFrom, bTo);
  let split = 0;
  let best = -1;
  for (let k = 0; k <= bLen; k += 1) {
    const score = left[k] + right[k];
    if (score > best) {
      best = score;
      split = k;
    }
  }

  const bMid = bFrom + split;
  return [...hirschbergPairs(a, aFrom, aMid, b, bFrom, bMid), ...hirschbergPairs(a, aMid, aTo, b, bMid, bTo)];
}

function uniquePatienceAnchors(aTokens: AlignedToken[], bTokens: AlignedToken[], aFrom: number, aTo: number, bFrom: number, bTo: number): Pair[] {
  const aSeen = new Map<string, { count: number; index: number }>();
  const bSeen = new Map<string, { count: number; index: number }>();
  for (let i = aFrom; i < aTo; i += 1) {
    const key = aTokens[i].key;
    if (key === '') continue;
    const seen = aSeen.get(key);
    aSeen.set(key, { count: (seen?.count ?? 0) + 1, index: i });
  }
  for (let i = bFrom; i < bTo; i += 1) {
    const key = bTokens[i].key;
    if (key === '') continue;
    const seen = bSeen.get(key);
    bSeen.set(key, { count: (seen?.count ?? 0) + 1, index: i });
  }

  const candidates: Pair[] = [];
  for (let i = aFrom; i < aTo; i += 1) {
    const key = aTokens[i].key;
    if (key === '') continue;
    const aSeenRow = aSeen.get(key);
    const bSeenRow = bSeen.get(key);
    if (aSeenRow?.count === 1 && bSeenRow?.count === 1) candidates.push({ a: i, b: bSeenRow.index });
  }
  if (candidates.length <= 1) return candidates;

  const piles: number[] = [];
  const prev = Array<number>(candidates.length).fill(-1);
  for (let i = 0; i < candidates.length; i += 1) {
    let lo = 0;
    let hi = piles.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (candidates[piles[mid]].b < candidates[i].b) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = piles[lo - 1];
    piles[lo] = i;
  }

  const anchors: Pair[] = [];
  for (let i = piles[piles.length - 1]; i >= 0; i = prev[i]) anchors.push(candidates[i]);
  anchors.reverse();
  return anchors;
}

function safeLcsPairs(aTokens: AlignedToken[], bTokens: AlignedToken[], aFrom: number, aTo: number, bFrom: number, bTo: number): Pair[] {
  const aKeyed = keyed(aTokens, aFrom, aTo);
  const bKeyed = keyed(bTokens, bFrom, bTo);
  if (aKeyed.length === 0 || bKeyed.length === 0) return [];
  if (aKeyed.length <= SMALL_LCS_MAX_TOKENS && bKeyed.length <= SMALL_LCS_MAX_TOKENS) {
    return matrixLcsPairs(aTokens, bTokens, aFrom, aTo, bFrom, bTo);
  }

  const anchors = uniquePatienceAnchors(aTokens, bTokens, aFrom, aTo, bFrom, bTo);
  if (anchors.length > 0) {
    const pairs: Pair[] = [];
    let nextA = aFrom;
    let nextB = bFrom;
    for (const anchor of anchors) {
      pairs.push(...safeLcsPairs(aTokens, bTokens, nextA, anchor.a, nextB, anchor.b), anchor);
      nextA = anchor.a + 1;
      nextB = anchor.b + 1;
    }
    pairs.push(...safeLcsPairs(aTokens, bTokens, nextA, aTo, nextB, bTo));
    return pairs;
  }

  if (aKeyed.length * bKeyed.length > LINEAR_LCS_CELL_CAP) {
    if (aTo - aFrom <= 1 || bTo - bFrom <= 1) return [];
    const aMid = aFrom + Math.floor((aTo - aFrom) / 2);
    const bMid = bFrom + Math.floor((bTo - bFrom) / 2);
    return [
      ...safeLcsPairs(aTokens, bTokens, aFrom, aMid, bFrom, bMid),
      ...safeLcsPairs(aTokens, bTokens, aMid, aTo, bMid, bTo),
    ];
  }

  return hirschbergPairs(aKeyed, 0, aKeyed.length, bKeyed, 0, bKeyed.length);
}

function commonAnchors(aTokens: AlignedToken[], bTokens: AlignedToken[]): Pair[] {
  const bByKey = new Map<string, number[]>();
  for (let i = 0; i < bTokens.length; i += 1) {
    const key = openerKey(bTokens[i].raw);
    if (!key) continue;
    const rows = bByKey.get(key) ?? [];
    rows.push(i);
    bByKey.set(key, rows);
  }
  const anchors: Pair[] = [];
  let minB = -1;
  for (let i = 0; i < aTokens.length; i += 1) {
    const key = openerKey(aTokens[i].raw);
    if (!key) continue;
    const b = (bByKey.get(key) ?? []).find((idx) => idx > minB);
    if (b === undefined) continue;
    anchors.push({ a: i, b });
    minB = b;
  }
  return anchors;
}

function appendOps(
  ops: AlignOp[],
  aTokens: AlignedToken[],
  bTokens: AlignedToken[],
  pairs: Pair[],
  aFrom: number,
  aTo: number,
  bFrom: number,
  bTo: number
) {
  let ai = aFrom;
  let bi = bFrom;
  for (const pair of pairs) {
    while (ai < pair.a) {
      ops.push({ t: 'aOnly', aRaw: aTokens[ai].raw, aProv: aTokens[ai].prov });
      ai += 1;
    }
    while (bi < pair.b) {
      ops.push({ t: 'bOnly', bRaw: bTokens[bi].raw });
      bi += 1;
    }
    ops.push({ t: 'match', aRaw: aTokens[pair.a].raw, bRaw: bTokens[pair.b].raw, aProv: aTokens[pair.a].prov });
    ai = pair.a + 1;
    bi = pair.b + 1;
  }
  while (ai < aTo) {
    ops.push({ t: 'aOnly', aRaw: aTokens[ai].raw, aProv: aTokens[ai].prov });
    ai += 1;
  }
  while (bi < bTo) {
    ops.push({ t: 'bOnly', bRaw: bTokens[bi].raw });
    bi += 1;
  }
}

export function alignTokens(backboneText: string, witnessText: string): AlignOp[] {
  const aTokens = tokenizeBackbone(backboneText);
  const bTokens = tokenizeWitness(witnessText);
  const anchors = commonAnchors(aTokens, bTokens);
  const ops: AlignOp[] = [];
  let aFrom = 0;
  let bFrom = 0;
  for (const anchor of anchors) {
    appendOps(ops, aTokens, bTokens, safeLcsPairs(aTokens, bTokens, aFrom, anchor.a, bFrom, anchor.b), aFrom, anchor.a, bFrom, anchor.b);
    ops.push({ t: 'match', aRaw: aTokens[anchor.a].raw, bRaw: bTokens[anchor.b].raw, aProv: aTokens[anchor.a].prov });
    aFrom = anchor.a + 1;
    bFrom = anchor.b + 1;
  }
  appendOps(ops, aTokens, bTokens, safeLcsPairs(aTokens, bTokens, aFrom, aTokens.length, bFrom, bTokens.length), aFrom, aTokens.length, bFrom, bTokens.length);
  return ops;
}
