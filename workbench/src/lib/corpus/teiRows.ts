/**
 * TEI → rows: turn a TEI document into (source citation, text) rows plus the
 * names of the citation tiers it declares.
 *
 * Serves BOTH source importers, because both hand us TEI: Diogenes' exporter
 * writes it from a TLG/PHI disc, and Perseus publishes it directly. The
 * difference between them is vocabulary, not structure — Diogenes nests
 * `<div type="Stephanus-page" n="327">` inside which `<l n="1">` are lines,
 * while older Perseus files use `<div1 type="book" n="1">`. Both reduce to
 * "some nested divisions, each with a name and a number, containing lines".
 *
 * The address of a row is its enclosing division numbers plus its own,
 * joined with "." — Republic 327 § a line 1 becomes "327.a.1". Deliberately
 * NOT the conventional "327a1": that runs three separate tiers together, and
 * nothing downstream could take them apart again for a text whose tiers we
 * don't know in advance. The tier NAMES travel separately (see `levelNames`)
 * so the work can still say what "327" means.
 *
 * Verified against real exports of Aristotle (Bekker pages) and Plato
 * (Stephanus pages with lettered sections, and Books of epigrams) — see
 * __tests__/teiRows.test.ts.
 */

import { XMLParser } from 'fast-xml-parser';
import type { XmlNode } from './xmlnode';
import { isTextNode, tagName, attrs } from './xmlnode';
import type { SourceRow } from '../import/createSourceImport';

/** Elements that carry one row of text. */
const ROW_TAGS = new Set(['l', 'p']);

/** Elements that mark a citation tier. `div1`…`div7` are the older Perseus
 * numbered form; `div` with a `type` is the modern (and Diogenes) form. */
const DIV_RE = /^div[1-7]?$/;

/**
 * Divs that wrap a whole text rather than divide one. A CTS file opens with
 * `<div type="edition" n="urn:cts:greekLit:tlg0059.tlg030.perseus-grc2">`, and
 * that `@n` is the urn — treating it as a citation tier prefixed the urn onto
 * every address in the work and made the whole import unusable.
 */
const WRAPPER_DIV_TYPES = new Set(['edition', 'translation', 'commentary']);

/**
 * `type="textpart"` says only "this is a division"; the tier's real name is in
 * `@subtype` (`book`, `section`, `chapter`). Without this every tier of every
 * modern Perseus file is called "textpart".
 */
const UNINFORMATIVE_DIV_TYPES = new Set(['textpart']);

/** Elements whose text is not part of the reading text. */
const SKIPPED_TAGS = new Set(['note', 'teiHeader', 'front', 'back', 'bibl', 'ref', 'milestone', 'pb', 'cb', 'gap']);

/**
 * `<milestone unit="…" n="…"/>` marks a citation boundary that falls INSIDE a
 * paragraph, and on Perseus prose it is the only place the real citation
 * appears. The Republic's divisions go no finer than a Stephanus page, so
 * without this a row is a whole page — two thousand characters — and 327a,
 * 327b, 327c are thrown away. Splitting there gives one row per section, which
 * is the unit the text is actually cited by.
 *
 * Diogenes exports carry no milestones (its divisions and `<l n="…">` already
 * reach line level), so nothing here changes the disc route.
 */
const MILESTONE_TAG = 'milestone';

/** Milestone units that mark layout, not citation — they carry no `@n` anyway
 * on the files seen, but naming them documents the intent. */
const NON_CITATION_UNITS = new Set(['para', 'card']);

/** The unit an absolute reference system is rooted at — see addressFor. */
const PAGE_UNIT = 'page';

export interface TeiDocument {
  /** From the TEI header, when it declares one. */
  title?: string;
  author?: string;
  /** Tier names outermost first, e.g. ["Stephanus-page", "section", "line"]. */
  levelNames: string[];
  rows: SourceRow[];
}

/** One open citation tier while walking. */
interface Tier {
  name: string;
  n: string;
}

