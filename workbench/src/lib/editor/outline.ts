/**
 * Heading outline for document-spine works (D8 heading tools): the rail's
 * table-of-contents of the heading rows, LABELED BY THEIR TRANSLATION. Pure
 * derivation from the model rows so it is unit-testable and callers can
 * recompute it whenever heading levels change or a heading's English commits.
 */

import type { RowModel } from './model';
import { docFromJSON } from './schema';
import { navRoleOf } from '../works/profile';
import type { NavRole, WorkProfile } from '../works/profile';

export interface OutlineItem {
  /** 1-based? No — the MODEL row index (0-based), matching model.rows. */
  rowIndex: number;
  /** 1-based heading level (rank into the work's profile); 1 = top tier. */
  level: number;
  /** The tier's navigation role, resolved from the work profile at build time. */
  navRole: NavRole;
  /** Translation of the heading if present, else the original-language text. */
  label: string;
}

/** A node in the nested navigation tree (buildOutlineTree). */
export interface OutlineNode {
  item: OutlineItem;
  children: OutlineNode[];
}

/** Plain text (no markup) of a JSON doc, empty on any failure. */
function plainText(doc: RowModel['english'] | undefined): string {
  if (!doc) return '';
  try {
    return docFromJSON(doc).textContent.trim();
  } catch {
    return '';
  }
}

/**
 * A heading's translation text. A paragraph-unit doc (e.g. the Summa) commits
 * translations to the PARAGRAPH layer (englishPara); a line/sentence doc to the
 * sentence layer (english). Prefer whichever layer carries text so the rail
 * label populates regardless of the work's granularity.
 */
function englishText(row: RowModel): string {
  return plainText(row.englishPara) || plainText(row.english);
}

/**
 * Build the outline: one entry per heading row, in document order. The label is
 * the row's English translation, falling back to the original-language text so
 * an untranslated heading is never blank.
 */
export function buildOutline(rows: RowModel[], profile: WorkProfile): OutlineItem[] {
  const items: OutlineItem[] = [];
  rows.forEach((row, i) => {
    if (!row.headingLevel) return;
    const en = englishText(row);
    const label = en.length > 0 ? en : row.greek.trim();
    items.push({
      rowIndex: i,
      level: row.headingLevel,
      navRole: navRoleOf(profile, row.headingLevel),
      label,
    });
  });
  return items;
}

/** Nav-role → coarse nesting rank; the profile level breaks ties within a role. */
const NAV_RANK: Record<NavRole, number> = { book: 0, chapter: 1, heading: 2 };

/**
 * Nesting depth of an outline item. Nav-role dominates (a Book always contains a
 * Chapter contains a heading, whatever the raw levels), and the 1-based profile
 * level breaks ties — so a deeper heading tier nests under a shallower one, and
 * two rows at the same tier are siblings. (MAX_LEVELS ≪ 100, so nav-role wins.)
 */
function nodeDepth(item: OutlineItem): number {
  return NAV_RANK[item.navRole] * 100 + item.level;
}

/**
 * Group a flat outline (document order) into a nested tree by nav-role/level.
 * Books contain everything until the next Book; Chapters likewise within a Book;
 * headings nest under the nearest Chapter/Book (or at the root when none
 * precedes them). Pure — the rail renders it, and it is the correctness core.
 */
export function buildOutlineTree(items: OutlineItem[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: { node: OutlineNode; depth: number }[] = [];
  for (const item of items) {
    const depth = nodeDepth(item);
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    const node: OutlineNode = { item, children: [] };
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].node.children.push(node);
    stack.push({ node, depth });
  }
  return roots;
}
