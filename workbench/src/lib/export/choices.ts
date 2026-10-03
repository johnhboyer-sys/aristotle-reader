/**
 * choices.ts — the export choices both export paths share (translation only or
 * bilingual, layout, order), seeded from Settings › Export, and the rule for
 * when the whole-work window closes itself. Pure; the dialogs do the I/O.
 */

import type { ExportSettings } from '../settings';
import type { CompileMode } from './compile';
import type { BilingualLayout, BilingualOrder, StampMode } from './pandocMarkdown';

export interface ExportChoices {
  mode: CompileMode;
  bilingualLayout: BilingualLayout;
  bilingualOrder: BilingualOrder;
  stampMode: StampMode | undefined;
}

/**
 * With no configured layout, seed the one the work's rendering path has always
 * used, so an unset setting exports exactly as it did before: block for a
 * corpus (Bekker) work, alternating for a document spine.
 */
export function seedChoices(prefs: ExportSettings, spine: 'corpus' | 'document'): ExportChoices {
  return {
    mode: prefs.mode ?? 'english',
    bilingualLayout: prefs.bilingualLayout ?? (spine === 'document' ? 'alternating' : 'block'),
    bilingualOrder: prefs.bilingualOrder ?? 'original-first',
    stampMode: prefs.stampMode,
  };
}

/** What the window says when an export succeeds, and whether it then closes. A note beyond "Exported." stays up so the user can read it. */
export function exportFinish(referenceNote?: string): { note: string; close: boolean } {
  return referenceNote
    ? { note: `Exported. ${referenceNote}`, close: false }
    : { note: 'Exported.', close: true };
}
