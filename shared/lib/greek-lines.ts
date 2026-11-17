// A segment's Greek as the index counts it: token places, lines, and the
// sections a match runs on into. Moved here from the results page so the
// row table (lib/row-table) counts with the same code that draws the rows.
import type { Segment, Token } from './data';

type Lines = Pick<Segment, 'greek'>;

/** A segment's Greek tokens in the order the index counts them. */
export const segTokens = (seg: Lines): Token[] => seg.greek.flatMap(line => line.tokens);

/** The Greek line of the token at index `pos` within a segment. A proximity
 * measure only: the citation is formatted through the work's scheme, which
 * for Stephanus prints the section alone. */
export function lineOfPosition(seg: Lines, pos: number): number {
  let count = 0;
  for (const line of seg.greek) {
    if (pos < count + line.tokens.length) return line.n;
    count += line.tokens.length;
  }
  return seg.greek[seg.greek.length - 1]?.n ?? 1;
}

/** The lettered line's suffix of the token at `pos` ("5a" → "a"), undefined
 * for a plain line or a place past the last line. */
export function subOfPosition(seg: Lines, pos: number): string | undefined {
  let left = pos;
  for (const l of seg.greek) { if (left < l.tokens.length) return l.sub; left -= l.tokens.length; }
  return undefined;
}

/** Each line's tokens in that order: number and suffix → [first, past last). */
export function lineTokens(seg: Lines): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  let at = 0;
  for (const line of seg.greek) { out.set(`${line.n}${line.sub ?? ''}`, [at, at + line.tokens.length]); at += line.tokens.length; }
  return out;
}

/** The sections after `seg` in its book that a match `last` words on from
 * its first reaches into, `reach` words more: none for a match inside it. */
export function sectionsAfter<S extends Lines>(segments: S[], seg: S, last: number, reach: number): S[] {
  let n = segTokens(seg).length;
  const out: S[] = [];
  for (let k = segments.indexOf(seg) + 1; k > 0 && k < segments.length && n <= last + reach; k++) {
    out.push(segments[k]);
    n += segTokens(segments[k]).length;
  }
  return last < segTokens(seg).length ? [] : out;
}
