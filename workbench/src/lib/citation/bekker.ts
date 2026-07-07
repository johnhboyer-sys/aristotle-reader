/**
 * Bekker reference utilities — faithful TS port of
 * pipeline/aristotle_pipeline/refs.py.
 *
 * A *column* is a Bekker page+side string like "1094a". A *ref* adds a line
 * number, e.g. "1094a1". Columns order by (page number, side); refs add the
 * line as a third key.
 *
 * Parsed structs (`BekkerColumn`, `BekkerRef`) are internal to citation/ and
 * must not be exported from the package's public surface (see types.ts and
 * workbench-design/d2-citation-schemes.md).
 */

/** A Bekker page+side, e.g. {page: 1094, side: 'a'}. */
export interface BekkerColumn {
  page: number;
  side: 'a' | 'b';
}

/** A Bekker page+side+line, e.g. {page: 1103, side: 'a', line: 14}. */
export interface BekkerRef {
  page: number;
  side: 'a' | 'b';
  line: number;
}

const REF_RE = /^(\d+)([ab])(\d+)?$/;

/**
 * Parse a Bekker column string like "1094a". Throws if the string carries a
 * trailing line number (that's a ref, not a column) or doesn't match at all.
 */
export function parseColumn(column: string): BekkerColumn {
  const m = REF_RE.exec(column);
  if (!m || m[3] !== undefined) {
    throw new Error(`not a Bekker column: ${JSON.stringify(column)}`);
  }
  return { page: Number(m[1]), side: m[2] as 'a' | 'b' };
}

/**
 * Parse a full Bekker ref like "1103a14". Throws if there's no line number
 * (that's a column, not a ref) or the string doesn't match at all.
 */
export function parseRef(ref: string): BekkerRef {
  const m = REF_RE.exec(ref);
  if (!m || m[3] === undefined) {
    throw new Error(`not a Bekker ref: ${JSON.stringify(ref)}`);
  }
  return { page: Number(m[1]), side: m[2] as 'a' | 'b', line: Number(m[3]) };
}

/** Sort key tuple for a column: (page, side). */
export type ColumnKey = readonly [number, string];

/** Sort key tuple for a ref: (page, side, line). */
export type RefKey = readonly [number, string, number];

export function columnKey(column: string): ColumnKey {
  const { page, side } = parseColumn(column);
  return [page, side];
}

export function refKey(ref: string): RefKey {
  const { page, side, line } = parseRef(ref);
  return [page, side, line];
}

export function lineKey(column: string, line: number): RefKey {
  const { page, side } = parseColumn(column);
  return [page, side, line];
}

/** Total order comparator over two BekkerRef structs: page → side → line. */
export function compareRef(a: BekkerRef, b: BekkerRef): number {
  if (a.page !== b.page) return a.page - b.page;
  if (a.side !== b.side) return a.side < b.side ? -1 : 1;
  return a.line - b.line;
}

/** Total order comparator over two BekkerColumn structs: page → side. */
export function compareColumn(a: BekkerColumn, b: BekkerColumn): number {
  if (a.page !== b.page) return a.page - b.page;
  if (a.side !== b.side) return a.side < b.side ? -1 : 1;
  return 0;
}

/** All columns from `first` to `last` inclusive (sides a and b). */
export function columnRange(first: string, last: string): string[] {
  const f = parseColumn(first);
  const l = parseColumn(last);
  const out: string[] = [];
  for (let page = f.page; page <= l.page; page++) {
    for (const side of ['a', 'b'] as const) {
      const cur: BekkerColumn = { page, side };
      if (compareColumn(cur, f) < 0 || compareColumn(cur, l) > 0) continue;
      out.push(`${page}${side}`);
    }
  }
  return out;
}
