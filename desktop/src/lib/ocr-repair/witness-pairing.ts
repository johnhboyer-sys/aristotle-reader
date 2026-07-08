import type { CorpusConfig } from './corpus-config';
import { decodeWitnessHeadRef } from './witness-anchors';
import type { WitnessAnchor } from './witness-anchors';
import { classifyTicToken } from '../pdf-import/line-shape';

export interface BekkerColumnRef {
  page: number;
  col: 'a' | 'b';
}

export interface BackbonePageSpan {
  page: number;
  bekkerSpan: [string, string] | null;
  lo: number | null;
  hi: number | null;
  interpolated: boolean;
}

export interface WitnessBodyPage {
  page: number;
  text: string;
  headRef: WitnessAnchor | null;
}

export type PairKind = '1:1' | '1:2' | '1:n' | 'interpolated' | 'no-witness-span';

export interface PairingRow {
  backbonePage: number;
  bekkerSpan: [string, string] | null;
  witnessPages: number[];
  witnessHeadRefs: string[];
  pairKind: PairKind;
}

export interface PairingReport {
  method: string;
  window: { bodyLo: number; bodyHi: number; commentaryIdx: number };
  counts: Record<PairKind, number>;
  rows: PairingRow[];
  noWitnessSpan: number[];
}

export interface PairingOutcome {
  witnessPages: string[];
  witnessBodyPages: WitnessBodyPage[];
  backboneSpans: BackbonePageSpan[];
  report: PairingReport;
}

const SEPARATOR_RE = /^---(?:\s.*)?$/u;
const FULL_TIC_RE = /(?:^|\s)(\d{1,4}[ab]\d{0,2})(?=\s|$)/gu;

export function columnOrder(ref: BekkerColumnRef): number {
  return ref.page * 2 + (ref.col === 'a' ? 0 : 1);
}

export function formatColumn(ref: BekkerColumnRef): string {
  return `${ref.page}${ref.col}`;
}

function inRange(ref: BekkerColumnRef, config: CorpusConfig): boolean {
  return columnOrder(ref) >= columnOrder(config.bekkerStart) && columnOrder(ref) <= columnOrder(config.bekkerEnd);
}

function splitWitnessPages(witnessText: string): string[] {
  const pages: string[] = [];
  let current: string[] = [];
  for (const line of witnessText.split(/\n/u)) {
    if (!SEPARATOR_RE.test(line)) {
      current.push(line);
      continue;
    }
    pages.push(current.join('\n'));
    current = [];
    if (/\[blank\]/iu.test(line)) pages.push('');
  }
  pages.push(current.join('\n'));
  if (pages.length > 1 && pages[0] === '') pages.shift();
  return pages;
}

function firstNonEmptyLine(page: string): string {
  return page.split(/\n/u).find((line) => line.trim() !== '') ?? '';
}

function headRefForPage(page: string): WitnessAnchor | null {
  const line = firstNonEmptyLine(page);
  return line ? decodeWitnessHeadRef(line) : null;
}

// Searched only AFTER the body start — front matter also carries NOTE/
// COMMENTARY-headed pages (APo: 'NOTE ON THE TRANSLATION'), the same
// first-match trap the stage-1 slice hit.
function firstCommentaryPage(pages: string[], from: number): number {
  for (let i = from; i < pages.length; i += 1) {
    if (/^#*\s*(?:SYNOPSIS|NOTE|COMMENTARY)\b/iu.test(firstNonEmptyLine(pages[i]).trim())) return i;
  }
  return pages.length;
}

function bodyStart(pages: string[], config: CorpusConfig): number {
  for (let i = 0; i < pages.length; i += 1) {
    const refs = pages.slice(i, Math.min(i + 5, pages.length)).map(headRefForPage);
    if (refs[0] && inRange(refs[0], config) && refs.filter((ref) => ref && inRange(ref, config)).length >= 4) {
      return i;
    }
  }
  return 0;
}

function refOrder(anchor: WitnessAnchor | null): number | null {
  return anchor ? columnOrder(anchor) : null;
}

function parseBackboneSpans(backboneText: string, config: CorpusConfig): BackbonePageSpan[] {
  const pages = backboneText.split('\f');
  const raw = pages.map((page, pageIndex): BackbonePageSpan => {
    const orders: number[] = [];
    for (const match of page.matchAll(FULL_TIC_RE)) {
      const cls = classifyTicToken(match[1]);
      if (!cls || cls.kind !== 'full' || cls.fullPage === undefined || cls.fullCol === undefined) continue;
      const ref = { page: cls.fullPage, col: cls.fullCol };
      if (inRange(ref, config)) orders.push(columnOrder(ref));
    }
    if (orders.length === 0) {
      return { page: pageIndex, bekkerSpan: null, lo: null, hi: null, interpolated: false };
    }
    const lo = Math.min(...orders);
    const hi = Math.max(...orders);
    return {
      page: pageIndex,
      bekkerSpan: [orderToColumn(lo), orderToColumn(hi)],
      lo,
      hi,
      interpolated: false,
    };
  });

  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i].lo !== null) continue;
    let prev = i - 1;
    while (prev >= 0 && raw[prev].lo === null) prev -= 1;
    let next = i + 1;
    while (next < raw.length && raw[next].lo === null) next += 1;
    const lo = prev >= 0 ? raw[prev].hi : next < raw.length ? raw[next].lo : null;
    const hi = next < raw.length ? raw[next].lo : prev >= 0 ? raw[prev].hi : null;
    if (lo !== null && hi !== null) {
      raw[i] = { page: i, bekkerSpan: [orderToColumn(lo), orderToColumn(hi)], lo, hi, interpolated: true };
    }
  }
  return raw;
}

