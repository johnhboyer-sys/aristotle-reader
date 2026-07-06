import { describe, expect, it } from 'vitest';
import { resolveToolBinary, type ResolveToolBinarySpec } from '../detect';
import { CLI_TOOLS } from '../tools';

const HOME = '/Users/john';

function existsOnly(paths: string[]) {
  return async (p: string) => paths.includes(p);
}

// Use the (non-claude) codex spec to exercise the generalized resolver.
const codexSpec: ResolveToolBinarySpec = {
  candidatePaths: CLI_TOOLS.codex.candidatePaths,
  binName: CLI_TOOLS.codex.binName,
};

describe('resolveToolBinary (generalized, codex spec)', () => {
  it('ladder order: prefers the first candidate that exists', async () => {
    const ladder = CLI_TOOLS.codex.candidatePaths(HOME);
    const exists = existsOnly(ladder);
    const resolved = await resolveToolBinary(codexSpec, { exists, home: HOME });
    expect(resolved).toBe(ladder[0]); // '/opt/homebrew/bin/codex'
  });

  it('falls to a later candidate when earlier ones are absent', async () => {
    const ladder = CLI_TOOLS.codex.candidatePaths(HOME);
    const exists = existsOnly([ladder[2]]); // only '/usr/local/bin/codex' exists
    const resolved = await resolveToolBinary(codexSpec, { exists, home: HOME });
    expect(resolved).toBe(ladder[2]);
  });

  it('stops at the first hit (does not over-call exists)', async () => {
    const ladder = CLI_TOOLS.codex.candidatePaths(HOME);
    const seen: string[] = [];
    const exists = async (p: string) => {
      seen.push(p);
      return p === ladder[1];
    };
    await resolveToolBinary(codexSpec, { exists, home: HOME });
    expect(seen).toEqual([ladder[0], ladder[1]]);
  });

  it('falls through to the injected invokeWhich rung, passing candidates + binName', async () => {
    const ladder = CLI_TOOLS.codex.candidatePaths(HOME);
    let seenCandidates: string[] | undefined;
    let seenBinName: string | undefined;
    const exists = async (p: string) => p === '/some/shell/resolved/codex';
    const resolved = await resolveToolBinary(codexSpec, {
      exists,
      home: HOME,
      invokeWhich: async (candidates, binName) => {
        seenCandidates = candidates;
        seenBinName = binName;
        return '/some/shell/resolved/codex';
      },
    });
    expect(resolved).toBe('/some/shell/resolved/codex');
    expect(seenCandidates).toEqual(ladder);
    expect(seenBinName).toBe('codex');
  });

  it('trusts the invokeWhich rung result as-is, even when exists() would reject it', async () => {
    // Rust assist_which already verifies the path is an executable file; a
    // frontend plugin-fs exists() re-check is wrong for symlinked out-of-
    // sandbox binaries (/opt/homebrew/bin/codex), where it returns false and
    // would drop assist to the clipboard floor. The shell rung is authoritative.
    const exists = async () => false; // plugin-fs can't see the symlinked binary
    const resolved = await resolveToolBinary(codexSpec, {
      exists,
      home: HOME,
      invokeWhich: async () => '/opt/homebrew/bin/codex',
    });
    expect(resolved).toBe('/opt/homebrew/bin/codex');
  });

  it('not found: no candidate exists and no invokeWhich provided', async () => {
    const exists = async () => false;
    const resolved = await resolveToolBinary(codexSpec, { exists, home: HOME });
    expect(resolved).toBeNull();
  });

  it('a spec with an empty binName never invokes the which rung (custom command)', async () => {
    let called = false;
    const custom: ResolveToolBinarySpec = { candidatePaths: () => ['/opt/tool/ai'], binName: '' };
    const exists = async () => false;
    await resolveToolBinary(custom, {
      exists,
      home: HOME,
      invokeWhich: async () => {
        called = true;
        return '/opt/tool/ai';
      },
    });
    expect(called).toBe(false);
  });
});
