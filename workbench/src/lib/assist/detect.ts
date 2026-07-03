/**
 * resolveClaudeBinary — the GUI-PATH resolution ladder core (D4 §1b, divergence A).
 *
 * A Finder-launched .app inherits launchd's minimal PATH; `claude` commonly
 * lives at `~/.claude/local/claude`, which no PATH probe finds. This
 * function is pure given its injected dependencies — no Tauri, no fs import
 * — so it is fully testable in the node/vitest environment.
 *
 * Candidate order:
 *   1. `${home}/.claude/local/claude`
 *   2. `${home}/.local/bin/claude`
 *   3. `/opt/homebrew/bin/claude`
 *   4. `/usr/local/bin/claude`
 *   5. the injected `invokeResolve` fallback (the Rust login-shell
 *      `command -v claude` rung), if provided
 *   6. `null` (not found)
 */

export interface ResolveClaudeBinaryDeps {
  /** Returns true if a file exists at the given absolute path. */
  exists(path: string): Promise<boolean>;
  /** The user's home directory, e.g. `/Users/john`. */
  home: string;
  /**
   * Last-resort fallback: the Rust side's login-shell `command -v claude`
   * rung. Returns an absolute path string, or null if it found nothing.
   * Optional — omitted in contexts (like most unit tests) that only want to
   * exercise the fixed candidate list.
   */
  invokeResolve?: () => Promise<string | null>;
}

function candidatePaths(home: string): string[] {
  return [
    `${home}/.claude/local/claude`,
    `${home}/.local/bin/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
}

/** Resolve an absolute path to the `claude` binary, or null if none is found. */
export async function resolveClaudeBinary(deps: ResolveClaudeBinaryDeps): Promise<string | null> {
  for (const candidate of candidatePaths(deps.home)) {
    if (await deps.exists(candidate)) {
      return candidate;
    }
  }

  if (deps.invokeResolve) {
    const resolved = await deps.invokeResolve();
    if (resolved && (await deps.exists(resolved))) {
      return resolved;
    }
  }

  return null;
}
