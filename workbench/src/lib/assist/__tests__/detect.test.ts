import { describe, expect, it } from 'vitest';
import { resolveClaudeBinary } from '../detect';

const HOME = '/Users/john';

function existsOnly(paths: string[]) {
  return async (p: string) => paths.includes(p);
}

describe('resolveClaudeBinary', () => {
  it('candidate ladder order: prefers ~/.claude/local/claude first', async () => {
    const exists = existsOnly([
      `${HOME}/.claude/local/claude`,
      `${HOME}/.local/bin/claude`,
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
    ]);
    const resolved = await resolveClaudeBinary({ exists, home: HOME });
    expect(resolved).toBe(`${HOME}/.claude/local/claude`);
  });

  it('falls to ~/.local/bin/claude when the first candidate is absent', async () => {
    const exists = existsOnly([`${HOME}/.local/bin/claude`, '/opt/homebrew/bin/claude']);
    const resolved = await resolveClaudeBinary({ exists, home: HOME });
    expect(resolved).toBe(`${HOME}/.local/bin/claude`);
  });

  it('falls to /opt/homebrew/bin/claude when the first two candidates are absent', async () => {
    const exists = existsOnly(['/opt/homebrew/bin/claude', '/usr/local/bin/claude']);
    const resolved = await resolveClaudeBinary({ exists, home: HOME });
    expect(resolved).toBe('/opt/homebrew/bin/claude');
  });

  it('falls to /usr/local/bin/claude when only the last fixed candidate exists', async () => {
    const exists = existsOnly(['/usr/local/bin/claude']);
    const resolved = await resolveClaudeBinary({ exists, home: HOME });
    expect(resolved).toBe('/usr/local/bin/claude');
  });

  it('checks candidates in order and stops at the first hit (does not over-call exists)', async () => {
    const seen: string[] = [];
    const exists = async (p: string) => {
      seen.push(p);
      return p === `${HOME}/.local/bin/claude`;
    };
    await resolveClaudeBinary({ exists, home: HOME });
    expect(seen).toEqual([`${HOME}/.claude/local/claude`, `${HOME}/.local/bin/claude`]);
  });

  it('falls through to the injected invokeResolve rung when no fixed candidate exists', async () => {
    const exists = async (p: string) => p === '/some/custom/path/claude';
    const resolved = await resolveClaudeBinary({
      exists,
      home: HOME,
      invokeResolve: async () => '/some/custom/path/claude',
    });
    expect(resolved).toBe('/some/custom/path/claude');
  });

  it('invokeResolve result is still validated with exists before being trusted', async () => {
    const exists = async () => false; // nothing exists, including the "resolved" path
    const resolved = await resolveClaudeBinary({
      exists,
      home: HOME,
      invokeResolve: async () => '/bogus/claude',
    });
    expect(resolved).toBeNull();
  });

  it('invokeResolve returning null is treated as not-found from that rung', async () => {
    const exists = async () => false;
    const resolved = await resolveClaudeBinary({
      exists,
      home: HOME,
      invokeResolve: async () => null,
    });
    expect(resolved).toBeNull();
  });

  it('not-found terminus: no candidate exists and no invokeResolve is provided', async () => {
    const exists = async () => false;
    const resolved = await resolveClaudeBinary({ exists, home: HOME });
    expect(resolved).toBeNull();
  });

  it('not-found terminus: no candidate exists and invokeResolve is omitted (never called)', async () => {
    let called = false;
    const exists = async () => {
      called = true;
      return false;
    };
    await resolveClaudeBinary({ exists, home: HOME });
    expect(called).toBe(true); // exists was checked for the fixed candidates
  });
});