export function parseTeiRows(xml: string): TeiDocument {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: false,
    // Diogenes writes Greek as entities in places; the parser handles the
    // standard five and numeric refs, which is all TEI uses.
    processEntities: true,
  });
  const tree = parser.parse(xml) as XmlNode[];

  const rows: SourceRow[] = [];
  /**
   * Milestones open at this point in the document, keyed by unit.
   *
   * Document-level on purpose: a milestone is a point in the text, not a
   * property of the element it happens to sit in, so a Bekker page opened in
   * one section is still the page in the next. Scoping this per row is what
   * made the Nicomachean Ethics come out as "1094a.1" for four rows and then
   * "1.2", "1.20", "1.2.1094b" — the page forgotten at every section boundary.
   */
  const carried = new Map<string, string>();
  /** The tiers each row's address used, kept so the tier NAMES can be worked
   * out once every row is in — see levelNamesFor. */
  const rowParts: Tier[][] = [];

  const emit = (parts: Tier[], text: string): void => {
    if (text.length === 0) return;
    rowParts.push(parts);
    rows.push({ ref: parts.map((p) => p.n).join('.'), text });
  };

  const walk = (nodes: XmlNode[], open: Tier[]): void => {
    for (const node of nodes) {
      if (isTextNode(node)) continue;
      const tag = tagName(node);
      if (tag === null || SKIPPED_TAGS.has(tag)) continue;
      const children = (node as Record<string, XmlNode[]>)[tag] ?? [];
      const a = attrs(node);

      if (DIV_RE.test(tag)) {
        // A div with no @n is a structural wrapper (a whole work, a
        // section grouping), not a citation tier — descend without opening one.
        // So is a CTS edition/translation div, whose @n is the urn.
        const n = a['n'];
        const type = a['type'];
        if (n === undefined || (type !== undefined && WRAPPER_DIV_TYPES.has(type))) {
          walk(children, open);
          continue;
        }
        const name =
          type === undefined || UNINFORMATIVE_DIV_TYPES.has(type)
            ? (a['subtype'] ?? type ?? tag)
            : type;
        walk(children, [...open, { name, n }]);
        continue;
      }

      if (ROW_TAGS.has(tag)) {
        const n = a['n'];
        // A row's own number is the innermost tier. Rows without one (an
        // unnumbered paragraph) still get an address from their enclosing
        // divisions — losing the row would be worse than a repeated address.
        const base = n === undefined ? open : [...open, { name: 'line', n }];
        for (const segment of splitAtMilestones(children, base, carried)) {
          emit(segment.parts, segment.text);
        }
        continue;
      }

      walk(children, open);
    }
  };

  walk(tree, []);

  const levelNames = levelNamesFor(rowParts);

  return {
    ...headerMeta(tree),
    levelNames,
    rows,
  };
}

/**
 * Name the work's tiers from the addresses its rows actually came out with.
 *
 * Not simply "first name seen at each depth": a stray row can collapse to a
 * different shape from the rest (a section milestone that repeats its page,
 * against one that doesn't), and reading names off those gave the Republic
 * four tier names for a two-part address. The shape most rows share is the
 * work's real shape, so the names come from a row having that shape.
 *
 * Every name here belongs to a tier some row used, which is also what stops a
 * prose work claiming a "line" tier it has no line numbers for.
 */
function levelNamesFor(rowParts: Tier[][]): string[] {
  if (rowParts.length === 0) return [];
  const counts = new Map<number, number>();
  for (const parts of rowParts) counts.set(parts.length, (counts.get(parts.length) ?? 0) + 1);
  let modal = 0;
  let best = -1;
  for (const [length, count] of counts) {
    if (count > best) {
      best = count;
      modal = length;
    }
  }
  return (rowParts.find((parts) => parts.length === modal) ?? []).map((p) => p.name);
}

interface Segment {
  parts: Tier[];
  text: string;
}

/**
 * Cut a row's contents into segments at the citation milestones inside it.
 *
 * A milestone sets the value of its own tier (keyed by `@unit`) and everything
 * after it belongs to that tier until the next milestone of the same unit. The
 * text before the first milestone keeps the row's own address.
 *
 * The milestones RESTATE the enclosing citation rather than extending it — the
 * Republic nests `<milestone unit="section" n="327a"/>` inside a division
 * already numbered 327 — so a component that merely leads up to the next one
 * is dropped: 1 · 327 · 327 · 327a becomes 1.327a. That collapse applies only
 * to rows that carry milestones, because an ordinary `<l n="1">` in book 1 is
 * genuinely 1.1 and must not lose its book.
 */