function orderToColumn(order: number): string {
  const page = Math.floor(order / 2);
  return `${page}${order % 2 === 0 ? 'a' : 'b'}`;
}

function countRows(rows: PairingRow[]): Record<PairKind, number> {
  const counts: Record<PairKind, number> = {
    '1:1': 0,
    '1:2': 0,
    '1:n': 0,
    interpolated: 0,
    'no-witness-span': 0,
  };
  for (const row of rows) counts[row.pairKind] += 1;
  return counts;
}

export function pairWitnessPages(backboneText: string, witnessText: string, config: CorpusConfig): PairingOutcome {
  const witnessPages = splitWitnessPages(witnessText);
  const bodyLo = bodyStart(witnessPages, config);
  const commentaryIdx = firstCommentaryPage(witnessPages, bodyLo + 1);
  const lastInRange = witnessPages.slice(bodyLo, commentaryIdx).reduce((last, page, offset) => {
    const ref = headRefForPage(page);
    return ref && inRange(ref, config) ? bodyLo + offset : last;
  }, bodyLo - 1);
  const bodyHi = lastInRange >= bodyLo ? lastInRange + 1 : commentaryIdx;
  const witnessBodyPages: WitnessBodyPage[] = witnessPages.slice(bodyLo, bodyHi).map((text, offset) => ({
    page: bodyLo + offset,
    text,
    headRef: headRefForPage(text),
  }));
  const backboneSpans = parseBackboneSpans(backboneText, config);
  const rows: PairingRow[] = [];
  const used = new Set<number>();

  for (let i = 0; i < backboneSpans.length; i += 1) {
    const span = backboneSpans[i];
    const lo = span.lo;
    const hi = span.hi;
    const matched: WitnessBodyPage[] = [];
    if (lo !== null && hi !== null) {
      for (const page of witnessBodyPages) {
        if (used.has(page.page)) continue;
        const order = refOrder(page.headRef);
        if (order === null) continue;
        if (order >= lo && order <= hi) matched.push(page);
      }
    }
    for (const page of matched) used.add(page.page);
    let pairKind: PairKind;
    if (matched.length === 0) pairKind = 'no-witness-span';
    else if (span.interpolated) pairKind = 'interpolated';
    else if (matched.length === 1) pairKind = '1:1';
    else if (matched.length === 2) pairKind = '1:2';
    else pairKind = '1:n';
    rows.push({
      backbonePage: i,
      bekkerSpan: span.bekkerSpan,
      witnessPages: matched.map((page) => page.page),
      witnessHeadRefs: matched.map((page) => page.headRef?.ref ?? ''),
      pairKind,
    });
  }

  return {
    witnessPages,
    witnessBodyPages,
    backboneSpans,
    report: {
      method: 'body-segmented-head-ref-monotone',
      window: { bodyLo, bodyHi, commentaryIdx },
      counts: countRows(rows),
      rows,
      noWitnessSpan: rows.filter((row) => row.pairKind === 'no-witness-span').map((row) => row.backbonePage),
    },
  };
}

export function renderPairingMarkdown(report: PairingReport): string {
  const lines = [
    '# Stage 5 Pairing',
    '',
    `method: ${report.method}`,
    `window: witness pages ${report.window.bodyLo}..${Math.max(report.window.bodyLo, report.window.bodyHi - 1)}; commentary ${report.window.commentaryIdx}`,
    '',
    '| backbonePage | bekkerSpan | witnessPages | witnessHeadRefs | pairKind |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push(
      `| ${row.backbonePage} | ${row.bekkerSpan?.join('..') ?? ''} | ${row.witnessPages.join(',')} | ${row.witnessHeadRefs.join(',')} | ${row.pairKind} |`
    );
  }
  lines.push('', `no-witness-span: ${report.noWitnessSpan.join(', ')}`);
  return `${lines.join('\n')}\n`;
}
