/**
 * Export module entry point. The UI toolbar action (wired later by the
 * orchestrator) should call `exportChapterToDocx` (single chapter) or
 * `exportWorkToDocx` (whole-work compile) and nothing else from here —
 * everything below it (pandocMarkdown.ts, compile.ts, pandoc.ts) is
 * implementation detail.
 */

import { chapterToPandocMarkdown } from './pandocMarkdown';
import type { PandocMarkdownOptions } from './pandocMarkdown';
import { compileWorkMarkdown } from './compile';
import type { CompileOptions, CompileWorkResult } from './compile';
import { pandocAvailable, pandocDocxArgs, runPandocNode, PANDOC_UNAVAILABLE_MESSAGE } from './pandoc';
import type { PandocDocxJob, RunResult } from './pandoc';
import type { ChapterFile } from '../chapterfile/types';
import type { WorkMeta } from '../citation/types';

export type { StampMode, PandocMarkdownOptions } from './pandocMarkdown';
export { chapterToPandocMarkdown, markupToPandoc, deriveRowAddresses } from './pandocMarkdown';
export { pandocAvailable, pandocDocxArgs, runPandocNode, runPandocTauri, PANDOC_UNAVAILABLE_MESSAGE, NATIVE_FOOTNOTES_NOTES } from './pandoc';
export type { PandocDocxJob, RunResult } from './pandoc';
export {
  compileWorkMarkdown,
  sortChaptersManifestOrder,
  buildGapReport,
} from './compile';
export type {
  CompileMode,
  CompileOptions,
  CompileWorkResult,
  CompileGapReport,
  CompiledChapterRef,
} from './compile';

export interface ExportChapterToDocxOptions extends PandocMarkdownOptions {
  /** Where to write the intermediate .md (caller's choice — e.g. a temp/app-data path). */
  markdownPath: string;
  /** Where pandoc should write the resulting .docx. */
  docxPath: string;
  /** Optional reference .docx for styling (does not change footnote nativity — see pandoc.ts). */
  referenceDocPath?: string;
  /** Node-side file writer, injected so this module has no direct fs dependency (Tauri uses plugin-fs; the harness uses node:fs). */
  writeFile: (path: string, contents: string) => Promise<void>;
  /** pandoc binary name/path override, default 'pandoc'. */
  pandocBin?: string;
}

export interface ExportChapterToDocxResult {
  ok: boolean;
  /** Plain-language message on failure (pandoc missing, or pandoc's own stderr). */
  message?: string;
  markdownPath: string;
  docxPath: string;
  run?: RunResult;
}

/**
 * The single entry point the UI wires up: parsed chapter + work metadata in,
 * a .docx with native Word footnotes out. Pure orchestration — the actual
 * transform is chapterToPandocMarkdown, the actual subprocess is
 * runPandocNode/runPandocTauri (this function uses the Node runner; a
 * Tauri-hosted caller can instead call chapterToPandocMarkdown +
 * runPandocTauri directly if it needs plugin-fs instead of node:fs).
 */
export async function exportChapterToDocx(
  chapter: ChapterFile,
  work: WorkMeta,
  options: ExportChapterToDocxOptions,
): Promise<ExportChapterToDocxResult> {
  const pandocBin = options.pandocBin ?? 'pandoc';
  const available = await pandocAvailable(pandocBin);
  if (!available) {
    return {
      ok: false,
      message: PANDOC_UNAVAILABLE_MESSAGE,
      markdownPath: options.markdownPath,
      docxPath: options.docxPath,
    };
  }

  const markdown = chapterToPandocMarkdown(chapter, work, { stampMode: options.stampMode });
  await options.writeFile(options.markdownPath, markdown);

  const job: PandocDocxJob = {
    markdownPath: options.markdownPath,
    docxPath: options.docxPath,
    referenceDocPath: options.referenceDocPath,
  };
  const run = await runPandocNode(job, pandocBin);
  if (run.code !== 0) {
    return {
      ok: false,
      message: run.stderr.trim() || `pandoc exited with code ${run.code}`,
      markdownPath: options.markdownPath,
      docxPath: options.docxPath,
      run,
    };
  }
  return { ok: true, markdownPath: options.markdownPath, docxPath: options.docxPath, run };
}