function splitAtMilestones(children: XmlNode[], base: Tier[], open: Map<string, string>): Segment[] {
  const segments: Segment[] = [];
  let buffer: string[] = [];

  const flush = (): void => {
    const text = buffer.join('').replace(/\s+/g, ' ').trim();
    buffer = [];
    if (text.length === 0) return;
    segments.push({ parts: addressFor(base, open), text });
  };

  const visit = (nodes: XmlNode[]): void => {
    for (const node of nodes) {
      if (isTextNode(node)) {
        buffer.push(node['#text']);
        continue;
      }
      const tag = tagName(node);
      if (tag === null) continue;
      if (tag === MILESTONE_TAG) {
        const a = attrs(node);
        const unit = a['unit'];
        const n = a['n'];
        if (n === undefined || unit === undefined || NON_CITATION_UNITS.has(unit)) continue;
        flush();
        open.set(unit, n);
        continue;
      }
      if (SKIPPED_TAGS.has(tag)) continue;
      visit((node as Record<string, XmlNode[]>)[tag] ?? []);
    }
  };

  visit(children);
  flush();
  return segments;
}

/**
 * The address of one segment: the divisions it sits in, plus whatever
 * milestones are open.
 *
 * A milestone whose unit NAMES one of those divisions refines it — Plato's
 * `<milestone unit="section" n="327a"/>` inside a division numbered 327 is
 * still the section, said more precisely — and the whole address stands.
 *
 * A PAGE with something finer under it is a different animal: another
 * authority's reference system laid over this edition, and an absolute one. A
 * Bekker page needs no book to be found, so where an edition prints
 * `<milestone unit="page" resp="Bekker" n="1094a"/>` and lines beneath it, the
 * page and its line ARE the citation — "1094a.1", the number every reader of
 * Aristotle cites and the one this edition otherwise loses. A page on its own
 * is not enough (Plato marks the Stephanus page as well as its section), since
 * every row of that page would answer to the same address.
 */
function addressFor(base: Tier[], open: Map<string, string>): Tier[] {
  if (open.size === 0) return base;
  const milestones = [...open].map(([name, n]) => ({ name, n }));
  const foreign = milestones.filter((tier) => !base.some((b) => b.name === tier.name));
  if (foreign.length > 1 && foreign.some((tier) => tier.name === PAGE_UNIT)) return foreign;
  return collapsePrefixes([...base, ...milestones]);
}

/**
 * Drop each component that the following one already spells out — "327" before
 * "327a", or a plain repeat. Leaves anything else alone: "1a" before "1" is two
 * real tiers (Bekker page, then line) and both stay.
 */
function collapsePrefixes(parts: Tier[]): Tier[] {
  return parts.filter((part, i) => {
    const next = parts[i + 1];
    return next === undefined || !next.n.startsWith(part.n);
  });
}

/**
 * All text under a node, tags flattened, whitespace collapsed. Keeps the text
 * of display elements (`<hi>`, `<label>`) because on these exports that is
 * where a work's own headings live — dropping them would silently lose the
 * title lines of every book.
 */
function flattenText(nodes: XmlNode[]): string {
  const parts: string[] = [];
  const visit = (list: XmlNode[]): void => {
    for (const node of list) {
      if (isTextNode(node)) {
        parts.push(node['#text']);
        continue;
      }
      const tag = tagName(node);
      if (tag === null || SKIPPED_TAGS.has(tag)) continue;
      visit((node as Record<string, XmlNode[]>)[tag] ?? []);
    }
  };
  visit(nodes);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/** Title and author from the TEI header, when it has them. */
function headerMeta(tree: XmlNode[]): { title?: string; author?: string } {
  const found: { title?: string; author?: string } = {};
  const visit = (nodes: XmlNode[]): void => {
    for (const node of nodes) {
      if (isTextNode(node)) continue;
      const tag = tagName(node);
      if (tag === null) continue;
      const children = (node as Record<string, XmlNode[]>)[tag] ?? [];
      // Only the FIRST of each wins: a TEI header carries several titles
      // (the work's, the edition's, the digitiser's) and the first is the work's.
      if (tag === 'title' && found.title === undefined) found.title = flattenText(children);
      else if (tag === 'author' && found.author === undefined) found.author = flattenText(children);
      else visit(children);
    }
  };
  visit(tree);
  return {
    ...(found.title ? { title: found.title } : {}),
    ...(found.author ? { author: found.author } : {}),
  };
}
