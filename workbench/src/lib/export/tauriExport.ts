/**
 * tauriExport.ts — the Tauri-side glue both export actions share:
 * ExportButton.svelte (single chapter) and CompileDialog.svelte (whole work).
 * Before the export settings existed, each of them inlined its own copy of the
 * pandoc probe, its own reference-doc lookup, and its own save-dialog call,
 * with the stamp mode hardcoded. Everything here is what those two now agree
 * on, so a setting is honoured identically by both.
 *
 * Nothing in this module may be reached in the browser harness — both callers
 * are already gated on isTauri().
 *
 * Every failure is one plain sentence for the UI; stderr and exit codes go to
 * the console only (the export deliverable's degraded-state rule).
 */

import { pandocDocxArgs, PANDOC_UNAVAILABLE_MESSAGE, resolvePandocProgramByRun } from './pandoc';
import type { PandocDocxJob, RunResult } from './pandoc';
import { loadSettings } from '../settings';
import type { ExportSettings } from '../settings';

/** Plain-language message when the user's OWN configured pandoc won't run. */
export const PANDOC_CONFIGURED_UNAVAILABLE_MESSAGE =
  "The Pandoc you chose in Settings couldn't be run — check the path in Settings › Export, or clear it to use the one installed on this computer.";

/** How long a conversion may take before the child is killed. */
const CONVERT_TIMEOUT_MS = 120_000;
/** How long the `--version` probe of a configured binary may take. */
const PROBE_TIMEOUT_MS = 10_000;

/** Runs one pandoc job. */
export type PandocRun = (job: PandocDocxJob) => Promise<RunResult>;

/** Either a usable runner, or the plain sentence explaining why there isn't one. */
export type PandocResolution = { run: PandocRun } | { message: string };

/** The `run_program` command's result (src-tauri/src/assist.rs). */
interface RunOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
  spawned: boolean;
}

/**
 * Resolve how to run pandoc.
 *
 * A configured `pandocPath` runs through the app-owned `run_program` command
 * rather than the shell plugin, because the shell capability pins three FIXED
 * pandoc locations by scope name (src-tauri/capabilities/default.json) and
 * cannot spawn an arbitrary path. `run_program` takes the same trust boundary
 * as the AI-assist runner: an absolute executable the user picked themselves,
 * under execve with an argv array, no shell.
 *
 * A configured path that won't run is NOT silently replaced by the probed one —
 * that would export through a pandoc the user didn't choose and never say so.
 * It fails with its own sentence instead.
 */
export async function resolveExportPandoc(configuredPath?: string): Promise<PandocResolution> {
  const { invoke } = await import('@tauri-apps/api/core');

  if (configuredPath) {
    const probe = (await invoke('run_program', {
      binPath: configuredPath,
      args: ['--version'],
      timeoutMs: PROBE_TIMEOUT_MS,
    })) as RunOutcome;
    if (!probe.spawned || probe.code !== 0) {
      console.error('[export] configured pandoc failed its --version probe:', configuredPath, probe);
      return { message: PANDOC_CONFIGURED_UNAVAILABLE_MESSAGE };
    }
    return {
      run: async (job) => {
        const out = (await invoke('run_program', {
          binPath: configuredPath,
          args: pandocDocxArgs(job),
          timeoutMs: CONVERT_TIMEOUT_MS,
        })) as RunOutcome;
        return { code: out.spawned ? out.code : null, stdout: out.stdout, stderr: out.stderr };
      },
    };
  }

  // No configured path — the existing GUI-PATH probe: run each scope name's
  // `--version` and take the first that exits cleanly. Running IS the probe.
  const shell = await import('@tauri-apps/plugin-shell');
  const program = await resolvePandocProgramByRun(async (candidate) => {
    const r = await shell.Command.create(candidate, ['--version']).execute().catch(() => null);
    return !!r && r.code === 0;
  });
  if (!program) return { message: PANDOC_UNAVAILABLE_MESSAGE };

  return {
    run: async (job) => {
      const { runPandocTauri } = await import('./pandoc');
      return runPandocTauri(job, shell, program);
    },
  };
}

/**
 * The reference .docx to style the output with: the user's own if they set one
 * AND it is still there, else the bundled resource when `fallbackToBundled`,
 * else none (pandoc's own defaults). A configured file that has since been
 * moved or deleted degrades rather than failing the export — the styling is a
 * preference, not the content.
 *
 * `fallbackToBundled` exists because the two callers differ on what "nothing
 * configured" has always meant: the whole-work compile has always applied the
 * bundled reference.docx, the single-chapter export has always applied none.
 * Setting a path changes both; leaving it unset changes neither.
 */
export async function resolveReferenceDoc(
  configuredPath?: string,
  fallbackToBundled = true,
): Promise<string | undefined> {
  const fs = await import('@tauri-apps/plugin-fs');
  if (configuredPath) {
    try {
      if (await fs.exists(configuredPath)) return configuredPath;
      console.warn('[export] configured reference doc is missing — falling back', configuredPath);
    } catch (err) {
      console.warn('[export] could not check the configured reference doc', err);
    }
  }
  if (!fallbackToBundled) return undefined;
  try {
    // The bundler keeps a resource's declared RELATIVE PATH, so
    // "resources/reference.docx" in tauri.conf.json lands at
    // Contents/Resources/resources/reference.docx. Resolving the bare filename
    // produced a path that does not exist, and pandoc — which does not treat a
    // missing --reference-doc as optional — failed every whole-work export.
    // Verify the file is really there and fall back to pandoc's own styling if
    // it is not: a missing template is a worse look, not a reason to refuse.
    const pathApi = await import('@tauri-apps/api/path');
    const candidate = await pathApi.resolveResource('resources/reference.docx');
    return (await fs.exists(candidate)) ? candidate : undefined;
  } catch (err) {
    console.warn('[export] reference.docx resource not found — using pandoc defaults', err);
    return undefined;
  }
}

/**
 * Where the save dialog should open. With no configured folder this is just the
 * bare filename (the system picks the folder, as before); with one, it is that
 * folder joined to the filename, which is what the native dialog reads as
 * "start here, with this name".
 */
export async function defaultSavePath(fileName: string, outputDir?: string): Promise<string> {
  if (!outputDir) return fileName;
  try {
    const pathApi = await import('@tauri-apps/api/path');
    return await pathApi.join(outputDir, fileName);
  } catch (err) {
    console.warn('[export] could not join the configured output folder', err);
    return fileName;
  }
}

/** The persisted export settings, or an empty object. Never throws. */
export async function exportSettings(): Promise<ExportSettings> {
  const settings = await loadSettings();
  return settings.export ?? {};
}
