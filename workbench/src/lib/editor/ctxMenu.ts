// Context-menu model (refinement pass — the D8 handoff's "clean selection
// menu" item). buildCtxMenu is the ONE place the right-click menu's items,
// wording and grouping are decided: ChapterEditor's template renders
// whatever it returns, and a Record<CtxMenuItemId, handler> maps ids onto
// the existing menu* commands. Pure and node-testable — the per-view menu
// matrix lives in ctxMenu.test.ts as a table, not in template conditionals.
//
// Branching discipline: like viewPolicy.ts, anything scheme-dependent here
// keys on CAPABILITIES (`gutter.rowUnit`) via `switch`, never a scheme id
// (d2 contract, enforced by schemeIdIsolation.test.ts).

import type { CitationScheme } from '../citation/types';

export type CtxMenuItemId =
  | 'line-split'
  | 'line-merge'
  | 'chunk-add'
  | 'chunk-remove'
  | 'para-split'
  | 'para-merge'
  | 'sentence-split'
  | 'sentence-join'
  | 'ai-translate'
  | 'ai-translate-batch'
  | 'ai-reference'
  | 'ai-check'
  | 'ai-ask';

export interface CtxMenuItem {
  id: CtxMenuItemId;
  title: string;
  desc?: string;
}

/** Groups render in order with a divider between consecutive groups (the
 * paraDoc menu has TWO structure groups — paragraph ops, then the sentence
 * fix-up — before the AI group; groups are never pushed empty). */
export interface CtxMenuModel {
  groups: CtxMenuItem[][];
}

export interface CtxMenuInput {
  /** The work's scheme — item sets and labels key on its capabilities. */
  scheme: CitationScheme;
  /** Document-spine paragraph structure ops (absent = not offered). */
  paraDoc?: { canMergePrev: boolean; joinBoundary: number | null };
  /** AI-modes-only menu (English cells, and source cells the corpus owns). */
  aiOnly?: boolean;
  /** Plain-line chunk-grouping toggle state (absent = not offered). */
  chunk?: 'add' | 'remove';
  /** D6: the clicked row is already split → offer the merge. */
  merge: boolean;
  /** Rows a batch translate would act on (≤1 = single-row flow). */
  batchRowCount: number;
  /** Target-unit noun for the cell-scoped AI items (D8 Phase E2). */
  noun?: 'line' | 'paragraph' | 'sentence';
  /** Whole-row unit noun for batch/ask wording. */
  rowNoun?: 'line' | 'paragraph';
  /** Source-language noun for the check desc ('Greek', 'German', …). */
  sourceNoun: string;
}

export function buildCtxMenu(input: CtxMenuInput): CtxMenuModel {
  const groups: CtxMenuItem[][] = [];
  if (input.paraDoc) {
    // Document-spine paragraph rows (D8 §2/§3): row-level paragraph ops
    // first, then the sentence fix-up — the D6 splitOffsets machinery
    // relabelled, since on paragraph rows those boundaries mean SENTENCES —
    // then the AI options (house convention: structure at the top).
    const para: CtxMenuItem[] = [
      {
        id: 'para-split',
        title: 'Split paragraph here',
        desc: 'The clicked word starts a new paragraph — your English stays with this one',
      },
    ];
    if (input.paraDoc.canMergePrev) {
      para.push({
        id: 'para-merge',
        title: 'Merge with previous paragraph',
        desc: 'Joins this paragraph onto the one above',
      });
    }
    const sentence: CtxMenuItem[] = [
      {
        id: 'sentence-split',
        title: 'Start new sentence here',
        desc: 'Fixes the sentence division used by the by-sentence view',
      },
    ];
    if (input.paraDoc.joinBoundary !== null) {
      sentence.push({
        id: 'sentence-join',
        title: 'Join sentences',
        desc: 'Merges this sentence with the previous one',
      });
    }
    groups.push(para, sentence);
  } else if (!input.aiOnly) {
    const structure: CtxMenuItem[] = [];
    if (input.chunk === 'add') {
      // Plain-line document-spine grouping (D8 §5): display metadata only —
      // no line is created, destroyed or edited. Worded as line-level
      // GROUPING so it can't be confused with the D6 within-line split.
      structure.push({
        id: 'chunk-add',
        title: 'Start a new paragraph at this line',
        desc: "Grouping only — the lines and their text don't change",
      });
    } else if (input.chunk === 'remove') {
      structure.push({
        id: 'chunk-remove',
        title: 'Merge into the paragraph above',
        desc: 'Grouping only — rejoins the visual paragraph',
      });
    }
    // The D6 within-line gesture, labelled by what a row's segment
    // boundaries MEAN under this row unit: on paragraph rows (a corpus-spine
    // paragraph work's grid) they are SENTENCES — same wording as the
    // document-spine fix-up above; on line rows they divide the translation
    // into paragraphs mid-line.
    switch (input.scheme.gutter.rowUnit) {
      case 'paragraph':
        if (input.merge) {
          structure.push({
            id: 'line-merge',
            title: 'Join sentences',
            desc: 'Merges this sentence with the previous one',
          });
        } else {
          structure.push({
            id: 'line-split',
            title: 'Start new sentence here',
            desc: 'Fixes the sentence division used by the by-sentence view',
          });
        }
        break;
      default:
        if (input.merge) {
          structure.push({ id: 'line-merge', title: 'Rejoin this split line' });
        } else {
          structure.push({
            id: 'line-split',
            title: 'Split this line at this word',
            desc: 'Your English continues in a new cell',
          });
        }
    }
    groups.push(structure);
  }

  const rowNoun = input.rowNoun ?? 'line';
  const ai: CtxMenuItem[] = [];
  if (input.batchRowCount > 1) {
    ai.push({
      id: 'ai-translate-batch',
      title: `Translate ${input.batchRowCount} ${rowNoun}s with AI`,
      desc: `Fills each selected ${rowNoun}'s English cell (asks before replacing existing text)`,
    });
  } else {
    const noun = input.noun ?? 'line';
    ai.push({
      id: 'ai-translate',
      title: 'Translate with AI',
      desc: `Writes a draft into this ${noun === 'line' ? 'row' : noun}'s English cell`,
    });
  }
  ai.push(
    {
      id: 'ai-reference',
      title: 'AI reference',
      desc: 'A second version in the sidebar — your cell untouched',
    },
    {
      id: 'ai-check',
      title: 'Check my translation',
      desc: `Linguist's check of your English against the ${input.sourceNoun}`,
    },
    {
      id: 'ai-ask',
      title: `Ask AI about this ${rowNoun}…`,
      desc: `Open a Q&A chat about this ${rowNoun}`,
    },
  );
  groups.push(ai);

  return { groups };
}
