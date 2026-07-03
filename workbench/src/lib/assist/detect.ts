/**
 * Binary resolution ladder (D4 §1b divergence A, generalized in D7 §Slice A).
 *
 * A Finder-launched .app inherits launchd's minimal PATH, so a CLI that lives
 * at e.g. `~/.claude/local/claude` is invisible to a plain PATH probe. This
 * module walks a per-tool absolute candidate ladder, then (last resort) the
 * injected login-shell `command -v <binName>` rung. It is pure given its
 * injected dependencies — no Tauri, no fs import — so it is fully testable in
 * the node/vitest environment.
 *
 * Resolution order for a spec:
 *   1. each `spec.candidatePaths(home)` in order (first existing wins)
 *   2. the injected `invokeWhich(candidates, binName)` rung (the Rust
 *      `assist_which` login-shell `command -v` fallback), if provided — its
 *      result is re-validated with `exists` before it is trusted
 *   3. `null` (not found)
 */

export interface ResolveToolBinarySpec {
  /** Per-tool absolute candidate ladder, in priority order. */
  candidatePaths(home: string): string[];
  /** The bare binary name for the `command -v <binName>` login-shell rung. */
  binName: string;
}

export interface ResolveToolBinaryDeps {
  /** Returns true if a file exists at the given absolute path. */
  exists(path: string): Promise<boolean>;
  /** The user's home directory, e.g. `/Users/john`. */
  home: string;
  /**
   * Last-resort fallback: the Rust `assist_which` login-shell rung. Given the
   * already-tried candidate list and the tool's bare binName, returns an
   * absolute path string, or null if it found nothing. Optional — omitted in
   * contexts (like most unit tests) that only exercise the fixed candidates.
   */
  invokeWhich?: (candidates: string[], binName: string) => Promise<string | null>;
}

/** Resolve an absolute path to a tool's binary, or null if none is found. */
export async function resolveToolBinary(
  spec: ResolveToolBinarySpec,
  deps: ResolveToolBinaryDeps,
): Promise<string | null> {
  const candidates = spec.candidatePaths(deps.home);
  for (const candidate of candidates) {
    if (await deps.exists(candidate)) {
      return candidate;
    }
  }

  if (deps.invokeWhich && spec.binName.length > 0) {
    const resolved = await deps.invokeWhich(candidates, spec.binName);
    if (resolved && (await deps.exists(resolved))) {
      return resolved;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Backward-compatible claude wrapper (kept so existing callers/tests are green)
// ---------------------------------------------------------------------------

export interface ResolveClaudeBinaryDeps {
  /** Returns true if a file exists at the given absolute path. */
  exists(path: string): Promise<boolean>;
  /** The user's home directory, e.g. `/Users/john`. */
  home: string;
  /**
   * Last-resort fallback: the Rust login-shell `command -v claude` rung.
   * Returns an absolute path string, or null. Optional.
   */
  invokeResolve?: () => Promise<string | null>;
}

/** The historical claude candidate ladder. */
function claudeCandidatePaths(home: string): string[] {
  return [
    `${home}/.claude/local/claude`,
    `${home}/.local/bin/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
}

/**
 * Resolve an absolute path to the `claude` binary, or null. Thin wrapper over
 * `resolveToolBinary` with the claude spec — kept so the editor's
 * assistController and detect.test.ts continue to work unchanged.
 */
export async function resolveClaudeBinary(deps: ResolveClaudeBinaryDeps): Promise<string | null> {
  return resolveToolBinary(
    { candidatePaths: claudeCandidatePaths, binName: 'claude' },
    {
      exists: deps.exists,
      home: deps.home,
      invokeWhich: deps.invokeResolve
        ? async () => (deps.invokeResolve ? deps.invokeResolve() : null)
        : undefined,
    },
  );
}
