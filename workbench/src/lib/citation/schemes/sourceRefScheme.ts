/**
 * source-ref — addresses imported VERBATIM from whatever source a text came
 * from (TLG/PHI via Diogenes, a Perseus TEI file, a CTS fetch).
 *
 * The other document schemes number rows themselves: plain-line calls the
 * third row "3" whatever the source called it. This one does the opposite —
 * it carries the source's own citation forward, because that is the whole
 * point of importing from a cited edition. So the address vocabulary cannot
 * be fixed in advance: "1.5" (book.section), "379d" (Stephanus), "2.3.11",
 * "praef.2" are all things a real source declares, and this scheme must order
 * every one of them without knowing which it is looking at.
 *
 * The rule is therefore structural, not lexical: an address is a run of
 * components separated by ".", and comparison walks them left to right,
 * comparing digit-runs as NUMBERS and everything else as text (so 2.10 sorts
 * after 2.9, which plain string comparison gets backwards). A shorter address
 * that is a prefix of a longer one sorts first ("1" before "1.1").
 *
 * spineSource is 'document': the imported rows ARE the text. There is no
 * external corpus to reconcile against, so the user may split and merge rows
 * like any other document work — the addresses are inherited labels, not a
 * grid handed down by a corpus.
 */

import type { Address, CitationScheme, RefSpan, WorkMeta } from '../types';

const SCHEME_ID = 'source-ref' as const;
const EN_DASH = '–';

/** A defensive cap. Real citation systems are 2–4 deep; this only stops a
 * malformed import from building an address with hundreds of components. */
export const MAX_COMPONENTS = 8;

/** Split a component into digit and non-digit runs: "379d" → ["379", "d"]. */
const RUN_RE = /\d+|\D+/g;

/**
 * A component is letters and digits only — no punctuation, no symbols.
 * Deliberately strict: this scheme's addresses arrive from a PARSER (TEI
 * attributes, Diogenes output), and the failure mode to guard against is
 * junk being blessed as a citation because it happened to be non-empty.
 * Letters are matched by Unicode class, so a Greek book letter (Ζ) is a
 * legitimate component.
 */
const COMPONENT_RE = /^[\p{L}\p{N}]+$/u;

function parseComponents(raw: string): string[] {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`source-ref address must be a non-empty string: ${JSON.stringify(raw)}`);
  }
  if (/\s/.test(raw)) {
    throw new Error(`source-ref address must not contain whitespace: ${JSON.stringify(raw)}`);
  }
  const parts = raw.split('.');
  if (parts.length > MAX_COMPONENTS) {
    throw new Error(`source-ref address has too many components (max ${MAX_COMPONENTS}): ${JSON.stringify(raw)}`);
  }
  // A trailing "." is common in real sources ("praef."), and dropping it is
  // the only forgiving step here — an EMPTY component anywhere else means the
  // address is malformed and we say so rather than guessing.
  if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  if (parts.some((p) => p.length === 0)) {
    throw new Error(`source-ref address has an empty component: ${JSON.stringify(raw)}`);
  }
  const bad = parts.find((p) => !COMPONENT_RE.test(p));
  if (bad !== undefined) {
    throw new Error(
      `source-ref address component must be letters and digits only, got ${JSON.stringify(bad)} in ${JSON.stringify(raw)}`,
    );
  }
  return parts;
}

/**
 * Natural comparison of one component. Digit runs compare as numbers so that
 * "10" follows "9"; non-digit runs compare as text. A digit run sorts before
 * a text run at the same position, which puts "2" before "2a".
 */
function compareComponent(a: string, b: string): number {
  const runsA = a.match(RUN_RE) ?? [];
  const runsB = b.match(RUN_RE) ?? [];
  const shared = Math.min(runsA.length, runsB.length);
  for (let i = 0; i < shared; i++) {
    const ra = runsA[i];
    const rb = runsB[i];
    const numA = /^\d/.test(ra);
    const numB = /^\d/.test(rb);
    if (numA && numB) {
      const diff = Number(ra) - Number(rb);
      if (diff !== 0) return diff;
      continue;
    }
    if (numA !== numB) return numA ? -1 : 1;
    if (ra !== rb) return ra < rb ? -1 : 1;
  }
  return runsA.length - runsB.length;
}

function parseAddress(raw: string): Address {
  parseComponents(raw); // throws on malformed input
  return { scheme: SCHEME_ID, raw };
}

function compareAddress(a: Address, b: Address): number {
  const ca = parseComponents(a.raw);
  const cb = parseComponents(b.raw);
  const shared = Math.min(ca.length, cb.length);
  for (let i = 0; i < shared; i++) {
    const diff = compareComponent(ca[i], cb[i]);
    if (diff !== 0) return diff;
  }
  return ca.length - cb.length;
}

/** Manifest labels win; a work with no book list is bookless (empty string),
 * following the plain-line / paragraph precedent rather than throwing. */
function bookLabel(bookIndex: number, work: WorkMeta): string {
  return work.books[bookIndex - 1]?.label ?? '';
}

/**
 * "1.5" for a point, "1.5–1.9" for a range. Deliberately does NOT collapse a
 * shared prefix the way Bekker does (1041a6–b3): the components here are
 * unknown tiers from an arbitrary source, and a collapsed "1.5–9" would be
 * ambiguous about which tier the 9 belongs to.
 */
function formatRange(span: RefSpan): string {
  const { start, end } = span;
  if (start.raw === end.raw) return start.raw;
  return `${start.raw}${EN_DASH}${end.raw}`;
}

function formatCitation(span: RefSpan, work: WorkMeta): string {
  return `*${work.title}* ${sourceRefScheme.formatRange(span)}`;
}

export const sourceRefScheme: CitationScheme = {
  id: SCHEME_ID,
  parseAddress,
  compareAddress,
  bookLabel,
  formatRange,
  formatCitation,
  gutter: {
    rowUnit: 'plain-line',
    gutterMode: 'address',
  },
  spineSource: 'document',
};
