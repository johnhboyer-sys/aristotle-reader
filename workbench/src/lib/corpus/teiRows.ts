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

/** Elements whose text is not part of the reading text. */
const SKIPPED_TAGS = new Set(['note', 'teiHeader', 'front', 'back', 'bibl', 'ref', 'milestone', 'pb', 'cb', 'gap']);

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
  /** Tier name seen at each depth; first one wins (a work is consistent). */
  const levelsByDepth: string[] = [];
  let rowTagSeen = false;

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
        const n = a['n'];
        if (n === undefined) {
          walk(children, open);
          continue;
        }
        const name = a['type'] ?? a['subtype'] ?? tag;
        const depth = open.length;
        if (levelsByDepth[depth] === undefined) levelsByDepth[depth] = name;
        walk(children, [...open, { name, n }]);
        continue;
      }

      if (ROW_TAGS.has(tag)) {
        rowTagSeen = true;
        const n = a['n'];
        // A row's own number is the innermost tier. Rows without one (an
        // unnumbered paragraph) still get an address from their enclosing
        // divisions — losing the row would be worse than a repeated address.
        const parts = [...open.map((t) => t.n), ...(n === undefined ? [] : [n])];
        rows.push({ ref: parts.join('.'), text: flattenText(children) });
        continue;
      }

      walk(children, open);
    }
  };

  walk(tree, []);

  const levelNames = [...levelsByDepth.filter((n) => n !== undefined)];
  if (rowTagSeen) levelNames.push('line');

  return {
    ...headerMeta(tree),
    levelNames,
    rows,
  };
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
