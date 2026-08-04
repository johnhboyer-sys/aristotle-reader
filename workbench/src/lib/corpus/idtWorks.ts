/**
 * The work list and citation-tier labels an author's .IDT file carries.
 *
 * A TLG/PHI disc stores, per author, the number and name of every work and the
 * NAME of each of its citation tiers — "Stephanus page", "section", "line".
 * Reading them here buys two things: the import dialog can list an author's
 * works without first running a slow export, and an imported work can name its
 * tiers the way the disc does instead of the way an XML export happens to spell
 * a `type` attribute ("Stephanus-page").
 *
 * The record grammar, from Diogenes' `parse_idt` (Diogenes/Base.pm):
 *
 *   byte 0x01 | 0x02               start of an author or work record:
 *     skip 2, then 2 bytes of start block
 *     byte 0xEF                    a numbered level follows
 *       byte  level & 0x7F         0 = author, 1 = work
 *       ASCII string to 0xFF       the author or work NUMBER
 *       bytes 0x10 0x00            (level 0) author name follows
 *       bytes 0x10 0x01            (level 1) work name follows
 *       Pascal string              length byte, then that many characters
 *       byte 0x11 (repeating)      (level 1 only) a tier label follows
 *         byte                     which tier it names
 *         Pascal string            the label, e.g. "Stephanus page"
 *
 * High bits are strays from the 7-bit encoding these discs use and are masked
 * off wherever the Perl masks them.
 *
 * Where this deliberately DIVERGES from Diogenes: the Perl walks the file as a
 * state machine, consuming the block-index records (codes 3, 10, 11, 13) that
 * sit between work records, because searching needs the block index. Nothing
 * here does, and emulating that machinery just to step over it would be a few
 * hundred lines whose only job is to be skipped — and every one of them a
 * chance to desync. So this scans for the work-record SIGNATURE instead and
 * validates the whole chain (0xEF at +5, a numeric level, digits to 0xFF, the
 * 0x10 name marker) before believing it. Random bytes do not pass that chain;
 * the counts are checked against real discs in the tests.
 */

import { betaToGreek } from '../betacode';

/** One work on the disc. */
export interface DiscWork {
  /** Work number as the disc writes it, e.g. "001" — the `-w` Diogenes takes. */
  number: string;
  /** Work title, e.g. "Respublica". */
  title: string;
  /**
   * Tier labels outermost first, e.g. ["Stephanus page", "section", "line"].
   * The disc keys them by tier index and counts UP from the innermost, so they
   * are reversed here to read outermost-first like everything else.
   */
  levelNames: string[];
}

export interface DiscAuthorWorks {
  /** Author number as the disc writes it, e.g. "0059". */
  number?: string;
  /** Author name from the .IDT, which may differ slightly from AUTHTAB's. */
  name?: string;
  works: DiscWork[];
}

/**
 * Titles on these discs are typeset, not plain: `$` switches the font to
 * Greek and `&` switches back to Roman, each optionally followed by a font
 * number. So the Athenian Constitution is stored as
 * "$*)AQHNAI/WN POLITEI/A&" — Beta Code inside a Greek run.
 *
 * Converts each Greek run through the app's existing Beta Code decoder and
 * drops the switches. A title with no switches passes through untouched.
 */
export function discTitle(raw: string): string {
  const out: string[] = [];
  // Split on the font switches, keeping them so we know which run is which.
  const parts = raw.split(/([$&]\d*)/);
  let greek = false;
  for (const part of parts) {
    if (/^[$&]\d*$/.test(part)) {
      greek = part.startsWith('$');
      continue;
    }
    if (part.length === 0) continue;
    out.push(greek ? betaToGreek(part) : part);
  }
  return out.join('').replace(/\s+/g, ' ').trim();
}

const MASK = 0x7f;
const RECORD_START = [0x01, 0x02];
const LEVEL_MARKER = 0xef;
const NAME_MARKER = 0x10;
const LABEL_MARKER = 0x11;
const STRING_END = 0xff;

/**
 * Longest record number to consider. Real ones are 1–4 digits ("0059", "056").
 * The bound is load-bearing, not cosmetic: this scan tries every 0x01/0x02
 * byte in the file as a possible record, and an unbounded read-to-terminator
 * at each one makes the whole parse quadratic — minutes per author on a large
 * .IDT instead of milliseconds.
 */
const MAX_NUMBER_LENGTH = 8;

/** Read an ASCII string up to 0xFF, masking the high bit off each byte.
 * Returns null when no terminator turns up within `limit` bytes. */
function asciiString(buf: Uint8Array, start: number, limit: number): { text: string; next: number } | null {
  let out = '';
  let i = start;
  const end = Math.min(buf.length, start + limit + 1);
  while (i < end) {
    const b = buf[++i];
    if (b === undefined) return null;
    if (b === STRING_END) return { text: out, next: i };
    out += String.fromCharCode(b & MASK);
  }
  return null;
}

/** Read a length-prefixed string. Returns the index of its LAST byte, matching
 * the Perl's "went one byte too far" convention so callers can keep stepping. */
function pascalString(buf: Uint8Array, start: number): { text: string; next: number } {
  const len = buf[start] ?? 0;
  let out = '';
  let i = start + 1;
  for (let n = 0; n < len && i < buf.length; n++, i++) {
    out += String.fromCharCode(buf[i]);
  }
  return { text: out, next: i - 1 };
}

/**
 * Parse an author's .IDT. Never throws on a malformed file: these discs are
 * decades old, and a record we can't read should cost that one work, not the
 * whole author.
 */
export function parseIdtWorks(bytes: Uint8Array): DiscAuthorWorks {
  const works: DiscWork[] = [];
  let authorNumber: string | undefined;
  let authorName: string | undefined;

  for (let start = 0; start < bytes.length; start++) {
    if (!RECORD_START.includes(bytes[start])) continue;
    // The level marker sits five bytes into a real record; anything else here
    // means these were data bytes that happened to be 0x01/0x02.
    let i = start + 5;
    if (bytes[i] !== LEVEL_MARKER) continue;

    const level = (bytes[++i] ?? 0) & MASK;
    if (level !== 0 && level !== 1) continue; // sub-work levels: Diogenes refuses these too
    const num = asciiString(bytes, i, MAX_NUMBER_LENGTH);
    // A record number is digits. Nothing else is, which is most of what keeps
    // a chance 0x01 byte from being read as a work.
    if (num === null || !/^\d+$/.test(num.text)) continue;
    i = num.next;

    if (bytes[++i] !== NAME_MARKER) continue;
    const kind = bytes[++i];

    if (level === 0) {
      if (kind !== 0x00) continue;
      authorNumber = num.text;
      const name = pascalString(bytes, ++i);
      authorName = name.text;
      continue;
    }

    if (kind !== 0x01) continue;
    const title = pascalString(bytes, ++i);
    i = title.next;

    // Tier labels, keyed by tier index. The disc counts up from the innermost.
    const byTier = new Map<number, string>();
    while (bytes[i + 1] === LABEL_MARKER) {
      i++; // the 0x11 marker
      const tier = bytes[++i] ?? 0;
      const label = pascalString(bytes, ++i);
      byTier.set(tier, label.text);
      i = label.next;
    }

    works.push({
      number: num.text,
      title: discTitle(title.text),
      levelNames: [...byTier.keys()].sort((a, b) => b - a).map((k) => byTier.get(k)!),
    });
  }

  return {
    ...(authorNumber ? { number: authorNumber } : {}),
    ...(authorName ? { name: authorName } : {}),
    works,
  };
}
