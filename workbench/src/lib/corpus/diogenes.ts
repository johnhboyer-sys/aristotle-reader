/**
 * Diogenes verse-mode export: command CONSTRUCTION only (as data).
 *
 * Port of the subprocess.run(...) call built in run_export()
 * (pipeline/aristotle_pipeline/stage1_greek.py). This module builds the
 * argv/cwd/env as plain data; actual invocation is out of scope here (wired
 * later via Tauri's shell plugin).
 */

/** The minimal manifest shape this module reads. Mirrors Manifest.data in
 * pipeline/aristotle_pipeline/config.py: work.tlg_author, sources.diogenes_server,
 * sources.tlg_dir_env / tlg_dir_default (resolved relative to the repo root). */
export interface DiogenesManifest {
  work: { tlg_author: string };
  sources: {
    diogenes_server: string;
    tlg_dir_env: string;
    tlg_dir_default: string;
  };
}

export interface DiogenesCommand {
  cmd: string[];
  cwd: string;
  env: { TLG_DIR: string; PATH: string };
}

/**
 * Resolve the TLG data directory the same way `Manifest.tlg_dir()` does: an
 * env var override (named by sources.tlg_dir_env), else sources.tlg_dir_default
 * resolved against the repo root.
 *
 * `resolveEnv` and `repoRoot` are injected (not read from process.env/cwd
 * directly) so this stays a pure function usable in the browser/Tauri webview
 * as well as Node-based parity tooling.
 */
export function resolveTlgDir(
  manifest: DiogenesManifest,
  repoRoot: string,
  resolveEnv: (name: string) => string | undefined,
): string {
  const envVal = resolveEnv(manifest.sources.tlg_dir_env);
  if (envVal) return envVal;
  return joinResolved(repoRoot, manifest.sources.tlg_dir_default);
}

/** Build the Diogenes xml-export.pl verse-mode (-y) command as data: argv,
 * cwd (the Diogenes server dir), and env (TLG_DIR + a minimal PATH). Mirrors
 * run_export()'s `subprocess.run([...], cwd=..., env={...})` call exactly —
 * this function only constructs that call, it never executes anything. */
export function buildDiogenesExportCommand(
  manifest: DiogenesManifest,
  exportDir: string,
  repoRoot: string,
  resolveEnv: (name: string) => string | undefined = () => undefined,
): DiogenesCommand {
  const tlgDir = resolveTlgDir(manifest, repoRoot, resolveEnv);
  return {
    cmd: [
      'perl',
      'xml-export.pl',
      '-c', 'tlg',
      '-n', manifest.work.tlg_author,
      '-y',
      '-o', exportDir,
    ],
    cwd: manifest.sources.diogenes_server,
    env: { TLG_DIR: tlgDir, PATH: '/usr/bin:/bin' },
  };
}

/** Join a possibly-relative path segment onto a base dir and lexically
 * collapse `.`/`..` segments the way Python's `(REPO_ROOT / rel).resolve()`
 * does (pure string manipulation, no filesystem access — good enough for
 * this data-construction context since the repo tree has no symlinks on the
 * resolved span). Absolute `rel` wins as-is, matching pathlib's `/` operator
 * semantics. */
function joinResolved(base: string, rel: string): string {
  if (rel.startsWith('/')) return rel;
  const parts = `${base}/${rel}`.split('/').filter((p) => p !== '' && p !== '.');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      if (stack.length) stack.pop();
    } else {
      stack.push(part);
    }
  }
  return `/${stack.join('/')}`;
}
