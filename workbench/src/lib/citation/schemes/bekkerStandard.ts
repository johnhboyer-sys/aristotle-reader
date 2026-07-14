/**
 * bekker-standard — the default Bekker citation scheme. Book labels read
 * work.books[n-1].label (from the manifest), falling back to Roman
 * numerals when the manifest doesn't supply one.
 */

import type { Address, CitationScheme, RefSpan, WorkMeta } from '../types';
import { compareRef, parseRef } from '../bekker';
import { formatBekkerRange } from '../range';

const ROMAN_NUMERALS: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`toRoman: expected a positive integer, got ${n}`);
  }
  let remaining = n;
  let out = '';
  for (const [value, symbol] of ROMAN_NUMERALS) {
    while (remaining >= value) {
      out += symbol;
      remaining -= value;
    }
  }
  return out;
}

function parseAddress(raw: string): Address {
  // Validate that it's a well-formed Bekker ref; throws on malformed input.
  parseRef(raw);
  return { scheme: 'bekker-standard', raw };
}

function compareAddress(a: Address, b: Address): number {
  return compareRef(parseRef(a.raw), parseRef(b.raw));
}

function bookLabel(bookIndex: number, work: WorkMeta): string {
  const entry = work.books[bookIndex - 1];
  if (entry?.label) return entry.label;
  return toRoman(bookIndex);
}

function formatRange(span: RefSpan): string {
  return formatBekkerRange(span.start.raw, span.end.raw);
}

function formatCitation(span: RefSpan, work: WorkMeta): string {
  const parts: string[] = [];
  if (span.book !== undefined) {
    let label = bekkerStandard.bookLabel(span.book, work);
    if (span.chapter !== undefined) label += `.${span.chapter}`;
    parts.push(label);
  } else if (span.chapter !== undefined) {
    parts.push(`${span.chapter}`);
  }
  const range = bekkerStandard.formatRange(span);
  const head = `*${work.title}*` + (parts.length ? ` ${parts.join('')}` : '');
  return `${head}, ${range}`;
}

export const bekkerStandard: CitationScheme = {
  id: 'bekker-standard',
  parseAddress,
  compareAddress,
  bookLabel,
  formatRange,
  formatCitation,
  gutter: {
    rowUnit: 'bekker-line',
    gutterMode: 'address',
  },
  spineSource: 'corpus',
};