// ── whole-work compile export (build spec §8, Phase 2) ─────────────────────

export interface ExportWorkToDocxOptions extends CompileOptions {
  markdownPath: string;
  docxPath: string;
  referenceDocPath?: string;
  writeFile: (path: string, contents: string) => Promise<void>;
  pandocBin?: string;
}

export interface ExportWorkToDocxResult {
  ok: boolean;
  message?: string;
  markdownPath: string;
  docxPath: string;
  run?: RunResult;
  /** Present even on pandoc failure, so a caller can still show the gap notice. */
  gapReport: CompileWorkResult['gapReport'];
  included: CompileWorkResult['included'];
}

/**
 * Compile every given (already-parsed) chapter of a work into ONE .docx —
 * headings, running Bekker stamps, and continuously-renumbered native Word
 * footnotes across chapter boundaries (see compile.ts's header for why
 * per-chapter footnote-id namespacing is sufficient: Word auto-numbers
 * sequentially within a single-section document regardless of the
 * underlying ids). `chapters` may be given in any order; compileWorkMarkdown
 * sorts them into manifest order internally. An empty `chapters` list is a
 * plain-language failure (nothing to export), not a pandoc invocation.
 */
export async function exportWorkToDocx(
  chapters: ChapterFile[],
  work: WorkMeta,
  options: ExportWorkToDocxOptions,
): Promise<ExportWorkToDocxResult> {
  const compiled = compileWorkMarkdown(chapters, work, { stampMode: options.stampMode, mode: options.mode });
  const empty = { gapReport: compiled.gapReport, included: compiled.included };

  if (compiled.included.length === 0) {
    return {
      ok: false,
      message: 'This work has no saved chapters yet — nothing to export.',
      markdownPath: options.markdownPath,
      docxPath: options.docxPath,
      ...empty,
    };
  }

  const pandocBin = options.pandocBin ?? 'pandoc';
  const available = await pandocAvailable(pandocBin);
  if (!available) {
    return {
      ok: false,
      message: PANDOC_UNAVAILABLE_MESSAGE,
      markdownPath: options.markdownPath,
      docxPath: options.docxPath,
      ...empty,
    };
  }

  await options.writeFile(options.markdownPath, compiled.markdown);

  const job: PandocDocxJob = {
    markdownPath: options.markdownPath,
    docxPath: options.docxPath,
    referenceDocPath: options.referenceDocPath,
  };
  const run = await runPandocNode(job, pandocBin);
  if (run.code !== 0) {
    return {
      ok: false,
      message: run.stderr.trim() || `pandoc exited with code ${run.code}`,
      markdownPath: options.markdownPath,
      docxPath: options.docxPath,
      run,
      ...empty,
    };
  }
  return {
    ok: true,
    markdownPath: options.markdownPath,
    docxPath: options.docxPath,
    run,
    ...empty,
  };
}

// ── filename helpers (build spec §8) ────────────────────────────────────────

const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/** Strip characters that are illegal in filenames on any of macOS/Windows/Linux; collapse whitespace runs. Does not truncate length (callers that need a length cap can do it after). */
export function sanitizeFilenameComponent(text: string): string {
  return text.replace(UNSAFE_FILENAME_CHARS, '').replace(/\s+/g, ' ').trim();
}

/**
 * Default filename for a whole-work compile export, e.g.
 * "Metaphysics — Aristotle (translation).docx" (English mode) or
 * "Metaphysics — Aristotle (Greek and translation).docx" (bilingual mode).
 */
export function compileDefaultFilename(work: WorkMeta, mode: CompileOptions['mode']): string {
  const suffix = mode === 'bilingual' ? 'Greek and translation' : 'translation';
  const base = `${work.title} — ${work.author} (${suffix})`;
  return `${sanitizeFilenameComponent(base)}.docx`;
}
