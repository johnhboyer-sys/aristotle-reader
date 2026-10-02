/**
 * pandoc.ts — command construction (as data) + the Node-side runner
 * (child_process, used by the export harness / tests). The app does not run
 * pandoc from the window: Rust builds the same argv (`pandoc_docx_args` in
 * src-tauri/src/jobs.rs, pinned to this one by a test) and runs it — see
 * tauriExport.ts.
 */

/** Plain-language message shown when pandoc isn't on PATH / isn't installed. */
export const PANDOC_UNAVAILABLE_MESSAGE =
  'Export needs Pandoc installed on this computer — get it from pandoc.org (or run `brew install pandoc`), then try again.';

export interface PandocDocxJob {
  /** Absolute (or cwd-relative) path to write the intermediate Markdown to. */
  markdownPath: string;
  /** Absolute (or cwd-relative) path to write the resulting .docx to. */
  docxPath: string;
  /** Optional reference .docx to base styles on (see NATIVE_FOOTNOTES_NOTES). */
  referenceDocPath?: string;
}

/**
 * The pandoc argv for "Markdown -> docx with native Word footnotes", as pure
 * data. Pandoc converts `[^id]: body` footnote blocks to REAL
 * `<w:footnote>` objects in `word/footnotes.xml` with `w:footnoteReference`
 * runs in the body by default — no extra flag is required to get native
 * footnotes (this is pandoc's normal docx writer behavior, not an opt-in).
 * `--reference-doc` is accepted as an optional styling base and does not
 * change the footnote mechanism; see NATIVE_FOOTNOTES_NOTES.
 */
export function pandocDocxArgs(job: PandocDocxJob): string[] {
  const args = ['-f', 'markdown', '-t', 'docx', '-o', job.docxPath];
  if (job.referenceDocPath) args.push('--reference-doc', job.referenceDocPath);
  args.push(job.markdownPath);
  return args;
}

export const NATIVE_FOOTNOTES_NOTES =
  'Pandoc\'s docx writer always emits native Word footnote objects (word/footnotes.xml + ' +
  'w:footnoteReference runs) for `[^id]: body` blocks — this is default behavior, not a flag. ' +
  'If a future pandoc version or a custom writer ever regresses to endnote-style anchors, the ' +
  'fix is a reference .docx (via --reference-doc) whose styles.xml pins the FootnoteReference/ ' +
  'FootnoteText styles; pandocDocxArgs already threads referenceDocPath through for that fallback.';

// ── Node-side runner (used by the harness, and by any Node-hosted tooling) ──
//
// This package's tsconfig (workbench/tsconfig.json) is frontend-only —
// `types: ["vite/client", "svelte"]`, no @types/node — because the app is a
// Vite/Tauri frontend. This module IS meant to run under Node (the export
// harness, and any future Node-hosted tooling), so it reaches for
// node:child_process dynamically, typed through a minimal local structural
// shim instead of @types/node (out of scope to add here — not this
// deliverable's dependency to introduce). `unknown`-import + local
// interfaces keep tsc clean under the existing tsconfig while the harness
// (plain .mjs, untyped) exercises the real Node module end to end.

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface NodeReadable {
  on(event: 'data', listener: (chunk: { toString(encoding?: string): string }) => void): void;
}
interface NodeChildProcess {
  stdout: NodeReadable;
  stderr: NodeReadable;
  on(event: 'error', listener: (err: Error) => void): void;
  on(event: 'close', listener: (code: number | null) => void): void;
}
interface NodeChildProcessModule {
  spawn(command: string, args: string[], options?: { stdio?: unknown }): NodeChildProcess;
}

async function importChildProcess(): Promise<NodeChildProcessModule> {
  const specifier = 'node:child_process';
  return (await import(/* @vite-ignore */ specifier)) as unknown as NodeChildProcessModule;
}

/**
 * Run pandoc via node:child_process. Dynamic import of `node:child_process`
 * keeps this module importable from a Vite/browser bundle (it's only
 * actually called from Node contexts: the harness, or tests).
 */
export async function runPandocNode(job: PandocDocxJob, pandocBin = 'pandoc'): Promise<RunResult> {
  const { spawn } = await importChildProcess();
  const args = pandocDocxArgs(job);
  return new Promise((resolve, reject) => {
    const child = spawn(pandocBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** True if `pandoc --version` succeeds (Node-side check). */
export async function pandocAvailable(pandocBin = 'pandoc'): Promise<boolean> {
  const { spawn } = await importChildProcess();
  return new Promise((resolve) => {
    try {
      const child = spawn(pandocBin, ['--version'], { stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}
