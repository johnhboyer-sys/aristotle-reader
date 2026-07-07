// ocr-repair/grade.ts
//
// The grader wrapper: run the FROZEN Goal-B converter over layout text and
// reduce its honesty report to the counters the repair pipeline steers by.
// The converter is the sole quality metric (handoff non-negotiable 2) — this
// module only summarizes and diffs, it never grades on its own terms.
//
// A collapsed-pages result is graded by re-running with pageLevelOnly:true
// (the converter refuses partial output otherwise); the summary records that
// the fallback was needed so stages can't mistake it for a clean pass.

import { convertLayoutExtraction } from '../pdf-import';
import type { ConvertReport, ConvertResult } from '../pdf-import';

export interface GradeSummary {
  /** 'ok' | 'refused' | 'collapsed-fallback' (ok only via pageLevelOnly). */
  status: 'ok' | 'refused' | 'collapsed-fallback';
  refusalReason?: string;
  pages: number;
  ticsEmitted: number;
  ticsSuppressedTotal: number;
  ticsSuppressedByFlag: Record<string, number>;
  droppedLines: number;
  collapsedPages: number;
  displayBlocks: number;
  sideAmbiguous: number;
  seams: number;
  divisions: { books: number; chapters: number; titled: number };
  footnotes: { scope: string; notes: number; markers: number; unmatched: number };
  flags: Record<string, number>;
}

export interface GradeOutcome {
  summary: GradeSummary;
  /** The full converter result for stages that need details (addresses, blocks). */
  result: ConvertResult;
  report?: ConvertReport;
}

export function grade(layoutText: string): GradeOutcome {
  let status: GradeSummary['status'] = 'ok';
  let result = convertLayoutExtraction(layoutText);
  if (!result.ok && 'needsChoice' in result && result.needsChoice) {
    status = 'collapsed-fallback';
    result = convertLayoutExtraction(layoutText, { pageLevelOnly: true });
  }

  if (!result.ok) {
    const reason = 'refused' in result && result.refused ? result.reason : 'needs-choice persisted';
    return {
      summary: {
        status: 'refused',
        refusalReason: reason,
        pages: 'scanned' in result ? result.scanned.pages : 0,
        ticsEmitted: 0,
        ticsSuppressedTotal: 0,
        ticsSuppressedByFlag: {},
        droppedLines: 0,
        collapsedPages: 0,
        displayBlocks: 0,
        sideAmbiguous: 0,
        seams: 0,
        divisions: { books: 0, chapters: 0, titled: 0 },
        footnotes: { scope: 'none', notes: 0, markers: 0, unmatched: 0 },
        flags: {},
      },
      result,
    };
  }

  const report = result.report;
  const byFlag: Record<string, number> = {};
  let suppressed = 0;
  for (const { flag, count } of report.ticsSuppressed) {
    byFlag[flag] = (byFlag[flag] ?? 0) + count;
    suppressed += count;
  }
  return {
    summary: {
      status,
      pages: report.pages,
      ticsEmitted: report.ticsEmitted,
      ticsSuppressedTotal: suppressed,
      ticsSuppressedByFlag: byFlag,
      droppedLines: report.droppedLines.length,
      collapsedPages: report.collapsedPages.length,
      displayBlocks: report.displayBlocks.length,
      sideAmbiguous: report.flags['side-ambiguous'] ?? 0,
      seams: report.seams.length,
      divisions: report.divisions,
      footnotes: { ...report.footnotes, unmatched: report.footnotes.unmatched.length },
      flags: report.flags,
    },
    result,
    report,
  };
}

const KEY_COUNTERS: [string, (s: GradeSummary) => number | string][] = [
  ['status', (s) => s.status],
  ['pages', (s) => s.pages],
  ['ticsEmitted', (s) => s.ticsEmitted],
  ['ticsSuppressed', (s) => s.ticsSuppressedTotal],
  ['droppedLines', (s) => s.droppedLines],
  ['collapsedPages', (s) => s.collapsedPages],
  ['displayBlocks', (s) => s.displayBlocks],
  ['sideAmbiguous', (s) => s.sideAmbiguous],
  ['seams', (s) => s.seams],
  ['books', (s) => s.divisions.books],
  ['chapters', (s) => s.divisions.chapters],
  ['fnNotes', (s) => s.footnotes.notes],
  ['fnUnmatched', (s) => s.footnotes.unmatched],
];

export function formatSummary(s: GradeSummary): string {
  const lines = KEY_COUNTERS.map(([name, get]) => `  ${name.padEnd(16)} ${get(s)}`);
  if (s.refusalReason) lines.push(`  refusal: ${s.refusalReason}`);
  return lines.join('\n');
}

/** One line per counter that moved; empty string when nothing changed. */
export function diffSummaries(before: GradeSummary, after: GradeSummary): string {
  const moved: string[] = [];
  for (const [name, get] of KEY_COUNTERS) {
    const a = get(before);
    const b = get(after);
    if (a !== b) moved.push(`  ${name.padEnd(16)} ${a} -> ${b}`);
  }
  return moved.join('\n');
}
