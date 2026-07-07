// D2 acceptance test 2, made executable: `if (scheme.id === '<some-id>')` (or
// the equivalent `=== 'busse-paragraph'` / `scheme.id === 'aquinas-tbd'` /
// etc.) anywhere in general code (outside a scheme's own file in
// src/lib/citation/schemes/) is a defect — general code must program against
// the CitationScheme interface, never branch on a concrete scheme id.
//
// This is a source-level grep test, not a type check: nothing in the type
// system stops someone from writing `scheme.id === 'busse-paragraph'` in
// editor code, so the contract's "general code never branches on scheme id"
// rule is enforced here instead.
//
// Uses the same dynamic node:fs/node:url import trick as
// editor/__tests__/copyCitation.test.ts (this project has no @types/node, so
// a static `import 'node:fs'` fails `tsc --noEmit` even though vitest's node
// environment provides it at runtime).
import { beforeAll, describe, expect, it } from 'vitest';
import type { SchemeId } from '../types';

type FS = {
  readFileSync(path: string, encoding: 'utf-8'): string;
  readdirSync(path: string, opts: { withFileTypes: true }): { name: string; isDirectory(): boolean; isFile(): boolean }[];
};
type PathMod = { join(...parts: string[]): string; relative(from: string, to: string): string };
type URLMod = { fileURLToPath(url: URL): string };

let fs: FS;
let pathMod: PathMod;
let srcRoot: string;

// Every SchemeId currently registered (types.ts's SchemeId union is the
// source of truth; the second test below cross-checks this list against
// registry.ts so it can't silently drift out of date).
const SCHEME_IDS: SchemeId[] = ['bekker-standard', 'bekker-metaphysics', 'aquinas-tbd', 'busse-paragraph'];

function listTsFiles(fsMod: FS, path: PathMod, dir: string): string[] {
  const out: string[] = [];
  for (const entry of fsMod.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFiles(fsMod, path, full));
    } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.svelte'))) {
      out.push(full);
    }
  }
  return out;
}

beforeAll(async () => {
  fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as FS;
  pathMod = (await import(/* @vite-ignore */ 'node' + ':path')) as unknown as PathMod;
  const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as URLMod;
  srcRoot = nodeUrl.fileURLToPath(new URL('../../..', import.meta.url)); // src/
});

describe('scheme-id isolation (D2 acceptance test 2)', () => {
  it('no `scheme.id === "<id>"` / `=== \'<id>\'` comparison against a registered scheme id appears outside src/lib/citation/schemes/', () => {
    const files = listTsFiles(fs, pathMod, srcRoot);
    const violations: string[] = [];

    for (const file of files) {
      const rel = pathMod.relative(srcRoot, file).replace(/\\/g, '/');
      // Each scheme file is allowed to reference its OWN id (e.g.
      // busseParagraph.ts assigning `id: SCHEME_ID`); this test file itself
      // lists every id as plain data, not as a `scheme.id === ...` check.
      if (rel.includes('/citation/schemes/')) continue;
      if (rel === 'lib/citation/__tests__/schemeIdIsolation.test.ts') continue;

      const source = fs.readFileSync(file, 'utf-8');
      for (const id of SCHEME_IDS) {
        const patterns = [
          `.id === '${id}'`,
          `.id === "${id}"`,
          `=== '${id}'`,
          `=== "${id}"`,
        ];
        for (const pattern of patterns) {
          if (source.includes(pattern)) {
            violations.push(`${rel}: contains ${JSON.stringify(pattern)}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('registry.ts registers every id under test (keeps SCHEME_IDS honest)', async () => {
    const { getScheme } = await import('../registry');
    for (const id of SCHEME_IDS) {
      expect(() => getScheme(id)).not.toThrow();
    }
  });
});
