/**
 * Export module entry point. The UI toolbar action (wired later by the
 * orchestrator) should call `exportChapterToDocx` and nothing else from
 * here — everything below it (pandocMarkdown.ts, pandoc.ts) is
 * implementation detail.
 */

import { chapterToPandocMarkdown } from './pandocMarkdown';
import type { PandocMarkdownOptions } from './pandocMarkdown';
import { pandocAvailable, pandocDocxArgs, runPandocNode, PANDOC_UNAVAILABLE_MESSAGE } from './pandoc';
import type { PandocDocxJob, RunResult } from './pandoc';
import type { ChapterFile } from '../chapterfile/types';
import type { WorkMeta } from '../citation/types';

export type { StampMode, PandocMarkdownOptions } from './pandocMarkdown';
export { chapterToPandocMarkdown, markupToPandoc, deriveRowAddresses } from './pandocMarkdown';
export { pandocAvailable, pandocDocxArgs, runPandocNode, runPandocTauri, PANDOC_UNAVAILABLE_MESSAGE, NATIVE_FOOTNOTES_NOTES } from './pandoc';
export type { PandocDocxJob, RunResult } from './pandoc';

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
